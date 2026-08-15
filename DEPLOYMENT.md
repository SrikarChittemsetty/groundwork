# Deploying Groundwork

Written for Vercel + a managed Postgres, which is the cheapest path that
doesn't lose your data on redeploy. Nothing here is exotic; the app is a
standard Next.js App Router project.

## The short version

Ten minutes, two free accounts, no card:

1. **Neon** (neon.tech) — sign in with GitHub, create a project, copy the
   connection string.
2. **Vercel** (vercel.com) — sign in with GitHub, "Add New Project", import
   `SrikarChittemsetty/groundwork`.
3. Add four environment variables in Vercel (Settings → Environment
   Variables), then deploy:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon connection string |
   | `AUTH_SECRET` | `openssl rand -base64 48` |
   | `APP_ENCRYPTION_KEY` | `openssl rand -hex 32` — **save this first** |
   | `ANTHROPIC_API_KEY` | optional; leave unset and the AI features simply don't appear |

4. Once it's live, run the schema push against the Neon URL from your laptop:

   ```bash
   DATABASE_URL="<neon-url>" npx prisma db push
   ```

Do **not** reuse the `APP_ENCRYPTION_KEY` from your local `.env`. Production
starts with an empty database, so a fresh key costs nothing — and keeping the
two separate means a leak of one doesn't read the other.

## Before you deploy: read this once

**Back up `APP_ENCRYPTION_KEY` somewhere you won't lose it.** Every value,
decision, and reflection in the database is encrypted with it. If you lose the
key, that data is unrecoverable — there is no reset link, no support channel,
and no way back. Put it in a password manager before you go any further.

**Do not use SQLite in production.** On Vercel (and most container hosts) the
filesystem is ephemeral: a redeploy silently replaces it, taking every user's
data with it. The app refuses to start with a `file:` database URL when
`NODE_ENV=production` for exactly this reason.

## 1. Provision a Postgres database

Any managed Postgres works — Vercel Postgres, Neon, Supabase, Railway. You
need one thing from it: a connection string of the form

```
postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

## 2. Point Prisma at Postgres

Nothing to do — `npm run build` sets the datasource provider from
`DATABASE_URL` before it builds. A `postgresql://` URL gives you Postgres, a
`file:` URL gives you SQLite. Prisma can't read an env var for `provider`, so
this used to be a hand-edit you had to remember and then undo; deriving it
removes a manual step whose failure mode is a build that succeeds and an app
that dies at runtime.

No model changes are needed either way. This was verified against a real
Postgres 16 instance: schema push, seeding, versioned edits inside
transactions, cascade deletes, and encryption at rest all behaved identically
to SQLite.

Then push the schema:

```bash
DATABASE_URL="postgresql://..." npx prisma db push
```

## 3. Generate production secrets

Generate fresh values — never reuse your local development ones:

```bash
openssl rand -base64 48
```

```bash
openssl rand -hex 32
```

The first is `AUTH_SECRET`, the second `APP_ENCRYPTION_KEY` (must be exactly
64 hex characters).

## 4. Set environment variables

In your host's dashboard (Vercel: Project → Settings → Environment Variables):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `AUTH_SECRET` | yes | session signing; ≥32 chars |
| `APP_ENCRYPTION_KEY` | yes | 64 hex chars; **back this up** |
| `ANTHROPIC_API_KEY` | for AI | without it, Reflect and Ask fail in production |
| `ANTHROPIC_MODEL` | no | defaults to `claude-sonnet-4-5` |
| `AI_LIMIT_PER_HOUR` | no | default 15 |
| `AI_LIMIT_PER_DAY` | no | default 60 |
| `LOGIN_MAX_ATTEMPTS` | no | default 10 |
| `LOGIN_WINDOW_MINUTES` | no | default 15 |
| `DEV_AUTOLOGIN` | **no** | must be absent or `"false"` — it bypasses login entirely |

The app validates all of this at runtime and refuses to mint sessions if
anything is unsafe, rather than quietly serving traffic with a placeholder
key.

## 5. Deploy

```bash
npx vercel --prod
```

`npm run build` runs `prisma generate` first, so no extra build step is
needed.

## 6. Verify the deploy

```bash
curl https://YOUR-DOMAIN/api/health
```

A healthy deploy returns `200`:

```json
{"status":"ok","database":"ok","configuration":"ok","problems":[],"aiConfigured":true}
```

Anything wrong returns `503` and names the offending setting — never its
value. If `aiConfigured` is `false`, Reflect and Ask will fail until you add
the API key.

Then check by hand: create an account, add a value, log a decision, and
confirm the timeline renders. If `aiConfigured` is true, generate one
reflection to confirm the Anthropic call actually succeeds in the production
environment.

## Before letting anyone else use it

The app is built to be honest about its own handling of data, but a few things
are outside what code can settle:

- **Get the privacy policy and terms reviewed.** Values and beliefs may
  constitute special category data under GDPR, which carries stricter
  obligations than ordinary personal data. `/privacy` is an honest description
  of actual behavior, deliberately including the unflattering parts — it is
  not a reviewed legal document.
- **Decide your backup posture.** Automated Postgres backups are useless
  without the encryption key, and dangerous if stored beside it.
- **Set a cost alert** on the Anthropic account. The per-user rate limits cap
  a single account's usage, not your total spend across accounts.

## Rolling the encryption key

There is no built-in rotation. Doing it safely means: read every row,
decrypt with the old key, re-encrypt with the new one, write back — with the
app offline throughout. If you ever need this, write it as a one-off script
against a restored backup copy first, never against live data.
