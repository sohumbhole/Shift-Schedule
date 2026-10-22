// Checks that src/lib/fetchAll.js reads past Supabase's 1000 row per request cap.
// Pure unit test with a fake query: no network, no database. Run from the repo root:
//   node scripts/tests/fetch_all_paging.mjs
import assert from 'node:assert/strict';
import { fetchAll, SUPABASE_PAGE } from '../../src/lib/fetchAll.js';

// A fake PostgREST table: `cap` rows per request at most, exactly like the live API.
function fakeTable(total, cap) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const calls = [];
  const build = () => ({
    range: async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, Math.min(to, from + cap - 1) + 1), error: null };
    },
  });
  return { build, calls };
}

let checks = 0;
async function expectAll(total, cap, pageSize, expectedCalls) {
  const t = fakeTable(total, cap);
  const rows = await fetchAll(t.build, pageSize);
  assert.equal(rows.length, total, `expected ${total} rows, got ${rows.length}`);
  assert.deepEqual(rows.map((r) => r.id), Array.from({ length: total }, (_, i) => i + 1), 'rows must come back once each, in order');
  assert.equal(t.calls.length, expectedCalls, `expected ${expectedCalls} requests, got ${t.calls.length}`);
  checks += 1;
}

// The real situation: 1,0xx shifts behind a 1000 row cap. One request used to lose the tail.
await expectAll(1037, 1000, SUPABASE_PAGE, 2);
// Exactly on the boundary: one extra (empty) request, nothing lost, nothing doubled.
await expectAll(1000, 1000, SUPABASE_PAGE, 2);
// Small tables keep costing one request.
await expectAll(289, 1000, SUPABASE_PAGE, 1);
await expectAll(0, 1000, SUPABASE_PAGE, 1);
// Many pages.
await expectAll(2501, 1000, SUPABASE_PAGE, 3);
// Smaller page sizes page the same way.
await expectAll(25, 10, 10, 3);

// An error on any page must surface, never be swallowed.
await assert.rejects(
  fetchAll(() => ({ range: async () => ({ data: null, error: new Error('boom') }) })),
  /boom/,
);
checks += 1;

console.log(`fetch_all_paging: ${checks} checks passed`);
