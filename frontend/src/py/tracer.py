"""CodeLens tracer.

Plain Python, runnable in both Pyodide (in the Web Worker) and CPython (under
pytest). It runs a beginner's Python program under ``sys.settrace`` and returns
a ``TraceResult`` dict matching the frozen contract in
``frontend/src/types/trace.ts``.

Public API:
- ``trace(source) -> dict``: a TraceResult dict.
- ``trace_json(source) -> str``: the same result as JSON (for the worker).
- ``snapshot(value) -> (json_value, was_cut)``: a JSON-safe value and whether a
  size cap dropped data.
- ``MAX_STEPS``, ``code_hash(source)``, ``empty_result(source)``.

Line-number rule: CPython 3.12+ reports ``f_lineno == 0`` for the module-level
"call" event. The tracer reports line 1 instead, and clamps every line into
``1..number of source lines`` (``shared/fixtures/loop.json`` follows this).

Safety: every type check uses ``type(v) is X`` so subclasses never qualify, and
the tracer never calls student-overridable methods (``__repr__``, ``__str__``,
``__eq__``, ``__hash__``, ``__getattribute__``, properties) on traced values.
"""

from __future__ import annotations

import builtins
import hashlib
import json
import math
import opcode as _opcode
import re
import sys

MAX_STEPS = 300

# Snapshot / stdout / step size caps.
MAX_ITEMS = 10
MAX_STR_LEN = 200
STDOUT_BYTE_CAP = 4000
STEP_BYTE_CAP = 16000

# Trace status values, matching the frozen contract's TraceResult.status.
STATUS_OK = "ok"
STATUS_ERROR = "error"
STATUS_LIMIT = "limit"
STATUS_TIMEOUT = "timeout"

# Trace event values, matching the frozen contract's TraceStep.event.
EVENT_CALL = "call"
EVENT_LINE = "line"
EVENT_RETURN = "return"
EVENT_EXCEPTION = "exception"

USER_FILENAME = "codelens_user.py"
MODULE_FUNCTION_NAME = "<module>"
MODULE_FRAME_ID = "module"

LIMIT_MESSAGE = "Stopped after 300 steps. Is there a loop that never ends?"
INPUT_MESSAGE = (
    'input() isn\'t available in CodeLens. '
    'Set the value directly, e.g. name = "Ada".'
)

# int values with absolute value above this are not exactly representable as a
# JSON number by double-precision consumers, so they become placeholders.
_MAX_SAFE_INT = 2 ** 53

# C-level descriptors, read directly so a metaclass or a student-defined
# property / __getattribute__ can never intercept them.
_type_name_getter = type.__dict__["__name__"].__get__
_exc_args_getter = BaseException.__dict__["args"].__get__
_exc_traceback_getter = BaseException.__dict__["__traceback__"].__get__
_syntax_msg_getter = SyntaxError.__dict__["msg"].__get__
_syntax_lineno_getter = SyntaxError.__dict__["lineno"].__get__


def _probe_frame_locals():
    return sys._getframe().f_locals


# Type of a function frame's f_locals: FrameLocalsProxy on 3.13+, dict before.
_FRAME_LOCALS_TYPE = type(_probe_frame_locals())

# Opcodes seen at a "return" event. A real return stops on RETURN_*, a
# generator yield stops just after YIELD_VALUE (RESUME on 3.13). Anything else
# means the frame is being unwound by an exception.
_RETURN_OPS = frozenset(
    _opcode.opmap[n] for n in ("RETURN_VALUE", "RETURN_CONST") if n in _opcode.opmap
)
_YIELD_OPS = frozenset(
    _opcode.opmap[n] for n in ("YIELD_VALUE", "RESUME") if n in _opcode.opmap
)
_EXTENDED_ARG = _opcode.opmap.get("EXTENDED_ARG", -1)

_NEWLINE_RE = re.compile(r"\r\n|\r|\n")
_SURROGATE_RE = re.compile("[\ud800-\udfff]")

_monitoring = getattr(sys, "monitoring", None)  # Python 3.12+
_MONITORING_TOOL_IDS = (4, 5, 2, 1, 0, 3)  # Hypothesis uses 3: try it last.


def code_hash(source: str) -> str:
    """Canonical codeHash: sha256 hex digest of the UTF-8 source."""
    # surrogatepass: a lone surrogate must not crash the tracer.
    return hashlib.sha256(source.encode("utf-8", "surrogatepass")).hexdigest()


def empty_result(source: str) -> dict:
    """A well-formed, empty TraceResult for the given source."""
    return {
        "steps": [],
        "status": STATUS_OK,
        "truncated": False,
        "codeHash": code_hash(source),
    }


# -- small safe helpers ----------------------------------------------------


def _exact_str(s) -> str:
    """An exact ``str`` copy of a str (or str subclass) without calling its methods."""
    return s if type(s) is str else str.__str__(s)


def _capped(text: str):
    """``(text shortened to MAX_STR_LEN, was_cut)``."""
    if len(text) > MAX_STR_LEN:
        return text[:MAX_STR_LEN], True
    return text, False


def _type_name(value) -> str:
    """The type name of ``value`` without invoking student-overridable attrs."""
    return _exact_str(_type_name_getter(type(value)))


def _placeholder(value, length=None):
    """``({"__type__": name[, "__len__": n]}, was_cut)`` for ``value``."""
    name, cut = _capped(_type_name(value))
    ph = {"__type__": name}
    if length is not None:
        ph["__len__"] = length
    return ph, cut


def _is_json_primitive(v) -> bool:
    """True for exact None / bool / int (safe range) / finite float / str."""
    t = type(v)
    if v is None or t is bool or t is str:
        return True
    if t is int:
        return -_MAX_SAFE_INT <= v <= _MAX_SAFE_INT
    if t is float:
        return math.isfinite(v)
    return False


def _line_count(source: str) -> int:
    """Number of source lines as Python counts them (at least 1)."""
    parts = _NEWLINE_RE.split(source)
    n = len(parts) - (1 if parts[-1] == "" else 0)
    return max(1, n)


# -- snapshot --------------------------------------------------------------


def snapshot(value):
    """Return ``(json_value, was_cut)`` for ``value`` per the design table.

    Only exact types qualify; subclasses and anything exotic become a type-only
    placeholder ``{"__type__": <name>}``. ``was_cut`` is True iff a size cap
    dropped data (a shortened string, an over-length container, or an
    over-long type name).
    """
    t = type(value)

    # None / bool / int / float / str. Identity checks only: `t in (...)`
    # would call a metaclass __eq__.
    if value is None or t is bool:
        return value, False
    if t is int:
        if -_MAX_SAFE_INT <= value <= _MAX_SAFE_INT:
            return value, False
        return {"__type__": "int"}, False
    if t is float:
        if math.isfinite(value):
            return value, False
        return {"__type__": "float"}, False
    if t is str:
        return _capped(value)

    # list / tuple of primitives -> JSON array.
    if t is list or t is tuple:
        n = len(value)
        if n > MAX_ITEMS:
            ph, _ = _placeholder(value, n)
            return ph, True
        out = []
        cut = False
        for item in value:
            if not _is_json_primitive(item):
                # Nested containers / objects / big numbers: type-only parent.
                return _placeholder(value)
            if type(item) is str and len(item) > MAX_STR_LEN:
                item = item[:MAX_STR_LEN]
                cut = True
            out.append(item)
        return out, cut

    # dict with str keys and primitive values -> JSON object.
    if t is dict:
        n = len(value)
        if n > MAX_ITEMS:
            return {"__type__": "dict", "__len__": n}, True
        # Iterate items instead of doing lookups: `k in value` or `value[k]`
        # could call a student key's __hash__ / __eq__.
        items = list(value.items())
        for k, _ in items:
            if type(k) is not str:
                return {"__type__": "dict"}, False
        for k, _ in items:
            if k == "__type__":
                # Must not masquerade as a placeholder.
                return {"__type__": "dict"}, False
            if len(k) > MAX_STR_LEN:
                return {"__type__": "dict", "__len__": n}, True
        out = {}
        cut = False
        for k, item in items:
            if not _is_json_primitive(item):
                return {"__type__": "dict"}, False
            if type(item) is str and len(item) > MAX_STR_LEN:
                item = item[:MAX_STR_LEN]
                cut = True
            out[k] = item
        return out, cut

    # Anything else: function, module, object, set, nested container, etc.
    return _placeholder(value)


def _locals_snapshot(frame):
    """Snapshot a frame's locals. Returns ``(locals, type_names, was_cut)``.

    Drops dunder names (Req 2.4), compiler-internal names such as ``.0``, and
    non-``str`` keys. A class body whose namespace is a custom mapping (from a
    metaclass ``__prepare__``) is not read at all, since reading it would run
    student code.
    """
    f_locals = frame.f_locals
    lt = type(f_locals)
    if lt is not dict and lt is not _FRAME_LOCALS_TYPE:
        return {}, {}, False
    out = {}
    types = {}
    cut = False
    for name, value in list(f_locals.items()):
        if type(name) is not str or name.startswith("__") or name.startswith("."):
            continue
        jv, was_cut = snapshot(value)
        if was_cut:
            cut = True
        out[name] = jv
        types[name] = _type_name(value)
    return out, types, cut


# -- step size cap ---------------------------------------------------------


def _escape_surrogate(m) -> str:
    return "\\u%04x" % ord(m.group())


def _to_json(obj) -> str:
    """Compact JSON, UTF-8 friendly; lone surrogates escaped so it always encodes."""
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return _SURROGATE_RE.sub(_escape_surrogate, text)


def _json_size(obj) -> int:
    return len(_to_json(obj).encode("utf-8"))


def _is_placeholder(jv) -> bool:
    return type(jv) is dict and "__type__" in jv


def _as_placeholder(jv, type_name):
    """Type-only placeholder for an already-snapshotted value."""
    if _is_placeholder(jv):
        return jv
    if type_name is None:
        type_name = "NoneType" if jv is None else _type_name(jv)
    return {"__type__": _capped(type_name)[0]}


def _fit_step(step: dict, types: dict, rv_type=None) -> bool:
    """Shrink ``step`` in place until its JSON fits STEP_BYTE_CAP.

    Returns True if data was dropped. Stages:
    1. (design) every local, and the return value, becomes its type placeholder;
    2. the locals are dropped (very many variables);
    3. the cumulative stdout keeps its longest prefix that fits (only reachable
       when escapes inflate it, e.g. control characters).
    Every other field is bounded by MAX_STR_LEN, so stage 3 always succeeds.
    """
    if _json_size(step) <= STEP_BYTE_CAP:
        return False
    step["locals"] = {
        name: _as_placeholder(jv, types.get(name)) for name, jv in step["locals"].items()
    }
    if "returnValue" in step:
        step["returnValue"] = _as_placeholder(step["returnValue"], rv_type)
    if _json_size(step) <= STEP_BYTE_CAP:
        return True
    step["locals"] = {}
    if _json_size(step) <= STEP_BYTE_CAP:
        return True
    out = step["stdout"]
    lo, hi = 0, len(out)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        step["stdout"] = out[:mid]
        if _json_size(step) <= STEP_BYTE_CAP:
            lo = mid
        else:
            hi = mid - 1
    step["stdout"] = out[:lo]
    return True


# -- stdout capture / input stub -------------------------------------------


class _CappedWriter:
    """A stdout replacement that stores output up to ``STDOUT_BYTE_CAP`` bytes.

    Bytes are counted in UTF-8. Once anything is dropped, every later write is
    dropped too, so the stored text is always an exact prefix of the output.
    """

    encoding = "utf-8"

    def __init__(self):
        self._text = ""
        self._nbytes = 0
        self.truncated = False

    def write(self, s):
        if type(s) is not str:
            # Like io.TextIOWrapper: str subclasses are accepted (copied without
            # calling their methods), anything else is a TypeError.
            try:
                s = str.__str__(s)
            except TypeError:
                raise TypeError(
                    "write() argument must be str, not " + _type_name(s)
                ) from None
        if not s:
            return 0
        if self.truncated:
            return len(s)
        room = STDOUT_BYTE_CAP - self._nbytes
        if len(s) <= room:  # each char is >= 1 byte, so it can only fit then
            n = len(s.encode("utf-8", "surrogatepass"))
            if n <= room:
                self._text += s
                self._nbytes += n
                return len(s)
        # Keep the longest whole-character prefix that fits, drop the rest.
        kept = s[:room].encode("utf-8", "surrogatepass")[:room].decode("utf-8", "ignore")
        self._text += kept
        self._nbytes += len(kept.encode("utf-8"))
        self.truncated = True
        return len(s)

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    def flush(self):
        pass

    def isatty(self):
        return False

    def writable(self):
        return True

    def getvalue(self) -> str:
        return self._text


def _input_stub(*args, **kwargs):
    raise RuntimeError(INPUT_MESSAGE)


# -- exceptions ------------------------------------------------------------


class StepLimit(BaseException):
    """Raised when the trace would exceed MAX_STEPS.

    A ``BaseException`` subclass so student ``except Exception`` can't swallow
    it. A bare ``except:`` can catch it, so once the limit is hit it is raised
    again at the next event (see ``_Tracer._hit_limit``).
    """


def _exception_message(exc) -> str:
    """Message text without calling a student ``__str__`` or property.

    SyntaxError (and subclasses) use their ``msg`` field. Otherwise a single
    arg of exact type ``str`` is used as-is; anything else gives "".
    """
    try:
        if issubclass(type(exc), SyntaxError):
            msg = _syntax_msg_getter(exc)
            return msg if type(msg) is str else ""
        args = _exc_args_getter(exc)
    except Exception:
        return ""
    if type(args) is tuple and len(args) == 1 and type(args[0]) is str:
        return args[0]
    return ""


def _last_user_line(exc):
    try:
        tb = _exc_traceback_getter(exc)
    except Exception:
        return None
    line = None
    while tb is not None:
        fname = tb.tb_frame.f_code.co_filename
        if type(fname) is str and fname == USER_FILENAME:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


# Kinds of "return" event.
_RETURN = "return"
_YIELD = "yield"
_UNWIND = "unwind"


def _return_kind(frame, unwinding: bool) -> str:
    """Classify a "return" event as a real return, a yield, or an unwind.

    Python fires "return" (arg None) while an exception passes out of a frame.
    The unwinding flag alone is not enough: a ``finally`` block runs line
    events before re-raising, so the instruction the frame stopped on decides.
    """
    i = frame.f_lasti
    code = frame.f_code.co_code
    if i < 0 or i >= len(code):
        return _UNWIND if unwinding else _RETURN
    op = code[i]
    while op == _EXTENDED_ARG and i + 2 < len(code):
        i += 2
        op = code[i]
    if op in _RETURN_OPS:
        return _RETURN
    if op in _YIELD_OPS:
        # A generator stops here both when it yields and when a thrown
        # exception (close(), throw()) unwinds it.
        return _UNWIND if unwinding else _YIELD
    return _UNWIND


# -- the tracer ------------------------------------------------------------

_NO_VALUE = object()


class _Tracer:
    def __init__(self, n_lines: int):
        self.n_lines = n_lines
        self.steps: list[dict] = []
        self.truncated = False
        self.limited = False
        # Per-frame state keyed on id(frame). Each state holds the frame itself,
        # so the id can't be reused while the entry exists. Ids never reach the
        # output, so results stay deterministic.
        self.frames: dict[int, dict] = {}
        self.call_counts: dict[str, int] = {}
        self.writer = _CappedWriter()
        # Latest exception seen, for the terminal exception step.
        self.exc: dict | None = None
        self._tool_id = None
        self._tf = self.tracefn

    # -- the trace function ----------------------------------------------
    def tracefn(self, frame, event, arg):
        fname = frame.f_code.co_filename
        if type(fname) is not str or fname != USER_FILENAME:
            return None  # not a user frame: no line events for it

        if self.limited:
            # Sticky: once the step cap is hit, every later event re-raises.
            raise StepLimit()

        if event == EVENT_LINE:
            self._on_line(frame)
        elif event == EVENT_CALL:
            self._on_call(frame)
        elif event == EVENT_RETURN:
            self._on_return(frame, arg)
        elif event == EVENT_EXCEPTION:
            self._on_exception(frame, arg)
        return self._tf

    # -- limit guard -----------------------------------------------------
    def _reserve(self):
        """Raise StepLimit if no room is left for another regular step.

        One slot of MAX_STEPS stays free for the terminal exception step.
        """
        if len(self.steps) >= MAX_STEPS - 1:
            self._hit_limit()

    def _hit_limit(self):
        self.limited = True
        # CPython removes a trace function that raises, so a bare `except:`
        # that catches StepLimit would otherwise run untraced forever. A
        # sys.monitoring LINE/JUMP hook keeps re-raising StepLimit in user code
        # until it escapes.
        self._arm_monitoring()
        raise StepLimit()

    def _arm_monitoring(self):
        mon = _monitoring
        if mon is None or self._tool_id is not None:
            return
        for tool_id in _MONITORING_TOOL_IDS:
            try:
                if mon.get_tool(tool_id) is None:
                    mon.use_tool_id(tool_id, "codelens-step-limit")
                    break
            except ValueError:
                continue
        else:
            return
        self._tool_id = tool_id
        ev = mon.events
        mon.register_callback(tool_id, ev.LINE, self._monitor_line)
        mon.register_callback(tool_id, ev.JUMP, self._monitor_jump)
        mon.set_events(tool_id, ev.LINE | ev.JUMP)

    def disarm_monitoring(self):
        tool_id = self._tool_id
        if tool_id is None:
            return
        self._tool_id = None
        mon = _monitoring
        ev = mon.events
        mon.set_events(tool_id, 0)
        mon.register_callback(tool_id, ev.LINE, None)
        mon.register_callback(tool_id, ev.JUMP, None)
        mon.free_tool_id(tool_id)

    def _monitor_line(self, code, line_number):
        fname = code.co_filename
        if self.limited and type(fname) is str and fname == USER_FILENAME:
            raise StepLimit()

    def _monitor_jump(self, code, instruction_offset, destination_offset):
        fname = code.co_filename
        if self.limited and type(fname) is str and fname == USER_FILENAME:
            raise StepLimit()

    # -- frame state -----------------------------------------------------
    def _line(self, frame) -> int:
        line = frame.f_lineno or 1
        return line if line <= self.n_lines else self.n_lines

    def _parent_state(self, frame):
        back = frame.f_back
        while back is not None:
            st = self.frames.get(id(back))
            if st is not None:
                return st
            back = back.f_back
        return None

    def _new_state(self, frame) -> dict:
        name, name_cut = _capped(_exact_str(frame.f_code.co_name))
        parent = self._parent_state(frame)
        if parent is None:
            frame_id = MODULE_FRAME_ID
            depth = 0
        else:
            n = self.call_counts.get(name, 0) + 1
            self.call_counts[name] = n
            frame_id = name + "-" + str(n)
            depth = parent["depth"] + 1
        state = {
            "frame": frame,
            "functionName": name,
            "frameId": frame_id,
            "depth": depth,
            "unwinding": False,
            "suspended": False,
            "cut": name_cut,
        }
        self.frames[id(frame)] = state
        return state

    def _state(self, frame) -> dict:
        state = self.frames.get(id(frame))
        if state is None:
            # Normally created on "call"; fall back defensively.
            state = self._new_state(frame)
        return state

    def _record(self, event, state, line, loc, types, cut, rv=_NO_VALUE, rv_type=None):
        step = {
            "index": len(self.steps),
            "line": line,
            "event": event,
            "functionName": state["functionName"],
            "frameId": state["frameId"],
            "depth": state["depth"],
            "locals": loc,
            "stdout": self.writer.getvalue(),
        }
        if rv is not _NO_VALUE:
            step["returnValue"] = rv
        if _fit_step(step, types, rv_type) or cut or state["cut"]:
            self.truncated = True
        self.steps.append(step)

    # -- events ----------------------------------------------------------
    def _on_call(self, frame):
        self._reserve()
        state = self.frames.get(id(frame))
        if state is not None and state["suspended"]:
            # A generator resuming: same frameId; it may be resumed elsewhere.
            state["suspended"] = False
            parent = self._parent_state(frame)
            state["depth"] = 0 if parent is None else parent["depth"] + 1
        else:
            state = self._new_state(frame)
        loc, types, cut = _locals_snapshot(frame)
        self._record(EVENT_CALL, state, self._line(frame), loc, types, cut)
        state["call_step"] = self.steps[-1]
        state["closing"] = False

    def _on_line(self, frame):
        self._reserve()
        state = self._state(frame)
        # Control resumed in this frame, so any exception that was unwinding
        # through it was caught.
        state["unwinding"] = False
        loc, types, cut = _locals_snapshot(frame)
        self._record(EVENT_LINE, state, self._line(frame), loc, types, cut)

    def _on_return(self, frame, arg):
        state = self._state(frame)
        kind = _return_kind(frame, state["unwinding"])
        if kind == _UNWIND:
            # Python fires "return" while an exception passes through: skip it.
            self.frames.pop(id(frame), None)
            if state.get("closing") and self.steps and self.steps[-1] is state.get("call_step"):
                # generator.close() threw GeneratorExit into a suspended
                # generator and nothing ran: drop the orphan resume "call".
                # Some CPython builds (e.g. 3.13.2, Pyodide 0.29) close such a
                # generator without any trace events; this keeps them equal.
                self.steps.pop()
            exc = self.exc
            if exc is not None and exc["frame"] is frame:
                exc["frame_done"] = True
            return
        self._reserve()
        loc, types, cut = _locals_snapshot(frame)
        rv, rv_cut = snapshot(arg)
        self._record(
            EVENT_RETURN, state, self._line(frame), loc, types, cut or rv_cut,
            rv=rv, rv_type=_type_name(arg),
        )
        if kind == _YIELD:
            state["suspended"] = True
        else:
            self.frames.pop(id(frame), None)

    def _on_exception(self, frame, arg):
        state = self._state(frame)
        state["unwinding"] = True
        if arg[0] is GeneratorExit and self.steps and self.steps[-1] is state.get("call_step"):
            state["closing"] = True
        exc_value = arg[1]
        prev = self.exc
        if (
            prev is not None
            and prev["value"] is exc_value
            and prev["frame_done"]
            and prev["frame"] is not frame
        ):
            # The same exception propagating out of a callee that already
            # unwound: keep the innermost location.
            prev["frame"] = frame
            prev["frame_done"] = False
            return
        loc, types, cut = _locals_snapshot(frame)
        self.exc = {
            "value": exc_value,
            "frame": frame,
            "frame_done": False,
            "line": self._line(frame),
            "functionName": state["functionName"],
            "frameId": state["frameId"],
            "depth": state["depth"],
            "locals": loc,
            "types": types,
            "cut": cut or state["cut"],
        }

    # -- terminal step ---------------------------------------------------
    def error_step(self, run_exc):
        """``(step, message, was_cut)`` for an uncaught exception."""
        rec = self.exc
        if rec is None or rec["value"] is not run_exc:
            # The trace function never saw it (unlikely). Fall back.
            line = _last_user_line(run_exc) or 1
            rec = {
                "line": max(1, min(line, self.n_lines)),
                "functionName": MODULE_FUNCTION_NAME,
                "frameId": MODULE_FRAME_ID,
                "depth": 0,
                "locals": {},
                "types": {},
                "cut": False,
            }
        type_name, type_cut = _capped(_type_name(run_exc))
        message, msg_cut = _capped(_exception_message(run_exc))
        step = {
            "index": len(self.steps),
            "line": rec["line"],
            "event": EVENT_EXCEPTION,
            "functionName": rec["functionName"],
            "frameId": rec["frameId"],
            "depth": rec["depth"],
            "locals": rec["locals"],
            "stdout": self.writer.getvalue(),
            "error": {"type": type_name, "message": message},
        }
        cut = _fit_step(step, rec["types"]) or rec["cut"] or type_cut or msg_cut
        return step, message, cut


def _compile_error_result(err, h: str, n_lines: int) -> dict:
    """A single error step for source that doesn't compile (SyntaxError etc.)."""
    lineno = None
    if issubclass(type(err), SyntaxError):
        lineno = _syntax_lineno_getter(err)
    if type(lineno) is not int or lineno < 1:
        lineno = 1
    type_name, type_cut = _capped(_type_name(err))
    message, msg_cut = _capped(_exception_message(err) or "invalid syntax")
    step = {
        "index": 0,
        "line": min(lineno, n_lines),
        "event": EVENT_EXCEPTION,
        "functionName": MODULE_FUNCTION_NAME,
        "frameId": MODULE_FRAME_ID,
        "depth": 0,
        "locals": {},
        "stdout": "",
        "error": {"type": type_name, "message": message},
    }
    cut = _fit_step(step, {}) or type_cut or msg_cut
    return {
        "steps": [step],
        "status": STATUS_ERROR,
        "message": message,
        "truncated": cut,
        "codeHash": h,
    }


def trace(source: str) -> dict:
    """Run ``source`` under the tracer and return a TraceResult dict."""
    h = code_hash(source)
    n_lines = _line_count(source)

    # 1. Compile. A SyntaxError (or any other compile failure, e.g. too deeply
    #    nested code) becomes a single error step.
    try:
        code = compile(source, USER_FILENAME, "exec")
    except Exception as err:  # noqa: BLE001
        return _compile_error_result(err, h, n_lines)

    tracer = _Tracer(n_lines)
    saved_stdout = sys.stdout
    saved_input = builtins.input
    saved_trace = sys.gettrace()
    run_exc = None

    # 2-3. Swap stdout / input, trace the run, restore everything.
    try:
        sys.stdout = tracer.writer
        builtins.input = _input_stub
        ns = {"__name__": "__main__", "__builtins__": builtins}
        sys.settrace(tracer.tracefn)
        try:
            exec(code, ns)
        except BaseException as e:  # noqa: BLE001 - record then classify
            run_exc = e
        finally:
            sys.settrace(saved_trace)
            tracer.disarm_monitoring()
    finally:
        sys.stdout = saved_stdout
        builtins.input = saved_input

    status = STATUS_OK
    message = None
    truncated = tracer.truncated or tracer.writer.truncated

    if tracer.limited or type(run_exc) is StepLimit:
        status = STATUS_LIMIT
        message = LIMIT_MESSAGE
        truncated = True  # the steps past the cap were dropped
    elif run_exc is not None:
        status = STATUS_ERROR
        step, message, cut = tracer.error_step(run_exc)
        tracer.steps.append(step)
        if cut:
            truncated = True

    result = {
        "steps": tracer.steps,
        "status": status,
        "truncated": truncated,
        "codeHash": h,
    }
    if message is not None:
        result["message"] = message
    return result


def trace_json(source: str) -> str:
    """Run ``source`` and return the TraceResult as compact JSON."""
    return _to_json(trace(source))
