"use client";

import { useEffect, useState } from "react";

// The keyboard hint next to a submit button.
//
// Rendered client-side after mount because it depends on the platform: showing
// a Mac user "Ctrl" is worse than showing nothing, and the server has no idea
// which they are. Before mount it renders the Mac form, which is what most
// people using this will see, and corrects itself immediately.
//
// A shortcut nobody is told about may as well not exist, but it also mustn't
// compete with the writing — hence a small muted hint rather than a chip.
export default function Chord() {
  const [ctrl, setCtrl] = useState(false);

  useEffect(() => {
    setCtrl(!/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  return (
    <span className="chord" aria-hidden="true">
      {ctrl ? "Ctrl" : "⌘"}↵
    </span>
  );
}
