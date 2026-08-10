// What follows from what.
//
// This is the one place the tool does something a notebook can't. Positions
// rest on axioms; if an axiom moves, everything that was derived from it is no
// longer derived. Not wrong — just no longer standing on what it was standing
// on. A journal lets you rewrite a premise and leaves every conclusion sitting
// there looking just as settled as before.
//
// Two rules, and both are deliberately mechanical:
//
//   1. Only a SETTLED position can be put back in question. An open one is
//      already open; telling someone their unfinished argument is unfinished
//      is noise.
//   2. The comparison is against when you settled, not when you wrote. If you
//      settled a position AFTER revising the axiom under it, you settled it
//      knowing — there's nothing to report.
//
// Nothing here decides whether you were right. It reports that the ground
// moved and leaves the rest to you, which is the same line the whole app
// holds: visibility, not verdicts.

export type AxiomState = {
  id: string;
  statement: string;
  createdAt: Date;
  revisedAt: Date | null;
  retiredAt: Date | null;
};

export type PositionState = {
  id: string;
  settledAt: Date | null;
};

export type Shift = {
  axiomId: string;
  statement: string;
  kind: "revised" | "retired";
  at: Date;
};

// The last moment this axiom changed under whatever rests on it. Null means it
// has said the same thing since the day it was written.
export function lastMoved(a: AxiomState): { at: Date; kind: Shift["kind"] } | null {
  // Retiring is the louder event: if both happened, the axiom is gone, and
  // reporting "reworded" about something you no longer hold would be a lie of
  // emphasis.
  if (a.retiredAt && (!a.revisedAt || a.retiredAt >= a.revisedAt)) {
    return { at: a.retiredAt, kind: "retired" };
  }
  if (a.revisedAt) return { at: a.revisedAt, kind: "revised" };
  return null;
}

// Which of the axioms under this position have moved since it was settled.
// Empty for an open position, and empty when nothing moved.
export function shiftsUnder(
  position: PositionState,
  restsOn: AxiomState[]
): Shift[] {
  if (!position.settledAt) return [];
  const settled = position.settledAt.getTime();

  return restsOn
    .map((a) => {
      const moved = lastMoved(a);
      if (!moved) return null;
      if (moved.at.getTime() <= settled) return null;
      return {
        axiomId: a.id,
        statement: a.statement,
        kind: moved.kind,
        at: moved.at,
      };
    })
    .filter((s): s is Shift => s !== null);
}

// A settled position with moved ground under it is "in question" — not
// unsettled automatically, because un-settling someone's conclusion on their
// behalf is a verdict. It's flagged, and they decide.
export function isInQuestion(
  position: PositionState,
  restsOn: AxiomState[]
): boolean {
  return shiftsUnder(position, restsOn).length > 0;
}

// --- Shape of a why-chain --------------------------------------------------
//
// Facts about the tree itself, by arithmetic. Used by Patterns, which is
// deliberately model-free: "four of your arguments bottom out in the same
// commitment" is something a tool can count, and counting it is the whole
// payoff the essay describes. Nothing here scores anything.

export type ChainNode = {
  id: string;
  parentId: string | null;
  isBedrock: boolean;
};

// Places you were asked why and haven't answered: a claim with nothing
// underneath it that you also didn't call bedrock. This is the difference
// between an argument that finished and one that merely stopped.
export function unfinishedLeaves(nodes: ChainNode[]): ChainNode[] {
  const hasChild = new Set(
    nodes.map((n) => n.parentId).filter((id): id is string => id !== null)
  );
  return nodes.filter((n) => !n.isBedrock && !hasChild.has(n.id));
}

// How many "why?"s deep the longest branch goes. Cycles can't occur through
// the UI, but the walk is bounded anyway rather than trusting that.
export function deepestChain(nodes: ChainNode[]): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let deepest = 0;
  for (const start of nodes) {
    let depth = 0;
    let cursor: ChainNode | undefined = start;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      depth++;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    if (depth > deepest) deepest = depth;
  }
  return deepest;
}

// Plain-English summary for the badge. Kept here beside the rule it describes
// so the wording can't drift from the logic.
export function describeShifts(shifts: Shift[]): string {
  if (shifts.length === 0) return "";
  const retired = shifts.filter((s) => s.kind === "retired").length;
  const revised = shifts.length - retired;

  const parts: string[] = [];
  if (retired) parts.push(`${retired} you no longer hold`);
  if (revised) parts.push(`${revised} reworded`);

  const noun = shifts.length === 1 ? "something" : `${shifts.length} things`;
  return `Rests on ${noun} that has since changed — ${parts.join(", ")}.`;
}
