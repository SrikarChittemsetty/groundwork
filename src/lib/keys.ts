// Submitting from the keyboard.
//
// The core loop here is: type an answer, submit, get asked why again, type the
// next one. Reaching for the mouse between every step breaks the thing this
// app is for — you're trying to hold a thought still long enough to look at
// it, and a hand leaving the keyboard is a small interruption repeated a dozen
// times per argument.
//
// Cmd+Enter (⌘⏎) on a Mac, Ctrl+Enter elsewhere. Deliberately NOT plain Enter:
// these are multi-line boxes and people write more than one sentence in them,
// so Enter has to keep meaning "new line". Getting that backwards would lose
// someone's paragraph mid-thought, which is worse than any amount of clicking.

export type SubmitKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function isSubmitChord(e: SubmitKeyEvent): boolean {
  if (e.key !== "Enter") return false;
  // Either modifier, so the same muscle memory works on either platform.
  if (!e.metaKey && !e.ctrlKey) return false;
  // Shift+Enter and Alt+Enter mean other things in text fields; leave them be.
  if (e.shiftKey || e.altKey) return false;
  return true;
}

// Wrap a submit action as a keydown handler. `enabled` mirrors whatever
// disables the button, so a shortcut can't do what a click currently can't —
// firing an empty or already-in-flight submit from the keyboard would be a
// second way to reach a state the UI is deliberately preventing.
export function submitOnChord(
  action: () => void,
  enabled = true
): (e: React.KeyboardEvent) => void {
  return (e) => {
    if (!isSubmitChord(e)) return;
    e.preventDefault();
    if (enabled) action();
  };
}
