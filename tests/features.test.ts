import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { aiEnabled } from "@/lib/features";

// The app must be fully usable with no model, no key, and no cost. These guard
// the switch that makes that true — a regression here would either bill someone
// who opted out, or hide features from someone who didn't.

const ORIGINAL = { ...process.env };

function setEnv(env: Record<string, string | undefined>) {
  for (const k of ["AI_ENABLED", "ANTHROPIC_API_KEY", "NODE_ENV"]) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
}

beforeEach(() => setEnv({}));
afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL);
});

describe("aiEnabled", () => {
  it('is off when explicitly disabled, even with a key present', () => {
    setEnv({ AI_ENABLED: "false", ANTHROPIC_API_KEY: "sk-ant-real" });
    expect(aiEnabled()).toBe(false);
  });

  it("is on when explicitly enabled", () => {
    setEnv({ AI_ENABLED: "true", NODE_ENV: "production" });
    expect(aiEnabled()).toBe(true);
  });

  it("is on in production when a key is configured", () => {
    setEnv({ NODE_ENV: "production", ANTHROPIC_API_KEY: "sk-ant-real" });
    expect(aiEnabled()).toBe(true);
  });

  it("is off in production with no key — nothing half-wired ships", () => {
    setEnv({ NODE_ENV: "production" });
    expect(aiEnabled()).toBe(false);
  });

  it("is on in development without a key, where mocks stand in", () => {
    setEnv({ NODE_ENV: "development" });
    expect(aiEnabled()).toBe(true);
  });

  it("treats any value other than 'false' as not an opt-out", () => {
    setEnv({ AI_ENABLED: "no", NODE_ENV: "production" });
    // "no" is not the documented opt-out; falls through to auto-detection,
    // which is off in production without a key.
    expect(aiEnabled()).toBe(false);
  });
});
