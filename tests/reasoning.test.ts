import { describe, it, expect } from "vitest";
import { buildRecord, parseSteps, type RecordItem } from "@/lib/reasoning";

// The parser is the enforcement point. Every way a model can fail to ground a
// claim has to end up marked as ungrounded — because a step that slips through
// uncited, or cites a tag that doesn't exist, reads exactly like reasoning
// from your own premises when it isn't.

const RECORD: RecordItem[] = buildRecord({
  axioms: [{ statement: "a life should be mine to steer" }],
  positions: [{ statement: "I should turn down the role" }],
  values: [{ title: "Honesty", body: "even when costly" }],
  decisions: [{ body: "told the client the truth", occurredAt: new Date("2026-07-15") }],
});

describe("record tagging", () => {
  it("gives each entry a stable, kind-prefixed tag", () => {
    expect(RECORD.map((r) => r.tag)).toEqual(["A1", "P1", "V1", "D1"]);
  });

  it("keeps the value's title and meaning together", () => {
    expect(RECORD.find((r) => r.tag === "V1")!.text).toContain("Honesty");
    expect(RECORD.find((r) => r.tag === "V1")!.text).toContain("even when costly");
  });
});

describe("parsing steps", () => {
  it("reads citations and claim", () => {
    const steps = parseSteps("- [A1] this follows from your axiom", RECORD);
    expect(steps).toHaveLength(1);
    expect(steps[0].cites).toEqual(["A1"]);
    expect(steps[0].claim).toBe("this follows from your axiom");
  });

  it("reads several citations on one step", () => {
    const steps = parseSteps("- [A1, D1] both bear on this", RECORD);
    expect(steps[0].cites).toEqual(["A1", "D1"]);
  });

  it("treats [none] as ungrounded", () => {
    const steps = parseSteps("- [none] I'm importing this premise", RECORD);
    expect(steps[0].cites).toEqual([]);
  });

  it("drops a citation to a tag that doesn't exist", () => {
    // A hallucinated tag is worse than no tag — it looks like grounding.
    const steps = parseSteps("- [A9] invented support", RECORD);
    expect(steps[0].cites).toEqual([]);
  });

  it("keeps the real citations and drops only the invented one", () => {
    const steps = parseSteps("- [A1, Z9] partly grounded", RECORD);
    expect(steps[0].cites).toEqual(["A1"]);
  });

  it("keeps a step that omitted the citation block, marked ungrounded", () => {
    // Dropping it would hide the model's own claim, which is the exact
    // failure this module exists to prevent.
    const steps = parseSteps("- no brackets at all here", RECORD);
    expect(steps).toHaveLength(1);
    expect(steps[0].cites).toEqual([]);
    expect(steps[0].claim).toBe("no brackets at all here");
  });

  it("ignores prose that isn't a step", () => {
    const steps = parseSteps(
      "Here is my analysis:\n\n- [A1] a real step\n\nIn summary, blah.",
      RECORD
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].claim).toBe("a real step");
  });

  it("is case-insensitive about tags", () => {
    expect(parseSteps("- [a1] lower", RECORD)[0].cites).toEqual(["A1"]);
  });

  it("returns nothing for empty output rather than inventing a step", () => {
    expect(parseSteps("", RECORD)).toEqual([]);
  });
});
