import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Trash2, AlertTriangle, CheckCircle, XCircle, CalendarOff } from "lucide-react";
import {
  timeToMinutes, minutesToTime, shiftHours, weeklyHours, getStoreHoursFor, checkStoreHours,
  findShiftConflict, findUnavailability, findTimeOffConflicts, dayNameOf,
} from "@/lib/shiftRules";

const MINUTES = ["00", "15", "30", "45"];

// Convert "HH:mm" 24h to { h12, minute, ampm }
function parseTo12h(value) {
  const [h24, min] = value.split(":").map(Number);
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = MINUTES.includes(String(min).padStart(2, "0")) ? String(min).padStart(2, "0") : "00";
  return { h12, minute, ampm };
}

// Convert 12h parts back to "HH:mm"
function to24h(h12, minute, ampm) {
  let h = parseInt(h12, 10);
  if (ampm === "AM" && h === 12) h = 0;
  if (ampm === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

function fmtDisplay(value) {
  const { h12, minute, ampm } = parseTo12h(value);
  return `${h12}:${minute} ${ampm}`;
}

function HoursStatus({ employee, weeklyHours }) {
  if (!employee) return null;
  const min = employee.min_hours || 0;
  const max = employee.max_hours || null;

  if (max && weeklyHours > max) {
    const over = (weeklyHours - max).toFixed(1);
    return (
      <span className="flex items-center gap-1 text-red-500 font-semibold text-xs">
        <XCircle className="w-3 h-3" /> {over}h over max
      </span>
    );
  }
  if (max && weeklyHours >= max) {
    return (
      <span className="flex items-center gap-1 text-red-400 font-semibold text-xs">
        <XCircle className="w-3 h-3" /> Fully booked
      </span>
    );
  }
  if (max && max - weeklyHours <= 4) {
    const left = (max - weeklyHours).toFixed(1);
    return (
      <span className="flex items-center gap-1 text-amber-500 font-semibold text-xs">
        <AlertTriangle className="w-3 h-3" /> {left}h to max
      </span>
    );
  }
  if (min && weeklyHours < min) {
    const needed = (min - weeklyHours).toFixed(1);
    return (
      <span className="flex items-center gap-1 text-blue-500 text-xs">
        <CheckCircle className="w-3 h-3" /> {needed}h to min
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-green-500 text-xs">
      <CheckCircle className="w-3 h-3" /> {weeklyHours.toFixed(1)}h scheduled
    </span>
  );
}

function TimePicker({ value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);
  const { h12, minute, ampm } = parseTo12h(value);
  const ref = useRef(null);
  const hourListRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setShowPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll selected hour into view when picker opens
  useEffect(() => {
    if (showPicker && hourListRef.current) {
      const selected = hourListRef.current.querySelector("[data-selected='true']");
      if (selected) selected.scrollIntoView({ block: "center" });
    }
  }, [showPicker]);

  const selectHour = (h) => onChange(to24h(h, minute, ampm));
  const selectMinute = (m) => { onChange(to24h(h12, m, ampm)); setShowPicker(false); };
  const selectAmPm = (ap) => onChange(to24h(h12, minute, ap));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setShowPicker((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border border-input rounded-md bg-white text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className="font-medium text-gray-800">{fmtDisplay(value)}</span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {showPicker && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-xl flex overflow-hidden" style={{ width: 200 }}>
          {/* Hour column */}
          <div ref={hourListRef} className="flex-1 overflow-y-auto max-h-52 border-r border-gray-100">
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 sticky top-0">Hour</div>
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
              <button
                key={h}
                data-selected={h === h12}
                onMouseDown={(e) => { e.preventDefault(); selectHour(h); }}
                className={"w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 hover:text-orange-600 transition-colors " +
                  (h === h12 ? "bg-orange-100 text-orange-600 font-semibold" : "text-gray-700")}
              >
                {h}
              </button>
            ))}
          </div>
          {/* Minute column */}
          <div className="overflow-y-auto max-h-52 border-r border-gray-100" style={{ width: 56 }}>
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 sticky top-0">Min</div>
            {MINUTES.map((m) => (
              <button
                key={m}
                onMouseDown={(e) => { e.preventDefault(); selectMinute(m); }}
                className={"w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 hover:text-orange-600 transition-colors " +
                  (m === minute ? "bg-orange-100 text-orange-600 font-semibold" : "text-gray-700")}
              >
                :{m}
              </button>
            ))}
          </div>
          {/* AM/PM column */}
          <div style={{ width: 48 }}>
            <div className="px-1 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 sticky top-0">  </div>
            {["AM", "PM"].map((ap) => (
              <button
                key={ap}
                onMouseDown={(e) => { e.preventDefault(); selectAmPm(ap); setShowPicker(false); }}
                className={"w-full text-center px-1 py-2 text-sm font-semibold transition-colors " +
                  (ap === ampm ? "bg-orange-100 text-orange-600" : "text-gray-500 hover:bg-orange-50 hover:text-orange-600")}
              >
                {ap}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AddShiftModal({ open, onClose, date, employees, shifts, timeOffs, storeSettings, onSave, editShift, onDelete, preselectedEmployeeId, defaultStartTime }) {
  const isEditing = !!editShift;

  const [employeeId, setEmployeeId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [tentative, setTentative] = useState(false); // backup/tentative shift - not counted in hours
  const [pendingPast, setPendingPast] = useState(null); // null | "save" | "delete" - past-date confirm

  // Compute smart default times based on store open hours (or a given start time)
  function getDefaultTimes(dateObj, overrideStart = null) {
    const DAY_KEYS_LOCAL = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    let startMins = null;
    let closeMins = null;

    if (storeSettings && dateObj) {
      const dayKey = DAY_KEYS_LOCAL[dateObj.getDay()];
      const storeOpen = storeSettings[`${dayKey}_open`];
      const storeClose = storeSettings[`${dayKey}_close`];
      if (storeOpen) {
        const openMins = timeToMinutes(storeOpen);
        startMins = overrideStart ? timeToMinutes(overrideStart) : openMins;
        closeMins = storeClose ? timeToMinutes(storeClose) : null;
        if (closeMins !== null && closeMins <= openMins) closeMins += 24 * 60;
      }
    }

    if (startMins === null) {
      startMins = overrideStart ? timeToMinutes(overrideStart) : 9 * 60;
    }

    // End = start + 4h, capped at store close
    let endMins = startMins + 4 * 60;
    if (closeMins !== null) endMins = Math.min(endMins, closeMins);

    return {
      start: minutesToTime(startMins % (24 * 60)),
      end: minutesToTime(endMins % (24 * 60)),
    };
  }

  useEffect(() => {
    setPendingPast(null);
    setTentative(editShift ? !!editShift.tentative : false);
    if (editShift) {
      setEmployeeId(editShift.employee_id);
      setStartTime(editShift.start_time);
      setEndTime(editShift.end_time);
    } else {
      setEmployeeId(preselectedEmployeeId || "");
      const defaults = getDefaultTimes(date, defaultStartTime);
      setStartTime(defaults.start);
      setEndTime(defaults.end);
    }
  }, [editShift, open, preselectedEmployeeId, defaultStartTime]);

  // The rules below come from src/lib/shiftRules.js, which the API (/api/v1) uses too, so the
  // website and Muse always agree on what is allowed.
  const weekDateStr = editShift ? editShift.date : format(date || new Date(), "yyyy-MM-dd");
  const selectedEmp = employees.find((e) => e.id === employeeId);

  // Compute weekly hours excluding current shift if editing
  const shiftsForCalc = isEditing ? (shifts || []).filter((s) => s.id !== editShift.id) : (shifts || []);
  const existingHours = selectedEmp ? weeklyHours(selectedEmp.id, shiftsForCalc, weekDateStr) : 0;
  const thisShiftHours = shiftHours(startTime, endTime);
  const projectedHours = existingHours + (tentative ? 0 : thisShiftHours);

  const displayDate = editShift ? new Date(editShift.date + "T00:00:00") : date;

  // Past-date guard: warn before changing anything dated before today (local).
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const targetDateStr = editShift ? editShift.date : (date ? format(date, "yyyy-MM-dd") : null);
  const isPastDate = targetDateStr ? targetDateStr < todayStr : false;

  const shiftDate = displayDate;
  const shiftDateStr = shiftDate ? format(shiftDate, "yyyy-MM-dd") : null;
  const storeHours = getStoreHoursFor(storeSettings, shiftDateStr);

  // Check if shift overlaps with employee's unavailable hours
  let unavailableWarning = null;
  if (selectedEmp && shiftDateStr) {
    const dayName = dayNameOf(shiftDateStr);
    const conflict = findUnavailability(selectedEmp, shiftDateStr, startTime, endTime);

    if (conflict) {
      const fmt = (t) => {
        const [h, m] = t.split(":").map(Number);
        const ampm = h >= 12 ? "PM" : "AM";
        return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
      };
      unavailableWarning = `${selectedEmp.name} is marked unavailable ${fmt(conflict.start_time)} - ${fmt(conflict.end_time)} on ${dayName}.`;
    }
  }

  // Check for overlapping shifts on the same day for the same employee
  let shiftConflictWarning = null;
  if (selectedEmp && shiftDateStr) {
    const conflictingShift = findShiftConflict(selectedEmp.id, shiftDateStr, startTime, endTime, shiftsForCalc);

    if (conflictingShift) {
      shiftConflictWarning = `Conflicts with existing shift ${fmtDisplay(conflictingShift.start_time)} - ${fmtDisplay(conflictingShift.end_time)}.`;
    }
  }

  // Block shifts outside store open/close hours (overnight aware; see shiftRules.checkStoreHours)
  let closedWarning = null;
  if (checkStoreHours(storeHours, startTime, endTime)) {
    const fmt = (t) => {
      const [h, m] = t.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
    };
    closedWarning = `Shift must be within store hours (${fmt(storeHours.open)} - ${fmt(storeHours.close)}).`;
  }

  // Warn (do not block) when the employee has time off that day
  let timeOffWarning = null;
  if (selectedEmp && shiftDateStr) {
    const overlapping = findTimeOffConflicts(selectedEmp.id, shiftDateStr, startTime, endTime, timeOffs);
    if (overlapping.length > 0) {
      const t = overlapping[0];
      const when = t.full_day !== false ? "all day" : `${fmtDisplay(t.start_time)} - ${fmtDisplay(t.end_time)}`;
      timeOffWarning = `${selectedEmp.name} has time off ${when} on this day${t.reason ? ` (${t.reason})` : ""}.`;
    }
  }

  const handleSave = () => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    onSave({
      employee_id: emp.id,
      employee_name: emp.name,
      date: editShift ? editShift.date : format(date, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      color: emp.color || "#FF8C00",
      tentative,
    }, editShift ? editShift.id : null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Shift" : "Add Shift"}{displayDate ? " - " + format(displayDate, "EEE, MMM d") : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {employees.map((emp) => {
                  const wh = weeklyHours(emp.id, shiftsForCalc, weekDateStr);
                  const min = emp.min_hours || 0;
                  const max = emp.max_hours || null;
                  let statusEl = null;
                  if (max && wh > max) {
                    statusEl = <span className="text-red-500 text-xs font-semibold">{(wh - max).toFixed(1)}h over max</span>;
                  } else if (max && wh >= max) {
                    statusEl = <span className="text-red-400 text-xs font-semibold">Fully booked</span>;
                  } else if (max && max - wh <= 4) {
                    statusEl = <span className="text-amber-500 text-xs font-semibold">{(max - wh).toFixed(1)}h to max</span>;
                  } else if (min && wh < min) {
                    statusEl = <span className="text-blue-500 text-xs">{(min - wh).toFixed(1)}h to min</span>;
                  } else {
                    statusEl = <span className="text-green-500 text-xs">{wh.toFixed(1)}h</span>;
                  }
                  return (
                    <SelectItem key={emp.id} value={emp.id}>
                      <div className="flex items-center justify-between gap-3 w-full">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: emp.color || "#FF8C00" }} />
                          <span className="font-medium">{emp.name}</span>
                        </div>
                        {statusEl}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Hours summary for selected employee */}
          {selectedEmp && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center justify-between text-sm">
              <span className="text-gray-500">This shift: <strong>{thisShiftHours.toFixed(1)}h</strong></span>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-xs">After adding:</span>
                <HoursStatus employee={selectedEmp} weeklyHours={projectedHours} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <TimePicker value={startTime} onChange={setStartTime} />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <TimePicker value={endTime} onChange={setEndTime} />
              {storeHours && (
                <button
                  type="button"
                  onClick={() => setEndTime(storeHours.close)}
                  className="text-xs text-orange-500 hover:text-orange-700 font-medium transition-colors"
                >
                  → Set to close ({fmtDisplay(storeHours.close)})
                </button>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5">
            <Checkbox id="tentative-shift" checked={tentative} onCheckedChange={(v) => setTentative(!!v)} className="mt-0.5" />
            <label htmlFor="tentative-shift" className="cursor-pointer select-none">
              <span className="text-sm font-medium text-gray-700">Tentative / backup shift</span>
              <span className="block text-xs text-gray-400">Shown as an outline and not counted toward weekly hours</span>
            </label>
          </div>

          {unavailableWarning && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <span><strong>Unavailability conflict:</strong> {unavailableWarning}</span>
            </div>
          )}

          {timeOffWarning && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-700">
              <CalendarOff className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <span><strong>Time off:</strong> {timeOffWarning}</span>
            </div>
          )}

          {shiftConflictWarning && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
              <span><strong>Shift conflict:</strong> {shiftConflictWarning}</span>
            </div>
          )}

          {closedWarning && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-sm text-orange-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
              <span>{closedWarning}</span>
            </div>
          )}
        </div>

        {pendingPast ? (
          <div className="pt-2">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-800 mb-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <span>
                You are {pendingPast === "delete" ? "deleting" : "changing"} a shift on a <strong>past date</strong>
                {displayDate ? ` (${format(displayDate, "EEE, MMM d")})` : ""}. Are you sure?
              </span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPendingPast(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (pendingPast === "delete") { onDelete(editShift.id); onClose(); }
                  else { handleSave(); }
                }}
                className={pendingPast === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-orange-500 hover:bg-orange-600"}
              >
                Yes, {pendingPast === "delete" ? "delete" : "save"}
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            {isEditing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { if (isPastDate) { setPendingPast("delete"); } else { onDelete(editShift.id); onClose(); } }}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={() => { if (isPastDate) { setPendingPast("save"); } else { handleSave(); } }}
                disabled={!employeeId || !!closedWarning || !!shiftConflictWarning}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isEditing ? "Save Changes" : "Add Shift"}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}