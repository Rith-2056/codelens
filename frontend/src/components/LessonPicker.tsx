import type { Lesson, LessonId } from "../lessons";

type Props = {
  lessons: readonly Lesson[];
  current: LessonId;
  onPick: (id: LessonId) => void;
};

// Buttons rather than a <select>: some browsers fire `change` on arrow keys in
// a closed select, which would replace the student's code by accident.
export default function LessonPicker({ lessons, current, onPick }: Props) {
  return (
    <div className="lesson-picker" role="group" aria-labelledby="lesson-picker-label">
      <span id="lesson-picker-label" className="lesson-picker-label">
        Lesson:
      </span>
      {lessons.map((lesson) => (
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
  );
}
