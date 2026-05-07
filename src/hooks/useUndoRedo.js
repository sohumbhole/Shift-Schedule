import { useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/api";
import { useUndoHistory } from "@/lib/undoHistory";
import { useDashboardNav } from "@/lib/dashboardNav";
import { createPageUrl } from "@/utils";

// Executes one undo or redo operation against the server, then invalidates
// the relevant React Query caches. The entry object is mutated in place to
// update IDs that change when items are recreated (e.g. after a delete+undo,
// the recreated row has a new UUID - we store it back so future redo works).
async function applyEntry(entry, direction, { queryClient, dashboardNav, navigate, location }) {
  const data = entry[direction];

  // --- Navigate to the right page / week / day first ---
  const path = location.pathname.toLowerCase();
  if (entry.page === "employees") {
    if (!path.includes("employees")) navigate(createPageUrl("Employees"));
  } else if (entry.page === "dashboard") {
    if (!path.includes("dashboard") && path !== "/") navigate(createPageUrl("Dashboard"));
    if (entry.weekStart) {
      const weekDate = new Date(entry.weekStart + "T00:00:00");
      // Preserve the current view - don't force a view switch just because
      // the entry has a dayDate. Only pass a dayDate if:
      //   - we are already in day view AND the entry has a specific day
      // In all other cases pass null so we stay in (or go to) week view.
      // Exception: if we are in day view but the entry has no dayDate (a
      // week-level op like CLEAR_WEEK), pass null to return to week view.
      const viewState = dashboardNav.getViewState?.();
      const isDayView = viewState?.isDayView ?? false;
      const dayDate = (isDayView && entry.dayDate)
        ? new Date(entry.dayDate + "T00:00:00")
        : null;
      dashboardNav.navigateTo(weekDate, dayDate);
    }
  }

  // --- Execute the operation ---
  switch (entry.type) {

    case "MOVE_SHIFT":
    case "RESIZE_SHIFT": {
      const { id, ...updateData } = data;
      await api.entities.Shift.update(id, updateData);
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      break;
    }

    case "ADD_SHIFT": {
      if (direction === "backward") {
        await api.entities.Shift.delete(data.id);
      } else {
        const created = await api.entities.Shift.create(data);
        entry.backward.id = created.id; // update for future undo
      }
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      break;
    }

    case "DELETE_SHIFT": {
      if (direction === "backward") {
        const created = await api.entities.Shift.create(data);
        entry.forward.id = created.id; // update for future redo
      } else {
        await api.entities.Shift.delete(data.id);
      }
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      break;
    }

    case "ADD_TIME_OFF": {
      // NOTE FOR FUTURE FEATURE - READ THIS before adding "edit time off" (move/resize):
      // patchId() does a shallow scan of entry.backward and entry.forward objects.
      // ADD_TIME_OFF stores multiple IDs as an array: backward.ids = [id1, id2, ...].
      // A shallow scan won't find individual IDs nested inside that array, so if a
      // DELETE_TIME_OFF undo ever recreates a row with a new UUID, the stale old UUID
      // inside backward.ids will NOT get patched automatically.
      // Right now this is harmless because time-offs can't be moved/resized - there is
      // no MOVE_TIME_OFF operation that would reference those IDs later.
      // BUT: if you add an "edit time off" feature (change start/end time after creation),
      // you MUST also extend patchId() to deep-scan arrays inside backward/forward, or
      // ADD_TIME_OFF undo will silently try to delete stale IDs and fail (or worse,
      // delete the wrong row if IDs ever collide).
      if (direction === "backward") {
        // backward.ids is an array of IDs to delete
        for (const id of data.ids) await api.entities.TimeOff.delete(id);
        queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
      } else {
        // forward is an array of payloads to re-create
        const payloads = Array.isArray(data) ? data : [data];
        const created = await api.entities.TimeOff.bulkCreate(payloads);
        entry.backward.ids = created.map((t) => t.id); // update IDs for future undo
        queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
      }
      break;
    }

    case "DELETE_TIME_OFF": {
      if (direction === "backward") {
        // data is the full time off payload (no id) - recreate it
        const created = await api.entities.TimeOff.create(data);
        entry.forward.id = created.id; // update for future redo
      } else {
        await api.entities.TimeOff.delete(data.id);
      }
      queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
      break;
    }

    case "ADD_EVENT": {
      if (direction === "backward") {
        await api.entities.Event.delete(data.id);
      } else {
        const created = await api.entities.Event.create(data);
        entry.backward.id = created.id;
      }
      queryClient.invalidateQueries({ queryKey: ["events"] });
      break;
    }

    case "DELETE_EVENT": {
      if (direction === "backward") {
        const created = await api.entities.Event.create(data);
        entry.forward.id = created.id;
      } else {
        await api.entities.Event.delete(data.id);
      }
      queryClient.invalidateQueries({ queryKey: ["events"] });
      break;
    }

    case "CLEAR_DAY": {
      if (direction === "backward") {
        // Restore all the shifts and time offs that were cleared
        if (data.shifts.length > 0) await api.entities.Shift.bulkCreate(data.shifts);
        if (data.timeOffs.length > 0) await api.entities.TimeOff.bulkCreate(data.timeOffs);
      } else {
        // Re-clear the day by date (don't rely on stale IDs)
        const allShifts = await api.entities.Shift.list();
        for (const s of allShifts.filter((s) => s.date === data.date)) {
          await api.entities.Shift.delete(s.id);
        }
        const allTimeOffs = await api.entities.TimeOff.list();
        for (const t of allTimeOffs.filter((t) => (t.date || t.start_date) === data.date && t.type === "regular_off")) {
          await api.entities.TimeOff.delete(t.id);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
      break;
    }

    case "CLEAR_WEEK": {
      if (direction === "backward") {
        if (data.shifts.length > 0) await api.entities.Shift.bulkCreate(data.shifts);
        if (data.timeOffs.length > 0) await api.entities.TimeOff.bulkCreate(data.timeOffs);
      } else {
        const wStart = new Date(data.weekStart + "T00:00:00");
        const wEnd = new Date(data.weekEnd + "T00:00:00");
        const allShifts = await api.entities.Shift.list();
        for (const s of allShifts.filter((s) => { const d = new Date(s.date + "T00:00:00"); return d >= wStart && d < wEnd; })) {
          await api.entities.Shift.delete(s.id);
        }
        const allTimeOffs = await api.entities.TimeOff.list();
        for (const t of allTimeOffs.filter((t) => {
          if (t.type !== "regular_off") return false;
          const d = new Date((t.date || t.start_date) + "T00:00:00");
          return d >= wStart && d < wEnd;
        })) {
          await api.entities.TimeOff.delete(t.id);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
      break;
    }

    case "COPY_PREV_WEEK": {
      if (direction === "backward") {
        // Delete what was copied in, then restore what was there originally
        const wStart = new Date(data.weekStart + "T00:00:00");
        const wEnd = new Date(data.weekEnd + "T00:00:00");
        const allShifts = await api.entities.Shift.list();
        for (const s of allShifts.filter((s) => { const d = new Date(s.date + "T00:00:00"); return d >= wStart && d < wEnd; })) {
          await api.entities.Shift.delete(s.id);
        }
        const allTimeOffs = await api.entities.TimeOff.list();
        for (const t of allTimeOffs.filter((t) => {
          if (t.type !== "regular_off") return false;
          const d = new Date((t.date || t.start_date) + "T00:00:00");
          return d >= wStart && d < wEnd;
        })) {
          await api.entities.TimeOff.delete(t.id);
        }
        if (data.originalShifts.length > 0) await api.entities.Shift.bulkCreate(data.originalShifts);
        if (data.originalTimeOffs.length > 0) await api.entities.TimeOff.bulkCreate(data.originalTimeOffs);
      } else {
        // Delete current week content, re-apply the copy
        const wStart = new Date(data.weekStart + "T00:00:00");
        const wEnd = new Date(data.weekEnd + "T00:00:00");
        const allShifts = await api.entities.Shift.list();
        for (const s of allShifts.filter((s) => { const d = new Date(s.date + "T00:00:00"); return d >= wStart && d < wEnd; })) {
          await api.entities.Shift.delete(s.id);
        }
        const allTimeOffs = await api.entities.TimeOff.list();
        for (const t of allTimeOffs.filter((t) => {
          if (t.type !== "regular_off") return false;
          const d = new Date((t.date || t.start_date) + "T00:00:00");
          return d >= wStart && d < wEnd;
        })) {
          await api.entities.TimeOff.delete(t.id);
        }
        if (data.shiftsToCreate.length > 0) await api.entities.Shift.bulkCreate(data.shiftsToCreate);
        if (data.timeOffsToCreate.length > 0) await api.entities.TimeOff.bulkCreate(data.timeOffsToCreate);
      }
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
      break;
    }

    case "COPY_PREV_DAY": {
      if (direction === "backward") {
        const allShifts = await api.entities.Shift.list();
        for (const s of allShifts.filter((s) => s.date === data.date)) {
          await api.entities.Shift.delete(s.id);
        }
        if (data.originalShifts.length > 0) await api.entities.Shift.bulkCreate(data.originalShifts);
      } else {
        const allShifts = await api.entities.Shift.list();
        for (const s of allShifts.filter((s) => s.date === data.date)) {
          await api.entities.Shift.delete(s.id);
        }
        if (data.shiftsToCreate.length > 0) await api.entities.Shift.bulkCreate(data.shiftsToCreate);
      }
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      break;
    }

    case "ADD_EMPLOYEE": {
      if (direction === "backward") {
        await api.entities.Employee.delete(data.id);
      } else {
        const created = await api.entities.Employee.create(data);
        entry.backward.id = created.id;
      }
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      break;
    }

    case "DELETE_EMPLOYEE": {
      if (direction === "backward") {
        // Recreate the employee, then re-attach all their shifts and time offs
        const { id: _skip, created_date: _cd, user_id: _uid, ...empPayload } = data.employee;
        const newEmp = await api.entities.Employee.create(empPayload);
        const newId = newEmp.id;
        if (data.shifts.length > 0) {
          await api.entities.Shift.bulkCreate(data.shifts.map((s) => ({ ...s, employee_id: newId })));
        }
        if (data.timeOffs.length > 0) {
          await api.entities.TimeOff.bulkCreate(data.timeOffs.map((t) => ({ ...t, employee_id: newId })));
        }
        // Update forward.id so a future redo knows which employee to cascade-delete
        entry.forward.id = newId;
        queryClient.invalidateQueries({ queryKey: ["employees"] });
        queryClient.invalidateQueries({ queryKey: ["shifts"] });
        queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
      } else {
        // Cascade delete: remove their shifts and time offs first, then the employee
        const allShifts = await api.entities.Shift.list();
        for (const s of allShifts.filter((s) => s.employee_id === data.id)) {
          await api.entities.Shift.delete(s.id);
        }
        const allTimeOffs = await api.entities.TimeOff.list();
        for (const t of allTimeOffs.filter((t) => t.employee_id === data.id)) {
          await api.entities.TimeOff.delete(t.id);
        }
        await api.entities.Employee.delete(data.id);
        queryClient.invalidateQueries({ queryKey: ["employees"] });
        queryClient.invalidateQueries({ queryKey: ["shifts"] });
        queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
      }
      break;
    }

    default:
      break;
  }
}

// Hook - call this once inside a component that lives inside both the Router
// and UndoHistoryProvider (e.g. AuthenticatedApp).
export function useUndoRedo({ showToast }) {
  const history = useUndoHistory();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const dashboardNav = useDashboardNav();

  // Keep a stable ref so the keydown handler always has the latest values
  // without needing to be re-registered on every render.
  const depsRef = useRef(null);
  depsRef.current = { history, queryClient, navigate, location, dashboardNav, showToast };

  useEffect(() => {
    const handler = async (e) => {
      // Never hijack shortcuts while the user is typing in a form field
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;

      e.preventDefault();

      const { history: h, queryClient: qc, navigate: nav, location: loc, dashboardNav: dnav, showToast: toast } = depsRef.current;

      if (isUndo) {
        if (!h.canUndo) return;
        const entry = h.undo();
        if (!entry) return;
        // Capture the forward ID before applyEntry mutates it (DELETE undo recreates
        // the row and writes a new UUID into entry.forward.id)
        const prevForwardId = ["DELETE_SHIFT", "DELETE_EVENT", "DELETE_TIME_OFF", "DELETE_EMPLOYEE"].includes(entry.type)
          ? entry.forward?.id
          : undefined;
        try {
          await applyEntry(entry, "backward", { queryClient: qc, dashboardNav: dnav, navigate: nav, location: loc });
          // If a new UUID was assigned, patch every other stack entry that still
          // holds the old UUID so future undo/redo operations use the correct ID.
          if (prevForwardId !== undefined && entry.forward?.id !== prevForwardId) {
            h.patchId(prevForwardId, entry.forward.id);
          }
          toast({ message: `Undid: ${entry.description}`, isRedo: false });
        } catch (err) {
          console.error("Undo failed:", err);
          // Roll the entry back so the stack stays consistent - future Ctrl+Z
          // won't skip over unrelated operations.
          h.rollbackUndo();
          toast({ message: "Undo failed", isRedo: false });
        }
      } else {
        if (!h.canRedo) return;
        const entry = h.redo();
        if (!entry) return;
        // Capture the backward ID before applyEntry mutates it (ADD redo recreates
        // the row and writes a new UUID into entry.backward.id)
        const prevBackwardId = ["ADD_SHIFT", "ADD_EVENT", "ADD_EMPLOYEE"].includes(entry.type)
          ? entry.backward?.id
          : undefined;
        try {
          await applyEntry(entry, "forward", { queryClient: qc, dashboardNav: dnav, navigate: nav, location: loc });
          // Patch stale IDs if redo re-created a row with a new UUID.
          if (prevBackwardId !== undefined && entry.backward?.id !== prevBackwardId) {
            h.patchId(prevBackwardId, entry.backward.id);
          }
          toast({ message: `Redid: ${entry.description}`, isRedo: true });
        } catch (err) {
          console.error("Redo failed:", err);
          h.rollbackRedo();
          toast({ message: "Redo failed", isRedo: true });
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // empty deps - handler reads everything through depsRef
}
