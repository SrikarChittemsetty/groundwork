// Push the schema to whatever DATABASE_URL points at, then put things back.
//
// Two problems this solves, both of which already bit:
//
//   1. `prisma db push` reads the provider out of schema.prisma, which is a
//      literal. Pushing to Postgres with a sqlite provider fails with the
//      unhelpful "the URL must start with the protocol `file:`".
//   2. Flipping the provider to postgresql and walking away leaves local dev
//      broken — the schema no longer matches the local SQLite file, and the
//      generated client is wrong until someone notices.
//
// So: flip, push, flip back, regenerate for local. The schema file ends up
// exactly as it started no matter which database you pushed to.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA = new URL("../prisma/schema.prisma", import.meta.url);
const read = () => readFileSync(SCHEMA, "utf8");
const providerOf = (s) => s.match(/provider\s*=\s*"(sqlite|postgresql)"/)?.[1];
const setProvider = (want) =>
  writeFileSync(
    SCHEMA,
    read().replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${want}"`)
  );

const url = process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("[groundwork] DATABASE_URL is not set. Nothing to push to.");
  process.exit(1);
}

const original = providerOf(read());
const wanted = /^postgres(ql)?:\/\//.test(url) ? "postgresql" : "sqlite";
const target = url.replace(/:\/\/[^@]*@/, "://***@");

const run = (args) =>
  execFileSync("npx", args, { stdio: "inherit", env: process.env });

try {
  if (original !== wanted) {
    console.log(`[groundwork] provider ${original} → ${wanted} for this push`);
    setProvider(wanted);
  }
  console.log(`[groundwork] pushing to ${target}`);
  run(["prisma", "db", "push", "--skip-generate"]);
} finally {
  // Always restore, including when the push throws — a failed push must not
  // leave the working tree pointed at the wrong database.
  if (original && providerOf(read()) !== original) {
    setProvider(original);
    console.log(`[groundwork] provider restored to ${original}`);
  }
  run(["prisma", "generate"]);
}
