import { useState } from "react";
import { MISTAKES } from "../components/mistakes";
import { hrefFor } from "../router";
import { clearSessions, loadSessions, mistakeSummary, openInEditor } from "../sessions";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Every Submit, saved only in this browser, with the kinds of mistakes made
// most often so a student can see their own patterns.
export default function SessionsPage() {
  const [sessions, setSessions] = useState(() => loadSessions());
  const summary = mistakeSummary(sessions);
  const top = summary[0];

  function clearAll() {
    if (!window.confirm("Delete every saved session in this browser? This cannot be undone.")) return;
    clearSessions();
    setSessions(loadSessions());
  }

  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>My sessions</h1>
        <p>Every time you press Submit, CodeLens saves the attempt here, only in this browser. Nothing is sent anywhere.</p>
      </div>
      {sessions.length === 0 ? (
        <p className="empty">No sessions yet. Submit a solution on any problem and it will show up here.</p>
      ) : (
        <>
          {top && (
            <section className="panel" aria-labelledby="mistakes-heading">
              <h2 id="mistakes-heading">Your mistakes by kind</h2>
              <ul className="mistake-summary" aria-label="Mistakes by kind">
                {summary.map((s) => (
                  <li key={s.category}>
                    {MISTAKES[s.category].label}: {s.count}
                  </li>
                ))}
              </ul>
              <p className="hint">
                Most common: {MISTAKES[top.category].label}. {MISTAKES[top.category].tip}
              </p>
            </section>
          )}
          <ul className="session-list" aria-label="Saved sessions">
            {sessions.map((s) => (
              <li key={s.id} className="session glass">
                <div className="session-head">
                  <a href={hrefFor({ page: "problem", slug: s.slug })}>{s.title}</a>
                  <span className={s.outcome === "accepted" ? "session-ok" : "session-wrong"}>
                    {s.outcome === "accepted" ? "Accepted" : s.category ? MISTAKES[s.category].label : "Wrong answer"}
                  </span>
                  <time dateTime={s.at}>{when(s.at)}</time>
                </div>
                <p className="session-detail">
                  {s.outcome === "accepted"
                    ? `Checked ${s.input}.`
                    : `Failing input: ${s.input}. ${s.error ? `Stopped with ${s.error.type}.` : `Returned ${s.got}, expected ${s.expected}.`}`}
                </p>
                <button
                  type="button"
                  className="tool-button"
                  aria-label={`Open in editor: ${s.title}, ${when(s.at)}`}
                  onClick={() => {
                    openInEditor(s.slug, s.code);
                    window.location.hash = hrefFor({ page: "problem", slug: s.slug });
                  }}
                >
                  Open in editor
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="tool-button" onClick={clearAll}>
            Clear all sessions
          </button>
        </>
      )}
    </>
  );
}
