// Point the Prisma datasource at whatever DATABASE_URL actually is.
//
// Prisma's `provider` has to be a literal in the schema — it can't read an env
// var — so deploying to Postgres has always meant hand-editing schema.prisma
// and remembering to put it back. That's a manual step in the one place where
// forgetting it means the build succeeds and the app fails at runtime.
//
// So it's derived instead. `npm run build` runs this first, and the provider
// follows the connection string: postgres:// or postgresql:// gives
// "postgresql", anything else stays "sqlite". One schema file, no drift, and
// nothing to remember.

import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA = new URL("../prisma/schema.prisma", import.meta.url);
const url = process.env.DATABASE_URL ?? "";
const wanted = /^postgres(ql)?:\/\//.test(url) ? "postgresql" : "sqlite";

const schema = readFileSync(SCHEMA, "utf8");
const current = schema.match(/provider\s*=\s*"(sqlite|postgresql)"/)?.[1];

if (!current) {
  console.error("[groundwork] could not find the datasource provider in schema.prisma");
  process.exit(1);
}

if (current === wanted) {
  console.log(`[groundwork] datasource provider already "${wanted}"`);
} else {
  writeFileSync(
    SCHEMA,
    schema.replace(
      /provider\s*=\s*"(sqlite|postgresql)"/,
      `provider = "${wanted}"`
    )
  );
  console.log(`[groundwork] datasource provider ${current} → ${wanted}`);
}
