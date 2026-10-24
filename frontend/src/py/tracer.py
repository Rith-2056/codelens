"""CodeLens tracer.

Plain Python, runnable in both Pyodide (in the Web Worker) and CPython (under
pytest). It runs a beginner's Python program under ``sys.settrace`` and returns
a ``TraceResult`` dict matching the frozen contract (version 2026-10-24) in
``frontend/src/types/trace.ts``.

Public API:
- ``trace(source) -> dict``: a TraceResult dict.
- ``trace_json(source) -> str``: the same result as JSON (for the worker).
- ``snapshot(value) -> (json_value, was_cut)``: one value in the contract's
  snapshot form, and whether a cap dropped data. Refs it returns point into a
  heap that is thrown away; ``snapshot_with_heap`` keeps it.
- ``snapshot_with_heap(values) -> (snapshots, heap, was_cut)``.
- ``MAX_STEPS``, ``code_hash(source)``, ``empty_result(source)``.

Value forms (design.md, "How Python values map to snapshot values"):
- exact ``None``/``bool``/safe ``int``/finite ``float``/``str``: inline;
- ``list``/``tuple``: JSON array; ``dict``: ``{"__dict": [[k, v], ...]}``;
  ``set``/``frozenset``: ``{"__set": [...]}`` (sorted when possible);
  ``collections.deque``: ``{"__deque": [...]}``;
- an instance of a student-defined class that passes the safety check:
  ``{"__ref": "o<n>"}`` plus ``heap["o<n>"] = {id, type, fields}``;
- anything else: ``{"__type__": name}`` (``"__len__"`` added for a container
  over MAX_ITEMS).

Every step also carries ``stack``: every active user frame, outermost first,
the current frame last (its locals are the step's locals), so
``len(stack) == depth + 1``.

Line-number rule: CPython 3.12+ reports ``f_lineno == 0`` for the module-level
"call" event. The tracer reports line 1 instead, and clamps every line into
``1..number of source lines``.

Safety: every type check uses ``type(v) is X`` so subclasses never qualify, and
the tracer never calls student-overridable methods (``__repr__``, ``__str__``,
``__eq__``, ``__hash__``, ``__getattribute__``, ``__getattr__``, properties)
on traced values. Class and instance dicts are read through C-level
descriptors fetched from ``type.__dict__`` / the class's own ``__dict__``.
"""

from __future__ import annotations

import builtins
import hashlib
import json
import math
import opcode as _opcode
import re
import sys
import types as _types
from collections import deque as _deque

MAX_STEPS = 2000

# Snapshot / stdout / step / trace size caps (design.md, "Caps").
MAX_ITEMS = 20
MAX_STR_LEN = 200
MAX_NEST_DEPTH = 4
MAX_HEAP_OBJECTS = 200
STDOUT_BYTE_CAP = 4000
STEP_BYTE_CAP = 16000
TRACE_BYTE_CAP = 3_000_000

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
PRELUDE_FILENAME = "codelens_prelude.py"
MODULE_FUNCTION_NAME = "<module>"
MODULE_FRAME_ID = "module"

# Formatted with the number of steps actually in the trace.
LIMIT_MESSAGE = "Stopped after {steps} steps. Is there a loop that never ends?"
DATA_LIMIT_MESSAGE = (
    "Stopped because this run made too much data to show. Try a smaller input."
)
INPUT_MESSAGE = (
    'input() isn\'t available in CodeLens. '
    'Set the value directly, e.g. name = "Ada".'
)


def limit_message(n_steps: int) -> str:
    """The step-limit message for a trace holding ``n_steps`` steps."""
    return LIMIT_MESSAGE.format(steps=n_steps)


# int values with absolute value above this are not exactly representable as a
# JSON number by double-precision consumers, so they become placeholders.
_MAX_SAFE_INT = 2 ** 53

# C-level descriptors, read directly so a metaclass or a student-defined
# property / __getattribute__ can never intercept them.
_type_name_getter = type.__dict__["__name__"].__get__
_type_dict_getter = type.__dict__["__dict__"].__get__
_type_mro_getter = type.__dict__["__mro__"].__get__
_type_flags_getter = type.__dict__["__flags__"].__get__
_exc_args_getter = BaseException.__dict__["args"].__get__
_exc_traceback_getter = BaseException.__dict__["__traceback__"].__get__
_syntax_msg_getter = SyntaxError.__dict__["msg"].__get__
_syntax_lineno_getter = SyntaxError.__dict__["lineno"].__get__

_TPFLAGS_HEAPTYPE = 1 << 9
_GETSET_TYPE = _types.GetSetDescriptorType
# A class (other than object) in the MRO that defines one of these is unsafe.
_UNSAFE_CLASS_ATTRS = frozenset(("__getattribute__", "__getattr__", "__slots__"))


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


def _class_name(cls) -> str:
    return _exact_str(_type_name_getter(cls))


def _type_name(value) -> str:
    """The type name of ``value`` without invoking student-overridable attrs."""
    return _class_name(type(value))


def _line_count(source: str) -> int:
    """Number of source lines as Python counts them (at least 1)."""
    parts = _NEWLINE_RE.split(source)
    n = len(parts) - (1 if parts[-1] == "" else 0)
    return max(1, n)


# -- snapshot --------------------------------------------------------------


def _prim_sort_key(v):
    """``(rank, value)`` for an exact primitive, or None if it can't be ordered.

    Ranks: None < bool < number < str. Only exact types qualify, so comparing
    keys never calls student code, and the order never depends on the string
    hash seed.
    """
    t = type(v)
    if v is None:
        return (0, 0)
    if t is bool:
        return (1, v)
    if t is int:
        return (2, v)
    if t is float:
        return None if math.isnan(v) else (2, v)
    if t is str:
        return (3, v)
    return None


def _set_sort_key(v):
    """Sort key for a set item (a primitive, or a tuple of primitives), or None."""
    if type(v) is tuple:
        keys = []
        for item in v:
            k = _prim_sort_key(item)
            if k is None:
                return None
            keys.append(k)
        return (4, tuple(keys))
    return _prim_sort_key(v)


# Static (non-heap) types can't change and never qualify as heap objects.
_static_type_ids: set = set()
_MISSING = object()


def _dict_descriptor_for(cls):
    """The C ``__dict__`` descriptor for instances of ``cls``, or None if unsafe.

    A class is safe (design.md, "Safety check") when it and every class in its
    MRO other than ``object`` is an exact ``type`` instance whose own
    ``__dict__`` mapping has ``__module__ == "__main__"`` and defines none of
    ``__getattribute__``, ``__getattr__``, ``__slots__``, and the first
    ``__dict__`` entry found along the MRO is a C getset descriptor (a student
    ``__dict__`` property is not). Everything is read through C-level
    descriptors, so no metaclass or student method can run.
    """
    if type(cls) is not type:
        return None  # a custom metaclass
    if not (_type_flags_getter(cls) & _TPFLAGS_HEAPTYPE):
        return None
    desc = _MISSING
    for c in _type_mro_getter(cls):
        if c is object:
            continue
        if type(c) is not type:
            return None
        module = None
        for k, v in _type_dict_getter(c).items():
            if type(k) is not str or k in _UNSAFE_CLASS_ATTRS:
                return None
            if k == "__module__":
                module = v
            elif k == "__dict__" and desc is _MISSING:
                desc = v
        if type(module) is not str or module != "__main__":
            return None  # a builtin or library base class
    if type(desc) is not _GETSET_TYPE:
        return None
    return desc


class _HeapIds:
    """Run-wide table mapping ``id(obj)`` to ``"o<n>"`` in first-seen order.

    It keeps every object it names alive until the run ends, so ``id()`` is
    never reused for another object mid-run, and an object keeps its heap id
    across steps. Python ids never reach the output.
    """

    def __init__(self):
        self.ids: dict = {}
        self.objects: list = []

    def lookup(self, obj):
        return self.ids.get(id(obj))

    def assign(self, obj) -> str:
        key = id(obj)
        hid = self.ids.get(key)
        if hid is None:
            self.objects.append(obj)
            hid = "o" + str(len(self.objects))
            self.ids[key] = hid
        return hid


class _Snap:
    """One step's snapshot context: converts values and collects the heap.

    ``cut`` becomes True whenever a cap drops data: a shortened string, a
    container over MAX_ITEMS, nesting past MAX_NEST_DEPTH, a container that
    contains itself, or a heap object past MAX_HEAP_OBJECTS.
    """

    def __init__(self, ids: _HeapIds):
        self.ids = ids
        self.heap: dict = {}
        self.pending: list = []  # (heap entry, instance dict) to fill in
        self.cut = False
        self.path: set = set()  # id()s of the containers being written
        self.classes: dict = {}  # id(cls) -> __dict__ descriptor or None

    # -- values ----------------------------------------------------------
    def value(self, v, depth: int = 0, refs: bool = True):
        t = type(v)
        # Identity checks only: `t in (...)` would call a metaclass __eq__.
        if v is None or t is bool:
            return v
        if t is int:
            if -_MAX_SAFE_INT <= v <= _MAX_SAFE_INT:
                return v
            return {"__type__": "int"}
        if t is float:
            if math.isfinite(v):
                return v
            return {"__type__": "float"}
        if t is str:
            if len(v) > MAX_STR_LEN:
                self.cut = True
                return v[:MAX_STR_LEN]
            return v
        if t is list or t is tuple or t is dict or t is set or t is frozenset or t is _deque:
            return self._container(v, t, depth, refs)
        return self._object(v, t, refs)

    def _container(self, v, t, depth, refs):
        name = _class_name(t)
        key = id(v)
        if depth >= MAX_NEST_DEPTH or key in self.path:
            self.cut = True
            return {"__type__": name}
        n = len(v)
        if n > MAX_ITEMS:
            self.cut = True
            return {"__type__": name, "__len__": n}
        self.path.add(key)
        d = depth + 1
        value = self.value
        try:
            if t is list or t is tuple:
                return [value(x, d, refs) for x in v]
            if t is dict:
                # Iterate items instead of doing lookups: `k in v` or `v[k]`
                # could call a student key's __hash__ / __eq__.
                return {"__dict": [[value(k, d, False), value(x, d, refs)] for k, x in list(v.items())]}
            if t is _deque:
                return {"__deque": [value(x, d, refs) for x in list(v)]}
            items = list(v)
            keys = []
            for x in items:
                k = _set_sort_key(x)
                if k is None:
                    keys = None
                    break
                keys.append(k)
            if keys is not None:
                order = sorted(range(len(items)), key=keys.__getitem__)
                items = [items[i] for i in order]
            return {"__set": [value(x, d, refs) for x in items]}
        finally:
            self.path.discard(key)

    def _object(self, v, t, refs):
        if refs:
            desc = self._descriptor(t)
            if desc is not None:
                try:
                    inst = desc.__get__(v, t)
                except Exception:  # noqa: BLE001 - defensive: never crash a step
                    inst = None
                if type(inst) is dict:
                    hid = self.ids.lookup(v)
                    if hid is not None and hid in self.heap:
                        return {"__ref": hid}
                    if len(self.heap) >= MAX_HEAP_OBJECTS:
                        self.cut = True
                    else:
                        hid = self.ids.assign(v)
                        tname, tcut = _capped(_class_name(t))
                        if tcut:
                            self.cut = True
                        entry = {"id": hid, "type": tname, "fields": {}}
                        self.heap[hid] = entry
                        self.pending.append((entry, inst))
                        return {"__ref": hid}
        name, cut = _capped(_class_name(t))
        if cut:
            self.cut = True
        return {"__type__": name}

    def _descriptor(self, cls):
        key = id(cls)
        if key in _static_type_ids:
            return None
        cache = self.classes
        if key in cache:
            return cache[key]
        desc = _dict_descriptor_for(cls)
        if desc is None and not (_type_flags_getter(cls) & _TPFLAGS_HEAPTYPE):
            _static_type_ids.add(key)  # static types are immortal: ids stay valid
        cache[key] = desc
        return desc

    # -- heap ------------------------------------------------------------
    def finish(self) -> dict:
        """Fill in every pending heap object's fields (which may add more)."""
        pending = self.pending
        i = 0
        while i < len(pending):
            entry, inst = pending[i]
            i += 1
            fields = {}
            for k, fv in list(inst.items()):
                if type(k) is not str or k.startswith("__"):
                    continue
                if len(k) > MAX_STR_LEN:
                    self.cut = True
                    continue
                fields[k] = self.value(fv)
            entry["fields"] = fields
        self.pending = []
        return self.heap


def snapshot(value):
    """Return ``(json_value, was_cut)`` for one value, per the design table.

    Only exact types qualify; subclasses and anything exotic become a type-only
    placeholder ``{"__type__": <name>}``. ``was_cut`` is True iff a cap dropped
    data. A student-defined object becomes a ``{"__ref": ...}`` into a heap
    that is not returned; use ``snapshot_with_heap`` to keep it.
    """
    snap = _Snap(_HeapIds())
    jv = snap.value(value)
    snap.finish()
    return jv, snap.cut


def snapshot_with_heap(values: dict):
    """``(snapshots, heap, was_cut)`` for a ``{name: value}`` mapping."""
    snap = _Snap(_HeapIds())
    out = {name: snap.value(v) for name, v in values.items()}
    heap = snap.finish()
    return out, heap, snap.cut


def _locals_snapshot(frame, snap: _Snap, want_types: bool, hidden=None):
    """Snapshot a frame's locals. Returns ``(locals, type_names)``.

    Drops dunder names, compiler-internal names such as ``.0``, and non-``str``
    keys. A class body whose namespace is a custom mapping (from a metaclass
    ``__prepare__``) is not read at all, since reading it would run student
    code.
    """
    f_locals = frame.f_locals
    lt = type(f_locals)
    if lt is not dict and lt is not _FRAME_LOCALS_TYPE:
        return {}, {}
    out = {}
    types = {}
    value = snap.value
    for name, v in list(f_locals.items()):
        if type(name) is not str or name.startswith("__") or name.startswith("."):
            continue
        # A prelude's names stay hidden while they hold the very same object
        # (an identity check, so no student code runs).
        if hidden and name in hidden and hidden[name] is v:
            continue
        out[name] = value(v)
        if want_types:
            types[name] = _type_name(v)
    return out, types


# -- step size cap ---------------------------------------------------------


def _escape_surrogate(m) -> str:
    return "\\u%04x" % ord(m.group())


def _to_json(obj) -> str:
    """Compact JSON, UTF-8 friendly; lone surrogates escaped so it always encodes."""
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return _SURROGATE_RE.sub(_escape_surrogate, text)


def _json_size(obj) -> int:
    """UTF-8 byte length of ``_to_json(obj)``."""
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    try:
        return len(text.encode("utf-8"))
    except UnicodeEncodeError:  # lone surrogates: measure the escaped form
        return len(_SURROGATE_RE.sub(_escape_surrogate, text).encode("utf-8"))


def _is_placeholder(jv) -> bool:
    return type(jv) is dict and "__type__" in jv


def _jv_type_name(jv, heap) -> str:
    """Python type name for an already-snapshotted value."""
    if jv is None:
        return "NoneType"
    t = type(jv)
    if t is list:
        return "list"
    if t is dict:
        if "__dict" in jv:
            return "dict"
        if "__set" in jv:
            return "set"
        if "__deque" in jv:
            return "deque"
        if "__ref" in jv:
            entry = heap.get(jv["__ref"])
            return entry["type"] if entry is not None else "object"
    return _class_name(t)


def _as_placeholder(jv, type_name):
    """Type-only placeholder for an already-snapshotted value."""
    if _is_placeholder(jv):
        return jv
    return {"__type__": _capped(type_name)[0]}


def _collect_refs(jv, out: list):
    t = type(jv)
    if t is list:
        for x in jv:
            _collect_refs(x, out)
    elif t is dict:
        ref = jv.get("__ref")
        if ref is not None:
            out.append(ref)
        else:
            for x in jv.values():
                _collect_refs(x, out)


def _prune_heap(step: dict):
    """Keep only heap objects still reachable from the step's values."""
    heap = step["heap"]
    if not heap:
        return
    todo: list = []
    for fr in step["stack"]:
        _collect_refs(fr["locals"], todo)
    _collect_refs(step["locals"], todo)
    if "returnValue" in step:
        _collect_refs(step["returnValue"], todo)
    keep = set()
    while todo:
        ref = todo.pop()
        if ref in keep or ref not in heap:
            continue
        keep.add(ref)
        _collect_refs(heap[ref]["fields"], todo)
    step["heap"] = {k: v for k, v in heap.items() if k in keep}


def _set_current_locals(step: dict, loc: dict):
    step["locals"] = loc
    if step["stack"]:
        step["stack"][-1]["locals"] = loc


def _fit_step(step: dict, types: dict, rv_type=None):
    """Shrink ``step`` in place until its JSON fits STEP_BYTE_CAP.

    Returns ``(dropped, size)``; ``size > STEP_BYTE_CAP`` means it could not be
    made to fit. Stages (design.md, "Step byte cap fallback"):
    1. empty the locals of every stack frame except the current one (whose
       locals must keep equalling the step's locals);
    2. replace each heap object's fields with placeholders;
    3. replace every local (and the return value) with its placeholder, then
       empty ``heap`` (no refs are left, so nothing dangles); then drop the
       locals altogether (very many variables);
    4. keep the longest prefix of the cumulative stdout that fits.
    """
    size = _json_size(step)
    if size <= STEP_BYTE_CAP:
        return False, size

    stack = step["stack"]
    if len(stack) > 1:
        for fr in stack[:-1]:
            fr["locals"] = {}
        _prune_heap(step)
        size = _json_size(step)
        if size <= STEP_BYTE_CAP:
            return True, size

    heap = step["heap"]
    if heap:
        for entry in heap.values():
            entry["fields"] = {
                k: _as_placeholder(v, _jv_type_name(v, heap)) for k, v in entry["fields"].items()
            }
        _prune_heap(step)
        size = _json_size(step)
        if size <= STEP_BYTE_CAP:
            return True, size

    heap = step["heap"]
    _set_current_locals(step, {
        name: _as_placeholder(jv, types.get(name) or _jv_type_name(jv, heap))
        for name, jv in step["locals"].items()
    })
    if "returnValue" in step:
        rv = step["returnValue"]
        step["returnValue"] = _as_placeholder(rv, rv_type or _jv_type_name(rv, heap))
    step["heap"] = {}
    size = _json_size(step)
    if size <= STEP_BYTE_CAP:
        return True, size
    _set_current_locals(step, {})
    size = _json_size(step)
    if size <= STEP_BYTE_CAP:
        return True, size

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
    return True, _json_size(step)


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


# Running byte budget for steps: the terminal exception step (at most
# STEP_BYTE_CAP) and the top-level fields must still fit under TRACE_BYTE_CAP.
_TRACE_STEP_BUDGET = TRACE_BYTE_CAP - STEP_BYTE_CAP - 2048


def _module_frame(line: int, loc: dict) -> dict:
    return {
        "functionName": MODULE_FUNCTION_NAME,
        "frameId": MODULE_FRAME_ID,
        "line": line,
        "locals": loc,
    }


class _Tracer:
    def __init__(self, n_lines: int):
        self.n_lines = n_lines
        self.steps: list[dict] = []
        self.truncated = False
        self.limited = False
        self.limit_message: str | None = None  # set when a byte cap stopped the run
        self.trace_bytes = 0
        # Per-frame state keyed on id(frame). Each state holds the frame itself,
        # so the id can't be reused while the entry exists. Ids never reach the
        # output, so results stay deterministic.
        self.frames: dict[int, dict] = {}
        self.call_counts: dict[str, int] = {}
        self.heap_ids = _HeapIds()
        self.writer = _CappedWriter()
        # Latest exception seen, for the terminal exception step.
        self.exc: dict | None = None
        # Names a prelude defined, hidden from locals (see trace(prelude=...)).
        self.hidden: dict = {}
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

    def _hit_data_limit(self):
        self.limit_message = DATA_LIMIT_MESSAGE
        self._hit_limit()

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
        if self._parent_state(frame) is None:
            frame_id = MODULE_FRAME_ID
        else:
            n = self.call_counts.get(name, 0) + 1
            self.call_counts[name] = n
            frame_id = name + "-" + str(n)
        state = {
            "frame": frame,
            "functionName": name,
            "frameId": frame_id,
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

    def _capture(self, frame, rv=_NO_VALUE) -> dict:
        """Snapshot every active user frame, the return value, and the heap.

        The stack is every frame on the ``f_back`` chain that the tracer has
        state for, outermost first, ending with ``frame``. Values are visited
        in design order: stack locals (outermost first, the current frame
        last), the return value, then heap objects' fields.
        """
        frames = self.frames
        chain = []
        f = frame
        while f is not None:
            st = frames.get(id(f))
            if st is not None and st["frame"] is f:
                chain.append((f, st))
            f = f.f_back
        chain.reverse()

        snap = _Snap(self.heap_ids)
        stack = []
        loc: dict = {}
        types: dict = {}
        cut = False
        last = len(chain) - 1
        for i, (f, st) in enumerate(chain):
            if i == last:
                loc, types = _locals_snapshot(f, snap, True, self.hidden)
                fl = loc
            else:
                fl, _ = _locals_snapshot(f, snap, False, self.hidden)
            stack.append({
                "functionName": st["functionName"],
                "frameId": st["frameId"],
                "line": self._line(f),
                "locals": fl,
            })
            cut = cut or st["cut"]
        rv_jv = _NO_VALUE if rv is _NO_VALUE else snap.value(rv)
        heap = snap.finish()
        return {
            "locals": loc,
            "types": types,
            "rv": rv_jv,
            "rv_type": None if rv is _NO_VALUE else _type_name(rv),
            "heap": heap,
            "stack": stack,
            "cut": cut or snap.cut,
        }

    def _record(self, event, frame, state, rv=_NO_VALUE):
        body = self._capture(frame, rv)
        step = {
            "index": len(self.steps),
            "line": self._line(frame),
            "event": event,
            "functionName": state["functionName"],
            "frameId": state["frameId"],
            "depth": len(body["stack"]) - 1,
            "locals": body["locals"],
            "stdout": self.writer.getvalue(),
        }
        if body["rv"] is not _NO_VALUE:
            step["returnValue"] = body["rv"]
        step["heap"] = body["heap"]
        step["stack"] = body["stack"]
        dropped, size = _fit_step(step, body["types"], body["rv_type"])
        if size > STEP_BYTE_CAP or self.trace_bytes + size + 1 > _TRACE_STEP_BUDGET:
            self._hit_data_limit()
        if dropped or body["cut"]:
            self.truncated = True
        self.trace_bytes += size + 1  # +1 for the separating comma
        self.steps.append(step)

    # -- events ----------------------------------------------------------
    def _on_call(self, frame):
        self._reserve()
        state = self.frames.get(id(frame))
        if state is not None and state["suspended"]:
            # A generator resuming: same frameId; it may be resumed elsewhere.
            state["suspended"] = False
        else:
            state = self._new_state(frame)
        self._record(EVENT_CALL, frame, state)
        state["call_step"] = self.steps[-1]
        state["closing"] = False

    def _on_line(self, frame):
        self._reserve()
        state = self._state(frame)
        # Control resumed in this frame, so any exception that was unwinding
        # through it was caught.
        state["unwinding"] = False
        self._record(EVENT_LINE, frame, state)

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
                orphan = self.steps.pop()
                self.trace_bytes -= _json_size(orphan) + 1
            exc = self.exc
            if exc is not None and exc["frame"] is frame:
                exc["frame_done"] = True
            return
        self._reserve()
        self._record(EVENT_RETURN, frame, state, rv=arg)
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
        self.exc = {
            "value": exc_value,
            "frame": frame,
            "frame_done": False,
            "line": self._line(frame),
            "functionName": state["functionName"],
            "frameId": state["frameId"],
            "body": self._capture(frame),
        }

    # -- terminal step ---------------------------------------------------
    def error_step(self, run_exc):
        """``(step, message, was_cut, fits)`` for an uncaught exception."""
        rec = self.exc
        if rec is None or rec["value"] is not run_exc:
            # The trace function never saw it (unlikely). Fall back.
            line = max(1, min(_last_user_line(run_exc) or 1, self.n_lines))
            loc: dict = {}
            rec = {
                "line": line,
                "functionName": MODULE_FUNCTION_NAME,
                "frameId": MODULE_FRAME_ID,
                "body": {
                    "locals": loc,
                    "types": {},
                    "heap": {},
                    "stack": [_module_frame(line, loc)],
                    "cut": False,
                },
            }
        body = rec["body"]
        type_name, type_cut = _capped(_type_name(run_exc))
        message, msg_cut = _capped(_exception_message(run_exc))
        step = {
            "index": len(self.steps),
            "line": rec["line"],
            "event": EVENT_EXCEPTION,
            "functionName": rec["functionName"],
            "frameId": rec["frameId"],
            "depth": len(body["stack"]) - 1,
            "locals": body["locals"],
            "stdout": self.writer.getvalue(),
            "error": {"type": type_name, "message": message},
            "heap": body["heap"],
            "stack": body["stack"],
        }
        dropped, size = _fit_step(step, body["types"])
        cut = dropped or body["cut"] or type_cut or msg_cut
        return step, message, cut, size <= STEP_BYTE_CAP


def _compile_error_result(err, h: str, n_lines: int) -> dict:
    """A single error step for source that doesn't compile (SyntaxError etc.)."""
    lineno = None
    if issubclass(type(err), SyntaxError):
        lineno = _syntax_lineno_getter(err)
    if type(lineno) is not int or lineno < 1:
        lineno = 1
    line = min(lineno, n_lines)
    type_name, type_cut = _capped(_type_name(err))
    message, msg_cut = _capped(_exception_message(err) or "invalid syntax")
    loc: dict = {}
    step = {
        "index": 0,
        "line": line,
        "event": EVENT_EXCEPTION,
        "functionName": MODULE_FUNCTION_NAME,
        "frameId": MODULE_FRAME_ID,
        "depth": 0,
        "locals": loc,
        "stdout": "",
        "error": {"type": type_name, "message": message},
        "heap": {},
        "stack": [_module_frame(line, loc)],
    }
    dropped, _ = _fit_step(step, {})
    return {
        "steps": [step],
        "status": STATUS_ERROR,
        "message": message,
        "truncated": dropped or type_cut or msg_cut,
        "codeHash": h,
    }


def trace(source: str, prelude: str | None = None) -> dict:
    """Run ``source`` under the tracer and return a TraceResult dict.

    ``prelude`` (our own code, e.g. typing names and TreeNode for practice
    problems) runs first in the same namespace, untraced: it is compiled under
    PRELUDE_FILENAME, so its frames are never recorded, and the names it
    defines are hidden from every step's locals.
    """
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
        if prelude:
            exec(compile(prelude, PRELUDE_FILENAME, "exec"), ns)
            tracer.hidden = {k: v for k, v in ns.items() if not k.startswith("__")}
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
        message = tracer.limit_message or limit_message(len(tracer.steps))
        truncated = True  # the steps past the cap were dropped
    elif run_exc is not None:
        step, message, cut, fits = tracer.error_step(run_exc)
        if fits:
            status = STATUS_ERROR
            tracer.steps.append(step)
            if cut:
                truncated = True
        else:
            status = STATUS_LIMIT
            message = DATA_LIMIT_MESSAGE
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


def trace_json(source: str, prelude: str | None = None) -> str:
    """Run ``source`` and return the TraceResult as compact JSON."""
    return _to_json(trace(source, prelude))
