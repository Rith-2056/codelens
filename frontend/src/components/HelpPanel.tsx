import { useState } from "react";
import { fetchHelp, type HelpLevel, type HelpReply, type HelpRequest } from "../explain/help";

const ASK: Record<HelpLevel, string> = {
  1: "Show a gentle hint",
  2: "Explain what went wrong",
  3: "Show a possible fix",
};
const TITLE: Record<HelpLevel, string> = {
  1: "Hint",
  2: "What went wrong",
  3: "A possible fix",
};

/** `inline code` in tutor text, shown as code. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/`([^`\n]+)`/);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <code key={i}>{p}</code> : p))}</>;
}

/** Split tutor text into paragraphs and ```fenced``` code blocks. */
function HelpText({ text }: { text: string }) {
  const parts = text.split(/```(?:python)?\n?([\s\S]*?)```/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="help-code">
            <code>{part.replace(/\n$/, "")}</code>
          </pre>
        ) : (
          part.trim() && (
            <p key={i} className="help-text">
              <Inline text={part.trim()} />
            </p>
          )
        ),
      )}
    </>
  );
}

// Three levels of help for a wrong answer, unlocked one at a time so the
// student tries each before asking for more: a gentle hint, then what went
// wrong, then a possible fix. Never a whole new solution.
export default function HelpPanel({ request }: { request: Omit<HelpRequest, "level"> }) {
  const [replies, setReplies] = useState<HelpReply[]>([]);
  const [asking, setAsking] = useState(false);
  const next = (replies.length + 1) as HelpLevel | 4;

  async function ask(level: HelpLevel) {
    if (asking) return;
    setAsking(true);
    try {
      const reply = await fetchHelp({ ...request, level });
      setReplies((rs) => [...rs, reply]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="panel help" aria-label="Stuck? Get help">
      <h2>Stuck? Get help</h2>
      <p className="hint">Three levels, one at a time. Try each one before asking for the next.</p>
      {replies.length > 0 && (
        <ol className="help-levels">
          {replies.map((r) => (
            <li key={r.level} className="help-level">
              <h3 className="subheading">{TITLE[r.level]}</h3>
              <HelpText text={r.text} />
              <p className="help-source">
                {r.source === "llm" ? "From the AI tutor, checked against your run." : "Built-in help (the AI tutor is offline)."}
              </p>
            </li>
          ))}
        </ol>
      )}
      {next <= 3 && (
        <button type="button" className="tool-button" onClick={() => ask(next as HelpLevel)} aria-disabled={asking}>
          {ASK[next as HelpLevel]}
        </button>
      )}
      {asking && (
        <p className="hint" role="status">
          Asking the tutor…
        </p>
      )}
    </section>
  );
}
