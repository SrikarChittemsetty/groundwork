import { describe, it, expect, afterEach } from "vitest";
import { positiveIntFromEnv } from "../src/lib/envNumber";

// Written after a production incident. Every numeric setting used
// `Number(process.env.X ?? default)`, which is right when the variable is
// absent and silently wrong when it is present-but-empty — Number("") is 0,
// and ?? doesn't catch 0. On the first deploy that set the AI cap to "0
// requests allowed" and the login throttle to "0 attempts", which is a lockout
// rather than a limit.
//
// Empty values are not exotic: hosting dashboards invite you to add a key and
// leave the box blank to mean "use the default".

const KEY = "TEST_NUMERIC_SETTING";
afterEach(() => {
  delete process.env[KEY];
});

const read = (raw?: string) => {
  if (raw === undefined) delete process.env[KEY];
  else process.env[KEY] = raw;
  return positiveIntFromEnv(KEY, 40);
};

describe("reading a numeric setting from the environment", () => {
  it("uses the value when one is genuinely set", () => {
    expect(read("12")).toBe(12);
  });

  it("falls back when the variable is absent", () => {
    expect(read(undefined)).toBe(40);
  });

  // The one that actually broke production.
  it("falls back when the variable is present but empty", () => {
    expect(read("")).toBe(40);
  });

  it("falls back on whitespace", () => {
    expect(read("   ")).toBe(40);
  });

  it("falls back on something that isn't a number", () => {
    expect(read("lots")).toBe(40);
  });

  // A cap of zero is never what someone meant by leaving a box blank. There
  // are explicit flags for turning features off.
  it("refuses zero, which would silently disable the feature", () => {
    expect(read("0")).toBe(40);
  });

  it("refuses a negative", () => {
    expect(read("-5")).toBe(40);
  });

  it("floors a fractional value rather than producing a fractional cap", () => {
    expect(read("7.9")).toBe(7);
  });

  it("tolerates surrounding whitespace on a real value", () => {
    expect(read(" 25 ")).toBe(25);
  });
});
