import React, { useRef, useState, useEffect, useCallback } from "react";
import { format, isSameDay, isToday } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, Copy, ChevronDown, Trash2, GripVertical, CalendarOff, Award } from "lucide-react";
import EmployeeTooltip from "@/components/employees/EmployeeTooltip";
import ExportScreenshot from "@/components/dashboard/ExportScreenshot";
import EventsRow from "@/components/events/EventsRow";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";

// ── helpers ────────────────────────────────────────────────────────────────
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(totalMins) {
  const normalized = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function snapToHalfHour(mins) { return Math.round(mins / 30) * 30; }
function fmtHourLabel(h) {
  const n = h % 24;
  if (n === 0) return "12A";
  if (n < 12) return `${n}A`;
  if (n === 12) return "12P";
  return `${n - 12}P`;
}
function fmtTimeFull(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}
function hasOverlap(shifts, employeeId, startMins, endMins, excludeShiftId = null) {
  return shifts
    .filter((s) => s.employee_id === employeeId && s.id !== excludeShiftId)
    .some((s) => {
      const sStart = timeToMinutes(s.start_time);
      const sEnd = timeToMinutes(s.end_time);
      return startMins < sEnd && endMins > sStart;
    });
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EDGE_HIT = 12;
const SIDEBAR_W = 160;

function getHourRange(day, storeSettings) {
  const dayKey = DAY_KEYS[day.getDay()];
  const open = storeSettings?.[`${dayKey}_open`];
  const close = storeSettings?.[`${dayKey}_close`];
  if (open && close) {
    const openHour = Math.floor(timeToMinutes(open) / 60);
    let closeHour = Math.ceil(timeToMinutes(close) / 60);
    if (closeHour <= openHour) closeHour += 24;
    return { startHour: openHour, endHour: closeHour };
  }
  return { startHour: 6, endHour: 22 };
}

// ── ShiftBar ───────────────────────────────────────────────────────────────
// Handles resize (left/right edges) locally.
// For "move" drags it notifies the parent via onStartMoveDrag so cross-row
// moves can be tracked at the DayView level.
function ShiftBar({ shift, emp, startHour, totalMinutes, timelineWidth, onSaveShift, onEditShift, onStartMoveDrag }) {
  const [liveStart, setLiveStart] = useState(null);
  const [liveEnd, setLiveEnd] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const dragRef = useRef(null);
  const clickBlockedRef = useRef(false);

  let startMinsAbs = timeToMinutes(shift.start_time);
  let endMinsAbs = timeToMinutes(shift.end_time);
  if (endMinsAbs <= startMinsAbs) endMinsAbs += 24 * 60;

  const displayStart = liveStart !== null ? liveStart : startMinsAbs;
  const displayEnd = liveEnd !== null ? liveEnd : endMinsAbs;

  const startMinsRel = displayStart - startHour * 60;
  const durMins = displayEnd - displayStart;
  const leftPct = (startMinsRel / totalMinutes) * 100;
  const widthPct = (durMins / totalMinutes) * 100;
  const color = shift.color || "#FF8C00";
  const minsPerPx = totalMinutes / timelineWidth;

  useEffect(() => { setLiveStart(null); setLiveEnd(null); }, [shift.start_time, shift.end_time]);

  const startResizeDrag = useCallback((e, type) => {
    e.stopPropagation();
    e.preventDefault();
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    setDragging(true);

    const dragData = { type, startX: e.clientX, origStart: startMinsAbs, origEnd: endMinsAbs, moved: false, finalStart: null, finalEnd: null };
    dragRef.current = dragData;

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      if (Math.abs(dx) > 3) d.moved = true;
      const deltaMins = dx * minsPerPx;
      let ns = d.origStart, ne = d.origEnd;
      if (d.type === "left") {
        ns = snapToHalfHour(d.origStart + deltaMins);
        ns = Math.max(startHour * 60, Math.min(d.origEnd - 30, ns));
        ne = d.origEnd;
      } else {
        ne = snapToHalfHour(d.origEnd + deltaMins);
        ne = Math.max(d.origStart + 30, Math.min(startHour * 60 + totalMinutes, ne));
        ns = d.origStart;
      }
      d.finalStart = ns; d.finalEnd = ne;
      setLiveStart(ns); setLiveEnd(ne);
    };

    const onUp = (ev) => {
      ev.stopPropagation();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
      const d = dragRef.current;
      dragRef.current = null;
      if (d && d.moved && d.finalStart !== null) {
        clickBlockedRef.current = true;
        setTimeout(() => { clickBlockedRef.current = false; }, 400);
        onSaveShift(shift.id, minutesToTime(d.finalStart), minutesToTime(d.finalEnd % (24 * 60)), emp.id);
      } else {
        setLiveStart(null); setLiveEnd(null);
        if (d && !d.moved && !clickBlockedRef.current) onEditShift(shift);
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp, true);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, true);
  }, [startMinsAbs, endMinsAbs, minsPerPx, startHour, totalMinutes, shift, emp, onSaveShift, onEditShift]);

  const displayStartTime = minutesToTime(displayStart);
  const displayEndTime = minutesToTime(displayEnd % (24 * 60));
  const barCursor = dragging ? "ew-resize" : (hoveredEdge ? "ew-resize" : "grab");
  const edgeBase = { position: "absolute", top: 0, bottom: 0, width: EDGE_HIT, zIndex: 2 };

  return (
    <div
      className="absolute top-2 bottom-2 rounded-lg overflow-visible shadow-sm select-none"
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: color,
        cursor: barCursor,
        zIndex: liveStart !== null ? 10 : 1,
        opacity: liveStart !== null ? 0.9 : 1,
      }}
      onMouseDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x <= EDGE_HIT) {
          startResizeDrag(e, "left");
        } else if (x >= rect.width - EDGE_HIT) {
          startResizeDrag(e, "right");
        } else {
          // Pass how many minutes into the shift the user grabbed
          // so the move/copy drag tracks correctly from that point
          const grabFraction = x / rect.width;
          const grabOffsetMins = grabFraction * durMins;
          onStartMoveDrag(e, shift, emp, grabOffsetMins);
        }
      }}
      onMouseMove={(e) => {
        if (dragging) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x <= EDGE_HIT) setHoveredEdge("left");
        else if (x >= rect.width - EDGE_HIT) setHoveredEdge("right");
        else setHoveredEdge(null);
      }}
      onMouseLeave={() => { if (!dragging) setHoveredEdge(null); }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ ...edgeBase, left: 0, borderRadius: "6px 0 0 6px", cursor: "ew-resize",
        background: hoveredEdge === "left" ? "rgba(255,255,255,0.3)" : "transparent",
        borderLeft: hoveredEdge === "left" ? "3px solid rgba(255,255,255,0.8)" : "none",
      }} />
      <div className="absolute inset-0 flex items-center justify-between px-2.5 overflow-hidden pointer-events-none">
        <span className="text-white text-xs font-semibold truncate">
          {fmtTimeFull(displayStartTime)} to {fmtTimeFull(displayEndTime)}
          <span className="opacity-75 font-normal ml-1.5">{emp.title}</span>
        </span>
        <span className="text-white text-xs font-bold opacity-90 ml-2 shrink-0">
          {(durMins / 60) % 1 === 0 ? `${durMins / 60}h` : `${(durMins / 60).toFixed(1)}h`}
        </span>
      </div>
      <div style={{ ...edgeBase, right: 0, left: "auto", borderRadius: "0 6px 6px 0", cursor: "ew-resize",
        background: hoveredEdge === "right" ? "rgba(255,255,255,0.3)" : "transparent",
        borderRight: hoveredEdge === "right" ? "3px solid rgba(255,255,255,0.8)" : "none",
      }} />
    </div>
  );
}

// ── Ghost overlay — direct DOM manipulation for zero-lag dragging ──
// We use a ref to the div and update its style directly, bypassing React state.
function GhostShift({ ghostRef }) {
  return (
    <div
      ref={ghostRef}
      className="fixed pointer-events-none rounded-lg shadow-xl flex items-center justify-between px-2.5 z-50"
      style={{ display: "none", opacity: 0.75 }}
    >
      <span className="ghost-label text-white text-xs font-semibold truncate" />
      <span className="ghost-copy-icon" style={{ display: "none" }}><Copy className="w-3 h-3 text-white opacity-80 ml-1 shrink-0" /></span>
      <span className="ghost-duration text-white text-xs font-bold opacity-90 ml-2 shrink-0" />
    </div>
  );
}

function updateGhostDOM(el, { ghostLeft, ghostTop, ghostWidth, rowHeight, color, isCopy, startTime, endTime, durationMins }) {
  if (!el) return;
  el.style.display = "flex";
  el.style.left = `${ghostLeft}px`;
  el.style.top = `${ghostTop + 4}px`;
  el.style.width = `${Math.max(ghostWidth, 80)}px`;
  el.style.height = `${rowHeight - 8}px`;
  el.style.backgroundColor = color;
  el.style.border = isCopy ? "2px dashed rgba(255,255,255,0.7)" : "2px solid rgba(255,255,255,0.4)";
  const label = el.querySelector(".ghost-label");
  if (label) label.textContent = `${fmtTimeFull(startTime)} – ${fmtTimeFull(endTime)}`;
  const copyIcon = el.querySelector(".ghost-copy-icon");
  if (copyIcon) copyIcon.style.display = isCopy ? "inline" : "none";
  const dur = el.querySelector(".ghost-duration");
  if (dur) dur.textContent = (durationMins / 60) % 1 === 0 ? `${durationMins / 60}h` : `${(durationMins / 60).toFixed(1)}h`;
}

function hideGhostDOM(el) {
  if (el) el.style.display = "none";
}

const TIME_OFF_COLORS = {
  regular_off: { bg: "rgba(219,234,254,0.75)", border: "2px solid #93c5fd", label: "Day Off", textColor: "#1d4ed8" },
  custom_time_off: { bg: "rgba(254,226,226,0.75)", border: "2px solid #fca5a5", label: "Time Off", textColor: "#dc2626" },
};

// ── DayView ────────────────────────────────────────────────────────────────
export default function DayView({ day, shifts, timeOffs = [], events = [], employees, storeSettings, onAddShift, onEditShift, onAddTimeOff, onEditTimeOff, onAddEvent, onEditEvent, onShiftDragSave, onShiftCopy, onPrevDay, onNextDay, onClose, isReorderMode, onReorder, onCopyPreviousDay, onClearDay }) {
  const navigate = useNavigate();
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const [confirmClearDay, setConfirmClearDay] = useState(false);
  const dayMenuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dayMenuRef.current && !dayMenuRef.current.contains(e.target)) {
        setDayMenuOpen(false);
        setConfirmClearDay(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const dayShifts = shifts.filter((s) => isSameDay(new Date(s.date + "T00:00:00"), day));
  const { startHour, endHour } = getHourRange(day, storeSettings);
  const totalMinutes = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const totalShiftCount = dayShifts.length;
  const totalHours = dayShifts.reduce((sum, s) => sum + Math.max(0, (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60), 0);

  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const ghostRef = useRef(null); // direct DOM ref for ghost — no setState lag
  const [hoveredEmpId, setHoveredEmpId] = useState(null); // which emp row is hovered during drag
  const [overlapError, setOverlapError] = useState(null); // brief error message
  const moveDragRef = useRef(null); // cross-row drag state
  const rowRectsRef = useRef({}); // empId -> DOMRect, refreshed each drag
  const dragJustEndedRef = useRef(false); // blocks spurious click after drag

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.offsetWidth));
    ro.observe(el);
    setContainerWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const timelineWidth = containerWidth ? containerWidth - SIDEBAR_W : hours.length * 56;
  const colWidth = Math.max(28, Math.floor(timelineWidth / hours.length));
  const minsPerPx = totalMinutes / (hours.length * colWidth);

  // Called by ShiftBar when a "move" mousedown happens
  const handleStartMoveDrag = useCallback((e, shift, origEmp, grabOffsetMins) => {
    e.stopPropagation();
    e.preventDefault();

    const isCopy = e.altKey;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    let startMinsAbs = timeToMinutes(shift.start_time);
    let endMinsAbs = timeToMinutes(shift.end_time);
    if (endMinsAbs <= startMinsAbs) endMinsAbs += 24 * 60;
    const dur = endMinsAbs - startMinsAbs;

    // Snapshot row rects for hit-testing
    const rects = {};
    employees.forEach((emp) => {
      const el = document.getElementById(`dayview-row-${emp.id}`);
      if (el) rects[emp.id] = el.getBoundingClientRect();
    });
    rowRectsRef.current = rects;

    // Get the actual rendered timeline bounds by finding the hour header cells
    // This is more reliable than computing from colWidth which may not match the DOM
    const firstHourEl = containerRef.current?.querySelector('[data-hour-col="0"]');
    const lastHourEl = containerRef.current?.querySelector(`[data-hour-col="${hours.length - 1}"]`);
    let timelineLeft = 0;
    let timelinePixelWidth = hours.length * colWidth;
    if (firstHourEl && lastHourEl) {
      const firstRect = firstHourEl.getBoundingClientRect();
      const lastRect = lastHourEl.getBoundingClientRect();
      timelineLeft = firstRect.left;
      timelinePixelWidth = lastRect.right - firstRect.left;
    } else if (containerRef.current) {
      timelineLeft = containerRef.current.getBoundingClientRect().left + SIDEBAR_W;
    }

    let currentHoveredEmpId = origEmp.id;
    let cancelled = false;

    // Find the original shift bar's row rect to know where to anchor the ghost
    const origRowEl = document.getElementById(`dayview-row-${origEmp.id}`);
    const origRowRect = origRowEl ? origRowEl.getBoundingClientRect() : null;

    // The ghost width in pixels
    const ghostWidthPx = (dur / totalMinutes) * timelinePixelWidth;
    // The ghost left = timeline left + offset of shift start from timeline start
    const origShiftLeftPx = timelineLeft + ((startMinsAbs - startHour * 60) / totalMinutes) * timelinePixelWidth;

    moveDragRef.current = {
      isCopy,
      shift,
      origEmp,
      origStart: startMinsAbs,
      origEnd: endMinsAbs,
      dur,
      grabOffsetMins: grabOffsetMins ?? 0,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      finalStart: startMinsAbs,
      finalEnd: endMinsAbs,
      finalTargetEmpId: origEmp.id,
      timelineLeft,
      timelinePixelWidth,
      ghostWidthPx,
      origShiftLeftPx,
      origRowTop: origRowRect ? origRowRect.top : e.clientY - 26,
      origRowHeight: origRowRect ? origRowRect.height : 52,
    };

    const initialColor = origEmp.color || "#FF8C00";
    updateGhostDOM(ghostRef.current, {
      ghostLeft: origShiftLeftPx,
      ghostTop: origRowRect ? origRowRect.top : e.clientY - 26,
      ghostWidth: ghostWidthPx,
      rowHeight: origRowRect ? origRowRect.height : 52,
      color: initialColor,
      isCopy,
      startTime: shift.start_time,
      endTime: shift.end_time,
      durationMins: dur,
    });
    setHoveredEmpId(origEmp.id);

    const cancel = () => {
      cancelled = true;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      hideGhostDOM(ghostRef.current);
      setHoveredEmpId(null);
      moveDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("keydown", onKey);
    };

    const onMove = (ev) => {
      if (cancelled) return;
      const d = moveDragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;

      // Delta-based: compute how many minutes the mouse moved since mousedown,
      // then add to the original shift start. This is correct because the ghost
      // stays at its original position — we're just tracking how much the user moved.
      const deltaMins = (dx / d.timelinePixelWidth) * totalMinutes;
      let ns = snapToHalfHour(d.origStart + deltaMins);
      ns = Math.max(startHour * 60, Math.min(startHour * 60 + totalMinutes - d.dur, ns));
      const ne = ns + d.dur;
      d.finalStart = ns;
      d.finalEnd = ne;

      // Hit-test which employee row we're over
      let targetEmpId = null;
      for (const [empId, rect] of Object.entries(rowRectsRef.current)) {
        if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          targetEmpId = empId;
          break;
        }
      }
      if (!targetEmpId) targetEmpId = d.finalTargetEmpId;
      d.finalTargetEmpId = targetEmpId;

      if (targetEmpId !== currentHoveredEmpId) {
        currentHoveredEmpId = targetEmpId;
        setHoveredEmpId(targetEmpId);
      }

      const targetEmp = employees.find((emp) => emp.id === targetEmpId);
      const ghostColor = targetEmp?.color || "#FF8C00";

      // Ghost left = original shift left + same pixel delta as the mouse
      const newGhostLeft = d.origShiftLeftPx + dx;
      // Ghost top = row top of target employee row
      const targetRowEl = document.getElementById(`dayview-row-${targetEmpId}`);
      const targetRowRect = targetRowEl ? targetRowEl.getBoundingClientRect() : null;
      const newGhostTop = targetRowRect ? targetRowRect.top : d.origRowTop;
      const newRowHeight = targetRowRect ? targetRowRect.height : d.origRowHeight;

      // Direct DOM update — no React setState, no re-render lag
      updateGhostDOM(ghostRef.current, {
        ghostLeft: newGhostLeft,
        ghostTop: newGhostTop,
        ghostWidth: d.ghostWidthPx,
        rowHeight: newRowHeight,
        color: ghostColor,
        isCopy: d.isCopy,
        startTime: minutesToTime(ns),
        endTime: minutesToTime(ne % (24 * 60)),
        durationMins: d.dur,
      });
    };

    const onKey = (ev) => {
      if (ev.key === "Escape") cancel();
    };

    const onUp = (ev) => {
      if (cancelled) return;
      ev.stopPropagation();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      hideGhostDOM(ghostRef.current);
      setHoveredEmpId(null);

      const d = moveDragRef.current;
      moveDragRef.current = null;

      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("keydown", onKey);

      if (d && d.moved) {
        dragJustEndedRef.current = true;
        setTimeout(() => { dragJustEndedRef.current = false; }, 300);
        const targetEmpId = d.finalTargetEmpId;
        const targetEmp = employees.find((emp) => emp.id === targetEmpId);
        if (!targetEmp) return;

        const newStart = minutesToTime(d.finalStart);
        const newEnd = minutesToTime(d.finalEnd % (24 * 60));

        // Overlap check
        const excludeId = d.isCopy ? null : d.shift.id;
        if (hasOverlap(dayShifts, targetEmpId, d.finalStart, d.finalEnd, excludeId)) {
          setOverlapError(`Overlap! ${targetEmp.name} already has a shift at that time.`);
          setTimeout(() => setOverlapError(null), 3000);
          return;
        }

        if (d.isCopy) {
          onShiftCopy(d.shift, targetEmp, newStart, newEnd);
        } else {
          onShiftDragSave(d.shift.id, newStart, newEnd, targetEmpId);
        }
      } else if (d && !d.moved) {
        // Only open edit if the drag was truly a clean click (no movement at all)
        // Use a small timeout so any stray click events from mouseup don't also fire
        setTimeout(() => onEditShift(d.shift), 10);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("keydown", onKey);
  }, [employees, dayShifts, minsPerPx, startHour, totalMinutes, hours.length, colWidth, onShiftDragSave, onShiftCopy, onEditShift]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" ref={containerRef}>
      {/* Ghost overlay — rendered once, updated via direct DOM for zero lag */}
      <GhostShift ghostRef={ghostRef} />

      {/* Overlap error toast */}
      {overlapError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
          {overlapError}
        </div>
      )}

      {/* Top nav bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-orange-50/40">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors border border-orange-200">
            Week view
          </button>
          <div className="w-px h-4 bg-gray-200" />
          {/* Fixed-width nav so the right arrow never shifts */}
          <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
            <button onClick={onPrevDay} className="p-1 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <div style={{ width: 148, flexShrink: 0 }} className="text-center">
              <div className="text-lg font-bold text-gray-900 truncate">{format(day, "EEEE")}</div>
              <div className={`text-sm font-medium truncate ${isToday(day) ? "text-orange-500" : "text-gray-500"}`}>
                {format(day, "MMMM d, yyyy")}{isToday(day) && <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">Today</span>}
              </div>
            </div>
            <button onClick={onNextDay} className="p-1 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Day-level copy/clear dropdown — placed right after day title */}
          <div className="relative" ref={dayMenuRef}>
           <button
             onClick={() => setDayMenuOpen((v) => !v)}
             className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300 transition-all text-sm font-medium"
           >
             <Copy className="w-3.5 h-3.5" />
             <ChevronDown className="w-3 h-3" />
           </button>

           {dayMenuOpen && (
             <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
               <ExportScreenshot day={day} containerRef={containerRef} onExport={() => setDayMenuOpen(false)} />
               <div className="border-t border-gray-100 my-1" />
               <button
                 onClick={() => { setDayMenuOpen(false); onCopyPreviousDay && onCopyPreviousDay(); }}
                 className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left"
               >
                 <Copy className="w-4 h-4 text-gray-400" />
                 Copy previous day's shifts
               </button>
               <div className="border-t border-gray-100 mt-1 pt-1">
                 {confirmClearDay ? (
                   <div className="px-3.5 py-2.5">
                     <p className="text-xs text-red-600 font-semibold mb-2">Clear all shifts for this day?</p>
                     <div className="flex gap-2">
                       <button
                         onClick={() => { setConfirmClearDay(false); setDayMenuOpen(false); onClearDay && onClearDay(); }}
                         className="flex-1 px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-md transition-colors"
                       >
                         Yes, clear
                       </button>
                       <button
                         onClick={() => setConfirmClearDay(false)}
                         className="flex-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors"
                       >
                         Cancel
                       </button>
                     </div>
                   </div>
                 ) : (
                   <button
                     onClick={() => setConfirmClearDay(true)}
                     className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors text-left"
                   >
                     <Trash2 className="w-4 h-4" />
                     Clear all shifts for this day
                   </button>
                 )}
               </div>
             </div>
           )}
          </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
          <span><strong className="text-gray-800">{totalShiftCount}</strong> shift{totalShiftCount !== 1 ? "s" : ""}</span>
          <span><strong className="text-gray-800">{totalHours.toFixed(1)}h</strong> total</span>
          <button
            onClick={() => onAddTimeOff && onAddTimeOff(day, null)}
            className="text-xs text-gray-400 hover:text-orange-500 font-medium transition-colors border border-gray-200 hover:border-orange-300 px-2.5 py-1 rounded-md hidden sm:block"
          >
            + Time Off
          </button>
          <span className="text-xs text-gray-400 hidden sm:block">Alt+drag to copy</span>
        </div>
      </div>

      {/* Events row */}
      <EventsRow 
        day={day} 
        weekStart={day}
        events={events} 
        onAddEvent={onAddEvent}
        onEditEvent={onEditEvent}
        isWeekView={false}
      />

      {/* Timeline */}
      <div className="overflow-x-hidden">
        <div style={{ width: "100%" }}>
          {/* Hour header */}
          <div className="flex border-b border-gray-100 sticky top-0 bg-white z-10">
            <div className="shrink-0 border-r border-gray-100 px-3 py-2 flex items-end" style={{ width: SIDEBAR_W }}>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Employees</span>
            </div>
            {hours.map((h) => (
              <div key={h} className="border-r border-gray-50 last:border-r-0 py-2 text-center flex-shrink-0" style={{ width: colWidth }}>
                <span className="text-xs font-semibold text-gray-400">{fmtHourLabel(h)}</span>
              </div>
            ))}
          </div>

          {/* Employee rows */}
          {employees.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-300 text-sm">No employees yet</div>
          ) : isReorderMode ? (
            <DragDropContext onDragEnd={(result) => {
              if (!result.destination || result.source.index === result.destination.index) return;
              const reordered = Array.from(employees);
              const [removed] = reordered.splice(result.source.index, 1);
              reordered.splice(result.destination.index, 0, removed);
              onReorder(reordered.map((e) => e.id));
            }}>
              <Droppable droppableId="dayview-employee-rows">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {employees.map((emp, idx) => {
                      const empShifts = dayShifts.filter((s) => s.employee_id === emp.id);
                      const empHours = empShifts.reduce((sum, s) => sum + Math.max(0, (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60), 0);
                      const empTimeOffs = timeOffs.filter((t) => t.employee_id === emp.id && isSameDay(new Date(t.date + "T00:00:00"), day));
                      return (
                        <Draggable key={emp.id} draggableId={emp.id} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`flex border-b border-gray-200 last:border-b-0 transition-colors ${snapshot.isDragging ? "bg-orange-50/80 shadow-lg border border-orange-200" : "hover:bg-gray-50/20"}`}
                              style={{ height: 52, ...provided.draggableProps.style }}
                            >
                              <div className="shrink-0 border-r border-gray-100 px-3 flex items-center gap-2.5 relative" style={{ width: SIDEBAR_W }}>
                                <GripVertical className="w-4 h-4 text-gray-300 hover:text-gray-500 shrink-0 -ml-1 cursor-grab" />
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: emp.color || "#FF8C00" }}>
                                  {emp.name.charAt(0)}
                                </div>
                                <div className="overflow-hidden min-w-0" style={{ width: SIDEBAR_W - 80 }}>
                                  <div className="text-sm font-semibold text-gray-800 truncate">{emp.name}</div>
                                  <div className="text-xs text-gray-400 truncate">{emp.title?.length > 9 ? emp.title.slice(0, 9) + "…" : emp.title}</div>
                                </div>
                              </div>
                              <div className="flex-1 flex items-center px-3">
                                <div className="flex gap-1 flex-wrap">
                                  {empShifts.map((s) => (
                                    <span key={s.id} className="text-xs px-2 py-1 rounded-md text-white font-semibold" style={{ backgroundColor: s.color || "#FF8C00" }}>
                                      {fmtTimeFull(s.start_time)}–{fmtTimeFull(s.end_time)}
                                    </span>
                                  ))}
                                  {empShifts.length === 0 && empTimeOffs.length === 0 && (
                                    <span className="text-xs text-gray-300 italic">No shifts</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            employees.map((emp) => {
              const empShifts = dayShifts.filter((s) => s.employee_id === emp.id);
              const empHours = empShifts.reduce((sum, s) => sum + Math.max(0, (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60), 0);
              const isHoverTarget = hoveredEmpId === emp.id && moveDragRef.current && moveDragRef.current.finalTargetEmpId !== moveDragRef.current.origEmp.id;
              const empTimeOffs = timeOffs.filter((t) => t.employee_id === emp.id && isSameDay(new Date(t.date + "T00:00:00"), day));

              return (
                <div
                  key={emp.id}
                  id={`dayview-row-${emp.id}`}
                  className={`flex border-b border-gray-200 last:border-b-0 transition-colors ${isHoverTarget ? "bg-orange-50/60" : "hover:bg-gray-50/20"}`}
                  style={{ height: 52 }}
                >
                  {/* Sidebar */}
                  <div className="shrink-0 border-r border-gray-100 px-3 flex items-center gap-2.5 group/sidebar relative" style={{ width: SIDEBAR_W }}>
                    <div className="relative">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: emp.color || "#FF8C00" }}
                      >
                        {emp.name.charAt(0)}
                      </div>
                      {emp.food_safety_certified && (
                        <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 border border-white shadow-sm">
                          <Award className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <EmployeeTooltip emp={emp}>
                      <div className="overflow-hidden min-w-0" style={{ width: SIDEBAR_W - 68 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(createPageUrl(`Employees?edit=${emp.id}`)); }}
                          className="text-sm font-semibold text-gray-800 truncate hover:text-orange-600 transition-colors block cursor-pointer text-left w-full"
                        >{emp.name}</button>
                        <div className="text-xs text-gray-400 truncate">
                          {emp.title?.length > 9 ? emp.title.slice(0, 9) + "…" : emp.title}{empHours > 0 ? ` · ${empHours % 1 === 0 ? empHours : empHours.toFixed(1)}h` : ""}
                        </div>
                      </div>
                    </EmployeeTooltip>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddTimeOff && onAddTimeOff(day, emp); }}
                      className="transition-opacity text-blue-300 hover:text-blue-500 absolute"
                      style={{ right: 6, top: "50%", transform: "translateY(-50%)" }}
                      title="Add time off"
                    >
                      <CalendarOff className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Timeline area */}
                  <div
                    className="relative flex-1 cursor-pointer group"
                    style={{ width: hours.length * colWidth }}
                    onClick={(e) => {
                      if (moveDragRef.current || dragJustEndedRef.current) return;
                      // Compute which hour the click landed on
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const clickMins = (x / rect.width) * totalMinutes;
                      const snappedMins = Math.round((startHour * 60 + clickMins) / 60) * 60;
                      const clampedMins = Math.max(startHour * 60, Math.min(startHour * 60 + totalMinutes - 60, snappedMins));
                      const h = Math.floor(clampedMins / 60);
                      const defaultStart = `${String(h).padStart(2, "0")}:00`;
                      onAddShift(day, emp, defaultStart);
                    }}
                  >
                    {hours.map((h, i) => (
                      <div key={h} data-hour-col={i} className="absolute top-0 bottom-0 border-r border-gray-50" style={{ left: i * colWidth, width: colWidth }} />
                    ))}

                    {/* Time Off overlays */}
                    {empTimeOffs.map((to) => {
                      const cfg = TIME_OFF_COLORS[to.type] || TIME_OFF_COLORS.regular_off;
                      const bStart = timeToMinutes(to.start_time || "00:00");
                      let bEnd = timeToMinutes(to.end_time || "23:59");
                      if (bEnd <= bStart) bEnd += 24 * 60;
                      const rangeStart = startHour * 60;
                      const rangeEnd = startHour * 60 + totalMinutes;
                      const cs = Math.max(bStart, rangeStart);
                      const ce = Math.min(bEnd, rangeEnd);
                      if (cs >= ce) return null;
                      const lp = ((cs - rangeStart) / totalMinutes) * 100;
                      const wp = ((ce - cs) / totalMinutes) * 100;
                      return (
                        <div
                          key={to.id}
                          className="absolute top-1 bottom-1 rounded-md flex items-center px-2 cursor-pointer z-[2]"
                          style={{ left: `${lp}%`, width: `${wp}%`, backgroundColor: cfg.bg, border: cfg.border }}
                          onClick={(e) => { e.stopPropagation(); onEditTimeOff && onEditTimeOff(to); }}
                          title={to.reason ? `${cfg.label}: ${to.reason}` : cfg.label}
                        >
                          <span className="text-xs font-semibold truncate" style={{ color: cfg.textColor }}>
                            {cfg.label}{to.reason ? ` · ${to.reason}` : ""}
                          </span>
                        </div>
                      );
                    })}

                    {/* Unavailable overlays */}
                    {(emp.unavailable_hours || [])
                      .filter((block) => block.day === DAY_NAMES[day.getDay()])
                      .map((block, i) => {
                        const bStart = timeToMinutes(block.start_time);
                        let bEnd = timeToMinutes(block.end_time);
                        if (bEnd <= bStart) bEnd += 24 * 60;
                        const rangeStart = startHour * 60;
                        const rangeEnd = startHour * 60 + totalMinutes;
                        const clampedStart = Math.max(bStart, rangeStart);
                        const clampedEnd = Math.min(bEnd, rangeEnd);
                        if (clampedStart >= clampedEnd) return null;
                        const leftPct = ((clampedStart - rangeStart) / totalMinutes) * 100;
                        const widthPct = ((clampedEnd - clampedStart) / totalMinutes) * 100;
                        return (
                          <div key={i} className="absolute top-0 bottom-0 pointer-events-none" style={{
                            left: `${leftPct}%`, width: `${widthPct}%`,
                            backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(0,0,0,0.06) 4px, rgba(0,0,0,0.06) 8px)",
                            backgroundColor: "rgba(0,0,0,0.035)", zIndex: 0,
                          }} />
                        );
                      })}

                    {/* Shift bars */}
                    {empShifts.map((shift) => (
                      <ShiftBar
                        key={shift.id}
                        shift={shift}
                        emp={emp}
                        startHour={startHour}
                        totalMinutes={totalMinutes}
                        timelineWidth={hours.length * colWidth}
                        onSaveShift={onShiftDragSave}
                        onEditShift={onEditShift}
                        onStartMoveDrag={handleStartMoveDrag}
                      />
                    ))}

                    {empShifts.length === 0 && (
                      <div className="absolute inset-2 opacity-0 group-hover:opacity-100 transition-opacity border-2 border-dashed border-orange-200 rounded-lg flex items-center justify-center gap-1 text-orange-400 text-xs font-medium">
                        <Plus className="w-3 h-3" /> Add shift
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}