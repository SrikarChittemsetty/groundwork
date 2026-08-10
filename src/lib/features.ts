// Whether the AI features exist at all for this installation.
//
// The tool is designed to be complete without them. Values, decisions, the
// timeline, your own written reflections, and the mechanically-derived
// patterns all work with no model, no API key, and no cost — someone who just
// wants to sit with their own record and think should never be nagged toward
// something that bills them.
//
// Set AI_ENABLED="false" to remove Reflect's generate button and the Ask page
// entirely. Unset, it follows whether inference is actually available.

export function aiEnabled(): boolean {
  const flag = process.env.AI_ENABLED;
  if (flag === "false") return false;
  if (flag === "true") return true;

  // Auto: available if a key is configured, or in dev where mocks stand in.
  if (process.env.ANTHROPIC_API_KEY) return true;
  return process.env.NODE_ENV !== "production";
}
