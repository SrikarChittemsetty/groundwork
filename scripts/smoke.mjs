// Load every page in the app and check it actually renders.
//
// This exists because "typecheck clean, all tests green, app broken" has
// happened twice:
//
//   - `next dev` kept a stale Prisma client after a schema change, so routes
//     500'd on a column that plainly existed. Vitest loads the client fresh,
//     so the suite never saw it.
//   - A client component imported a helper that pulled in `node:crypto`. That
//     one fails `next build`, but not tsc and not Vitest, because neither
//     bundles anything.
//
// Neither class is exotic and neither was caught by the test suite. Loading
// the page was the only thing that found them, so that's what this automates.
//
// It is deliberately not a Vitest file: it needs a running server, and a test
// suite that silently passes when the server is down would be worse than no
// test at all.
//
//   npm run smoke                  # against http://localhost:3100
//   BASE=http://localhost:3000 npm run smoke

const BASE = process.env.BASE ?? "http://localhost:3100";

// Markers that mean the page came back 200 but is not a working page. Next's
// dev overlay and error boundary both do this.
const FAILURE_MARKERS = [
  "Failed to compile",
  "Build Error",
  "Unhandled Runtime Error",
  "This page could not be found",
  "Application error: a client-side exception",
  "unable to decrypt",
];

async function session() {
  // Dev auto-login hands out a session on this route.
  const res = await fetch(`${BASE}/api/auth/dev-login`, { redirect: "manual" });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) {
    console.error(
      `No session from ${BASE}. Is the dev server running with DEV_AUTOLOGIN=true?`
    );
    process.exit(2);
  }
  return cookie;
}

// Routes with a [param] need a real id, so ask the API for one. A route we
// can't build an example for is reported rather than quietly skipped —
// "we covered everything" should never be an illusion.
async function routes(cookie) {
  const get = async (path) => {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie } });
    return r.ok ? r.json() : null;
  };

  const [positions, circles, shares] = await Promise.all([
    get("/api/positions"),
    get("/api/circles"),
    get("/api/shares"),
  ]);

  const positionId = positions?.positions?.[0]?.id ?? null;
  const circleId = circles?.circles?.[0]?.id ?? null;
  const linkToken = shares?.shares?.flatMap((s) => s.linkTokens ?? [])[0] ?? null;

  return [
    { path: "/", needs: null },
    { path: "/positions", needs: null },
    { path: "/axioms", needs: null },
    { path: "/values", needs: null },
    { path: "/log", needs: null },
    { path: "/timeline", needs: null },
    { path: "/patterns", needs: null },
    { path: "/reflect", needs: null },
    { path: "/circles", needs: null },
    { path: "/share", needs: null },
    { path: "/settings", needs: null },
    { path: "/reason", needs: null },
    { path: "/ask", needs: null },
    { path: "/privacy", needs: null },
    { path: "/login?real=1", needs: null },
    { path: "/signup?real=1", needs: null },
    { path: "/forgot?real=1", needs: null },
    { path: positionId && `/positions/${positionId}`, needs: "a position" },
    { path: circleId && `/circles/${circleId}`, needs: "a circle" },
    { path: linkToken && `/shared/${linkToken}`, needs: "a share link" },
  ];
}

const cookie = await session();
const list = await routes(cookie);

let failed = 0;
let skipped = 0;

for (const { path, needs } of list) {
  if (!path) {
    console.log(`  SKIP  (no ${needs} exists to build a URL from)`);
    skipped++;
    continue;
  }

  let res, body;
  try {
    res = await fetch(`${BASE}${path}`, { headers: { cookie } });
    body = await res.text();
  } catch (err) {
    console.log(`  FAIL  ${path} — ${err.message}`);
    failed++;
    continue;
  }

  const marker = FAILURE_MARKERS.find((m) => body.includes(m));
  if (!res.ok) {
    console.log(`  FAIL  ${path} — HTTP ${res.status}`);
    failed++;
  } else if (marker) {
    console.log(`  FAIL  ${path} — rendered an error page ("${marker}")`);
    failed++;
  } else {
    console.log(`  ok    ${path}`);
  }
}

console.log(
  `\n${list.length - failed - skipped} ok, ${failed} failed, ${skipped} skipped`
);
if (skipped > 0) {
  console.log("Skipped routes were not checked. Seed the data to cover them.");
}
process.exit(failed > 0 ? 1 : 0);
