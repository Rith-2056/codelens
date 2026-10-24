import type { Lang } from "../explain";
import type { Lesson, LessonId } from "../lessons";

type Props = {
  lessons: readonly Lesson[];
  current: LessonId;
  onPick: (id: LessonId) => void;
  lang: Lang;
};

const LEVELS: { level: 1 | 2; label: string }[] = [
  { level: 1, label: "Level 1: How code runs" },
  { level: 2, label: "Level 2: Interview patterns" },
];

const WORDS: Record<Lang, { pattern: string; problem: string }> = {
  en: { pattern: "Pattern", problem: "Problem" },
  es: { pattern: "Patrón", problem: "Problema" },
};

// Buttons rather than a <select>: some browsers fire `change` on arrow keys in
// a closed select, which would replace the student's code by accident.
export default function LessonPicker({ lessons, current, onPick, lang }: Props) {
  const picked = lessons.find((l) => l.id === current);
  return (
    <div className="lesson-picker">
      {LEVELS.map(({ level, label }) => {
        const group = lessons.filter((l) => (l.level ?? 1) === level);
        if (group.length === 0) return null;
        const id = `lesson-level-${level}`;
        return (
          <div key={level} className="lesson-group" role="group" aria-labelledby={id}>
            <span id={id} className="lesson-picker-label">
              {label}
            </span>
            <div className="lesson-buttons">
              {group.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  className="lesson-button"
                  aria-pressed={lesson.id === current}
                  onClick={() => onPick(lesson.id)}
                >
                  {lesson.short}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {picked && picked.level === 2 && (picked.pattern || picked.statement) && (
        <div className="lesson-brief">
          {picked.pattern && (
            <p className="lesson-pattern">
              <strong>{WORDS[lang].pattern}:</strong> {picked.pattern}
            </p>
          )}
          {picked.statement && (
            <p className="lesson-statement" lang={lang}>
              <strong>{WORDS[lang].problem}:</strong> {picked.statement[lang]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
