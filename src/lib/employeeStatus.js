// Employee display name and active or inactive status (2026-11-16).
//
// Inactive employees are stored as a list of employee ids in store_settings.metadata
// (`inactive_employee_ids`), next to week notes. No database column was added: the website and the
// API already read and write store_settings, the API merges metadata instead of replacing it (so
// Muse cannot erase the list), and nothing about the employee row itself changes. If a real
// `employees.inactive` column is ever added, move the list there and keep reading this key as a
// fallback.
import { api } from "@/api/api";

// First word of the name: "Preeti Sharma" shows as "Preeti". Names without a space are shown whole.
export function firstName(name) {
  const trimmed = String(name || "").trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

export function inactiveIdsOf(settings) {
  const ids = settings?.metadata?.inactive_employee_ids;
  return new Set(Array.isArray(ids) ? ids : []);
}

// Saves one employee as inactive or active. Re-reads the settings row first so a note or anything
// else written elsewhere (another tab, Muse) is never overwritten by a stale copy.
// When an employee becomes active again they go to the bottom of the dashboard order: they are
// taken out of employee_order, and employees missing from that list are shown after it. If no
// custom order was ever saved, one is created from `allEmployees` (oldest first, like the
// dashboard's default) so "bottom" really is the bottom.
export async function setEmployeeInactive(employeeId, inactive, allEmployees = []) {
  const rows = await api.entities.StoreSettings.list();
  const fresh = rows[0] || null;
  const meta = { ...(fresh?.metadata || {}) };
  const ids = new Set(Array.isArray(meta.inactive_employee_ids) ? meta.inactive_employee_ids : []);
  if (inactive === ids.has(employeeId)) return;

  const update = {};
  if (inactive) {
    ids.add(employeeId);
  } else {
    ids.delete(employeeId);
    let order = Array.isArray(fresh?.employee_order) ? fresh.employee_order : [];
    if (order.length === 0) {
      order = [...allEmployees]
        .sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime())
        .map((e) => e.id);
    }
    update.employee_order = order.filter((id) => id !== employeeId);
  }
  meta.inactive_employee_ids = [...ids];
  update.metadata = meta;

  if (fresh) await api.entities.StoreSettings.update(fresh.id, update);
  else await api.entities.StoreSettings.create(update);
}
