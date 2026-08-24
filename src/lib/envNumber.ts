// Reading a positive integer out of the environment.
//
// This exists because of a real production incident. Every numeric setting was
// written as `Number(process.env.X ?? 15)`, which is correct when the variable
// is absent and silently wrong when it is present-but-empty:
//
//   Number("")        === 0
//   0 ?? 15           === 0     <- ?? only catches null/undefined
//
// Hosting dashboards make empty values easy to create — you add the key to
// have it listed, leave the box blank meaning "use the default", and get 0.
// On the first deploy that turned the AI hourly cap into "0 requests allowed"
// and, worse, the login throttle into "0 attempts allowed", which is a lockout
// rather than a limit.
//
// So: absent, empty, non-numeric, zero and negative all mean "use the
// default". A cap of zero is never what someone meant by leaving a box blank;
// if they genuinely want a feature off there are explicit flags for that.
export function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;

  return Math.floor(n);
}
