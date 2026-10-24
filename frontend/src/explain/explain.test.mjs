// Tests for the deterministic explainer. Run from the repo root:
//   node --test frontend/src/explain/explain.test.mjs
// Node >= 22.18 / 24 strips TypeScript types natively, so this .mjs file can
// import the .ts modules directly. It is .mjs (not .ts) so that
// `npm run typecheck`, which has no Node types, never sees it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { diffStep, explainStep, inventedNumbers, LANGS } from "./index.ts";
import loop from "../../../shared/fixtures/loop.json" with { type: "json" };

const STEPS = loop.steps;

/** A TraceStep with module-level defaults. */
function step(fields) {
  return {
    index: 0,
    line: 1,
    event: "line",
    functionName: "<module>",
    frameId: "module",
    depth: 0,
    locals: {},
    stdout: "",
    ...fields,
  };
}

function fnStep(fn, n, fields) {
  return step({ functionName: fn, frameId: `${fn}-${n}`, depth: 1, ...fields });
}

function errorStep(type, message, fields = {}) {
  return step({ event: "exception", error: { type, message }, ...fields });
}

/** Strip quoted segments (values, output, Python messages) before checking prose. */
function prose(text) {
  return text
    .replace(/“[^”]*”/g, "Q")
    .replace(/«[^»]*»/g, "Q")
    .replace(/"(?:[^"\\]|\\.)*"/g, "Q");
}

function sentenceCount(text) {
  return (prose(text).match(/[.!?](?=\s|$)/g) ?? []).length;
}

/** Checks every explanation must pass, whatever the case. */
function assertWellFormed(text, prev, curr, lang, label) {
  assert.equal(typeof text, "string", label);
  assert.ok(text.length > 0, `${label}: empty`);
  assert.ok(text.length <= 320, `${label}: too long (${text.length}): ${text}`);
  assert.deepEqual(inventedNumbers(text, prev, curr), [], `${label}: invented number in: ${text}`);
  assert.doesNotMatch(text, /__type__|__len__|\{"__|undefined|NaN|\[object Object\]/, `${label}: raw data leaked: ${text}`);
  const n = sentenceCount(text);
  assert.ok(n >= 1 && n <= 2, `${label}: ${n} sentences: ${text}`);
  if (lang === "es") {
    const p = prose(text);
    assert.equal((p.match(/¿/g) ?? []).length, (p.match(/\?/g) ?? []).length, `${label}: unbalanced ¿?: ${text}`);
    assert.equal((p.match(/¡/g) ?? []).length, (p.match(/!/g) ?? []).length, `${label}: unbalanced ¡!: ${text}`);
    assert.doesNotMatch(
      p,
      /\b(linea|funcion|todavia|ejecuto|devolvio|volvio|llamo|mostro|creo|paso de|despues|aqui|asi que)\b/,
      `${label}: missing accent: ${text}`,
    );
    assert.doesNotMatch(p, /\b(Line|just ran|is next|the function|hasn't|and|with)\b/, `${label}: English in Spanish: ${text}`);
  } else {
    assert.doesNotMatch(prose(text), /[áéíóúñ¿¡]/, `${label}: Spanish in English: ${text}`);
  }
}

// --------------------------------------------------------------------------
// Hand-written cases: one per template branch, each with en and es checks.
// --------------------------------------------------------------------------

const add = { __type__: "function" };

const CASES = [
  {
    name: "first step (prev undefined)",
    prev: undefined,
    curr: step({ event: "call" }),
    en: ["Your program is about to start, so nothing has run yet.", "Line 1 is the first line to run."],
    es: ["Tu programa está a punto de empezar", "todavía no se ha ejecutado nada", "es la 1."],
  },
  {
    name: "start of the module body (prev is the module call)",
    prev: step({ event: "call" }),
    curr: step({}),
    en: ["Python is ready to run your program from the top.", "Line 1 is next, and it hasn't run yet."],
    es: ["Python ya está listo", "Ahora sigue la línea 1, que todavía no se ha ejecutado."],
  },
  {
    name: "resume (prev undefined but state already exists)",
    prev: undefined,
    curr: step({ line: 5, locals: { x: 1 } }),
    en: ["Line 5 is next, and it hasn't run yet."],
    es: ["Ahora sigue la línea 5, que todavía no se ha ejecutado."],
  },
  {
    name: "new variable (literal)",
    prev: step({ line: 2 }),
    curr: step({ line: 3, locals: { total: 0 } }),
    en: ["Line 2 just ran and created total = 0.", "Line 3 is next, and it hasn't run yet."],
    es: ["Ya se ejecutó la línea 2: se creó total con el valor 0.", "Ahora sigue la línea 3"],
  },
  {
    name: "new variable (function placeholder)",
    prev: step({ line: 1 }),
    curr: step({ line: 3, locals: { add } }),
    en: ["created add (a function)"],
    es: ["se creó add (una función)"],
  },
  {
    name: "new variable (long list placeholder with __len__)",
    prev: step({ line: 1 }),
    curr: step({ line: 2, locals: { big: { __type__: "list", __len__: 12 } } }),
    en: ["created big (a list with 12 items)"],
    es: ["se creó big (una lista con 12 elementos)"],
  },
  {
    name: "new variables (several, grouped)",
    prev: step({ line: 1 }),
    curr: step({ line: 2, locals: { a: 1, i: 2 } }),
    en: ["created a = 1 and i = 2"],
    es: ["se crearon a = 1 e i = 2"],
  },
  {
    name: "new variables (more than listed)",
    prev: step({ line: 1 }),
    curr: step({ line: 2, locals: { a: 1, b: 2, c: 3, d: 4 } }),
    en: ["created a = 1, b = 2, and c = 3, and changed other variables too."],
    es: ["se crearon a = 1, b = 2 y c = 3, y también cambiaron otras variables."],
  },
  {
    name: "new variables of other shapes (string, bool, None, dict)",
    prev: step({ line: 1 }),
    curr: step({ line: 2, locals: { s: 'say "hi"\n', ok: true, d: { a: 1 } } }),
    en: ['s = "say \\"hi\\"\\n"', "ok = True", 'd = {"a": 1}'],
    es: ['s = "say \\"hi\\"\\n"', "ok = True", 'd = {"a": 1}'],
  },
  {
    name: "changed variable",
    prev: step({ line: 4, locals: { total: 0, n: 3 } }),
    curr: step({ line: 3, locals: { total: 3, n: 3 } }),
    en: ["Line 4 just ran and changed total from 0 to 3.", "Line 3 is next, and it hasn't run yet."],
    es: ["Ya se ejecutó la línea 4: total pasó de 0 a 3.", "Ahora sigue la línea 3, que todavía no se ha ejecutado."],
  },
  {
    name: "changed variable (placeholder to placeholder)",
    prev: step({ line: 2, locals: { big: { __type__: "list", __len__: 12 } } }),
    curr: step({ line: 3, locals: { big: { __type__: "list", __len__: 13 } } }),
    en: ["changed big from a list with 12 items to a list with 13 items"],
    es: ["big pasó de una lista con 12 elementos a una lista con 13 elementos"],
  },
  {
    // Wave 3: an append is described item by item (see structures.test.mjs).
    name: "changed variable (list grows)",
    prev: step({ line: 2, locals: { nums: [3, 1] } }),
    curr: step({ line: 3, locals: { nums: [3, 1, 2] } }),
    en: ["Line 2 just ran, and 2 was added to the end of nums."],
    es: ["Ya se ejecutó la línea 2: 2 se agregó al final de nums."],
  },
  {
    name: "changed variable (list replaced by a different list)",
    prev: step({ line: 2, locals: { nums: [3, 1] } }),
    curr: step({ line: 3, locals: { nums: [5] } }),
    en: ["changed nums from [3, 1] to [5]"],
    es: ["nums pasó de [3, 1] a [5]"],
  },
  {
    name: "deleted variable",
    prev: step({ line: 2, locals: { x: 1, y: 2 } }),
    curr: step({ line: 3, locals: { y: 2 } }),
    en: ["Line 2 just ran and deleted x."],
    es: ["Ya se ejecutó la línea 2: se borró x."],
  },
  {
    name: "output printed",
    prev: step({ line: 4, locals: { result: 5 } }),
    curr: step({ line: 5, locals: { result: 5 }, stdout: "5\n" }),
    en: ["Line 4 just ran and printed “5”.", "Line 5 is next"],
    es: ["Ya se ejecutó la línea 4: se mostró «5» en pantalla.", "Ahora sigue la línea 5"],
  },
  {
    name: "output printed (appended to earlier output, several lines)",
    prev: step({ line: 2, stdout: "old\n" }),
    curr: step({ line: 3, stdout: "old\na\nb\n" }),
    en: ["printed “a” and “b”."],
    es: ["se mostraron «a» y «b» en pantalla."],
  },
  {
    name: "output printed (empty line)",
    prev: step({ line: 2 }),
    curr: step({ line: 3, stdout: "\n" }),
    en: ["printed an empty line"],
    es: ["se mostró una línea vacía en pantalla"],
  },
  {
    name: "changed variable and output together",
    prev: step({ line: 2, locals: { x: 1 } }),
    curr: step({ line: 3, locals: { x: 2 }, stdout: "hi\n" }),
    en: ["Line 2 just ran and changed x from 1 to 2 and printed “hi”."],
    es: ["Ya se ejecutó la línea 2: x pasó de 1 a 2 y se mostró «hi» en pantalla."],
  },
  {
    name: "nothing changed",
    prev: step({ line: 3, locals: { x: 1 } }),
    curr: step({ line: 4, locals: { x: 1 } }),
    en: ["Line 3 just ran, and no variables changed.", "Line 4 is next, and it hasn't run yet."],
    es: ["Ya se ejecutó la línea 3, pero no cambió ninguna variable.", "Ahora sigue la línea 4"],
  },
  {
    name: "same line runs again (one-line loop)",
    prev: step({ line: 2, locals: { n: 0 } }),
    curr: step({ line: 2, locals: { n: 1 } }),
    en: ["changed n from 0 to 1.", "Line 2 is next again, and this time it hasn't run yet."],
    es: ["n pasó de 0 a 1.", "Ahora vuelve a tocar la línea 2, que esta vez todavía no se ha ejecutado."],
  },
  {
    name: "function call",
    prev: step({ line: 3, locals: { add } }),
    curr: fnStep("add", 1, { event: "call", line: 1, locals: { a: 2, b: 3 } }),
    en: ["Line 3 called the function add with a = 2 and b = 3, so Python jumps into it.", "Nothing inside add has run yet."],
    es: ["La línea 3 llamó a la función add con a = 2 y b = 3, así que Python entra en ella.", "Todavía no se ha ejecutado nada dentro de add."],
  },
  {
    name: "function call without parameters",
    prev: step({ line: 4, locals: { greet: add } }),
    curr: fnStep("greet", 1, { event: "call", line: 1 }),
    en: ["Line 4 called the function greet, so Python jumps into it."],
    es: ["La línea 4 llamó a la función greet, así que Python entra en ella."],
  },
  {
    name: "first line inside a function",
    prev: fnStep("add", 1, { event: "call", line: 1, locals: { a: 2, b: 3 } }),
    curr: fnStep("add", 1, { line: 2, locals: { a: 2, b: 3 } }),
    en: ["Python is now inside the function add.", "Line 2 is next, and it hasn't run yet."],
    es: ["Python ya está dentro de la función add.", "Ahora sigue la línea 2"],
  },
  {
    name: "return value",
    prev: fnStep("add", 1, { line: 2, locals: { a: 2, b: 3 } }),
    curr: fnStep("add", 1, { event: "return", line: 2, locals: { a: 2, b: 3 }, returnValue: 5 }),
    en: ["The function add is done and gives back 5 to the line that called it."],
    es: ["La función add ya terminó y le devuelve 5 a la línea que la llamó."],
  },
  {
    name: "return value (placeholder)",
    prev: fnStep("make", 1, { line: 2 }),
    curr: fnStep("make", 1, { event: "return", line: 2, returnValue: { __type__: "list", __len__: 12 } }),
    en: ["gives back a list with 12 items"],
    es: ["le devuelve una lista con 12 elementos"],
  },
  {
    name: "return None after a change in the last line",
    prev: fnStep("g", 1, { line: 2 }),
    curr: fnStep("g", 1, { event: "return", line: 2, locals: { y: 2 }, returnValue: null }),
    en: ["Line 2 just ran and created y = 2.", "Now the function g is done and gives back None."],
    es: ["Ya se ejecutó la línea 2: se creó y con el valor 2.", "Ahora la función g termina y devuelve None."],
  },
  {
    name: "back in the caller after a return",
    prev: fnStep("add", 1, { event: "return", line: 2, locals: { a: 2, b: 3 }, returnValue: 5 }),
    curr: step({ line: 4, locals: { add, result: 5 } }),
    en: ["The function add gave back 5, and Python is back in the main program.", "Line 4 is next"],
    es: ["La función add devolvió 5 y Python volvió al programa principal.", "Ahora sigue la línea 4"],
  },
  {
    name: "back in the caller, which then printed",
    prev: fnStep("add", 1, { event: "return", line: 2, returnValue: 5 }),
    curr: step({ line: 5, locals: { add }, stdout: "5\n" }),
    en: ["The function add gave back 5, and the line that called it finished and printed “5”."],
    es: ["La función add devolvió 5, y la línea que la llamó terminó y mostró «5» en pantalla."],
  },
  {
    name: "recursion: an inner call returns into an outer call of the same function",
    prev: step({ event: "return", line: 3, functionName: "fact", frameId: "fact-3", depth: 3, locals: { n: 1 }, returnValue: 1 }),
    curr: step({ event: "return", line: 4, functionName: "fact", frameId: "fact-2", depth: 2, locals: { n: 2 }, returnValue: 2 }),
    en: ["The inner call to fact gave back 1.", "Now the function fact is done and gives back 2."],
    es: ["La llamada interna a fact devolvió 1.", "Ahora la función fact termina y devuelve 2."],
  },
  {
    name: "back in the main program without a return step (exception caught by caller)",
    prev: fnStep("risky", 1, { line: 2, locals: { a: 1 } }),
    curr: step({ line: 6, locals: { risky: add } }),
    en: ["Python is back in the main program.", "Line 6 is next"],
    es: ["Python volvió al programa principal.", "Ahora sigue la línea 6"],
  },
  {
    name: "program ends (nothing new on the last line)",
    prev: step({ line: 3, locals: { total: 6 } }),
    curr: step({ event: "return", line: 3, locals: { total: 6 }, returnValue: null }),
    en: ["Your program has finished, so there's nothing left to run."],
    es: ["Tu programa terminó, así que ya no queda nada por ejecutar."],
  },
  {
    name: "program ends after printing",
    prev: step({ line: 4, locals: { result: 5 } }),
    curr: step({ event: "return", line: 4, locals: { result: 5 }, stdout: "5\n", returnValue: null }),
    en: ["Line 4 just ran and printed “5”.", "That was the end of your program, so there's nothing left to run."],
    es: ["Ya se ejecutó la línea 4: se mostró «5» en pantalla.", "Ese era el final de tu programa"],
  },
  {
    name: "program ends right after a function returns",
    prev: fnStep("g", 1, { event: "return", line: 2, locals: { y: 2 }, returnValue: null }),
    curr: step({ event: "return", line: 3, locals: { g: add }, returnValue: null }),
    en: ["The function g gave back None.", "That was the end of your program"],
    es: ["La función g devolvió None.", "Ese era el final de tu programa"],
  },
  // ---- errors ----
  {
    name: "NameError",
    prev: step({ line: 1 }),
    curr: errorStep("NameError", "name 'x' is not defined", { line: 1 }),
    en: ["Line 1 uses x, but Python doesn't know that name yet.", "Did you create x before this line"],
    es: ["En la línea 1 se usa x, pero Python todavía no conoce ese nombre.", "¿Creaste x antes de esa línea"],
  },
  {
    name: "NameError with a suggestion",
    prev: step({ line: 3, locals: { total: 0 } }),
    curr: errorStep("NameError", "name 'totl' is not defined. Did you mean: 'total'?", { line: 3, locals: { total: 0 } }),
    en: ["Line 3 uses totl", "Did you mean total, or did you forget to create totl first?"],
    es: ["En la línea 3 se usa totl", "¿Querías escribir total, o te faltó crear totl antes?"],
  },
  {
    name: "UnboundLocalError",
    prev: fnStep("bump", 1, { line: 3 }),
    curr: errorStep("UnboundLocalError", "cannot access local variable 'count' where it is not associated with a value", {
      line: 3, functionName: "bump", frameId: "bump-1", depth: 1,
    }),
    en: ["Line 3 (inside the function bump) uses count before it has a value inside this function."],
    es: ["En la línea 3 (dentro de la función bump) se usa count antes de que tenga un valor"],
  },
  {
    name: "TypeError: text + number",
    prev: step({ line: 2, locals: { age: 12 } }),
    curr: errorStep("TypeError", 'can only concatenate str (not "int") to str', { line: 2, locals: { age: 12 } }),
    en: ["Line 2 tried to join text with a whole number (int) using +", "wrap the other value in str() first"],
    es: ["En la línea 2 se intentó unir un texto con un número entero (int) usando +", "convierte el otro valor con str()"],
  },
  {
    name: "TypeError: unsupported operand",
    prev: step({ line: 1 }),
    curr: errorStep("TypeError", "unsupported operand type(s) for +: 'int' and 'str'", { line: 1 }),
    en: ["Line 1 tried to use + with a whole number (int) and text (str), and Python can't mix those."],
    es: ["En la línea 1 se intentó usar + entre un número entero (int) y un texto (str), pero Python no sabe combinarlos."],
  },
  {
    name: "TypeError: comparison",
    prev: step({ line: 1 }),
    curr: errorStep("TypeError", "'<' not supported between instances of 'str' and 'int'", { line: 1 }),
    en: ["tried to use < with text (str) and a whole number (int)"],
    es: ["se intentó usar < entre un texto (str) y un número entero (int)"],
  },
  {
    name: "TypeError: not callable",
    prev: step({ line: 2 }),
    curr: errorStep("TypeError", "'int' object is not callable", { line: 2 }),
    en: ["uses a whole number (int) as if it were a function"],
    es: ["se usa un número entero (int) como si fuera una función"],
  },
  {
    name: "TypeError: not subscriptable",
    prev: step({ line: 2 }),
    curr: errorStep("TypeError", "'int' object is not subscriptable", { line: 2 }),
    en: ["used [ ] on a whole number (int)"],
    es: ["se usaron corchetes [ ] con un número entero (int)"],
  },
  {
    name: "TypeError: not iterable",
    prev: step({ line: 2 }),
    curr: errorStep("TypeError", "'int' object is not iterable", { line: 2 }),
    en: ["tried to loop over a whole number (int)"],
    es: ["se intentó recorrer un número entero (int) con un bucle"],
  },
  {
    name: "TypeError: wrong number of arguments",
    prev: step({ line: 3, locals: { add } }),
    curr: errorStep("TypeError", "add() missing 1 required positional argument: 'b'", { line: 3, locals: { add } }),
    en: ["Line 3 called the function add with the wrong number of values (“add() missing 1 required positional argument: 'b'”)."],
    es: ["En la línea 3 se llamó a la función add con una cantidad incorrecta de valores («add() missing 1 required positional argument: 'b'»)."],
  },
  {
    name: "TypeError: other message",
    prev: step({ line: 2 }),
    curr: errorStep("TypeError", "object of type 'int' has no len()", { line: 2 }),
    en: ["Line 2 used a value of the wrong type (“object of type 'int' has no len()”)."],
    es: ["En la línea 2 se usó un valor de un tipo que no sirve ahí («object of type 'int' has no len()»)."],
  },
  {
    name: "IndexError (list)",
    prev: step({ line: 2, locals: { nums: [1, 2] } }),
    curr: errorStep("IndexError", "list index out of range", { line: 2, locals: { nums: [1, 2] } }),
    en: ["Line 2 asked for a position that the list doesn't have.", "how many items the list really holds"],
    es: ["En la línea 2 se pidió una posición que no existe en la lista.", "cuántos elementos tiene la lista de verdad"],
  },
  {
    name: "IndexError (string)",
    prev: step({ line: 2, locals: { word: "hi" } }),
    curr: errorStep("IndexError", "string index out of range", { line: 2, locals: { word: "hi" } }),
    en: ["a position that the text doesn't have", "how many characters"],
    es: ["una posición que no existe en el texto", "cuántos caracteres tiene el texto"],
  },
  {
    name: "IndexError (empty list)",
    prev: step({ line: 2, locals: { stack: [] } }),
    curr: errorStep("IndexError", "pop from empty list", { line: 2, locals: { stack: [] } }),
    en: ["Line 2 tried to take an item from an empty list."],
    es: ["En la línea 2 se intentó sacar un elemento de una lista vacía."],
  },
  {
    name: "ZeroDivisionError inside a function",
    prev: fnStep("divide", 1, { line: 2, locals: { a: 3, b: 0 } }),
    curr: errorStep("ZeroDivisionError", "division by zero", {
      line: 2, functionName: "divide", frameId: "divide-1", depth: 1, locals: { a: 3, b: 0 },
    }),
    en: ["Line 2 (inside the function divide) tried to divide by zero", "No worries"],
    es: ["En la línea 2 (dentro de la función divide) se intentó dividir entre cero", "No pasa nada"],
  },
  {
    name: "SyntaxError as the only step (prev undefined)",
    prev: undefined,
    curr: errorStep("SyntaxError", "invalid syntax", { index: 0, line: 2 }),
    en: ["Python couldn't understand line 2 (“invalid syntax”), so none of your program has run yet.", "missing colon (:)"],
    es: ["Python no pudo entender la línea 2 («invalid syntax»), así que tu programa todavía no se ha ejecutado.", "si falta un «:»"],
  },
  {
    name: "SyntaxError about indentation",
    prev: undefined,
    curr: errorStep("SyntaxError", "expected an indented block after 'for' statement on line 3", { index: 0, line: 4 }),
    en: ["Python couldn't understand line 4", "Check the spaces at the start of the line"],
    es: ["Python no pudo entender la línea 4", "Revisa los espacios al principio de la línea"],
  },
  {
    name: "KeyError",
    prev: step({ line: 2, locals: { person: { name: "Ada" } } }),
    curr: errorStep("KeyError", "age", { line: 2, locals: { person: { name: "Ada" } } }),
    en: ["Line 2 looked up the key “age”, but the dictionary doesn't have it."],
    es: ["En la línea 2 se buscó la clave «age», pero el diccionario no la tiene."],
  },
  {
    name: "input() is not available",
    prev: step({ line: 1 }),
    curr: errorStep("RuntimeError", 'input() isn\'t available in CodeLens. Set the value directly, e.g. name = "Ada".', { line: 1 }),
    en: ["Line 1 calls input(), but CodeLens can't stop and wait for you to type."],
    es: ["En la línea 1 se llama a input(), pero CodeLens no puede detenerse a esperar que escribas."],
  },
  {
    name: "generic fallback (ValueError)",
    prev: step({ line: 1 }),
    curr: errorStep("ValueError", "invalid literal for int() with base 10: 'abc'", { line: 1 }),
    en: ["Line 1 hit a problem Python calls ValueError (“invalid literal for int() with base 10: 'abc'”).", "Errors are a normal part of coding"],
    es: ["En la línea 1 apareció un error de tipo ValueError («invalid literal for int() with base 10: 'abc'»).", "Los errores son parte normal de programar"],
  },
  {
    name: "generic fallback with an empty message",
    prev: step({ line: 7 }),
    curr: errorStep("RecursionError", "", { line: 7 }),
    en: ["Line 7 hit a problem Python calls RecursionError.", "read that line carefully"],
    es: ["En la línea 7 apareció un error de tipo RecursionError.", "revisa esa línea con calma"],
  },
  {
    name: "exception step without an error object",
    prev: step({ line: 7 }),
    curr: step({ event: "exception", line: 7 }),
    en: ["Line 7 hit an error, so Python stopped there."],
    es: ["En la línea 7 ocurrió un error y Python se detuvo ahí."],
  },
];

test("every template case reads as expected in English and Spanish", () => {
  for (const c of CASES) {
    for (const lang of LANGS) {
      const text = explainStep(c.prev, c.curr, lang);
      for (const want of c[lang]) {
        assert.ok(text.includes(want), `[${lang}] ${c.name}\n  want: ${want}\n  got:  ${text}`);
      }
      assertWellFormed(text, c.prev, c.curr, lang, `[${lang}] ${c.name}`);
    }
  }
});

test("long values are shortened without inventing numbers", () => {
  const long = "abc 1234567890 " + "9".repeat(60);
  const cases = [
    [step({ line: 1 }), step({ line: 2, locals: { s: long } })],
    [step({ line: 1 }), step({ line: 2, locals: { xs: [123456789, 223456789, 323456789, 423456789, 523456789, 623456789] } })],
    [step({ line: 1 }), step({ line: 2, stdout: "x".repeat(37) + "12345678\n" })],
    [step({ line: 1 }), errorStep("ValueError", "z".repeat(85) + " 1234567890", { line: 2 })],
  ];
  for (const [prev, curr] of cases) {
    for (const lang of LANGS) {
      const text = explainStep(prev, curr, lang);
      assert.ok(text.includes("…"), `expected a shortened value: ${text}`);
      assertWellFormed(text, prev, curr, lang, `[${lang}] long value`);
    }
  }
});

// --------------------------------------------------------------------------
// The loop lesson from shared/fixtures/loop.json.
// --------------------------------------------------------------------------

function explainAll(steps, lang) {
  return steps.map((s, i) => explainStep(i > 0 ? steps[i - 1] : undefined, s, lang));
}

test("loop lesson: every step is well formed in both languages", () => {
  for (const lang of LANGS) {
    explainAll(STEPS, lang).forEach((text, i) => {
      assertWellFormed(text, STEPS[i - 1], STEPS[i], lang, `[${lang}] loop step ${i}`);
    });
  }
});

test("loop lesson: total goes 0 → 3 → 4 → 6 at the right steps", () => {
  const patterns = { en: /changed total from (\d+) to (\d+)/, es: /total pasó de (\d+) a (\d+)/ };
  const created = { en: "created total = 0", es: "se creó total con el valor 0" };
  for (const lang of LANGS) {
    const texts = explainAll(STEPS, lang);
    const seen = [];
    texts.forEach((text, i) => {
      const prev = STEPS[i - 1];
      const curr = STEPS[i];
      const m = text.match(patterns[lang]);
      const totalChanged = prev !== undefined && "total" in prev.locals && "total" in curr.locals
        && prev.locals.total !== curr.locals.total;
      // Mentioned exactly when the snapshot shows the change, with the real values.
      assert.equal(m !== null, totalChanged, `[${lang}] step ${i}: ${text}`);
      if (m) {
        assert.deepEqual([Number(m[1]), Number(m[2])], [prev.locals.total, curr.locals.total]);
        seen.push(`${m[1]}→${m[2]}`);
      }
      const totalCreated = prev !== undefined && !("total" in prev.locals) && "total" in curr.locals;
      assert.equal(text.includes(created[lang]), totalCreated, `[${lang}] step ${i}: ${text}`);
    });
    assert.deepEqual(seen, ["0→3", "3→4", "4→6"], `[${lang}] totals`);
  }
});

test("loop lesson: line steps name the next line and say it hasn't run yet", () => {
  const en = explainAll(STEPS, "en");
  const es = explainAll(STEPS, "es");
  STEPS.forEach((s, i) => {
    if (s.event !== "line") return;
    assert.ok(en[i].includes(`Line ${s.line} is next`) && en[i].includes("hasn't run yet"), `en step ${i}: ${en[i]}`);
    assert.ok(es[i].includes(`la línea ${s.line}, que todavía no se ha ejecutado`), `es step ${i}: ${es[i]}`);
    // The line that just ran is prev.line, never confused with the next one.
    if (i > 1) assert.ok(en[i].startsWith(`Line ${STEPS[i - 1].line} just ran`), `en step ${i}: ${en[i]}`);
  });
  assert.match(en[0], /nothing has run yet/);
  assert.match(es[0], /todavía no se ha ejecutado nada/);
  assert.match(en[en.length - 1], /Your program has finished/);
  assert.match(es[es.length - 1], /Tu programa terminó/);
});

test("loop lesson: no explanation mentions a later total", () => {
  for (const lang of LANGS) {
    explainAll(STEPS, lang).forEach((text, i) => {
      const known = new Set([STEPS[i - 1]?.locals.total, STEPS[i].locals.total].filter((v) => v !== undefined));
      const later = STEPS.slice(i + 1).map((s) => s.locals.total).filter((v) => v !== undefined && !known.has(v));
      for (const v of later) {
        assert.doesNotMatch(text, new RegExp(`total[^.]*\\b${v}\\b`), `[${lang}] step ${i} leaks ${v}: ${text}`);
      }
    });
  }
});

// --------------------------------------------------------------------------
// Number rule, determinism and purity across everything.
// --------------------------------------------------------------------------

function allPairs() {
  const pairs = STEPS.map((s, i) => [STEPS[i - 1], s]);
  for (const c of CASES) pairs.push([c.prev, c.curr]);
  return pairs;
}

test("no explanation contains a number absent from prev/curr (all steps, both languages)", () => {
  for (const [prev, curr] of allPairs()) {
    for (const lang of LANGS) {
      const text = explainStep(prev, curr, lang);
      assert.deepEqual(inventedNumbers(text, prev, curr), [], `[${lang}] ${text}`);
    }
  }
});

test("the number check itself catches invented numbers", () => {
  const prev = STEPS[4];
  const curr = STEPS[5];
  // prev/curr hold lines 4 and 3, numbers [3, 1, 2], total 0 and 3, n 3.
  assert.deepEqual(inventedNumbers("Step 6: total is 3, then 7.", prev, curr), ["6", "7"]);
  assert.deepEqual(inventedNumbers("total changed from 0 to 3 on line 4", prev, curr), []);
  // index, depth and frameId are not sources; step index 5 is not otherwise present.
  assert.deepEqual(inventedNumbers("This is step 5.", STEPS[3], STEPS[4]), ["5"]);
  // Numbers glued to identifiers (x1, add2) are names, not numbers.
  assert.deepEqual(inventedNumbers("x1 and add2", prev, curr), []);
});

function deepFreeze(v) {
  if (v && typeof v === "object") {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

test("explainStep is deterministic and pure", () => {
  const pairs = allPairs();
  const run = () => pairs.flatMap(([p, c]) => LANGS.map((lang) => explainStep(p, c, lang)));
  const first = run();
  assert.deepEqual(run(), first, "same input, same output");

  // Copies give the same text; frozen inputs prove nothing is mutated
  // (ES modules are strict, so a write to a frozen object would throw).
  const copies = pairs.map(([p, c]) => [p && deepFreeze(structuredClone(p)), deepFreeze(structuredClone(c))]);
  assert.deepEqual(copies.flatMap(([p, c]) => LANGS.map((lang) => explainStep(p, c, lang))), first);

  // No clock, randomness or locale formatting: make them all throw.
  const saved = {
    now: Date.now,
    random: Math.random,
    numLocale: Number.prototype.toLocaleString,
    strLocale: String.prototype.localeCompare,
    DateCtor: globalThis.Date,
    Intl: globalThis.Intl,
  };
  const boom = () => { throw new Error("non-deterministic API used"); };
  try {
    Date.now = boom;
    Math.random = boom;
    Number.prototype.toLocaleString = boom;
    String.prototype.localeCompare = boom;
    globalThis.Date = new Proxy(saved.DateCtor, { construct: boom, apply: boom });
    globalThis.Intl = new Proxy({}, { get: boom });
    assert.deepEqual(run(), first);
  } finally {
    Date.now = saved.now;
    Math.random = saved.random;
    Number.prototype.toLocaleString = saved.numLocale;
    String.prototype.localeCompare = saved.strLocale;
    globalThis.Date = saved.DateCtor;
    globalThis.Intl = saved.Intl;
  }
});

// --------------------------------------------------------------------------
// diffStep (task 1)
// --------------------------------------------------------------------------

test("diffStep reports created, changed, removed variables and new output", () => {
  const d = diffStep(
    step({ line: 2, locals: { a: 1, b: [1, 2], gone: true }, stdout: "x\n" }),
    step({ line: 3, locals: { a: 1, b: [1, 2, 3], c: "new" }, stdout: "x\ny\n" }),
  );
  assert.equal(d.first, false);
  assert.equal(d.sameFrame, true);
  assert.deepEqual(d.created, [{ name: "c", value: "new" }]);
  assert.deepEqual(d.changed, [{ name: "b", before: [1, 2], after: [1, 2, 3] }]);
  assert.deepEqual(d.removed, [{ name: "gone", value: true }]);
  assert.equal(d.output, "y\n");
});

test("diffStep handles the first step and frame changes", () => {
  const first = diffStep(undefined, STEPS[0]);
  assert.equal(first.first, true);
  assert.deepEqual([first.created, first.changed, first.removed, first.output], [[], [], [], ""]);

  // Caller and callee locals are unrelated: no variable diff across frames.
  const across = diffStep(step({ line: 3, locals: { add } }), fnStep("add", 1, { event: "call", locals: { a: 2 } }));
  assert.equal(across.sameFrame, false);
  assert.deepEqual([across.created, across.changed, across.removed], [[], [], []]);

  // Equal placeholders and equal dicts (in any key order) are not changes.
  const same = diffStep(
    step({ locals: { f: { __type__: "function" }, d: { a: 1, b: 2 } } }),
    step({ locals: { f: { __type__: "function" }, d: { b: 2, a: 1 } } }),
  );
  assert.deepEqual(same.changed, []);
});
