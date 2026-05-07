# Shift Schedule App - Project Context

## What This Is

A restaurant employee scheduling web app built for Sohum's mom's restaurant. Family use only - no employee logins, just one manager (mom) using it to schedule staff. Lives at https://shift-schedule-website.vercel.app

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
- `time_off` table uses `date` column (not `start_date` - the supabaseApi.js has a minor inconsistency where it orders by `start_date` but the schema column is `date`)
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
8. **Supabase time_off**: DB column is `date` (confirmed from schema). Some code paths use `t.date || t.start_date` as a fallback for safety.

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

## Next Steps

1. **Custom right-click context menu** - right-clicking a shift bar shows: Edit, Delete, Undo, Redo. Right-clicking empty timeline shows: Add Shift. Right-clicking an employee row shows context options. Replaces the need to hunt for buttons.
2. **Notes feature** - mom wants to attach notes to many things. Proposed scope:
   - Notes on individual shifts (e.g. "called in late", "cover needed")
   - Notes on employees (e.g. "availability changed", "training notes")
   - Notes on specific days (e.g. "holiday rush", "event catering")
   - Needs a new `notes` table in Supabase: columns likely `id`, `user_id`, `note_type` (shift/employee/day), `ref_id` (foreign key to the relevant row, or null for day notes), `ref_date` (for day notes), `body`, `created_at`
   - RLS on the table same as all other tables
3. **README update** - document Ctrl+Z / Ctrl+Shift+Z shortcuts

## Conversations We Had (Key Decisions)

- Considered "manual save queue" (Feature 1) vs Ctrl+Z (Feature 2). Researched all major competitors (7shifts, When I Work, Deputy, HotSchedules, Sling, Homebase). Industry consensus: autosave + publish step (for employee visibility). Since mom has no employees logging in, the publish concept doesn't apply. HotSchedules has full Z/Y undo up to 20 steps - that's the model we used.
- Decided employee edits are NOT undoable (editing modal = confirmed action)
- Decided employee reorder is NOT undoable (keep it simple)
- Employee delete IS undoable WITH cascade (solves "can't find all shifts to delete before undoing" problem by making delete itself cascade and storing everything)
- Undo failure behavior: retry (Option A) chosen over burn-the-bridge (Option B). Reason: transient errors shouldn't destroy history; retrying is safe because API calls are atomic; the user cannot skip past a failed step.

## Credentials Location

`~/blueberry/credentials.md` (gitignored) - has Supabase DB passwords for both projects
