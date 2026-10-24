import type { StepChange } from "./focus";

/** "What changed" on a step, as chips; arrows are shown, not spoken. Notes are facts worth seeing, e.g. pointers on the same cell. */
export default function ChangeList({ changes, notes = [] }: { changes: StepChange[]; notes?: string[] }) {
  if (changes.length === 0 && notes.length === 0) return <p className="cv-quiet">Nothing changed on this step.</p>;
  return (
    <ul className="cv-chips" aria-label="What changed">
      {changes.map((c) => (
        <li key={c.shown} className="cv-chip cv-chip-changed">
          <span aria-hidden="true">{c.shown}</span>
          <span className="sr-only">{c.spoken}</span>
        </li>
      ))}
      {notes.map((n) => (
        <li key={n} className="cv-chip cv-chip-note">
          {n}
        </li>
      ))}
    </ul>
  );
}
