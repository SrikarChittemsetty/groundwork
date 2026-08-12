import { describe, it, expect } from "vitest";
import { isSubmitChord, type SubmitKeyEvent } from "../src/lib/keys";

// The rule that matters most here is the one about plain Enter. These are
// multi-line boxes people write paragraphs in; if Enter submitted, it would
// eat someone's thought mid-sentence, and no amount of saved clicking is worth
// that. Everything else is convenience.

const press = (over: Partial<SubmitKeyEvent> = {}): SubmitKeyEvent => ({
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe("the submit chord", () => {
  it("fires on Cmd+Enter", () => {
    expect(isSubmitChord(press({ metaKey: true }))).toBe(true);
  });

  it("fires on Ctrl+Enter, so the habit travels between platforms", () => {
    expect(isSubmitChord(press({ ctrlKey: true }))).toBe(true);
  });

  // The important one.
  it("never fires on plain Enter — that has to stay a new line", () => {
    expect(isSubmitChord(press())).toBe(false);
  });

  it("leaves Shift+Enter alone", () => {
    expect(isSubmitChord(press({ shiftKey: true }))).toBe(false);
    expect(isSubmitChord(press({ metaKey: true, shiftKey: true }))).toBe(false);
  });

  it("leaves Alt+Enter alone", () => {
    expect(isSubmitChord(press({ metaKey: true, altKey: true }))).toBe(false);
  });

  it("ignores every other key, modified or not", () => {
    for (const key of ["a", "Escape", "Tab", " ", "s"]) {
      expect(isSubmitChord(press({ key, metaKey: true }))).toBe(false);
      expect(isSubmitChord(press({ key }))).toBe(false);
    }
  });
});
