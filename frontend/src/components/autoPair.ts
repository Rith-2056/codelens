// IDE-style brackets and quotes for the editor, as a pure function: given a
// key, the text and the selection, the edit to make (or null to let the key
// do its normal thing). Matches what students know from VS Code:
// - ( [ { add the closing bracket (only before a space, a closing bracket or
//   the end of the line, so typing in front of a word does not);
// - " and ' pair up too, but not right after a letter or digit (it's);
// - typing a closing bracket or quote that is already next steps over it;
// - with text selected, a bracket or quote wraps it;
// - Backspace inside an empty pair deletes both halves, and in a line's
//   leading spaces goes back one indent level;
// - Enter between brackets puts the closing one on its own line.

export type Edit = { value: string; selStart: number; selEnd: number };

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
const CLOSERS = new Set([")", "]", "}"]);
const INDENT = "    ";

/** The caret may get a closing partner only before these. */
const closesBefore = (next: string | undefined) => next === undefined || /[\s)\]}:,;]/.test(next);

export function autoPair(key: string, value: string, start: number, end: number): Edit | null {
  const before = value[start - 1];
  const next = value[end];
  const replace = (text: string, selStart: number, selEnd = selStart): Edit => ({
    value: value.slice(0, start) + text + value.slice(end),
    selStart,
    selEnd,
  });

  if (key in PAIRS) {
    const close = PAIRS[key]!;
    if (start !== end) return replace(key + value.slice(start, end) + close, start + 1, end + 1);
    const isQuote = key === close;
    if (isQuote && next === key) return { value, selStart: start + 1, selEnd: start + 1 };
    if (isQuote && before !== undefined && /\w/.test(before)) return null;
    if (!closesBefore(next)) return null;
    return replace(key + close, start + 1);
  }

  if (CLOSERS.has(key)) {
    return start === end && next === key ? { value, selStart: start + 1, selEnd: start + 1 } : null;
  }

  const emptyPair = start === end && before !== undefined && next !== undefined && PAIRS[before] === next;

  if (key === "Backspace" && emptyPair) {
    return { value: value.slice(0, start - 1) + value.slice(start + 1), selStart: start - 1, selEnd: start - 1 };
  }

  // Backspace in a line's leading spaces: back to the previous indent level.
  if (key === "Backspace" && start === end) {
    const lead = value.slice(value.lastIndexOf("\n", start - 1) + 1, start);
    if (lead.length > 0 && /^ +$/.test(lead)) {
      const to = start - (lead.length % INDENT.length || INDENT.length);
      return { value: value.slice(0, to) + value.slice(start), selStart: to, selEnd: to };
    }
  }

  if (key === "Enter" && emptyPair && before !== '"' && before !== "'") {
    const line = value.slice(value.lastIndexOf("\n", start - 1) + 1, start);
    const indent = /^[ \t]*/.exec(line)![0];
    const inner = "\n" + indent + INDENT;
    return replace(inner + "\n" + indent, start + inner.length);
  }

  return null;
}
