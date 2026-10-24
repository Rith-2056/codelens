// describeShort: one value as short, readable text in the student's language,
// e.g. `[3, 1, 2]`, `{4: 0}`, `TreeNode(val=2)`, or "a list with 12 items".
// Raw tags (__dict, __set, __deque, __ref) and heap ids never appear.

import type { HeapObject, JsonValue } from "../types/trace.ts";
import { valueEn } from "./en.ts";
import { valueEs } from "./es.ts";
import { viewValue } from "./values.ts";

export function describeShort(v: JsonValue, heap: Record<string, HeapObject> = {}, lang: "en" | "es" = "en"): string {
  const view = viewValue(v, heap ?? {});
  return lang === "es" ? valueEs(view) : valueEn(view);
}
