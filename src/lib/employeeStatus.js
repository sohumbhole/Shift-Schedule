// Employee display name and active or inactive status.
//
// Inactive lives in the real column `employees.inactive` (boolean, NOT NULL, default false), added
// 2026-11-16 in the Supabase SQL editor. For about an hour before that, the website kept a list of
// inactive ids in store_settings.metadata.inactive_employee_ids; `migrateLegacyInactive` copies any
// ids still there onto the rows once and removes the list, and `isInactive` still honours the list
// until that has happened.
import { api } from "@/api/api";

// First word of the name: "Preeti Sharma" shows as "Preeti". Names without a space are shown whole.
export function firstName(name) {
  const trimmed = String(name || "").trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

function legacyIds(settings) {
  const ids = settings?.metadata?.inactive_employee_ids;
  return new Set(Array.isArray(ids) ? ids : []);
}

// Ids of every inactive employee: the column, plus any id still on the old settings list.
export function inactiveIdsOf(settings, employees) {
  const ids = legacyIds(settings);
  for (const e of employees || []) if (e.inactive) ids.add(e.id);
  return ids;
}

// Puts an employee who just became active again at the bottom of the dashboard order: they are
// taken out of employee_order, and employees missing from that list are shown after it. If no
// custom order was ever saved, one is created from `allEmployees` (oldest first, like the
// dashboard's default). Re-reads the settings row first so nothing written elsewhere is lost.
export async function moveToBottom(employeeId, allEmployees = []) {
  const rows = await api.entities.StoreSettings.list();
  const fresh = rows[0] || null;
  let order = Array.isArray(fresh?.employee_order) ? fresh.employee_order : [];
  if (order.length === 0) {
    order = [...allEmployees]
      .sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime())
      .map((e) => e.id);
  }
  const employee_order = order.filter((id) => id !== employeeId);
  if (fresh) await api.entities.StoreSettings.update(fresh.id, { employee_order });
  else await api.entities.StoreSettings.create({ employee_order });
}

// One time: copies ids from the old settings list onto the employee rows, then removes the list.
// Safe to call on every page load; it does nothing once the list is gone. Returns true if it
// changed anything.
export async function migrateLegacyInactive(employees) {
  const rows = await api.entities.StoreSettings.list();
  const fresh = rows[0] || null;
  const ids = legacyIds(fresh);
  if (!fresh || !fresh.metadata || !Object.prototype.hasOwnProperty.call(fresh.metadata, "inactive_employee_ids")) return false;
  const known = new Set((employees || []).map((e) => e.id));
  for (const id of ids) {
    if (known.has(id)) await api.entities.Employee.update(id, { inactive: true });
  }
  const { inactive_employee_ids: _drop, ...meta } = fresh.metadata;
  await api.entities.StoreSettings.update(fresh.id, { metadata: meta });
  return true;
}
