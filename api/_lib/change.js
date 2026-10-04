// The change log and undo engine.
//
// Every write made through the API is saved as a change with an "inverse": the steps that put
// things back. Undo runs the inverse, then logs the undo as a change of its own (with its own
// inverse), so an undo can itself be undone.
//
// Inverse step types:
//   { op: 'delete', table, ids, expect }            remove rows the change created
//   { op: 'insert', table, rows }                   re-create rows the change removed (new ids)
//   { op: 'update', table, id, set, expect }        put fields back
//   { op: 'restore_employee', employee, shifts, time_off }   re-create a deleted employee and their rows
//   { op: 'delete_employee_cascade', employee_id }  remove an employee with their shifts and time off
//   { op: 'set_note', week, text }                  put a week note back (text null = no note)
//   { op: 'update_settings', set, expect }          put store settings back
// "expect" is how the rows looked right after the change. If someone edited them since, undo
// stops with CHANGED_SINCE unless force is true.
import { ApiError, problem } from './http.js';
import { newChangeId, saveChange, getChange } from './store.js';

const IGNORED = new Set(['id', 'user_id', 'created_at', 'created_date', 'updated_at']);

export function stripRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) if (!IGNORED.has(k)) out[k] = v;
  return out;
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function diffFields(current, expected, fields) {
  return fields.filter((f) => !sameValue(current?.[f], expected?.[f]));
}

// Records a change (skipped for dry runs). Returns the summary the response includes.
export async function recordChange(ctx, { action, summary, entity, entity_ids = [], before = null, after = null, inverse = [], undo_of = null }) {
  if (ctx.dryRun) return null;
  const id = newChangeId();
  const change = {
    id,
    at: new Date().toISOString(),
    action,
    summary,
    entity,
    entity_ids,
    actor: ctx.auth.via === 'api_key'
      ? { via: 'api_key', key_name: ctx.auth.key.name, key_prefix: ctx.auth.key.prefix }
      : { via: 'website' },
    before,
    after,
    inverse,
    undo_of,
    undone_at: null,
    undone_by: null,
    request_id: ctx.requestId,
  };
  try {
    await saveChange(ctx.sb, ctx.auth.userId, change);
  } catch (e) {
    // The data change already happened; do not fail the request, but say the log entry is missing.
    ctx.extraWarnings.push(problem('CHANGE_NOT_LOGGED', `The change was made, but saving it to the change log failed (${e.message}), so it cannot be undone through the API.`));
    return null;
  }
  return { change_id: id, undo: `POST /changes/${id}/undo` };
}

export function changeOut(c) {
  return {
    id: c.id,
    at: c.at,
    action: c.action,
    summary: c.summary,
    entity: c.entity,
    entity_ids: c.entity_ids,
    actor: c.actor,
    undo_of: c.undo_of,
    undone_at: c.undone_at,
    undone_by: c.undone_by,
    can_undo: !c.undone_at && Array.isArray(c.inverse) && c.inverse.length > 0,
    before: c.before,
    after: c.after,
  };
}

// Read only pass: what would block the undo, and what is already gone.
async function precheck(db, ops) {
  const conflicts = [];
  const notes = [];
  for (const op of ops) {
    if (op.op === 'delete') {
      const rows = await db.getByIds(op.table, op.ids);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const gone = op.ids.filter((id) => !byId.has(id));
      if (gone.length) notes.push(problem('ROWS_ALREADY_GONE', `${gone.length} ${op.table} row(s) from this change were already removed; nothing to undo for those.`, { details: { ids: gone } }));
      for (const exp of op.expect || []) {
        const cur = byId.get(exp.id);
        if (!cur) continue;
        const fields = Object.keys(stripRow(exp));
        const changed = diffFields(cur, exp, fields);
        if (changed.length) conflicts.push({ table: op.table, id: exp.id, changed_fields: changed, now: stripRow(cur), expected: stripRow(exp) });
      }
    } else if (op.op === 'update' || op.op === 'update_settings') {
      const cur = op.op === 'update_settings' ? await db.settings() : await db.getById(op.table, op.id);
      if (!cur) {
        conflicts.push({ table: op.table || 'store_settings', id: op.id, changed_fields: ['(row deleted)'] });
        continue;
      }
      const changed = diffFields(cur, op.expect || {}, Object.keys(op.expect || {}));
      if (changed.length) conflicts.push({ table: op.table || 'store_settings', id: cur.id, changed_fields: changed, now: Object.fromEntries(changed.map((f) => [f, cur[f]])), expected: Object.fromEntries(changed.map((f) => [f, op.expect[f]])) });
    } else if (op.op === 'set_note') {
      const s = await db.settings();
      const cur = s?.metadata?.week_notes?.[op.week] ?? null;
      if (op.expect !== undefined && !sameValue(cur, op.expect)) {
        conflicts.push({ table: 'week_notes', id: op.week, changed_fields: ['text'], now: cur, expected: op.expect });
      }
    }
  }
  return { conflicts, notes };
}

async function writeNote(db, week, text) {
  const s = await db.settings();
  const meta = { ...(s?.metadata || {}) };
  const notes = { ...(meta.week_notes || {}) };
  const prior = notes[week] ?? null;
  if (text === null || text === undefined || text === '') delete notes[week];
  else notes[week] = text;
  meta.week_notes = notes;
  if (s) await db.updateSettings(s.id, { metadata: meta });
  else await db.createSettings({ metadata: meta });
  return prior;
}

// Applies inverse steps in order. Returns the inverse of what it did (so the undo can be undone).
export async function applyOps(db, ops) {
  const redo = [];
  for (const op of ops) {
    switch (op.op) {
      case 'delete': {
        const rows = await db.getByIds(op.table, op.ids);
        if (rows.length) {
          await db.remove(op.table, rows.map((r) => r.id));
          redo.unshift({ op: 'insert', table: op.table, rows: rows.map(stripRow) });
        }
        break;
      }
      case 'insert': {
        const created = await db.insert(op.table, op.rows);
        redo.unshift({ op: 'delete', table: op.table, ids: created.map((r) => r.id), expect: created });
        break;
      }
      case 'update': {
        const cur = await db.getById(op.table, op.id);
        if (!cur) break;
        const prior = Object.fromEntries(Object.keys(op.set).map((k) => [k, cur[k]]));
        const updated = await db.update(op.table, op.id, op.set);
        redo.unshift({ op: 'update', table: op.table, id: op.id, set: prior, expect: Object.fromEntries(Object.keys(op.set).map((k) => [k, updated?.[k]])) });
        break;
      }
      case 'update_settings': {
        const cur = await db.settings();
        if (!cur) break;
        const prior = Object.fromEntries(Object.keys(op.set).map((k) => [k, cur[k]]));
        const updated = await db.updateSettings(cur.id, op.set);
        redo.unshift({ op: 'update_settings', set: prior, expect: Object.fromEntries(Object.keys(op.set).map((k) => [k, updated?.[k]])) });
        break;
      }
      case 'restore_employee': {
        const [emp] = await db.insert('employees', [op.employee]);
        const shifts = await db.insert('shifts', (op.shifts || []).map((s) => ({ ...s, employee_id: emp.id, employee_name: emp.name })));
        const timeOff = await db.insert('time_off', (op.time_off || []).map((t) => ({ ...t, employee_id: emp.id, employee_name: emp.name })));
        redo.unshift({ op: 'delete_employee_cascade', employee_id: emp.id, restored_counts: { shifts: shifts.length, time_off: timeOff.length } });
        break;
      }
      case 'delete_employee_cascade': {
        const emp = await db.getById('employees', op.employee_id);
        if (!emp) break;
        const shifts = await db.shifts({ employeeIds: [emp.id] });
        const timeOff = await db.timeOff({ employeeIds: [emp.id] });
        await db.remove('shifts', shifts.map((s) => s.id));
        await db.remove('time_off', timeOff.map((t) => t.id));
        await db.remove('employees', [emp.id]);
        redo.unshift({ op: 'restore_employee', employee: stripRow(emp), shifts: shifts.map(stripRow), time_off: timeOff.map(stripRow) });
        break;
      }
      case 'set_note': {
        const prior = await writeNote(db, op.week, op.text);
        redo.unshift({ op: 'set_note', week: op.week, text: prior, expect: op.text || null });
        break;
      }
      default:
        throw new ApiError(500, 'UNDO_NOT_POSSIBLE', `Unknown undo step "${op.op}".`);
    }
  }
  return redo;
}

export async function undoChange(ctx, changeId, { force = false } = {}) {
  const { sb, db, auth } = ctx;
  const change = await getChange(sb, auth.userId, changeId);
  if (!change) {
    throw new ApiError(404, 'NOT_FOUND', `No change with id ${changeId}.`, { hint: 'GET /changes lists recent changes with their ids.' });
  }
  if (change.undone_at) {
    throw new ApiError(409, 'ALREADY_UNDONE', `This change was already undone at ${change.undone_at}${change.undone_by ? ` (by change ${change.undone_by})` : ''}.`, {
      hint: change.undone_by ? `To bring it back, undo ${change.undone_by}: POST /changes/${change.undone_by}/undo.` : undefined,
    });
  }
  if (!Array.isArray(change.inverse) || change.inverse.length === 0) {
    throw new ApiError(409, 'UNDO_NOT_POSSIBLE', 'This change has nothing to undo.');
  }

  const { conflicts, notes } = await precheck(db, change.inverse);
  if (conflicts.length && !force) {
    throw new ApiError(409, 'CHANGED_SINCE', `Some of what this change touched was edited again afterwards (${conflicts.length} item(s)), so undoing it could overwrite newer work.`, {
      hint: 'Look at details.conflicts. To undo anyway, send {"force": true}.',
      details: { conflicts },
    });
  }

  if (ctx.dryRun) {
    return { change, redo: null, notes, conflicts, logged: null };
  }

  const redo = await applyOps(db, change.inverse);
  const logged = await recordChange(ctx, {
    action: 'change.undo',
    summary: `Undid: ${change.summary}`,
    entity: change.entity,
    entity_ids: change.entity_ids,
    inverse: redo,
    undo_of: change.id,
  });
  change.undone_at = new Date().toISOString();
  change.undone_by = logged?.change_id || null;
  await saveChange(sb, auth.userId, change);
  return { change, redo, notes, conflicts, logged };
}
