import { useState } from "react";
import CodeView from "./components/CodeView";
import Narrator from "./components/Narrator";
import Timeline from "./components/Timeline";
import Variables from "./components/Variables";
import { previousInFrame } from "./components/stepInfo";
import { loopLesson } from "./lessons";
import "./styles.css";

export default function App() {
  const lesson = loopLesson;
  const steps = lesson.fixture.steps;
  const [stepIndex, setStepIndex] = useState(0);
  const index = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const step = steps[index];
  const previous = previousInFrame(steps, index);

  return (
    <div className="app">
      <header className="app-header">
        <h1>CodeLens</h1>
        <p>Watch your Python program run, one step at a time.</p>
      </header>
      <main className="layout">
        <section className="panel" aria-labelledby="code-heading">
          <h2 id="code-heading">{lesson.title}</h2>
          <CodeView source={lesson.source} step={step} />
          <Timeline
            index={index}
            total={steps.length}
            onIndexChange={setStepIndex}
          />
          <p className="hint">
            Tip: use the Left and Right arrow keys to step.
          </p>
        </section>
        <section className="panel" aria-labelledby="vars-heading">
          <h2 id="vars-heading">Variables</h2>
          <p className="hint">
            Values right now, before the highlighted line runs.
          </p>
          {step ? (
            <Variables current={step.locals} previous={previous?.locals} />
          ) : (
            <p className="empty">There are no steps to show.</p>
          )}
        </section>
      </main>
      <Narrator
        source={lesson.source}
        step={step}
        index={index}
        total={steps.length}
      />
    </div>
  );
}
