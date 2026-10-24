import type { StepChange } from "./focus";

/** "What changed" on a step, as chips; arrows are shown, not spoken. */
export default function ChangeList({ changes }: { changes: StepChange[] }) {
  if (changes.length === 0) return <p className="cv-quiet">Nothing changed on this step.</p>;
  return (
    <ul className="cv-chips" aria-label="What changed">
      {changes.map((c) => (
        <li key={c.shown} className="cv-chip cv-chip-changed">
          <span aria-hidden="true">{c.shown}</span>
          <span className="sr-only">{c.spoken}</span>
        </li>
      ))}
    </ul>
  );
}
