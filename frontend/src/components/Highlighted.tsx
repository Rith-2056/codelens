import type { Token } from "./highlight";

/** One line of colored code: each token is a span with a `tok-<kind>` class. */
export default function Highlighted({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((t, k) =>
        t.kind ? (
          <span key={k} className={`tok-${t.kind}`}>
            {t.text}
          </span>
        ) : (
          t.text
        ),
      )}
    </>
  );
}
