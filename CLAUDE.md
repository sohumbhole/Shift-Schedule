# Instructions for any AI working on this project (Claude Code, Codex, others)

This is the **Shift Schedule** website: the live staff scheduling app for the Atomic Wings restaurant
in Champaign, IL. The restaurant's owner, **Kavita**, uses it every week to schedule her staff, and her
assistant Muse reads and changes the schedule through this site's API. It is real production software:
a mistake here affects her business the same day.

Read this file, then `CONTEXT.md` (the full technical history and gotchas) before changing anything.

## Who you are working for

- **Kavita (owner and only real user)** is NOT a developer. She describes what she wants in plain
  words ("make the export bigger", "add a phone number to employees"). You do everything technical:
  local testing, checks, committing, pushing, verifying. Never ask her to run commands or make technical
  decisions she cannot judge. Explain in short, friendly, plain language, with no jargon.
- **Sohum (her son)** built the site and may also work on it. Always get the latest code first (step 1
  of the routine) so neither of you overwrites the other.
- Business context (staff, how she schedules, preferences) lives in Kavita's own brain repository, not
  here. Sohum's brain is private to him; you cannot read it and do not need it.

## The routine for EVERY change (do not skip steps)

1. `git pull` on `main` to get the latest code.
2. Make sure you understand the request. Restate it to her in one or two plain sentences and ask
   only if something is truly unclear.
3. If the change touches data or the database, back up first: `node _backup_user.mjs` (writes to the
   `Backups` folder next to this project; that folder holds personal data and never goes into git).
4. Make the change.
5. Test it locally:
   - `npm run build` must pass, and `npx eslint <changed files> --quiet` must be clean.
   - If you touched shift rules (`src/lib/shiftRules.js` or the add shift window), run
     `node scripts/tests/rules_equivalence.mjs` (it must say MISMATCHES: 0, or you must explain why
     the change in behavior is intended).
   - Run the site with `npm run dev` (http://localhost:5173), open the page you changed, and check it
     works. Show her a screenshot or describe what you see.
6. Tell the person who asked (usually Kavita, sometimes Sohum) what changed and ask: "Ready to put this
   on the live website?" Do not publish without their yes.
7. Commit with a clear message and `git push origin main`. Every push to `main` deploys the live site
   on Vercel automatically within about a minute.
8. Confirm it is live: open https://shift-schedule-website.vercel.app (and the changed page) and check
   the change is there. Then tell her it is done.
9. Add a short entry to `CONTEXT.md` (date, what changed, why) and commit it.

If the deploy does not show up after a few minutes, Vercel may have blocked it (the free Vercel plan
only deploys changes made by the account owner). Do not retry in a loop. Tell her plainly: "The change
is saved but not live yet; Sohum needs to approve it on Vercel," and tell Sohum the commit.

## Hard rules

- Never delete real data or change the database structure just to test. Database structure changes
  follow the safe pattern described in `CONTEXT.md` and need her clear OK (and ideally Sohum's).
- To test against the real database, use an empty week in 2030 or later and remove only what you added.
  NEVER touch the week note for the week of 2026-12-28 (her notepad for supply prices).
- Secrets (database keys, email keys) live only in `.env.local` (never committed) and in Vercel's
  settings. Never print them, paste them in chat, or commit them.
- Do not break the API that her Muse uses (`/api/v1`, code in `api/`). If you change it, keep old
  behavior working, update the docs in `src/lib/apiDocs.js` and `api/_lib/openapi.js`, and run
  `node scripts/tests/api_integration.mjs` with `API_TEST_EMAIL` set to a TEST account (never hers).
- Do not remove the keepalive (`vercel.json` crons and `.github/workflows/keepalive.yml`); it stops the
  free database from pausing.
- No em dashes or en dashes anywhere (code, comments, text on the site). Use commas, periods or colons.
- When unsure whether a change could hurt the live site, stop and ask.

## First time on a new computer

1. Install Node.js (LTS) and git if missing (ask her before downloading anything).
2. Sign in to GitHub with her account (`gh auth login`, she completes it in the browser), then clone:
   `git clone https://github.com/sohumbhole/Shift-Schedule.git`.
3. Create `.env.local` in the project folder with these names (get the values from the Supabase
   dashboard: Project Settings, API; she must be a member of the Supabase project):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `VITE_APP_BASE_URL=https://shift-schedule-website.vercel.app`, and `VITE_SENDGRID_API_KEY` if Sohum
   provides one. Walk her through copying each value, one at a time.
4. `npm install`, then `npm run dev`, and confirm the site loads and she can sign in.
5. Set the git author to her GitHub identity (`git config user.name` and `user.email`) so commits are
   credited to her.

## Quick facts

- Stack: Vite + React 18, Tailwind/shadcn, TanStack Query; Supabase (Postgres + Auth, free plan);
  Vercel (hosting and the serverless `/api` functions); SendGrid for emails.
- Known issue (2026-10): the SendGrid account has no credits, so signup and password reset emails do
  not send. Fixing it needs a decision from Sohum.
- Weekly backups run from Sohum's Windows PC (`_run_weekly_backup.cmd`).
- Full details, history and gotchas: `CONTEXT.md`.
