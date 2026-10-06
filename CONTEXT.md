# Shift Schedule App - Project Context

## What This Is

A restaurant employee scheduling web app built for Sohum's mom's restaurant. Family use only - no employee logins, just one manager (mom) using it to schedule staff. Lives at https://shift-schedule-website.vercel.app

Business context, how mom uses the app, and the current open action items live in Sohum's brain:
`~/brain/wiki/atomic-wings/shift-scheduler.md` (github.com/sohumbhole/brain). Read that first.

## The Situation

Sohum's mom uses this to schedule restaurant employees. She accidentally made a change once and couldn't find her shifts - caused a scare. That's why we added undo/redo. She is the only user. No employees log in. The "publish" concept that competitors use doesn't apply here.

## Tech Stack

- **Frontend**: React 18 + Vite (NOT Next.js - Sohum thought it was Next.js but it's not)
- **Routing**: React Router v6
- **UI**: Tailwind CSS + shadcn/ui components
- **Data fetching**: TanStack React Query (with optimistic updates on shift mutations)
- **Database + Auth**: Supabase (PostgreSQL + RLS - each user only sees their own data)
- **API routes**: Vercel Serverless Functions in `/api/` folder (auth only - signup, verify, reset-password)
- **Deployment**: Vercel (auto-deploy on push to main)
- **Repo**: https://github.com/sohumbhole/Shift-Schedule.git

## How to Run Locally

```bash
cd "/Users/sohumbhole/Documents/shift schedule/Shift-Schedule"
npm run dev           # frontend only at http://localhost:5173
# OR
npx vercel dev        # frontend + /api/ serverless functions (needed for auth flows)
```

The `.env.local` file is already set up with the correct Supabase URL and anon key. The service role key is needed only for auth API routes (vercel dev).

## Database

Supabase project: `ituelwpduyuupmyhxhej`
Tables: `employees`, `shifts`, `time_off`, `events`, `store_settings`
- `time_off` table uses `start_date` column (NOT `date` - the migration file 001_initial_schema.sql says `date` but the live DB was created with `start_date`. All code uses `start_date`. The `t.date || t.start_date` fallback pattern is for safety only.)
- All tables protected by RLS - user_id must match auth.uid()

Backups stored at: `/Users/sohumbhole/Documents/shift schedule database backups/`
Backup skill: `~/.claude/skills/supabase-backup/SKILL.md`

## Project Structure

```
src/
  pages/        - Dashboard.jsx, Employees.jsx, Settings.jsx, Login.jsx
  components/
    dashboard/  - DayView.jsx (drag/resize), CalendarGrid.jsx, AddShiftModal.jsx, etc.
    employees/  - EmployeeCard.jsx, EmployeeModal.jsx
    events/     - AddEditEventModal.jsx, EventsRow.jsx
    ui/         - shadcn components + UndoToast.jsx (custom)
  lib/          - AuthContext.jsx, supabaseClient.js, undoHistory.jsx, dashboardNav.jsx
  hooks/        - useUndoRedo.js, use-mobile.jsx
  api/          - api.js (routes to supabaseApi or mockApi)
api/            - Vercel serverless functions (auth only)
```

## What Was Built in This Session

### Drag UX fixes (DayView.jsx)
- **Resize drag stray click fix**: after resize, a one-time capture-phase click listener swallows the stray browser click so timeline's "Add Shift" doesn't fire
- **Edge hold+release**: no longer opens Edit Shift modal (edges are resize-only)
- **Move drag stray click fix**: same capture-phase swallow after move drag
- **Out-of-bounds cancel for move drag**: if cursor leaves the timeline area (tight bounds: right of sidebar, within employee rows only), cursor becomes `not-allowed` via injected `<style>` tag with `!important` (so buttons/links can't override it). Releasing out of bounds cancels the drag silently.
- **Optimistic updates**: `updateShift` mutation uses onMutate/onError/onSettled pattern so UI updates instantly on drag

### Login fix (Login.jsx)
- Removed `window.location.reload()` after `navigate()` - was causing AuthContext to reinitialize before Supabase session loaded from localStorage (redirect loop)
- `/api/auth/check-verified` gracefully falls back to user metadata when endpoint returns 404 (local dev without vercel dev)

### Em dash audit
- All em dashes (--) and en dashes (-) replaced with regular hyphens throughout entire src/ directory. User is adamant: NO em dashes anywhere ever in code, comments, UI, or server.

### Dashboard optimistic updates
- Added onMutate/onError/onSettled to updateShift mutation

### Undo/Redo Stack (Ctrl+Z / Ctrl+Shift+Z) - JUST ADDED
Full implementation across 4 new files + 3 modified files.

**New files:**
- `src/lib/undoHistory.jsx` - React context, 20-entry undo/redo stacks, push/undo/redo/canUndo/canRedo
- `src/lib/dashboardNav.jsx` - lets undo system tell Dashboard to jump to a specific week/day
- `src/components/ui/UndoToast.jsx` - floating toast (bottom center, rounded, auto-dismisses 3s)
- `src/hooks/useUndoRedo.js` - global keyboard handler + full applyEntry execution engine

**What goes on the undo stack:**
- Move/resize shift
- Add shift
- Delete shift
- Add time off (bulk or single)
- Delete time off
- Add event
- Delete event
- Clear day (stores all deleted shifts+timeoffs for restoration)
- Clear week (same)
- Copy previous week (stores original week AND what was copied in)
- Copy previous day
- Add employee
- Delete employee (CASCADE - deletes all their shifts+timeoffs first, stores everything for undo)

**What does NOT go on the stack:**
- Employee field edits (name, color, hours, etc.)
- Store settings changes
- Employee reorder
- Exports
- Time off edits (update only)

**Cross-page navigation**: If you Ctrl+Z and the change was on a different week, Dashboard automatically jumps to that week and shows a toast: "Undid: [description]" or "Redid: [description]"

**Employee delete cascade**: When you delete an employee, it cascade-deletes all their shifts and time offs first, stores everything in the undo entry. Ctrl+Z recreates the employee (new UUID) and re-attaches all their shifts with the updated employee_id. Redo cascade-deletes again.

**ID tracking**: After undo of a create (which deletes the item), a redo re-creates it and gets a new UUID from DB. The entry object is mutated in place to update the stored ID so future undo/redo stays in sync.

## Workflow Rules

1. **Always local first, never push without explicit permission.** Every feature is tested on localhost before pushing to GitHub/Vercel. Never push unless Sohum explicitly says "push it" or "push to GitHub". This applies even if the change looks obviously correct.

## Important Patterns / Lessons Learned

1. **No em dashes anywhere** - user is strict about this. Regular hyphen (-) only.
2. **Don't push to GitHub until user tests locally** - user got burned once when we pushed unverified code. Always test at localhost:5173 first.
3. **The /api/ auth routes only work with `npx vercel dev`** - regular `npm run dev` serves only the Vite frontend, not serverless functions.
4. **DayView.jsx drag system**: ShiftBar handles resize (left/right edge = 12px EDGE_HIT zone), parent DayView handles move drag via handleStartMoveDrag. Ghost overlay uses direct DOM manipulation (ghostRef) to avoid React setState lag.
5. **Cursor override during drag**: Use an injected `<style id="...">` tag with `* { cursor: X !important; }` - setting `document.body.style.cursor` is NOT enough because buttons/links override it.
6. **updateShift mutation**: needs `origData` passed as third key in variables object for undo history. mutationFn only uses `id` and `data`, so `origData` is ignored by the API call but available in onSuccess.
7. **deleteShift/deleteTimeOff/deleteEvent**: callers must pass `{ id, shift/timeOff/event: fullObject }` - the full object is needed to store in undo stack. mutationFn destructures only `{ id }`.
8. **Supabase time_off**: the live column is `start_date`, not `date` (verified with `node _discover_schema.mjs` on 2026-10-04; the migration file is wrong). Some code paths use `t.date || t.start_date` as a fallback for safety.

## Undo/Redo Bug Fixes (2026-05-06)

Three bugs found and fixed after initial undo/redo shipped:

### Bug 1: Move/drag undo failing after delete+undo-delete
**Root cause**: Supabase assigns a new UUID every time a row is recreated. When you undo a DELETE (shift comes back with a new ID), earlier stack entries (MOVE_SHIFT, ADD_SHIFT) still held the old UUID. Next Ctrl+Z tried `update(old_id)` → 404 → "Undo failed."

**Fix - `patchId()` in `undoHistory.jsx`**: After any DELETE undo (or ADD redo) creates a new UUID, scan every entry on both stacks shallow-scanning `backward` and `forward` objects and replace the old UUID with the new one. Covered types:
- Undo: `DELETE_SHIFT`, `DELETE_EVENT`, `DELETE_TIME_OFF`, `DELETE_EMPLOYEE`
- Redo: `ADD_SHIFT`, `ADD_EVENT`, `ADD_EMPLOYEE`

### Bug 2: Failed undo corrupted the stack, causing ghost shifts
**Root cause**: When undo failed, the entry stayed on the redo stack. The next Ctrl+Z popped an unrelated earlier entry and applied it out of order, creating duplicate/phantom shifts.

**Fix - `rollbackUndo()` / `rollbackRedo()` in `undoHistory.jsx`**: On failure, move the entry back to where it came from. Ctrl+Z always retries the same failed step - you cannot skip past it and undo earlier entries out of order. If the failure was transient (network blip), retrying naturally succeeds.

### Bug 3: Ctrl+Shift+Z and Ctrl+Z broken on Windows / with Caps Lock
**Root cause**: `e.key` is `"Z"` (uppercase) when Shift is held (Ctrl+Shift+Z) or Caps Lock is on. The old check `e.key === "z"` always failed in those cases.

**Fix**: `e.key.toLowerCase()` before comparing. One line in `useUndoRedo.js`.

### Security/edge case comment practice
When a known limitation exists in the code that is safe today but could become a real bug if a future feature is added, write a comment in the code at the relevant location explaining: what the limitation is, why it's safe now, and exactly what must be fixed before the new feature ships. Don't just note it in CONTEXT.md - put it in the code where the future developer will be working. Example already in place: `ADD_TIME_OFF` case in `useUndoRedo.js` has a comment warning that `patchId()` does not deep-scan arrays (`backward.ids`), which is fine today because time-offs can't be moved/resized, but must be fixed before any "edit time off" feature is added.

## Session: 2026-05-06 (Notes Feature + UX Polish)

### Weekly Notes (SHIPPED)

New `DayNotesModal.jsx` component + wired into WeekNav top bar.

**What it does:**
- Notes button always visible in WeekNav (both week view and day view)
- When a note is saved for the current week, button turns orange with PencilLine icon. Empty = blue with Pencil icon.
- Modal: textarea with 2,000-char limit. Paste truncates to limit instead of blocking.
- Live character counter turns red at limit.
- Save / Delete / Cancel actions. Deleting removes the key from metadata entirely.
- Shares the `["storeSettings"]` React Query cache - no extra network calls.

**Database:**
- Added `metadata jsonb NOT NULL DEFAULT '{}'` column to `store_settings` table.
- SQL run in Supabase: safe 3-step pattern (add nullable -> backfill -> enforce NOT NULL).
- Notes stored as: `metadata.week_notes["yyyy-MM-dd"] = "text"`
- `StoreSettings.create` in `supabaseApi.js` always injects `metadata: {}` as fallback to prevent NOT NULL violation.
- `supabase/migrations/001_initial_schema.sql` updated to reflect new column.

**Files changed:**
- `src/components/dashboard/DayNotesModal.jsx` - NEW
- `src/components/dashboard/WeekNav.jsx` - Notes button + hasNote indicator
- `src/api/supabaseApi.js` - metadata fallback on create
- `supabase/migrations/001_initial_schema.sql` - metadata column added

### Day View UX Polish (SHIPPED)

- **"Week view" back button** moved from DayView inner header into WeekNav top bar (orange, always in same place). Prop: `onExitDayView` on WeekNav.
- **Escape key exits day view**: `keydown` handler in DayView with two guards:
  - `document.querySelector('[role="dialog"]')` - don't exit if a modal is open
  - `document.fullscreenElement || document.webkitFullscreenElement` - Safari fullscreen check
  - Note: Safari native fullscreen sometimes triggers Escape before the app sees it - known Mac quirk, not a code bug.
- **Rotating hints** (top-right of DayView): cycles every 4 seconds between "Alt+drag to copy" and "Esc -> week view". Hidden on mobile (`hidden sm:block`).

**Files changed:**
- `src/components/dashboard/DayView.jsx`
- `src/components/dashboard/WeekNav.jsx`
- `src/pages/Dashboard.jsx` - `onExitDayView={() => setSelectedDay(null)}` prop added

### Dashboard Subtitle - Week Total Hours (SHIPPED)

- Subtitle now shows: `N employees - N shifts scheduled - X hrs this week`
- Uses `isSameDay` (from date-fns) for date matching - same logic CalendarGrid uses per-employee
- Handles midnight-crossing shifts: if `end <= start`, add 24*60 to end before subtracting
- Computed as a clean variable (`weekTotalHours`) before the return statement, not an inline IIFE

**File changed:** `src/pages/Dashboard.jsx`

### Code Archive / Backup (2026-05-06 10:47 PM)

A local archive snapshot of the full project was taken and tagged for this date/time. Stored separately from the repo. Purpose: safety net before major changes, not a replacement for git history.

### Supabase Skill Created

`~/.claude/skills/supabase/SKILL.md` - covers:
- 3-step safe ADD COLUMN pattern (add nullable -> backfill -> enforce NOT NULL)
- JSONB metadata bag pattern (top-level keys by feature)
- `IF NOT EXISTS` idempotency
- RLS safety when adding columns
- Supabase AI assistant consultation tip before risky schema changes
- Project ref `ituelwpduyuupmyhxhej` and where to find backup procedures

## Next Steps

1. **Custom right-click context menu** - right-clicking a shift bar shows: Edit, Delete, Undo, Redo. Right-clicking empty timeline shows: Add Shift. Right-clicking an employee row shows context options. Replaces the need to hunt for buttons.
2. **Notes expansion** - Week notes shipped. Future scope if mom wants more:
   - Notes on individual shifts (e.g. "called in late", "cover needed")
   - Notes on employees (e.g. "availability changed", "training notes")
   - Day-level notes (separate key in metadata: `metadata.day_notes["yyyy-MM-dd"]`)
3. **README update** - document Ctrl+Z / Ctrl+Shift+Z shortcuts

## Conversations We Had (Key Decisions)

- Considered "manual save queue" (Feature 1) vs Ctrl+Z (Feature 2). Researched all major competitors (7shifts, When I Work, Deputy, HotSchedules, Sling, Homebase). Industry consensus: autosave + publish step (for employee visibility). Since mom has no employees logging in, the publish concept doesn't apply. HotSchedules has full Z/Y undo up to 20 steps - that's the model we used.
- Decided employee edits are NOT undoable (editing modal = confirmed action)
- Decided employee reorder is NOT undoable (keep it simple)
- Employee delete IS undoable WITH cascade (solves "can't find all shifts to delete before undoing" problem by making delete itself cascade and storing everything)
- Undo failure behavior: retry (Option A) chosen over burn-the-bridge (Option B). Reason: transient errors shouldn't destroy history; retrying is safe because API calls are atomic; the user cannot skip past a failed step.

## Credentials Location

`~/blueberry/credentials.md` (gitignored) - has Supabase DB passwords for both projects

## Session: 2026-09-07 (Windows machine sync, backups, rules)

### This repo also lives on a Windows machine
Path: `C:\Users\sohum\Documents\Atomic Wings Shift Scedule Website\Shift-Schedule-Repo`.
Lesson learned: the local checkout can fall behind the live GitHub `main`. Always run
`git fetch` and compare `main..origin/main` before assuming local == live. On 2026-09-07 this
Windows checkout was found 17 commits behind; a plain `git status` showed "in sync" only because
the cached remote ref was stale. Nearly regressed the live app (would have wiped the Notes feature)
before this was caught.

### Windows local backups (this machine)
Supabase Free takes no automatic backups, so a Windows Task Scheduler job "Supabase Weekly Backup"
backs up all users to `..\Backups\backup-<timestamp>\` (one folder per user, plus `_manifest.json`,
written last, so a folder without it is a failed attempt). Log: `..\Backups\backup-log.txt`.

Triggers (changed 2026-10-04): Monday and Thursday at 1 AM (both wake the PC) plus at logon. Every
run skips silently if a successful backup from the last 6 days exists, so Thursday and logon only do
work when Monday failed. Runs on battery, catches up when available, 1 hour limit, hidden window.

Why: on 2026-09-21 and 2026-09-28 the Monday run started after waking the PC and was killed before
finishing (result 0xC000013A), because a PC woken by a timer sleeps again after about 2 minutes
without input and the network is slow right after waking. `_run_weekly_backup.ps1` now keeps the PC
awake for the run, waits up to 3 minutes for the network, limits each attempt to 10 minutes, and
retries 3 times. Running the task as S4U (fully in the background, which would also allow an unlock
trigger without a window flash) needs admin rights; not done.

Helper scripts in the repo root (they read secrets from `.env.local`, never print them):
- `_backup_user.mjs` - backs up EVERY user. It takes no arguments and has no way to target a
  single person (simplified 2026-09-07; it previously accepted an email or UUID). Reads the LIVE
  schema each run via the PostgREST OpenAPI spec, so column drift is captured; uses `SELECT *`.
  Backup folders are still named by the account email, which is read from the DB at run time, so
  a restore can tell whose data is whose.
- `_discover_schema.mjs` - prints the live public tables and columns.
- `_run_weekly_backup.ps1` - the runner the scheduled task calls (keep awake, network wait, time
  limit, retries, skip when fresh). Test parameters: `-Force`, `-MaxAttempts`,
  `-AttemptTimeoutSeconds`, `-RetryDelaySeconds`, `-NodeScript`.
- `_run_weekly_backup.cmd` - manual entry point; `_run_weekly_backup.cmd -Force` always backs up.
No Supabase Storage buckets exist, so there are no files to download beyond DB rows (re-check
each run).

### Rules reinforced
- **No em dashes or en dashes anywhere, ever** (code, comments, UI, docs). Plain hyphen only.
- **Do not change the DB schema or delete real rows just to test.** Deliberate feature migrations
  are done carefully (see the supabase skill, 3-step add-column pattern). To test against the live
  DB, use an empty week in 2030 or later (NOT the week of 2026-12-28: mom uses that week's note as
  a notepad for supply prices), write test rows there, then delete only those rows. Prefer mock
  mode (unset `VITE_SUPABASE_*`) for pure UI work.
- **Never push until Sohum says so;** test locally first.

### Requests from mom (2026-08-30) - status as of 2026-09-07 (built locally, not pushed)
1. DONE - Removed "Load Test Data" and "Reset All" from Settings; deleted `DataControls.jsx` and
   `testData.js`.
2. DONE - Employee unavailability now shows on the WEEK view (subtle hatch on the cell plus a small
   ban icon with a tooltip; the icon is darker for all-day unavailability). `CalendarGrid.jsx`.
3. DONE (shift modal) - Add/edit/delete of a shift on a PAST date now asks for confirmation before
   saving (`AddShiftModal.jsx`). NOT yet covered: time-off edits and drag/resize/move in DayView,
   and the copy/clear-week/day bulk actions - follow-up if mom wants full coverage.
4. DONE - Tentative / backup shifts, via a real `tentative boolean NOT NULL DEFAULT false`
   column on `shifts` (Sohum approved the migration). The migration has been APPLIED to the live
   DB and verified on 2026-09-07 with `node _discover_schema.mjs` (shifts now reports
   `..., color, created_at, tentative`). The statement that was run, for the record:
     ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS tentative boolean NOT NULL DEFAULT false;
   Checkbox in the Add/Edit Shift modal; rendered as an outline (colored border, white fill, dark
   text, no extra label) in week and day views; excluded from ALL hours math (modal, week grid,
   day view, dashboard subtitle); shown in exports (outlined box in the image tables, " (backup)"
   text tag in the condensed Employee Summary). Preserved through copy week/day, alt-drag copy, and
   undo/redo. Flows through the data layer and backups automatically (SELECT *). Migration file
   `001_initial_schema.sql` updated to document the column.
5. DONE - "Employee Summary" export can now target a single employee (new "Employee Summary: one
   person" picker in the export menu). `ExportSchedule.jsx`.
6. DONE - Week notes modal now auto-saves when you click the X, click outside, or press Escape
   (Cancel still discards), and Delete now asks for confirmation. `DayNotesModal.jsx`.
7. DONE - `reset-password.js` now sends from `sohumbhole@gmail.com` (the same verified sender
   signup uses) instead of the likely-unverified `noreply@shift-schedule.app`.

8. DONE - Fixed the tentative outline being drawn wrong in "Export as Image" (mom reported the
   outline was off-center and cut through the time text). See the section below for the cause.

### html2canvas + Tailwind: the export text baseline bug (2026-09-07)

Root cause, worth remembering because it is invisible until something has a border:

html2canvas 1.4.1 works out where a font's baseline sits by inserting a hidden 1x1 `<img>` next to
a sample `<span>` and reading `img.offsetTop` (see `FontMetrics.parseMetrics` in
`node_modules/html2canvas/dist/html2canvas.js`). That measurement only works while the img is
**inline**. Tailwind's preflight ships
`img,svg,video,canvas,audio,iframe,embed,object{display:block;vertical-align:middle}`, which knocks
the probe onto its own line and inflates the measured baseline by roughly a line height. Every
glyph in every exported image was therefore painted about 6px lower than the browser puts it.

Plain text hid it. The tentative outline did not: measured in the repro, the box was drawn
correctly at y 22.0-43.0 but the text ink landed at 34.5-45.0, i.e. hanging 2px BELOW its own
bottom border. Adding padding does not help, because the box was never the thing in the wrong
place.

Fix: `src/lib/exportImage.js` exports `renderNodeToCanvas(node, options)`, which injects
`img[width="1"][height="1"]{display:inline !important;vertical-align:baseline !important}` for the
duration of the render and removes it in a `finally`. The selector matches only html2canvas's own
measuring probe, so nothing on the visible page is affected. Both html2canvas call sites now go
through it (`ExportSchedule.jsx` and `ExportScreenshot.jsx`).

Side effect worth knowing: ALL text in exported images moved up about 5px into its correct
position, so exports are slightly better aligned overall, not just the tentative boxes.

The tentative box padding is `3px 8px 6px` (heavier at the bottom on purpose). Even with the
baseline fixed, html2canvas still paints roughly 2px low because it uses `textBaseline = 'bottom'`
plus a `+ 2` fudge in the metric. Measured after the fix: 8.5px above the text, 7.0px below.
That element is only ever rasterized (it is mounted at `position: fixed; top/left: -9999px` and
never shown on screen), so tuning its padding for the raster rather than for the DOM is correct.

If a future export ever looks vertically off again, reach for
`node_modules/html2canvas/dist/html2canvas.js` `FontMetrics.parseMetrics` first, not padding.

## Session: 2026-10-04 (security fix, backup fix)
- Deleted `api/auth/debug.js`. It was publicly reachable at `/api/auth/debug` with no login, returned
  the first characters of the service role and SendGrid keys plus the Supabase URL, and ran admin
  queries on every request. Nothing referenced it.
- Backup runner rewritten and the scheduled task changed (see "Windows local backups" above).
- `time_off` column note corrected to `start_date`; test rows must go in 2030 or later, never the
  week of 2026-12-28 (mom's notepad).

## Session: 2026-10-04 (Muse API, built while Sohum was away)

Mom uses Meta Muse as her assistant (connected to her own brain, Toast, Sysco, calendar, email). This
session gave Muse full access to the scheduler through a private REST API. Business context and the
plan: `~/brain/wiki/atomic-wings/muse-integration.md`.

### Where things are
- Base URL `https://shift-schedule-website.vercel.app/api/v1`. Docs for AI: `/api/v1/docs` (raw
  Markdown, no JavaScript needed). Docs for people: `/api-docs` (public React page, no sign in).
  OpenAPI: `/api/v1/openapi.json`.
- Fallback if the Settings card ever fails: node scripts/create_api_key.mjs <account email> [name] [read|read_write]
  (prints the key once; needs .env.local). The card itself was not exercised end to end on 2026-10-04
  because that needs a real sign in; everything behind it is tested.
- Keys: website Settings > "API access" card (create, copy once, revoke; also lists recent API
  changes with an Undo button). Home page has a small "Connect an AI assistant" link to the docs.
- One Vercel function: `api/v1/index.js` (router). `vercel.json` rewrites `/api/v1/:path*` to
  `/api/v1?path=:path*` (must stay ABOVE the generic `/api/(.*)` rule). Total functions: 5 (Hobby
  limit is 12), so add routes to the router, not new files under `api/`.
- Code under `api/_lib/` (underscore folders are not deployed as functions): `http.js` (envelope,
  errors, Chicago time), `parse.js` (dates, "5pm" style times, quarter hour rule, employee lookup by
  name or id), `auth.js`, `data.js` (EVERY query pinned to `user_id`), `store.js` (Storage),
  `format.js`, `rules.js`, `change.js` (change log and undo engine), `handlers_read.js`,
  `handlers_shifts.js`, `handlers_other.js`, `openapi.js`. Docs Markdown: `src/lib/apiDocs.js` (one
  source for both docs URLs).

### Same rules as the website
`src/lib/shiftRules.js` holds the shift rules and is imported by BOTH `AddShiftModal.jsx` and the API.
Blocks: outside store hours (overnight aware), overlapping shift for the same employee that day.
Past dates need `confirm_past` (the website asks "Are you sure?"). Warnings: marked unavailable, time
off that day (new; the modal now shows it too), over or at max weekly hours. Times must be on :00,
:15, :30, :45 because the website's time picker only offers those. Proof that the extraction did
not change behavior: `node scripts/tests/rules_equivalence.mjs` runs the ORIGINAL modal logic
(frozen copy) and the module side by side on 20,000 cases from the busiest account in the newest
backup; result 0 mismatches.

### Storage instead of new tables
No SQL access from this PC (the DB password file in the workspace root is out of date) and Sohum
prefers no new tables. So API keys, the change log and idempotency records live in the private
Supabase Storage bucket `api-private` (created automatically): `tokens/<sha256>.json`,
`users/<uid>/tokens/<id>.json`, `users/<uid>/changes/<chg_id>.json`, `users/<uid>/idem/<sha256>.json`.
Keys are `sk_shift_` + 32 random bytes and are stored only as SHA-256 hashes.
GOTCHA: Supabase Storage downloads are CDN cached (objects default to max-age=3600). A revoked key
kept working until this was fixed. `store.js` now uploads with `cacheControl: '0'` and reads through
the storage REST endpoint with a unique `nocache` query string. Keep both.
The backup script (`_backup_user.mjs`) only copies database tables, so the change log is not in the
Windows backups; it is not primary data.

### Behavior
- Every response: `ok, status, action, message, data, warnings, errors, meta`. Errors and warnings
  carry `code`, `message`, `hint`, `details`. Writes return the affected day(s) and employee week(s).
- `dry_run` on every write; `Idempotency-Key` header for safe retries (24 hours); `confirm: true` for
  clear and employee delete (mirrors the website's confirm dialogs).
- Every API write is logged with an "inverse" (steps to put things back). `POST /changes/{id}/undo`
  applies it, refuses with CHANGED_SINCE if the same rows were edited again (unless `force`), and
  logs the undo itself so it can be undone. Re-created rows get new ids.
- Copy week inserts the new rows first, then deletes the old ones, so a failure can never leave the
  week empty (the website's copy deletes first).
- Website auth: the Settings card calls the API with the Supabase session token (`src/lib/apiClient.js`);
  only a session can create or revoke keys.
- Live refresh: `refetchOnWindowFocus` is now true, and `src/hooks/useLiveRefresh.js` polls
  `/changes/latest` every 30 seconds while the tab is visible and refetches when something new
  appears. Realtime would need SQL (publication changes), so it is not used.

### Website fixes shipped with it
- Copy previous week (and the undo snapshots for clear day, clear week and delete employee) sent
  time off with `date`, which the live table rejects (PGRST204: the column is `start_date`), so copy
  week failed on regular days off after already deleting the target week's. `supabaseApi.js` now maps
  `date` to `start_date` for every time off write.
- The notes window merged into a cached settings row, which could erase a note written by Muse. It
  now re-reads the row right before saving or deleting.
- Delete employee undo now keeps the `tentative` flag on restored shifts.

### Testing
`API_TEST_EMAIL=<test account> node scripts/tests/api_integration.mjs` runs 87 checks through the
real handler against the live DB: only in that account, only in empty 2030 weeks (it refuses
otherwise), and it deletes everything it created (rows, storage files, keys). Covers every endpoint,
the rules, dry run, batch, idempotency, copy and clear with undo, undo of undo, account isolation
(another account's key gets 404 on these rows), read only keys, revoked keys. Last run 2026-10-04:
87 passed. Use your own account, never the restaurant's.

### Keeping the database awake (2026-10-04)
Supabase Free pauses a project after 7 days with no database queries, which would take the website
AND the API offline. Vercel functions themselves never spin down (only a cold start of a second or
two). vercel.json now has a daily cron (11:00 UTC, 6 AM Champaign; Hobby allows daily only) that calls
GET /api/v1/keepalive, which runs one tiny real query. Check it in Vercel > Project > Settings > Cron
Jobs. Before this, only mom's use and the Monday/Thursday PC backups kept the project active.
A second, independent schedule: .github/workflows/keepalive.yml (GitHub Actions, daily 14:17 UTC,
3 retries, also runnable by hand from the Actions tab). Neither depends on any laptop. If a run
fails, GitHub emails Sohum, which doubles as basic downtime monitoring. The repo is private, so
GitHub's 60 day auto disable for inactive public repos does not apply (about 30 of 2,000 free
Actions minutes a month).

## Session: 2026-10-06 (handoff to Kavita's Claude, repository going public)
- Kavita takes over requesting and shipping changes through her own Claude Code. `CLAUDE.md` (loaded
  automatically by Claude Code; `AGENTS.md` points other agents to it) holds the routine for every change.
- Decision: make this repository PUBLIC so commits by collaborators deploy on Vercel's free Hobby plan
  (Hobby blocks other people's commits only on private repositories). Vercel stays on Sohum's account and
  the site address does not change. Kavita (GitHub kavitavenkatesh) is a collaborator with push access;
  both are Owners of the Supabase organization. No Vercel key is shared.
- Checked before going public: no keys, tokens, passwords or connection strings anywhere in the 49
  commit history; the only email in history is Sohum's (the site's sender). `.vercel/project.json` is
  tracked but holds only project and org ids (not secrets).
- Keep on: Vercel Git Fork Protection (default on), so pull requests from strangers' forks never build
  with the project's secret environment variables.
- Caveat: GitHub disables scheduled workflows in PUBLIC repositories after 60 days without commits, so the
  GitHub keepalive can stop on its own; the Vercel cron keeps the database awake regardless.
