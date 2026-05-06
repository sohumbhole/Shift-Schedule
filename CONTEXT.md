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

## Important Patterns / Lessons Learned

1. **No em dashes anywhere** - user is strict about this. Regular hyphen (-) only.
2. **Don't push to GitHub until user tests locally** - user got burned once when we pushed unverified code. Always test at localhost:5173 first.
3. **The /api/ auth routes only work with `npx vercel dev`** - regular `npm run dev` serves only the Vite frontend, not serverless functions.
4. **DayView.jsx drag system**: ShiftBar handles resize (left/right edge = 12px EDGE_HIT zone), parent DayView handles move drag via handleStartMoveDrag. Ghost overlay uses direct DOM manipulation (ghostRef) to avoid React setState lag.
5. **Cursor override during drag**: Use an injected `<style id="...">` tag with `* { cursor: X !important; }` - setting `document.body.style.cursor` is NOT enough because buttons/links override it.
6. **updateShift mutation**: needs `origData` passed as third key in variables object for undo history. mutationFn only uses `id` and `data`, so `origData` is ignored by the API call but available in onSuccess.
7. **deleteShift/deleteTimeOff/deleteEvent**: callers must pass `{ id, shift/timeOff/event: fullObject }` - the full object is needed to store in undo stack. mutationFn destructures only `{ id }`.
8. **Supabase time_off**: DB column is `date` (confirmed from schema). Some code paths use `t.date || t.start_date` as a fallback for safety.

## Next Steps (as of this session)

1. **Test undo/redo locally** - it was just coded and hasn't been tested yet
2. **Push to GitHub** after testing
3. **Custom right-click context menu** - was discussed but not built. Show "Undo/Redo" + context-aware options (edit/delete shift when right-clicking a shift bar, add shift on empty timeline)
4. **README**: Mention undo/redo shortcuts (Ctrl+Z / Ctrl+Shift+Z) in the README

## Conversations We Had (Key Decisions)

- Considered "manual save queue" (Feature 1) vs Ctrl+Z (Feature 2). Researched all major competitors (7shifts, When I Work, Deputy, HotSchedules, Sling, Homebase). Industry consensus: autosave + publish step (for employee visibility). Since mom has no employees logging in, the publish concept doesn't apply. HotSchedules has full Z/Y undo up to 20 steps - that's the model we used.
- Decided employee edits are NOT undoable (editing modal = confirmed action)
- Decided employee reorder is NOT undoable (keep it simple)
- Employee delete IS undoable WITH cascade (solves "can't find all shifts to delete before undoing" problem by making delete itself cascade and storing everything)

## Credentials Location

`~/blueberry/credentials.md` (gitignored) - has Supabase DB passwords for both projects
