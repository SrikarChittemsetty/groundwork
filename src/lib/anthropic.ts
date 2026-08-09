import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env to enable reflections."
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

export const REFLECTION_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

// Dev-only mock mode: when running outside production with no API key set,
// the AI endpoints return clearly-labeled canned output so the full product
// loop is visible and testable. Hard-gated off in production — a prod deploy
// with a missing key fails loudly instead of silently faking output.
export const AI_MOCK_MODE =
  process.env.NODE_ENV !== "production" && !process.env.ANTHROPIC_API_KEY;

export const MOCK_MODEL_LABEL = "dev-mock (no API key)";

export type ValueInput = { title: string; body: string };
export type DecisionInput = {
  body: string;
  occurredAt: Date;
  // Titles of the values the user themselves said this decision bears on.
  linkedValueTitles?: string[];
};

// The reflection prompt encodes the product's core principle: VISIBILITY, NOT
// VERDICTS. The model surfaces observations and open questions about alignment
// and tension — it must not hand down a judgment ("you're a hypocrite" /
// "you're consistent"). The user interprets their own trajectory.
export const SYSTEM_PROMPT = `You are a careful, warm reflection assistant inside a private, single-user tool. The person using you has written down their own core values and logged real decisions they made. Your job is to hold up an honest mirror.

Strict rules:
- VISIBILITY, NOT VERDICTS. Surface patterns, alignments, and tensions as observations and open questions. Never deliver an overall verdict like "you are a hypocrite" or "you are living consistently." Do not score, grade, or rank the person.
- No moralizing and no praise-seeking flattery. Be honest and specific, grounded only in what they actually wrote.
- Where a decision seems to sit in tension with a stated value, name the tension plainly and neutrally, then ask a question that helps them think — do not resolve it for them.
- Where decisions line up with values, note it just as plainly, without turning it into a gold star.
- If there isn't enough logged data to say much, say so honestly rather than inventing patterns.
- This is a private mirror, not social media. There is no audience but them.

Format your response in short, readable Markdown with these sections:
## Where things seem to line up
## Where there may be tension
## Questions worth sitting with
Keep it concise and human — a few observations per section, not an exhaustive list.`;

export function buildUserMessage(
  values: ValueInput[],
  decisions: DecisionInput[]
): string {
  const valuesText =
    values.length > 0
      ? values
          .map((v, i) => `${i + 1}. ${v.title}\n   ${v.body}`)
          .join("\n")
      : "(none recorded yet)";

  const decisionsText =
    decisions.length > 0
      ? decisions
          .slice()
          .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
          .map((d) => {
            const linked =
              d.linkedValueTitles && d.linkedValueTitles.length > 0
                ? ` (I tagged this as bearing on: ${d.linkedValueTitles.join(
                    "; "
                  )})`
                : "";
            return `- [${d.occurredAt
              .toISOString()
              .slice(0, 10)}] ${d.body}${linked}`;
          })
          .join("\n")
      : "(none logged yet)";

  return `Here are my stated values:\n${valuesText}\n\nHere are decisions/actions I logged, oldest first. Where I tagged a decision as bearing on particular values, that tagging is my own judgment — treat it as what I believed the decision was about, and weigh the decision against those values first:\n${decisionsText}\n\nPlease reflect honestly on where these line up and where there is tension, following your rules.`;
}

export async function generateReflection(
  values: ValueInput[],
  decisions: DecisionInput[]
): Promise<{ text: string; model: string }> {
  if (AI_MOCK_MODE) {
    return { text: mockReflection(values, decisions), model: MOCK_MODEL_LABEL };
  }
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: REFLECTION_MODEL,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(values, decisions) }],
  });

  return { text: extractText(response), model: REFLECTION_MODEL };
}

// --- "What should I do?" decision aid -------------------------------------
//
// Practical-syllogism-style guidance: start from the user's OWN stated values
// (major premises) and the situation they describe (minor premise), and lay
// out how the reasoning runs — which values bear on it, where they pull in
// different directions, and what their logged history suggests about how
// they've weighed similar tradeoffs. Same non-negotiable as reflections:
// the tool illuminates the reasoning; the user draws the conclusion.
export const GUIDANCE_SYSTEM_PROMPT = `You are a careful thinking partner inside a private, single-user tool. The person using you has written down their own core values and logged real past decisions. They are now facing a new situation and want help reasoning about it FROM THEIR OWN VALUES — not from yours, and not from generic advice.

Strict rules:
- Reason only from the values and history they provide. Do not smuggle in outside value judgments about what a good person would do.
- VISIBILITY, NOT VERDICTS. Never tell them what to do ("you should…", "the right choice is…"). Lay out the reasoning and let them conclude.
- Identify which of their stated values actually bear on this situation, and say plainly when values pull in opposite directions here — that tension is the useful information.
- Where their logged decisions reveal how they've actually weighed similar tradeoffs before, name that pattern neutrally.
- Sketch the main courses of action available, and for each one, what it would mean measured against their own stated values.
- If their stated values genuinely don't speak to this situation, say so honestly.
- Close with the one or two questions that their decision most turns on.

Format your response in short, readable Markdown with these sections:
## Which of your values bear on this
## What your history suggests
## The paths and what each costs you
## What this decision turns on
Keep it concise and concrete — this is a thinking aid, not an essay.`;

export async function generateGuidance(
  values: ValueInput[],
  decisions: DecisionInput[],
  question: string
): Promise<{ text: string; model: string }> {
  if (AI_MOCK_MODE) {
    return { text: mockGuidance(values, question), model: MOCK_MODEL_LABEL };
  }
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: REFLECTION_MODEL,
    max_tokens: 1400,
    system: GUIDANCE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${buildUserMessage(values, decisions)}\n\nThe situation I'm facing now:\n${question}\n\nHelp me reason about this from my own values, following your rules.`,
      },
    ],
  });

  return { text: extractText(response), model: REFLECTION_MODEL };
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

// --- Dev mocks -------------------------------------------------------------

function mockReflection(
  values: ValueInput[],
  decisions: DecisionInput[]
): string {
  const v = values[0]?.title ?? "one of your values";
  return [
    `**This is a dev mock** — no ANTHROPIC_API_KEY is set, so this canned text stands in for a real reflection. Add your key to .env to get the real thing.`,
    ``,
    `## Where things seem to line up`,
    `- You stated ${values.length} value(s) and logged ${decisions.length} decision(s); at least one decision reads as a direct expression of "${v}".`,
    ``,
    `## Where there may be tension`,
    `- A real reflection would point here at specific decisions that sit uneasily next to specific stated values, quoting your own words back to you.`,
    ``,
    `## Questions worth sitting with`,
    `- When these values conflict in practice, which one have you actually been protecting?`,
  ].join("\n");
}

function mockGuidance(values: ValueInput[], question: string): string {
  const v = values[0]?.title ?? "your first stated value";
  const preview = question.length > 80 ? question.slice(0, 80) + "…" : question;
  return [
    `**This is a dev mock** — no ANTHROPIC_API_KEY is set, so this canned text stands in for real guidance. Add your key to .env to get the real thing.`,
    ``,
    `## Which of your values bear on this`,
    `- Your situation ("${preview}") would be weighed against your stated values, starting with "${v}".`,
    ``,
    `## What your history suggests`,
    `- A real response would cite your own logged decisions that faced similar tradeoffs.`,
    ``,
    `## The paths and what each costs you`,
    `- Each available course of action, measured against your own values — never a recommendation.`,
    ``,
    `## What this decision turns on`,
    `- The one or two questions your choice actually hinges on.`,
  ].join("\n");
}
