import { prisma } from "@/lib/db";
import { safeDecrypt } from "@/lib/crypto";

// Building the full export payload.
//
// "Everything" is load-bearing. Every time a new kind of entry is added it has
// to appear here too, or the promise on the privacy page quietly stops being
// true — which is how an export ends up covering half an app. It lives here
// rather than in the route so the test can run the real builder; a test that
// reimplemented it would pass while the export silently fell behind.
//
// What it deliberately excludes: other people's writing. Shares and comments
// by other members of your circles are theirs, not yours, and an export of
// your account shouldn't be a way to walk off with them.
export async function buildExport(userId: string) {
  const [
    user,
    positions,
    axioms,
    tensions,
    memberships,
    shares,
    comments,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        values: { include: { versions: { orderBy: { createdAt: "asc" } } } },
        decisions: { include: { values: { include: { value: true } } } },
        reflections: { orderBy: { createdAt: "asc" } },
        consultations: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.position.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        nodes: { orderBy: { createdAt: "asc" }, include: { axiom: true } },
      },
    }),
    prisma.axiom.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        nodes: { include: { position: true } },
        versions: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.axiomTension.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { a: true, b: true },
    }),
    prisma.circleMember.findMany({
      where: { userId },
      include: { circle: true },
    }),
    prisma.share.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { circle: true },
    }),
    prisma.shareComment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { share: { include: { circle: true } } },
    }),
  ]);

  if (!user) return null;

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: user.createdAt },

    // The interrogation, with each chain intact rather than flattened — a
    // list of claims without their parents isn't an argument.
    positions: positions.map((p) => ({
      statement: safeDecrypt(p.statement),
      settled: p.settledAt !== null,
      createdAt: p.createdAt,
      reasoning: p.nodes.map((n) => ({
        id: n.id,
        answers: n.parentId,
        claim: safeDecrypt(n.claim),
        isBedrock: n.isBedrock,
        axiom: n.axiom ? safeDecrypt(n.axiom.statement) : null,
        createdAt: n.createdAt,
      })),
    })),

    axioms: axioms.map((a) => ({
      statement: safeDecrypt(a.statement),
      reachedFrom: [
        ...new Set(a.nodes.map((n) => safeDecrypt(n.position.statement))),
      ],
      // What it used to say. The wording your settled arguments were actually
      // settled against, which is the part an export would most obviously be
      // missing if it only carried the current text.
      history: a.versions.map((v) => ({
        statement: safeDecrypt(v.statement),
        until: v.createdAt,
      })),
      stillHeld: a.retiredAt === null,
      retiredAt: a.retiredAt,
      revisedAt: a.revisedAt,
      createdAt: a.createdAt,
    })),

    axiomTensions: tensions.map((t) => ({
      between: [safeDecrypt(t.a.statement), safeDecrypt(t.b.statement)],
      whereThePullIs: safeDecrypt(t.note),
      whatYouCameTo: t.resolution ? safeDecrypt(t.resolution) : null,
      resolved: t.resolvedAt !== null,
      createdAt: t.createdAt,
    })),

    values: user.values.map((v) => ({
      title: safeDecrypt(v.title),
      body: safeDecrypt(v.body),
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      history: v.versions.map((ver) => ({
        title: safeDecrypt(ver.title),
        body: safeDecrypt(ver.body),
        createdAt: ver.createdAt,
      })),
    })),

    decisions: user.decisions.map((d) => ({
      body: safeDecrypt(d.body),
      occurredAt: d.occurredAt,
      createdAt: d.createdAt,
      bearsOnValues: d.values.map((link) => safeDecrypt(link.value.title)),
    })),

    reflections: user.reflections.map((r) => ({
      body: safeDecrypt(r.body),
      writtenBy: r.source === "self" ? "you" : r.model,
      scope: r.scope === "Everything" ? "Everything" : safeDecrypt(r.scope),
      createdAt: r.createdAt,
    })),

    consultations: user.consultations.map((c) => ({
      question: safeDecrypt(c.question),
      body: safeDecrypt(c.body),
      model: c.model,
      createdAt: c.createdAt,
    })),

    sharing: {
      note: "Only your own shares and comments. Other members' writing is theirs.",
      circles: memberships.map((m) => ({
        name: safeDecrypt(m.circle.name),
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      shared: shares.map((s) => ({
        kind: s.kind,
        title: s.title ? safeDecrypt(s.title) : null,
        body: s.body ? safeDecrypt(s.body) : null,
        note: s.note ? safeDecrypt(s.note) : null,
        into: s.circle ? safeDecrypt(s.circle.name) : "a link only",
        hidden: s.hiddenAt !== null,
        createdAt: s.createdAt,
      })),
      comments: comments.map((c) => ({
        body: safeDecrypt(c.body),
        in: c.share.circle ? safeDecrypt(c.share.circle.name) : "(no circle)",
        createdAt: c.createdAt,
      })),
    },
  };

  return payload;
}
