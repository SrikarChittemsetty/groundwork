import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findEnvProblems } from "@/lib/env";

// Deployment health check. Reports whether the app can reach its database and
// whether configuration is sane.
//
// Deliberately leaks nothing: it reports WHICH setting is wrong, never its
// value, and exposes no user data or row counts.
export async function GET() {
  const problems = findEnvProblems();

  let database: "ok" | "unreachable" = "unreachable";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    database = "unreachable";
  }

  const healthy = database === "ok" && problems.length === 0;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      configuration: problems.length === 0 ? "ok" : "problems",
      problems: problems.map((p) => `${p.key}: ${p.problem}`),
      aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    { status: healthy ? 200 : 503 }
  );
}
