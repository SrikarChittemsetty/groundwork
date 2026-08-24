import Anthropic from "@anthropic-ai/sdk";
import {
  AI_MOCK_MODE,
  MOCK_MODEL_LABEL,
  REFLECTION_MODEL,
  getAnthropic,
} from "@/lib/anthropic";

// Reasoning that has to show its sources.
//
// The problem this exists for: a model is trained, and therefore opinionated.
// Asked to reason from your premises it will happily reach a conclusion that
// depends on premises it brought with it, and the result reads exactly like a
// conclusion drawn from yours. That is not solvable by asking nicely.
//
// So the constraint here is structural rather than hortatory: every step must
// cite the entry of YOURS it rests on, and a step that cites nothing is
// rendered as what it is — the model's own import, not something you hold.
// You still get to decide what to do with it. The point is that you can see
// which is which, instead of a smooth paragraph that hides the seam.

export type RecordItem = {
  tag: string; // A1, P2, V3, D4 — short, stable within one request
  kind: "axiom" | "position" | "value" | "decision";
  text: string;
  date?: Date;
};

export type Step = {
  cites: string[]; // tags; empty means ungrounded
  claim: string;
};

export type Reasoning = {
  steps: Step[];
  model: string;
};

export type Direction = "forward" | "backward";

// The record, tagged. Tags are what the model cites, and what we resolve back
// to real entries when rendering — so a citation can be checked rather than
// taken on faith.
export function buildRecord(items: {
  axioms: { statement: string }[];
  positions: { statement: string }[];
  values: { title: string; body: string }[];
  decisions: { body: string; occurredAt: Date }[];
}): RecordItem[] {
  const out: RecordItem[] = [];
  items.axioms.forEach((a, i) =>
    out.push({ tag: `A${i + 1}`, kind: "axiom", text: a.statement })
  );
  items.positions.forEach((p, i) =>
    out.push({ tag: `P${i + 1}`, kind: "position", text: p.statement })
  );
  items.values.forEach((v, i) =>
    out.push({ tag: `V${i + 1}`, kind: "value", text: `${v.title} — ${v.body}` })
  );
  items.decisions.forEach((d, i) =>
    out.push({
      tag: `D${i + 1}`,
      kind: "decision",
      text: d.body,
      date: d.occurredAt,
    })
  );
  return out;
}

function renderRecord(record: RecordItem[]): string {
  return record
    .map((r) => {
      const when = r.date ? ` [${r.date.toISOString().slice(0, 10)}]` : "";
      return `${r.tag} (${r.kind})${when}: ${r.text}`;
    })
    .join("\n");
}

const SHARED_RULES = `You are reasoning inside someone's private journal, strictly from a record they wrote themselves.

The single hard rule: EVERY step must cite the record entries it rests on, by tag, in square brackets at the start of the line.

Format each step on its own line, exactly:
- [A1, D3] the inference this step makes

If a step genuinely requires something that is NOT in their record — a premise, an empirical fact, a piece of common-sense morality — you must still include it, but cite it as [none] and word it so the imported premise is explicit. Do not disguise it as following from their record.

Rules:
- Never cite a tag that does not appear in the record.
- Do not smuggle in your own values. If their record does not settle something, say so with [none] rather than quietly supplying an answer.
- Do not tell them what to do. You are laying out how the reasoning runs, not concluding on their behalf.
- Prefer few, load-bearing steps over many trivial ones.
- No preamble, no summary, no headings. Only the step lines.`;

const FORWARD = `${SHARED_RULES}

Work FORWARD: start from their axioms and stated values, and trace what follows for the situation they describe. Show which commitments bear on it, and where two of their own commitments pull in different directions.`;

const BACKWARD = `${SHARED_RULES}

Work BACKWARD: start from what they actually did, and trace back to which of their axioms and values it rests on. Where an action does not follow from anything in their record, say that plainly — that gap is the useful part, and it is not your job to resolve it for them.`;

// Tolerant of the model's formatting drift; strict about the citation itself.
// A step whose citation can't be read is treated as uncited, which is the
// safer failure: it gets flagged as ungrounded rather than silently accepted.
//
// "Tolerant" has to be earned rather than asserted. The first version of this
// required a literal "-" at the start of the line, which every test fixture
// happened to use — so the suite passed while three formats a model genuinely
// produces (numbered lists, "*" bullets, en-dash bullets) parsed to NOTHING
// and rendered a blank page. Bold around the citation lost the citation
// entirely and silently marked a grounded step as the model's own import,
// which is the exact misattribution this module exists to prevent.
//
// So the bullet may be any of - * • – —, or "1." / "1)" numbering, and
// emphasis around the citation is stripped before it is read.
const BULLET = /^(?:[-*\u2022\u2013\u2014]|\d+[.)])\s*/;

export function parseSteps(text: string, record: RecordItem[]): Step[] {
  const valid = new Set(record.map((r) => r.tag.toUpperCase()));
  const steps: Step[] = [];

  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (!BULLET.test(line)) continue;
    line = line.replace(BULLET, "");

    // Markdown emphasis around the citation, e.g. "**[A1]** claim". Stripped
    // only at the front, so emphasis inside the claim itself is left alone.
    line = line.replace(/^(\*\*|__|\*|_)+\s*/, "");

    const m = /^\[([^\]]*)\]\s*(?:\*\*|__|\*|_)*\s*(?:[-\u2013\u2014:]\s*)?(.+)$/.exec(line);
    if (!m) {
      // A step line without a citation block is still a claim the model made.
      // Keep it, marked ungrounded, rather than dropping it — hiding it would
      // be the same failure this whole module exists to prevent.
      const claim = line.trim();
      if (claim) steps.push({ cites: [], claim });
      continue;
    }

    const cites = m[1]
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t && t !== "NONE")
      // A hallucinated tag is worse than no tag: it looks like grounding.
      .filter((t) => valid.has(t));

    steps.push({ cites, claim: m[2].trim() });
  }

  return steps;
}

export async function reason(
  record: RecordItem[],
  direction: Direction,
  situation: string
): Promise<Reasoning> {
  if (AI_MOCK_MODE) {
    return { steps: mockSteps(record, direction), model: MOCK_MODEL_LABEL };
  }

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: REFLECTION_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    system: direction === "forward" ? FORWARD : BACKWARD,
    messages: [
      {
        role: "user",
        content: `My record:\n${renderRecord(record)}\n\n${
          direction === "forward"
            ? "The situation in front of me"
            : "What I actually did"
        }:\n${situation}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      "The model declined to respond to this content. Nothing was saved."
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return { steps: parseSteps(text, record), model: REFLECTION_MODEL };
}

// The mock deliberately includes one ungrounded step, because that is the
// case the interface exists to make visible.
function mockSteps(record: RecordItem[], direction: Direction): Step[] {
  const first = record[0]?.tag;
  const second = record[1]?.tag;
  return [
    {
      cites: [],
      claim:
        "This is a dev mock — no ANTHROPIC_API_KEY is set. Note that this step cites nothing, so it is marked as the model's own, which is exactly what a smuggled premise looks like here.",
    },
    ...(first
      ? [
          {
            cites: [first],
            claim:
              direction === "forward"
                ? "A real response would trace from this commitment to the situation you described."
                : "A real response would trace what you did back to this commitment.",
          },
        ]
      : []),
    ...(second
      ? [
          {
            cites: [second],
            claim:
              "And where two of your own commitments pull against each other, it would name the tension rather than resolve it.",
          },
        ]
      : []),
  ];
}
