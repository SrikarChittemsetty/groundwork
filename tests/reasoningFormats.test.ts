import { describe, it, expect } from "vitest";
import { buildRecord, parseSteps } from "../src/lib/reasoning";

// Formatting drift the model actually produces.
//
// These exist because the original tests were circular: every fixture was
// written in the one shape the parser accepted, so the suite passed while
// three shapes a model genuinely emits — numbered lists, "*" bullets, en-dash
// bullets — parsed to NOTHING and rendered a blank page. Bolded citations were
// worse than blank: the citation was silently dropped and a grounded step was
// labelled as the model's own import, which is the precise misattribution this
// module exists to prevent.
//
// The rule for anything added here: it must be a shape a model would plausibly
// emit for the prompt in SHARED_RULES, not one invented to exercise the regex.

const record = buildRecord({
  axioms: [{ statement: "A life should be mine to steer." }],
  positions: [{ statement: "I should turn down the higher-paying role." }],
  values: [{ title: "Honesty", body: "I tell the truth when it costs me." }],
  decisions: [
    { body: "Told a client their project was failing.", occurredAt: new Date("2026-07-15") },
  ],
});

describe("citations survive the formats a model actually uses", () => {
  const grounded = (text: string) => parseSteps(text, record);

  it("reads the format the prompt asks for", () => {
    const steps = grounded("- [A1] steering my own life is the commitment");
    expect(steps).toHaveLength(1);
    expect(steps[0].cites).toEqual(["A1"]);
  });

  it("reads a citation wrapped in bold, and keeps it a citation", () => {
    const steps = grounded("- **[A1, P1]** the role hands over the shape of my days");
    expect(steps[0].cites).toEqual(["A1", "P1"]);
    expect(steps[0].claim).toBe("the role hands over the shape of my days");
  });

  it("reads a numbered list", () => {
    expect(grounded("1. [A1] first\n2. [P1] second").map((s) => s.cites)).toEqual([
      ["A1"],
      ["P1"],
    ]);
  });

  it("reads asterisk and bullet-character bullets", () => {
    expect(grounded("* [A1] one")[0].cites).toEqual(["A1"]);
    expect(grounded("• [A1] one")[0].cites).toEqual(["A1"]);
  });

  it("reads en-dash and em-dash bullets", () => {
    expect(grounded("– [A1] one")[0].cites).toEqual(["A1"]);
    expect(grounded("— [A1] one")[0].cites).toEqual(["A1"]);
  });

  it("drops a separator between the citation and the claim", () => {
    expect(grounded("- [A1] — steering my life")[0].claim).toBe("steering my life");
    expect(grounded("- [A1]: steering my life")[0].claim).toBe("steering my life");
  });

  it("accepts lowercase tags", () => {
    expect(grounded("- [a1, p1] one")[0].cites).toEqual(["A1", "P1"]);
  });

  it("ignores a preamble it was told not to write", () => {
    const steps = grounded("Here is how the reasoning runs:\n\n- [A1] one");
    expect(steps).toHaveLength(1);
  });
});

// The security properties. Widening the parser must not have loosened these.
describe("what must never become more permissive", () => {
  it("still strips a tag that isn't in the record", () => {
    const steps = parseSteps("- [A7, V9] invented\n- [A1] real", record);
    expect(steps[0].cites).toEqual([]);
    expect(steps[1].cites).toEqual(["A1"]);
  });

  it("still treats [none] as ungrounded rather than as a tag", () => {
    expect(parseSteps("- [none] an imported premise", record)[0].cites).toEqual([]);
  });

  it("still keeps an uncited step rather than hiding it", () => {
    const steps = parseSteps("- a claim with no citation at all", record);
    expect(steps).toHaveLength(1);
    expect(steps[0].cites).toEqual([]);
    expect(steps[0].claim).toBe("a claim with no citation at all");
  });

  it("ignores prose that isn't a step line", () => {
    expect(parseSteps("This is a summary paragraph.", record)).toEqual([]);
  });
});
