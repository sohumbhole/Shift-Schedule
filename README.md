# Shift Schedule

A restaurant employee scheduling web app built for managing shifts, time off, and store events. Built for personal family use.

---

## What It Does

- **Dashboard** — weekly calendar view of all employee shifts. Click any day to open a detailed day view.
- **Employees** — add, edit, and manage staff profiles (name, color, hours, food safety cert, etc.)
- **Time Off** — log regular days off or custom time-off requests per employee
- **Events** — add store-wide events (holidays, special days) that show on the calendar
- **Settings** — configure store name, manager, and opening/closing hours per day of week
- **Reorder employees** — drag to rearrange the order employees appear on the schedule

---

## Tech Stack

- **Frontend**: React 18 + Vite + React Router
- **UI**: Tailwind CSS + shadcn/ui components
- **Database + Auth**: Supabase (PostgreSQL with Row Level Security)
- **Data fetching**: TanStack React Query
- **API routes**: Vercel Serverless Functions (`/api/` folder)
- **Email**: SendGrid (for signup verification emails)
- **Deployed on**: Vercel

---

## Running Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=https://ituelwpduyuupmyhxhej.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
VITE_SENDGRID_API_KEY=your_sendgrid_key_here
VITE_APP_BASE_URL=http://localhost:5173
```

> **Where to find these**: Supabase Dashboard → your project → Settings → API

### 3. Start the dev server

```bash
npm run dev
```

This runs the frontend at `http://localhost:5173`.

> **Important**: The `/api/auth/*` routes (signup, email verification, password reset) are Vercel Serverless Functions. They **only work on Vercel** when using `npm run dev`. To test auth flows locally, use:
> ```bash
> npx vercel dev
> ```
> This runs both the frontend and the API functions together locally.

---

## Signing In

The app requires a Supabase account to log in. There is a sign-up flow on the login page, but it requires SendGrid to be configured (sends a verification email).

**For internal/family use**: accounts are best created directly in the Supabase dashboard under Authentication → Users, then mark them as verified.

---

## Database Schema

Five tables in Supabase (all protected by Row Level Security — each user only sees their own data):

| Table | Purpose |
|-------|---------|
| `employees` | Staff profiles (name, color, hours, notes) |
| `shifts` | Individual shift entries (employee, date, start/end time) |
| `time_off` | Time-off entries (regular off or custom requests) |
| `events` | Store-wide calendar events |
| `store_settings` | Store name, manager, hours per day of week, employee sort order |

The full schema is in `supabase/migrations/001_initial_schema.sql`.

---

## Deployment

Deployed automatically via Vercel on push to `main`. Environment variables are configured in the Vercel project dashboard.

Live URL: `https://shift-schedule-website.vercel.app` (or check Vercel dashboard for current URL)

---

## Project Structure

```
src/
  pages/          # Top-level pages (Dashboard, Employees, Settings, etc.)
  components/     # Reusable UI components
    dashboard/    # Calendar grid, shift blocks, modals
    employees/    # Employee cards and modals
    ui/           # shadcn/ui base components
  api/            # API client (routes to Supabase or mock)
  lib/            # Auth context, Supabase client, utils
api/
  auth/           # Vercel serverless functions (signup, verify, reset-password)
supabase/
  migrations/     # SQL schema files
```
