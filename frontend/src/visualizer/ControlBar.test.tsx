// The execution control bar: always on screen in the Code Visualizer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import ControlBar, { SPEEDS } from "./ControlBar";

function Harness({ total = 5 }: { total?: number }) {
  const [i, setI] = useState(0);
  return <ControlBar index={i} total={total} line={i + 10} onIndexChange={setI} description={`Description of step ${i + 1}.`} />;
}

const step = () => screen.getByRole("slider", { name: "Step" }).getAttribute("aria-valuetext");
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ControlBar", () => {
  it("shows progress and a short description of the current step", () => {
    render(<Harness />);
    expect(step()).toBe("Step 1 of 5, line 10");
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    expect(screen.getByText("Description of step 1.")).toBeTruthy();
    fireEvent.click(button("Next step"));
    expect(step()).toBe("Step 2 of 5, line 11");
    expect(screen.getByText("Description of step 2.")).toBeTruthy();
    fireEvent.click(button("Previous step"));
    expect(step()).toBe("Step 1 of 5, line 10");
  });

  it("plays one step per tick at the chosen speed, then stops at the end", () => {
    render(<Harness />);
    fireEvent.click(button("Play"));
    expect(button("Pause")).toBeTruthy();
    act(() => vi.advanceTimersByTime(SPEEDS[1]!.ms));
    expect(step()).toBe("Step 2 of 5, line 11");
    fireEvent.change(screen.getByRole("combobox", { name: "Speed" }), { target: { value: "4" } });
    for (let k = 0; k < 3; k++) act(() => vi.advanceTimersByTime(SPEEDS[3]!.ms)); // React schedules each next tick after a render
    expect(step()).toBe("Step 5 of 5, line 14");
    act(() => vi.advanceTimersByTime(5000));
    expect(step()).toBe("Step 5 of 5, line 14");
    expect(button("Play")).toBeTruthy(); // stopped by itself at the last step
  });

  it("Play at the last step starts over; stepping by hand pauses", () => {
    render(<Harness total={3} />);
    fireEvent.change(screen.getByRole("slider", { name: "Step" }), { target: { value: "2" } });
    fireEvent.click(button("Play"));
    expect(step()).toBe("Step 1 of 3, line 10");
    fireEvent.click(button("Next step"));
    expect(button("Play")).toBeTruthy();
    act(() => vi.advanceTimersByTime(5000));
    expect(step()).toBe("Step 2 of 3, line 11");
  });

  it("Restart goes back to step 1", () => {
    render(<Harness />);
    fireEvent.click(button("Next step"));
    fireEvent.click(button("Next step"));
    fireEvent.click(button("Restart"));
    expect(step()).toBe("Step 1 of 5, line 10");
  });

  it("Left and Right arrow keys step, but not while typing", () => {
    render(
      <>
        <input aria-label="typing" />
        <Harness />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(step()).toBe("Step 2 of 5, line 11");
    fireEvent.keyDown(screen.getByRole("textbox", { name: "typing" }), { key: "ArrowRight" });
    expect(step()).toBe("Step 2 of 5, line 11");
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(step()).toBe("Step 1 of 5, line 10");
  });

  it("the ends are announced as unavailable, not removed (focus stays put)", () => {
    render(<Harness total={2} />);
    expect(button("Previous step").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button("Next step"));
    expect(button("Next step").getAttribute("aria-disabled")).toBe("true");
  });
});
