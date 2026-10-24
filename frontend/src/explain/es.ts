// Plantillas en español. Tono: un tutor paciente que tutea al estudiante.
// Se escriben aparte (no se traducen palabra por palabra del inglés).
// Las citas en prosa usan «…»; los textos de Python mantienen comillas "…".

import type { ErrorInfo } from "./errors.ts";
import { hasChanges, MODULE, type Changes, type Lead, type OutputView, type Plan, type Tail, type VarView } from "./plan.ts";
import type { ValueView } from "./values.ts";

/** "y" becomes "e" before a word that starts with the sound /i/ (i-, hi-). */
function yOrE(next: string): string {
  return /^h?[iíIÍ](?![aeouáéóú])/.test(next) ? "e" : "y";
}

function join(items: string[]): string {
  if (items.length <= 1) return items.join("");
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(", ")} ${yOrE(last)} ${last}`;
}

function placeholder(t: string, n: number | undefined): string {
  const count = (one: string, many: string) => (n === undefined ? "" : ` con ${n} ${n === 1 ? one : many}`);
  switch (t) {
    case "list": return "una lista" + count("elemento", "elementos");
    case "tuple": return "una tupla" + count("elemento", "elementos");
    case "dict": return "un diccionario" + count("clave", "claves");
    case "set":
    case "frozenset": return "un conjunto" + count("elemento", "elementos");
    case "str": return "un texto";
    case "int": return "un número entero muy grande";
    case "float": return "un valor decimal especial";
    case "bool": return "un valor True/False";
    case "NoneType": return "None";
    case "function": return "una función";
    case "builtin_function_or_method": return "una función integrada de Python";
    case "method": return "un método";
    case "type": return "una clase";
    case "module": return "un módulo";
    case "range": return "un rango";
    case "generator": return "un generador";
    default: return `un objeto de tipo ${t}` + count("elemento", "elementos");
  }
}

function value(v: ValueView): string {
  return v.kind === "literal" ? v.text : placeholder(v.typeName, v.length);
}

function variable(v: VarView): string {
  return v.value.kind === "literal" ? `${v.name} = ${v.value.text}` : `${v.name} (${value(v.value)})`;
}

function output(o: OutputView): string {
  if (o.blank) return "una línea vacía";
  return join([...o.lines.map((l) => `«${l}»`), ...(o.more ? ["más"] : [])]);
}

/** "al programa principal" / "a la función f" (a + el = al). */
function toPlace(p: string): string {
  return p === MODULE ? "al programa principal" : `a la función ${p}`;
}

function pyType(t: string): string {
  switch (t) {
    case "int": return "un número entero (int)";
    case "float": return "un número decimal (float)";
    case "str": return "un texto (str)";
    case "bool": return "un valor True/False (bool)";
    case "NoneType": return "None";
    case "list": return "una lista";
    case "tuple": return "una tupla";
    case "dict": return "un diccionario";
    case "set": return "un conjunto";
    case "function": return "una función";
    case "builtin_function_or_method": return "una función integrada";
    default: return `un valor de tipo ${t}`;
  }
}

function changes(c: Changes): string {
  const parts: string[] = [];
  for (const x of c.changed) parts.push(`${x.name} pasó de ${value(x.before)} a ${value(x.after)}`);
  if (c.created.length === 1) {
    const v = c.created[0];
    parts.push(
      v.value.kind === "literal"
        ? `se creó ${v.name} con el valor ${v.value.text}`
        : `se creó ${v.name} (${value(v.value)})`,
    );
  } else if (c.created.length > 1) {
    parts.push(`se crearon ${join(c.created.map(variable))}`);
  }
  if (c.removed.length === 1) parts.push(`se borró ${c.removed[0]}`);
  else if (c.removed.length > 1) parts.push(`se borraron ${join(c.removed)}`);
  if (c.output !== undefined) {
    const single = c.output.blank || (c.output.lines.length === 1 && !c.output.more);
    parts.push(`${single ? "se mostró" : "se mostraron"} ${output(c.output)} en pantalla`);
  }
  if (c.more) parts.push("también cambiaron otras variables");
  // "se crearon a = 1 y b = 2, y se mostró…": a comma before the last "y"
  // keeps a clause from blurring into the list before it.
  if (parts.length >= 2 && parts.slice(0, -1).some((p) => / [ye] /.test(p))) {
    const last = parts[parts.length - 1];
    return `${parts.slice(0, -1).join(", ")}, ${yOrE(last)} ${last}`;
  }
  return join(parts);
}

function leadText(lead: Lead, tail: Tail): string {
  switch (lead.kind) {
    case "ran":
      if (hasChanges(lead.changes)) return `Ya se ejecutó la línea ${lead.line}: ${changes(lead.changes)}.`;
      return tail.kind === "next" ? `Ya se ejecutó la línea ${lead.line}, pero no cambió ninguna variable.` : "";
    case "returned": {
      const who = lead.inner ? `La llamada interna a ${lead.fn}` : `La función ${lead.fn}`;
      const base = lead.value !== undefined ? `${who} devolvió ${value(lead.value)}` : `${who} acabó`;
      if (lead.output !== undefined) {
        return `${base}, y la línea que la llamó terminó y mostró ${output(lead.output)} en pantalla.`;
      }
      return tail.kind === "next" ? `${base} y Python volvió ${toPlace(lead.place)}.` : `${base}.`;
    }
    case "entered":
      return lead.place === MODULE
        ? "Python ya está listo para ejecutar tu programa desde el principio."
        : `Python ya está dentro de la función ${lead.place}.`;
    case "moved": {
      const base = `Python ${lead.back ? "volvió" : "pasó"} ${toPlace(lead.place)}`;
      return lead.output !== undefined ? `${base} después de mostrar ${output(lead.output)} en pantalla.` : `${base}.`;
    }
    case "none":
      return "";
  }
}

function tailText(tail: Tail, hasLead: boolean): string {
  switch (tail.kind) {
    case "next":
      return tail.again
        ? `Ahora vuelve a tocar la línea ${tail.line}, que esta vez todavía no se ha ejecutado.`
        : `Ahora sigue la línea ${tail.line}, que todavía no se ha ejecutado.`;
    case "fnDone":
      if (hasLead) {
        return tail.value !== undefined
          ? `Ahora la función ${tail.fn} termina y devuelve ${value(tail.value)}.`
          : `Ahora la función ${tail.fn} termina.`;
      }
      return tail.value !== undefined
        ? `La función ${tail.fn} ya terminó y le devuelve ${value(tail.value)} a la línea que la llamó.`
        : `La función ${tail.fn} ya terminó.`;
    case "end":
      return hasLead
        ? "Ese era el final de tu programa, así que ya no queda nada por ejecutar."
        : "Tu programa terminó, así que ya no queda nada por ejecutar. Puedes retroceder para repasar cualquier paso.";
  }
}

function errorText(line: number, where: string, nothingRan: boolean, e: ErrorInfo): string {
  const loc = where === MODULE ? `la línea ${line}` : `la línea ${line} (dentro de la función ${where})`;
  const quote = (m: string) => (m === "" ? "" : ` («${m}»)`);
  switch (e.kind) {
    case "name":
      if (e.name === undefined) {
        return `En ${loc} se usa un nombre que Python todavía no conoce. Revisa cómo está escrito o crea esa variable antes de esa línea.`;
      }
      if (e.suggestion !== undefined) {
        return `En ${loc} se usa ${e.name}, pero Python todavía no conoce ese nombre. ¿Querías escribir ${e.suggestion}, o te faltó crear ${e.name} antes?`;
      }
      return `En ${loc} se usa ${e.name}, pero Python todavía no conoce ese nombre. ¿Creaste ${e.name} antes de esa línea y está escrito igual en todas partes?`;
    case "unbound":
      return `En ${loc} se usa ${e.name} antes de que tenga un valor dentro de esta función. Dale un valor a ${e.name} antes, dentro de la función, o pásalo como parámetro.`;
    case "operand":
      return `En ${loc} se intentó usar ${e.op} entre ${pyType(e.left)} y ${pyType(e.right)}, pero Python no sabe combinarlos. Es un error muy común: convierte uno de los valores primero, por ejemplo con int() o str().`;
    case "concat":
      if (e.left === "str") {
        return `En ${loc} se intentó unir un texto con ${pyType(e.right)} usando +, pero + solo une texto con texto. Tiene fácil arreglo: convierte el otro valor con str() antes de unirlos.`;
      }
      return `En ${loc} se intentó unir ${pyType(e.left)} con ${pyType(e.right)} usando +, y eso Python no lo permite. Primero haz que ambos lados sean del mismo tipo.`;
    case "notCallable":
      return `En ${loc} se usa ${pyType(e.typeName)} como si fuera una función, con ( ) detrás. Quizás una variable se llama igual que una función, o sobran unos paréntesis.`;
    case "notSubscriptable":
      return `En ${loc} se usaron corchetes [ ] con ${pyType(e.typeName)}, pero solo funcionan con cosas como listas, textos o diccionarios. Revisa qué variable querías usar ahí.`;
    case "notIterable":
      return `En ${loc} se intentó recorrer ${pyType(e.typeName)} con un bucle, pero un for necesita algo que tenga elementos, como una lista o un range(). Revisa qué estás recorriendo.`;
    case "arguments":
      return `En ${loc} se llamó a ${e.fn !== undefined ? `la función ${e.fn}` : "una función"} con una cantidad incorrecta de valores${quote(e.message)}. Compara la llamada con la línea def de la función para ver qué falta o qué sobra.`;
    case "type":
      return `En ${loc} se usó un valor de un tipo que no sirve ahí${quote(e.message)}. Revisa qué tipo de valor guarda cada variable: casi siempre ahí está la pista.`;
    case "index": {
      if (e.empty) {
        return `En ${loc} se intentó sacar un elemento de una lista vacía. Tiene fácil arreglo: antes, comprueba con un if que la lista tenga algo.`;
      }
      const [the, unit] = ({
        list: ["la lista", "elementos"],
        string: ["el texto", "caracteres"],
        tuple: ["la tupla", "elementos"],
        range: ["el rango", "números"],
        other: ["la secuencia", "elementos"],
      } as const)[e.container];
      return `En ${loc} se pidió una posición que no existe en ${the}. Compara esa posición con cuántos ${unit} tiene ${the} de verdad: es un despiste muy común.`;
    }
    case "key":
      return `En ${loc} se buscó ${e.key !== "" ? `la clave «${e.key}»` : "una clave"}, pero el diccionario no la tiene. Revisa cómo está escrita o agrégala antes de leerla.`;
    case "zero":
      return `En ${loc} se intentó dividir entre cero, algo que no tiene resultado, así que Python se detuvo ahí. No pasa nada: antes de dividir, comprueba con un if que el divisor no sea cero.`;
    case "syntax": {
      const what = nothingRan ? "tu programa todavía no se ha ejecutado" : "se detuvo ahí";
      const hint = e.indent
        ? "Revisa los espacios al principio de la línea: lo que va después de «:» tiene que llevar sangría."
        : "Le pasa a todo el mundo: revisa si falta un «:», unas comillas o un paréntesis.";
      return `Python no pudo entender la línea ${line}${quote(e.message)}, así que ${what}. ${hint}`;
    }
    case "input":
      return `En ${loc} se llama a input(), pero CodeLens no puede detenerse a esperar que escribas. En su lugar, dale un valor directamente a la variable, por ejemplo nombre = "Ada".`;
    case "other":
      if (e.typeName === "") {
        return `En ${loc} ocurrió un error y Python se detuvo ahí. Los errores son parte normal de programar: revisa esa línea con calma, corrígela y vuelve a ejecutar tu programa.`;
      }
      if (e.message === "") {
        return `En ${loc} apareció un error de tipo ${e.typeName}. Los errores son parte normal de programar: revisa esa línea con calma, corrígela y vuelve a ejecutar tu programa.`;
      }
      return `En ${loc} apareció un error de tipo ${e.typeName}${quote(e.message)}. Los errores son parte normal de programar: lee el mensaje, corrige esa línea y vuelve a ejecutar tu programa.`;
  }
}

export function renderEs(plan: Plan): string {
  switch (plan.kind) {
    case "start":
      return `Tu programa está a punto de empezar, así que todavía no se ha ejecutado nada. La primera línea que se va a ejecutar es la ${plan.line}.`;
    case "resume":
      return `Ahora sigue la línea ${plan.line}, que todavía no se ha ejecutado.`;
    case "call": {
      const items = [...plan.params.map(variable), ...(plan.more ? ["más"] : [])];
      const params = items.length > 0 ? ` con ${join(items)}` : "";
      let first: string;
      if (plan.callerLine === undefined) {
        first = `Python está llamando a la función ${plan.fn}${params}.`;
      } else if (plan.output !== undefined) {
        first = `La línea ${plan.callerLine} mostró ${output(plan.output)} en pantalla y luego llamó a la función ${plan.fn}${params}, así que Python entra en ella.`;
      } else {
        first = `La línea ${plan.callerLine} llamó a la función ${plan.fn}${params}, así que Python entra en ella.`;
      }
      return `${first} Todavía no se ha ejecutado nada dentro de ${plan.fn}.`;
    }
    case "error":
      return errorText(plan.line, plan.place, plan.nothingRan, plan.error);
    case "flow": {
      const lead = leadText(plan.lead, plan.tail);
      const tail = tailText(plan.tail, lead !== "");
      return lead === "" ? tail : `${lead} ${tail}`;
    }
  }
}
