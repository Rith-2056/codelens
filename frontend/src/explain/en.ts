// English templates. Voice: a patient tutor talking to a beginner.
// Prose quotes use “…”; Python string values keep straight "…" quotes.

import type { ErrorInfo } from "./errors.ts";
import { hasChanges, MODULE, type Changes, type Lead, type OutputView, type Plan, type Tail, type VarView } from "./plan.ts";
import type { ValueView } from "./values.ts";

function join(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
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
    default: return `an object of type ${t}` + count("item", "items");
  }
}

function value(v: ValueView): string {
  return v.kind === "literal" ? v.text : placeholder(v.typeName, v.length);
}

function variable(v: VarView): string {
  return v.value.kind === "literal" ? `${v.name} = ${v.value.text}` : `${v.name} (${value(v.value)})`;
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
      if (hasChanges(lead.changes)) return `Line ${lead.line} just ran and ${changes(lead.changes)}.`;
      return tail.kind === "next" ? `Line ${lead.line} just ran, and no variables changed.` : "";
    case "returned": {
      const who = lead.inner ? `The inner call to ${lead.fn}` : `The function ${lead.fn}`;
      const base = lead.value !== undefined ? `${who} gave back ${value(lead.value)}` : `${who} ended`;
      if (lead.output !== undefined) return `${base}, and the line that called it finished and printed ${output(lead.output)}.`;
      return tail.kind === "next" ? `${base}, and Python is back in ${place(lead.place)}.` : `${base}.`;
    }
    case "entered":
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
