import { describe, it, expect } from "vitest";
import {
  buildUserMessage,
  SYSTEM_PROMPT,
  GUIDANCE_SYSTEM_PROMPT,
} from "@/lib/anthropic";

const VALUES = [
  { title: "Honesty, even when it's costly", body: "I tell the truth." },
  { title: "Protect deep work", body: "I guard focused hours." },
];

describe("buildUserMessage", () => {
  it("includes every stated value", () => {
    const msg = buildUserMessage(VALUES, []);
    expect(msg).toContain("Honesty, even when it's costly");
    expect(msg).toContain("Protect deep work");
  });

  it("orders decisions oldest first", () => {
    const msg = buildUserMessage(VALUES, [
      { body: "later thing", occurredAt: new Date("2026-07-22") },
      { body: "earlier thing", occurredAt: new Date("2026-07-15") },
    ]);
    expect(msg.indexOf("earlier thing")).toBeLessThan(
      msg.indexOf("later thing")
    );
  });

  it("surfaces the user's own value tagging for a decision", () => {
    const msg = buildUserMessage(VALUES, [
      {
        body: "Skipped deep work for meetings",
        occurredAt: new Date("2026-07-22"),
        linkedValueTitles: ["Protect deep work"],
      },
    ]);
    expect(msg).toContain("I tagged this as bearing on: Protect deep work");
  });

  it("omits the tagging clause when nothing is linked", () => {
    const msg = buildUserMessage(VALUES, [
      { body: "untagged", occurredAt: new Date("2026-07-22") },
    ]);
    expect(msg).not.toContain("I tagged this");
  });

  it("says so honestly when there is nothing logged", () => {
    expect(buildUserMessage([], [])).toContain("(none recorded yet)");
    expect(buildUserMessage(VALUES, [])).toContain("(none logged yet)");
  });
});

// These assertions guard the product's central non-negotiable. If someone
// loosens the prompt later, these fail loudly.
describe("prompt guardrails: visibility, not verdicts", () => {
  it("forbids verdicts in the reflection prompt", () => {
    expect(SYSTEM_PROMPT).toContain("VISIBILITY, NOT VERDICTS");
    expect(SYSTEM_PROMPT).toContain("Never deliver an overall verdict");
    expect(SYSTEM_PROMPT).toMatch(/Do not score, grade, or rank/);
  });

  it("forbids telling the user what to do in the guidance prompt", () => {
    expect(GUIDANCE_SYSTEM_PROMPT).toContain("VISIBILITY, NOT VERDICTS");
    expect(GUIDANCE_SYSTEM_PROMPT).toContain("Never tell them what to do");
  });

  it("keeps guidance anchored to the user's own values", () => {
    expect(GUIDANCE_SYSTEM_PROMPT).toContain("FROM THEIR OWN VALUES");
    expect(GUIDANCE_SYSTEM_PROMPT).toMatch(
      /Do not smuggle in outside value judgments/
    );
  });

  it("requires honesty when the data is thin", () => {
    expect(SYSTEM_PROMPT).toMatch(/rather than inventing patterns/);
  });
});
