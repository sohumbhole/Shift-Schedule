import { useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import { addDays, addMonths, format, startOfMonth } from "date-fns";
import { api } from "@/api/api";

// The website loads shifts ONE CALENDAR MONTH AT A TIME instead of the whole history (2026-10-22).
//
// Each month is its own cached query, key ["shifts", "yyyy-MM"]. The Dashboard asks for the months
// around the week on screen and the months around today (see neededShiftMonths), so:
// - a reload on an old week loads that week's months AND today's months, so "Today" is instant;
// - moving week to week inside loaded months makes no request at all;
// - moving into a month that is not loaded yet fetches it and its neighbors in the background while
//   the page stays usable (the grid shows "Loading shifts" until that week's data is in);
// - months already seen stay cached for 30 minutes, so going back to them is instant.
// Invalidating ["shifts"] (live refresh, the API card) still refreshes every loaded month.

const MONTH_STALE_MS = 2 * 60 * 1000;
const MONTH_CACHE_MS = 30 * 60 * 1000;

export const monthKeyOf = (date) => format(date, "yyyy-MM");
export const monthKeyOfDateStr = (dateStr) => String(dateStr).slice(0, 7);

function monthStart(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function monthBounds(key) {
  const start = monthStart(key);
  return { from: format(start, "yyyy-MM-dd"), toExclusive: format(addMonths(start, 1), "yyyy-MM-dd") };
}

// Month keys from the month of `from` through the month of `to` (Dates, inclusive).
export function monthsBetween(from, to) {
  const keys = [];
  const last = monthKeyOf(to);
  for (let d = startOfMonth(from); ; d = addMonths(d, 1)) {
    const key = monthKeyOf(d);
    keys.push(key);
    if (key >= last) break;
  }
  return keys;
}

export const monthsAround = (date, radius = 1) => monthsBetween(addMonths(date, -radius), addMonths(date, radius));

// The months the Dashboard keeps loaded: the viewed month plus one each side, the whole viewed week
// plus the week before (copy previous week) and after, the selected day and the day before it (copy
// previous day), and today's month plus one each side.
export function neededShiftMonths({ weekStart, selectedDay, today = new Date() }) {
  const keys = new Set([
    ...monthsAround(weekStart, 1),
    ...monthsBetween(addDays(weekStart, -7), addDays(weekStart, 13)),
    ...monthsAround(today, 1),
  ]);
  if (selectedDay) {
    for (const k of monthsAround(selectedDay, 1)) keys.add(k);
    for (const k of monthsBetween(addDays(selectedDay, -1), addDays(selectedDay, 1))) keys.add(k);
  }
  return [...keys].sort();
}

export function shiftMonthQuery(key) {
  const { from, toExclusive } = monthBounds(key);
  return {
    queryKey: ["shifts", key],
    queryFn: () => api.entities.Shift.listRange(from, toExclusive),
    staleTime: MONTH_STALE_MS,
    gcTime: MONTH_CACHE_MS,
  };
}

// Loads the given months (from cache when possible) and merges them into one list.
export function useShiftMonths(monthKeys) {
  const keysId = monthKeys.join(",");
  const combine = useCallback((results) => {
      const keys = keysId.split(",");
      const loaded = {};
      const shifts = [];
      results.forEach((r, i) => {
        loaded[keys[i]] = r.data !== undefined;
        if (r.data) shifts.push(...r.data);
      });
      return {
        shifts,
        loaded,
        isFetching: results.some((r) => r.isFetching),
        failed: results.some((r) => r.isError && r.data === undefined),
        refetchFailed: () => results.forEach((r) => { if (r.isError) r.refetch(); }),
      };
  }, [keysId]);
  return useQueries({ queries: monthKeys.map(shiftMonthQuery), combine });
}

// Every shift with from <= date <= to (yyyy-MM-dd strings), making sure each month is loaded first.
// Used before copy and clear so they never act on a month that has not arrived yet.
export async function ensureShiftsBetween(queryClient, from, to) {
  const keys = monthsBetween(new Date(from + "T00:00:00"), new Date(to + "T00:00:00"));
  const months = await Promise.all(keys.map((k) => queryClient.ensureQueryData(shiftMonthQuery(k))));
  return months.flat().filter((s) => s.date >= from && s.date <= to);
}

// Refetch only the months these dates fall in. With no dates, refetch every loaded month.
export function refreshShiftMonths(queryClient, dateStrs = []) {
  const keys = [...new Set(dateStrs.filter(Boolean).map(monthKeyOfDateStr))];
  if (keys.length === 0) return queryClient.invalidateQueries({ queryKey: ["shifts"] });
  return Promise.all(keys.map((k) => queryClient.invalidateQueries({ queryKey: ["shifts", k] })));
}
