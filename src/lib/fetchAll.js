// Reads EVERY row of a Supabase query by paging through it.
//
// Why this exists (bug found 2026-10-22): Supabase's REST layer (PostgREST) returns at most 1000
// rows per request, silently, with no error and no warning. The website used to load all of an
// account's shifts with one request. In October 2026 the restaurant's account passed 1000 shifts,
// so the newest rows (sorted by date, those are the last days of the newest week) never reached the
// browser: the week view, the day view and the image exports showed nothing for them, and nothing
// on those days could be edited or deleted, while the API (which already pages) could see them.
//
// `build` must return a fresh Supabase query each time it is called (filters and ORDER BY included).
// The ORDER BY must be stable (end it with a unique column such as `id`), otherwise rows that tie
// can move between pages and get skipped or duplicated.
export const SUPABASE_PAGE = 1000;

export async function fetchAll(build, pageSize = SUPABASE_PAGE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}
