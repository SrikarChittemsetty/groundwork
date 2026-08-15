# Groundwork

A Socratic journal for reasoning from your own axioms.

You state a position. It asks why. It asks why of the answer, and keeps asking
until you reach something with no reason underneath it — that is an axiom, and
it's yours. Axioms accumulate across positions, so you find out which few
commitments actually sit under everything you think.

You also log real decisions. With a model configured, it will reason both
ways — forward from your axioms to the choice in front of you, backward from
what you did to where it diverged — and every step has to cite the entry of
yours it rests on. Steps that cite nothing are marked as the model's own
import, because a premise it brought with it should never read like one of
yours.

**The only verdict is the one you arrive at yourself.** Nothing here scores
you, ranks you, or tells you what to do. There is no progress bar on purpose:
a number you could be good or bad at turns the thing into something to perform
for, and the honesty is what makes the record worth keeping.

> The interrogation needs no model, no API key, and no network. See
> [The AI is optional](#the-ai-is-optional).

## The AI is optional

The tool is built to work fully without a model. Writing down values, logging
decisions, tagging which values a decision bears on, the timeline, the
mechanically-derived patterns, and reflections **you write yourself** all run
with no API key, no cost, and nothing transmitted anywhere. Set
`AI_ENABLED="false"` and the AI surfaces disappear rather than sitting there
disabled.

If you want it to be just you and your record, that is a first-class way to
use this — not a degraded one. The AI draft is an addition, and the privacy
page tells the truth about which mode you're in.

## Design principles (non-negotiable)

- **Visibility, not verdicts.** The tool surfaces patterns and tensions as
  observations and questions. It never hands down "you're a hypocrite" or
  "you're consistent." You interpret your own trajectory.
- **No external judgment.** Nobody else sees your data unless you explicitly
  share it. This is not social media.
- **Sensitive data by default.** Values, beliefs, and decisions are encrypted at
  rest (AES-256-GCM, application layer), transmitted over HTTPS in production,
  and you can export or permanently delete everything at any time.

## Stack

- Next.js 14 (App Router) + React + TypeScript
- Prisma ORM — **SQLite in dev** (zero setup), one-line swap to Postgres
- Claude (Anthropic API) for the reflection feature, called from the backend
- Session auth via signed httpOnly JWT cookie; passwords hashed with bcrypt

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Then fill in `.env`:

   - `AUTH_SECRET` — `openssl rand -base64 48`
   - `APP_ENCRYPTION_KEY` — `openssl rand -hex 32` (exactly 64 hex chars)
   - `ANTHROPIC_API_KEY` — from https://console.anthropic.com/ (needed only for
     the Reflect feature; the rest of the app works without it)

3. **Create the database**

   ```bash
   npm run db:push
   ```

4. **Run**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, create an account, and start adding values.

## What's here (v0.1 MVP scope)

- Email/password auth (multi-user capable; fine to use solo), with password
  change, **password reset**, and brute-force throttling on sign-in. Resets
  lose nothing: entries are encrypted with an application key, not one derived
  from your password
- **Positions and axioms** — state something you hold, get asked why until you
  reach something with no reason underneath it. No model involved. Axioms
  accumulate across positions, so you find out which few commitments sit under
  everything you think
- **Reason** (optional, AI) — forward from your axioms to a choice, or backward
  from what you did to where it diverged. Every step must cite the entry of
  yours it rests on; steps that cite nothing are marked as the model's own
  import rather than passing as yours
- Decisions can be tagged with **which values they bear on** — your judgment,
  not the tool's — which is fed to the AI features so tension is grounded in
  what you said the decision was about
- Values entry (encrypted), with inline editing and **full wording history** —
  editing a value never overwrites what you used to believe; the timeline
  distinguishes "Value stated" from "Value revised"
- Decision/action log with timestamps (encrypted), with inline editing
- **Reflections you write yourself** — the primary surface. Read your record
  back and put words to it; no key, no cost, no network
- **Patterns** — neutral facts derived by counting (how long since a value
  last bore on anything you logged, how often you've reworded it, which
  decisions you never tagged). Deliberately no score: a number you could be
  good or bad at would turn this into something to perform for
- AI reflection over your values + decisions (Claude, optional) — observations
  and questions, never verdicts. Can be scoped to a single value or a recent
  window; when scoped, the prompt is told so, since a filtered gap isn't the
  same as a gap in your life
- Timeline filtering (everything / values only / decisions only) — the counts
  always describe the whole record, so narrowing the view never looks like
  history shrinking
- "What should I do?" decision aid (`/ask`) — practical-syllogism-style
  guidance that lays out how your own values bear on a new situation and what
  your history suggests; paths and costs, never a recommendation
- A merged chronological timeline of values (every wording) and decisions
- Full data export (JSON, including value history) and permanent account
  deletion
- A per-user AI cost guard (hourly/daily caps shared across Reflect and Ask,
  configurable via `AI_LIMIT_PER_HOUR` / `AI_LIMIT_PER_DAY`)
- An honest `/privacy` page describing actual behavior — including that the AI
  features send your entries to Anthropic's API, and that this is not
  end-to-end encrypted

## Dev conveniences (hard-gated to non-production)

- `DEV_AUTOLOGIN="true"` in `.env` skips the login screen and auto-signs-in a
  seeded `dev@local` user.
- With no `ANTHROPIC_API_KEY` set, the AI endpoints return clearly-labeled
  mock output so the full loop is demoable. In production a missing key fails
  loudly instead.

### Checking a change actually works

```bash
npm run verify
```

Types, tests, a real production bundle, and every page in the app loaded
against the running dev server. The last two exist because "typecheck clean,
tests green, app broken" has happened three times here, and neither tsc nor
Vitest could have caught any of them:

- A client component imported a helper that pulled in `node:crypto`. Fails
  `next build`; invisible to tsc and Vitest, because neither bundles.
- `next dev` kept a stale Prisma client after a schema change, so routes 500'd
  on a column that plainly existed. Vitest loads the client fresh, so the suite
  never saw it. **After any `prisma generate` — which `prisma db push` runs
  unless you pass `--skip-generate` — restart the dev server.**
- `next build` clobbered the running dev server's `.next`, and the app started
  serving chunks that no longer existed. `npm run build:check` now builds into
  a scratch directory for exactly this reason, so verifying never breaks the
  server you're verifying against.

`npm run smoke` runs the page checks alone against an already-running server.

## Tests

```bash
npm test
```

Covers the things that would be quietly catastrophic if they broke:

- **Encryption** — round-trip, random IV, tamper/auth-tag rejection, and that
  plaintext never appears in the stored value
- **Markdown rendering** — model output is injected with
  `dangerouslySetInnerHTML`, so HTML/script escaping is a security boundary
- **Prompt guardrails** — asserts the "visibility, not verdicts" rules are
  actually present in both system prompts, so a future edit can't quietly turn
  the tool into a judge
- **Per-user scoping** — one user cannot read, edit, or delete another's data
  even with a valid row id
- **Sharing boundaries** — a share is visible only through a circle you're in
  or a live link you hold; revoking, hiding, expiring, and binding an invite
  to one address all actually stop working when they say they do
- **Bearer tokens** — invite and share-link tokens never appear in the
  database in the clear, and a token still resolves after being stored
- **Deletion** — runs the real `purgeAccount()` and then checks *every* table
  in the schema for anything left behind, including rows keyed to your email
  rather than your id. The list is exhaustive on purpose: adding a model
  without a cascade fails here rather than in production

Tests run against a throwaway SQLite file, never your dev database.

## Moving to Postgres

In `prisma/schema.prisma`, change:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Point `DATABASE_URL` at your Postgres instance and run `npm run db:push`. No
model changes required.

This has been verified against a real Postgres 16 instance, not just assumed:
schema push, seeding, versioned edits inside transactions, cascade deletes,
the AI request path, and encryption at rest all behaved identically to SQLite.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full deploy guide.

## Security notes

- `APP_ENCRYPTION_KEY` decrypts all stored personal data. Back it up securely;
  if you lose or rotate it, existing rows can no longer be decrypted.
- The SQLite `dev.db` file contains ciphertext but is still personal — it's
  gitignored. Don't commit it.
- Before any real launch: HTTPS everywhere, a real privacy policy, and (given
  values/beliefs may be GDPR "special category data") a brief legal review. See
  the build plan.

## Out of scope for v0.1 (deferred)

Team/multi-tenant version, vector/semantic search, native mobile app, richer
dissonance visualization, and BYOK API keys.
