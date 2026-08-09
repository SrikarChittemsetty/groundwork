// Production configuration guard.
//
// The failure mode this prevents is the quiet one: an app that boots fine with
// a placeholder secret, serves real users, and encrypts their beliefs with a
// key that's committed in an example file. Better to refuse to start.
//
// Checked at request time via assertProductionEnv() rather than at import, so
// a missing key can't break `next build` (which runs without runtime secrets).

const PLACEHOLDERS = [
  "replace-me-with-a-long-random-string",
  "replace-me-with-64-hex-chars",
  "sk-ant-...",
];

export type EnvProblem = { key: string; problem: string; fix: string };

export function findEnvProblems(): EnvProblem[] {
  const problems: EnvProblem[] = [];

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    problems.push({
      key: "AUTH_SECRET",
      problem: "not set — sessions cannot be signed",
      fix: "openssl rand -base64 48",
    });
  } else if (PLACEHOLDERS.includes(authSecret)) {
    problems.push({
      key: "AUTH_SECRET",
      problem: "still the placeholder from .env.example",
      fix: "openssl rand -base64 48",
    });
  } else if (authSecret.length < 32) {
    problems.push({
      key: "AUTH_SECRET",
      problem: "too short to be a safe signing secret",
      fix: "openssl rand -base64 48",
    });
  }

  const encKey = process.env.APP_ENCRYPTION_KEY;
  if (!encKey) {
    problems.push({
      key: "APP_ENCRYPTION_KEY",
      problem: "not set — user data cannot be encrypted",
      fix: "openssl rand -hex 32",
    });
  } else if (PLACEHOLDERS.includes(encKey)) {
    problems.push({
      key: "APP_ENCRYPTION_KEY",
      problem: "still the placeholder from .env.example",
      fix: "openssl rand -hex 32",
    });
  } else if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
    problems.push({
      key: "APP_ENCRYPTION_KEY",
      problem: "must be exactly 64 hex characters (32 bytes)",
      fix: "openssl rand -hex 32",
    });
  }

  if (process.env.NODE_ENV === "production") {
    if (process.env.DEV_AUTOLOGIN === "true") {
      problems.push({
        key: "DEV_AUTOLOGIN",
        problem:
          "enabled in production — this would bypass the login screen entirely",
        fix: 'remove it, or set DEV_AUTOLOGIN="false"',
      });
    }
    if (process.env.DATABASE_URL?.startsWith("file:")) {
      problems.push({
        key: "DATABASE_URL",
        problem:
          "points at a local SQLite file; on ephemeral hosting this loses all user data on redeploy",
        fix: "point it at your Postgres instance",
      });
    }
  }

  return problems;
}

// Throws in production if configuration is unsafe. In development it warns
// once so local work isn't blocked.
let warned = false;

export function assertProductionEnv(): void {
  const problems = findEnvProblems();
  if (problems.length === 0) return;

  const summary = problems
    .map((p) => `  - ${p.key}: ${p.problem}\n    fix: ${p.fix}`)
    .join("\n");

  if (process.env.NODE_ENV === "production") {
    throw new Error(`Unsafe configuration — refusing to serve:\n${summary}`);
  }

  if (!warned) {
    warned = true;
    console.warn(`[values-mirror] configuration warnings:\n${summary}`);
  }
}
