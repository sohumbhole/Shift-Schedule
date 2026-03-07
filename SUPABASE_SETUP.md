# Supabase setup

The app uses **Supabase** when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. Otherwise it uses the **local mock API** (data is in-memory only, lost on refresh).

---

## Reverting these changes

- **If you use Git:** Create a commit before making changes, then you can revert later:
  ```bash
  git add .
  git commit -m "Before Supabase"
  ```
  To revert after Supabase work: `git log` to find the commit hash, then `git reset --hard <hash>` or `git revert`.

- **If you don’t use Git:** Copy the whole project folder (e.g. `shift_schedule_website_backup`) before changing anything so you can replace the folder to restore the previous state.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose org, name, database password, region.
3. Wait for the project to be ready.

---

## 2. Run the database migration

1. In the Supabase Dashboard, open **SQL Editor**.
2. Copy the contents of **`supabase/migrations/001_initial_schema.sql`**.
3. Paste into the editor and click **Run**. This creates the tables and RLS policies.

---

## 3. Get your API keys

1. In the Dashboard go to **Project Settings** (gear) → **API**.
2. Copy:
   - **Project URL** → use as `VITE_SUPABASE_URL`
   - **anon public** key → use as `VITE_SUPABASE_ANON_KEY`

---

## 4. Configure the app

1. In the project root, create a file **`.env.local`** (it is gitignored; do not commit keys).
2. Add:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
   ```
3. Restart the dev server: `npm run dev`.

---

## 5. Enable email auth (for sign-in)

1. In the Dashboard go to **Authentication** → **Providers**.
2. **Email** is usually enabled by default.
3. For local/dev you can turn off “Confirm email” in **Authentication** → **Providers** → **Email** so sign-up works without verifying the inbox.

---

## 6. Create an account

1. Open the app (e.g. `http://localhost:5173`).
2. You’ll be redirected to **/login** if not signed in.
3. Use **Sign up** to create an account (email + password).
4. After sign-in you can use the Dashboard, Employees, Settings, etc.; data is stored in Supabase and scoped to your user.

---

## Summary

| Step | Action |
|------|--------|
| Revert | Use Git (commit before changes) or a backup copy of the project. |
| DB | Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor. |
| Keys | Project URL + anon key from Project Settings → API. |
| App | Put them in `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart dev server. |
| Auth | Sign up / sign in at `/login`; data is per user via RLS. |
