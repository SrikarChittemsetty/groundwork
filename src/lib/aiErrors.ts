// Turn a provider exception into something safe and useful to show a user.
//
// The raw error is deliberately not returned: it carries request ids, internal
// JSON, and provider wording that means nothing to the person using this, and
// leaking upstream error bodies to the browser is a habit worth not forming.
// The detail is logged server-side instead.

export type AiFailure = { message: string; status: number };

export function describeAiError(err: unknown, action: string): AiFailure {
  const raw = err instanceof Error ? err.message : String(err);

  // Log the real thing where the operator can see it.
  console.error(`[groundwork] ${action} failed:`, raw);

  // Configuration problem — the operator needs to know precisely what's wrong.
  if (raw.includes("ANTHROPIC_API_KEY")) {
    return { message: raw, status: 500 };
  }

  // The model declined the content; generateReflection throws this itself.
  if (raw.includes("declined to respond")) {
    return { message: raw, status: 502 };
  }

  const status = (err as { status?: number })?.status;

  if (status === 401 || status === 403) {
    return {
      message:
        "The AI service rejected the API key. Check ANTHROPIC_API_KEY in your environment.",
      status: 502,
    };
  }
  if (status === 429) {
    return {
      message:
        "The AI service is rate-limiting requests right now. Try again shortly.",
      status: 502,
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      message: "The AI service is having trouble. Try again in a moment.",
      status: 502,
    };
  }

  return {
    message: `Couldn't ${action} right now. Nothing was saved — try again.`,
    status: 502,
  };
}
