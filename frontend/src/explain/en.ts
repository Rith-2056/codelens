// English templates. Voice: a patient tutor talking to a beginner.
// Prose quotes use “…”; Python string values keep straight "…" quotes.

import type { ErrorInfo } from "./errors.ts";
import {
  hasChanges,
  MODULE,
  type Changes,
  type Item,
  type Items,
  type Lead,
  type Membership,
  type OutputView,
  type Plan,
  type Tail,
  type VarView,
} from "./plan.ts";
import type { ValueView } from "./values.ts";

function join(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Join whole clauses: "A, and B" when a clause already has a comma or "and". */
function joinClauses(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.some((x) => x.includes(",") || / and /.test(x))) {
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }
  return join(items);
}

function placeholder(t: string, n: number | undefined): string {
  const count = (one: string, many: string) => (n === undefined ? "" : ` with ${n} ${n === 1 ? one : many}`);
  switch (t) {
    case "list": return "a list" + count("item", "items");
    case "tuple": return "a tuple" + count("item", "items");
    case "dict": return "a dictionary" + count("key", "keys");
    case "set":
    case "frozenset": return "a set" + count("item", "items");
    case "str": return "some text";
    case "int": return "a very large whole number";
    case "float": return "a special decimal value";
    case "bool": return "a True/False value";
    case "NoneType": return "None";
    case "function": return "a function";
    case "builtin_function_or_method": return "a built-in function";
    case "method": return "a method";
    case "type": return "a class";
    case "module": return "a module";
    case "range": return "a range";
    case "generator": return "a generator";
    case "deque": return "a queue (deque)" + count("item", "items");
    default: return `an object of type ${t}` + count("item", "items");
  }
}

function value(v: ValueView): string {
  if (v.kind === "literal") return v.text;
  if (v.kind === "object") {
    if (v.typeName === "") return "an object";
    return v.fields !== undefined ? `${v.typeName}(${v.fields})` : `a ${v.typeName} object`;
  }
  return placeholder(v.typeName, v.length);
}

/** describeShort's English wording. */
export const valueEn = value;

/** True when value(v) reads as code (`x = …`) rather than as words. */
function codeLike(v: ValueView): boolean {
  return v.kind === "literal" || (v.kind === "object" && v.fields !== undefined);
}

function variable(v: VarView): string {
  return codeLike(v.value) ? `${v.name} = ${value(v.value)}` : `${v.name} (${value(v.value)})`;
}

function cell(name: string, index: string[] | undefined, row: boolean): string {
  if (index !== undefined) return `${name}[${index.join("][")}]`;
  return row ? `a row of ${name}` : `a cell of ${name}`;
}

function item(x: Item): string {
  switch (x.kind) {
    case "dictAdd": return `${x.name} now has key ${value(x.key)} with value ${value(x.value)}`;
    case "dictChange": return `${x.name}[${value(x.key)}] changed from ${value(x.before)} to ${value(x.after)}`;
    case "dictRemove": return `key ${value(x.key)} was removed from ${x.name}`;
    case "setAdd": return `${value(x.item)} was added to the set ${x.name}`;
    case "setRemove": return `${value(x.item)} was removed from the set ${x.name}`;
    case "queue":
      if (x.op === "pushed") {
        return x.end === "back" ? `${value(x.item)} joined the back of ${x.name}` : `${value(x.item)} was put at the front of ${x.name}`;
      }
      return `${value(x.item)} was taken off the ${x.end} of ${x.name}`;
    case "cell": return `${cell(x.name, x.index, x.row)} changed from ${value(x.before)} to ${value(x.after)}`;
    case "append": return `${value(x.item)} was added to the end of ${x.name}`;
    case "popEnd": return `${value(x.item)} was removed from the end of ${x.name}`;
    case "field": {
      const where = x.owner !== undefined ? `${x.owner}.${x.field}` : `the field ${x.field} of ${x.typeName !== "" ? `a ${x.typeName} object` : "an object"}`;
      return x.before !== undefined
        ? `${where} changed from ${value(x.before)} to ${value(x.after)}`
        : `${where} is now ${value(x.after)}`;
    }
    case "pointer":
      return `${x.name} moved from ${value(x.before)} to ${value(x.after)}, so it now points at ${x.array}[${x.name}], which is ${value(x.target)}`;
    case "var": return `${x.change.name} changed from ${value(x.change.before)} to ${value(x.change.after)}`;
    case "new":
      return codeLike(x.v.value)
        ? `${x.v.name} was created with the value ${value(x.v.value)}`
        : `${x.v.name} was created (${value(x.v.value)})`;
    case "gone": return `${x.name} was deleted`;
  }
}

function items(it: Items): string {
  const parts = it.list.map(item);
  if (it.output !== undefined) parts.push(`it printed ${output(it.output)}`);
  if (it.more) parts.push("other things changed too");
  return joinClauses(parts);
}

function check(line: number, c: Membership): string {
  const subject = c.subject.name !== undefined
    ? `${c.subject.name} is ${value(c.subject.value)}, which ${c.found ? "is" : "is not"}`
    : `${value(c.subject.value)} ${c.found ? "is" : "is not"}`;
  const where = c.dict ? `a key in ${c.container}` : `in ${c.container}`;
  const then = c.loop
    ? (c.result ? "Python runs the loop body" : "Python leaves the loop")
    : (c.result ? "Python goes into that block" : "Python skips that block");
  return `Line ${line} just checked ${c.cond}: ${subject} ${where}, so it's ${c.result ? "True" : "False"} and ${then}.`;
}

function nowText(now: VarView[]): string {
  return join(now.map((v) => `${v.name} is now ${value(v.value)}`));
}

function output(o: OutputView): string {
  if (o.blank) return "an empty line";
  return join([...o.lines.map((l) => `“${l}”`), ...(o.more ? ["more"] : [])]);
}

function place(p: string): string {
  return p === MODULE ? "the main program" : `the function ${p}`;
}

function pyType(t: string): string {
  switch (t) {
    case "int": return "a whole number (int)";
    case "float": return "a decimal number (float)";
    case "str": return "text (str)";
    case "bool": return "a True/False value (bool)";
    case "NoneType": return "None";
    case "list": return "a list";
    case "tuple": return "a tuple";
    case "dict": return "a dictionary";
    case "set": return "a set";
    case "function": return "a function";
    case "builtin_function_or_method": return "a built-in function";
    default: return `a value of type ${t}`;
  }
}

function changes(c: Changes): string {
  const groups: string[] = [];
  if (c.changed.length > 0) {
    groups.push("changed " + join(c.changed.map((x) => `${x.name} from ${value(x.before)} to ${value(x.after)}`)));
  }
  if (c.created.length > 0) groups.push("created " + join(c.created.map(variable)));
  if (c.removed.length > 0) groups.push("deleted " + join(c.removed));
  if (c.output !== undefined) groups.push("printed " + output(c.output));
  if (c.more) groups.push("changed other variables too");
  if (groups.length === 2) {
    const firstIsList = c.changed.length > 1 || (c.changed.length === 0 && c.created.length > 1);
    return groups.join(firstIsList ? ", and " : " and ");
  }
  return join(groups);
}

function leadText(lead: Lead, tail: Tail): string {
  switch (lead.kind) {
    case "ran":
      if (lead.items !== undefined) return `Line ${lead.line} just ran, and ${items(lead.items)}.`;
      if (lead.check !== undefined) return check(lead.line, lead.check);
      if (hasChanges(lead.changes)) return `Line ${lead.line} just ran and ${changes(lead.changes)}.`;
      return tail.kind === "next" ? `Line ${lead.line} just ran, and no variables changed.` : "";
    case "returned": {
      const who = lead.inner ? `The inner call to ${lead.fn}` : `The function ${lead.fn}`;
      const base = lead.cls
        ? `Python finished setting up the class ${lead.fn}`
        : lead.value !== undefined ? `${who} gave back ${value(lead.value)}` : `${who} ended`;
      if (lead.output !== undefined) return `${base}, and the line that called it finished and printed ${output(lead.output)}.`;
      const back = lead.inner ? `the earlier call of ${lead.place}` : place(lead.place);
      if (lead.now !== undefined) return `${base}; back in ${back}, ${nowText(lead.now)}.`;
      return tail.kind === "next" ? `${base}, and Python is back in ${back}.` : `${base}.`;
    }
    case "entered":
      if (lead.cls) return `Python is now inside the class ${lead.place}.`;
      return lead.place === MODULE
        ? "Python is ready to run your program from the top."
        : `Python is now inside the function ${lead.place}.`;
    case "moved": {
      const base = lead.back ? `Python is back in ${place(lead.place)}` : `Python moved into ${place(lead.place)}`;
      return lead.output !== undefined ? `${base}, after printing ${output(lead.output)}.` : `${base}.`;
    }
    case "none":
      return "";
  }
}

function tailText(tail: Tail, hasLead: boolean): string {
  switch (tail.kind) {
    case "next":
      return tail.again
        ? `Line ${tail.line} is next again, and this time it hasn't run yet.`
        : `Line ${tail.line} is next, and it hasn't run yet.`;
    case "fnDone":
      if (tail.cls) return hasLead ? `Now the class ${tail.fn} is ready.` : `The class ${tail.fn} is ready.`;
      if (tail.toSelf) {
        const who = hasLead ? `Now this call of ${tail.fn}` : `This call of ${tail.fn}`;
        return tail.value !== undefined
          ? `${who} is done and gives back ${value(tail.value)} to the call of ${tail.fn} that was waiting for it.`
          : `${who} is done, and Python goes back to the call of ${tail.fn} that was waiting for it.`;
      }
      if (hasLead) {
        return tail.value !== undefined
          ? `Now the function ${tail.fn} is done and gives back ${value(tail.value)}.`
          : `Now the function ${tail.fn} is done.`;
      }
      return tail.value !== undefined
        ? `The function ${tail.fn} is done and gives back ${value(tail.value)} to the line that called it.`
        : `The function ${tail.fn} is done.`;
    case "end":
      return hasLead
        ? "That was the end of your program, so there's nothing left to run."
        : "Your program has finished, so there's nothing left to run. You can step back to review any moment.";
  }
}

function errorText(line: number, where: string, nothingRan: boolean, e: ErrorInfo): string {
  const loc = where === MODULE ? `Line ${line}` : `Line ${line} (inside the function ${where})`;
  const quote = (m: string) => (m === "" ? "" : ` (“${m}”)`);
  switch (e.kind) {
    case "name":
      if (e.name === undefined) {
        return `${loc} uses a name that Python doesn't know yet. Check the spelling, or create that variable before this line.`;
      }
      if (e.suggestion !== undefined) {
        return `${loc} uses ${e.name}, but Python doesn't know that name yet. Did you mean ${e.suggestion}, or did you forget to create ${e.name} first?`;
      }
      return `${loc} uses ${e.name}, but Python doesn't know that name yet. Did you create ${e.name} before this line, and is it spelled the same everywhere?`;
    case "unbound":
      return `${loc} uses ${e.name} before it has a value inside this function. Give ${e.name} a value earlier in the function, or pass it in as a parameter.`;
    case "operand":
      return `${loc} tried to use ${e.op} with ${pyType(e.left)} and ${pyType(e.right)}, and Python can't mix those. That's a common mix-up: convert one value first, for example with int() or str().`;
    case "concat":
      if (e.left === "str") {
        return `${loc} tried to join text with ${pyType(e.right)} using +, but + can only join text to text. Easy fix: wrap the other value in str() first.`;
      }
      return `${loc} tried to use + to join ${pyType(e.left)} with ${pyType(e.right)}, which Python can't do. Make both sides the same type first, and it will work.`;
    case "notCallable":
      return `${loc} uses ${pyType(e.typeName)} as if it were a function, with ( ) after it. Maybe a variable has the same name as a function, or there are extra parentheses.`;
    case "notSubscriptable":
      return `${loc} used [ ] on ${pyType(e.typeName)}, but [ ] only works on things like lists, text, and dictionaries. Check which variable you meant to use there.`;
    case "notIterable":
      return `${loc} tried to loop over ${pyType(e.typeName)}, but a for loop needs something that holds items, like a list or a range(). Check what you're looping over.`;
    case "arguments":
      return `${loc} called ${e.fn !== undefined ? `the function ${e.fn}` : "a function"} with the wrong number of values${quote(e.message)}. Compare the call with the function's def line to see what's missing or extra.`;
    case "type":
      return `${loc} used a value of the wrong type${quote(e.message)}. Check what kind of value each variable holds; that usually points to the fix.`;
    case "index": {
      if (e.empty) {
        return `${loc} tried to take an item from an empty list. That's easy to fix: check that the list has something in it first, for example with an if.`;
      }
      const [the, unit] = ({
        list: ["the list", "items"],
        string: ["the text", "characters"],
        tuple: ["the tuple", "items"],
        range: ["the range", "numbers"],
        other: ["the sequence", "items"],
      } as const)[e.container];
      return `${loc} asked for a position that ${the} doesn't have. Compare that position with how many ${unit} ${the} really holds; this slip happens to everyone.`;
    }
    case "key":
      return `${loc} looked up ${e.key !== "" ? `the key “${e.key}”` : "a key"}, but the dictionary doesn't have it. Check the spelling, or add that key before reading it.`;
    case "zero":
      return `${loc} tried to divide by zero, which has no answer, so Python stopped there. No worries: before dividing, check that the number you divide by isn't zero, for example with an if.`;
    case "syntax": {
      const what = nothingRan ? "none of your program has run yet" : "it stopped there";
      const hint = e.indent
        ? "Check the spaces at the start of the line: the lines after a colon (:) need to be indented."
        : "Typos like this happen to everyone: look for a missing colon (:), quote, or bracket.";
      return `Python couldn't understand line ${line}${quote(e.message)}, so ${what}. ${hint}`;
    }
    case "input":
      return `${loc} calls input(), but CodeLens can't stop and wait for you to type. Instead, give the variable a value directly, like name = "Ada".`;
    case "other":
      if (e.typeName === "") {
        return `${loc} hit an error, so Python stopped there. Errors are a normal part of coding: read the line carefully, fix it, and run your program again.`;
      }
      if (e.message === "") {
        return `${loc} hit a problem Python calls ${e.typeName}. Errors are a normal part of coding: read that line carefully, fix it, and run your program again.`;
      }
      return `${loc} hit a problem Python calls ${e.typeName}${quote(e.message)}. Errors are a normal part of coding: read the message, fix that line, and run your program again.`;
  }
}

export function renderEn(plan: Plan): string {
  switch (plan.kind) {
    case "start":
      return `Your program is about to start, so nothing has run yet. Line ${plan.line} is the first line to run.`;
    case "resume":
      return `Line ${plan.line} is next, and it hasn't run yet.`;
    case "call": {
      const items = [...plan.params.map(variable), ...(plan.more ? ["more"] : [])];
      const params = items.length > 0 ? ` with ${join(items)}` : "";
      if (plan.cls) {
        return `Python starts setting up the class ${plan.fn} by reading the lines inside it. None of them has run yet.`;
      }
      if (plan.recursive && plan.output === undefined) {
        const first = plan.callerLine !== undefined
          ? `On line ${plan.callerLine}, ${plan.fn} calls itself again${params}.`
          : `${plan.fn} calls itself again${params}.`;
        return `${first} Nothing inside this new call has run yet.`;
      }
      let first: string;
      if (plan.callerLine === undefined) {
        first = `Python is calling the function ${plan.fn}${params}.`;
      } else if (plan.output !== undefined) {
        first = `Line ${plan.callerLine} printed ${output(plan.output)} and then called the function ${plan.fn}${params}, so Python jumps into it.`;
      } else {
        first = `Line ${plan.callerLine} called the function ${plan.fn}${params}, so Python jumps into it.`;
      }
      return `${first} Nothing inside ${plan.fn} has run yet.`;
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
