import React, { useState, useRef, useEffect } from "react";
import { format, addDays } from "date-fns";
import { ChevronDown } from "lucide-react";
import html2canvas from "html2canvas";

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, "0")}${ampm}`;
}

async function exportToImage(node, filename) {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

// Week view table: employees × 7 days
function WeekTable({ weekStart, shifts, employees, filterEmployee }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const displayEmployees = filterEmployee ? employees.filter((e) => e.id === filterEmployee.id) : employees;

  return (
    <table style={{ borderCollapse: "collapse", fontFamily: "Arial, sans-serif", fontSize: 12, width: "100%", minWidth: 900, backgroundColor: "#fff" }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid #ccc", padding: "6px 10px", background: "#f5f5f5", width: 120 }} />
          {days.map((d) => (
            <th key={d.toISOString()} style={{ border: "1px solid #ccc", padding: "6px 10px", background: "#f5f5f5", textAlign: "center", color: "#555" }}>
              {format(d, "M/d/yyyy")}
            </th>
          ))}
        </tr>
        <tr>
          <th style={{ border: "1px solid #ccc", padding: "6px 10px", background: "#f0f0f0" }} />
          {days.map((d) => (
            <th key={d.toISOString()} style={{ border: "1px solid #ccc", padding: "6px 10px", background: "#f0f0f0", textAlign: "left", fontWeight: 600, color: "#333" }}>
              {format(d, "EEEE")}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {displayEmployees.map((emp, idx) => (
          <tr key={emp.id} style={{ backgroundColor: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
            <td style={{ border: "1px solid #ccc", padding: "6px 10px", fontWeight: 700, backgroundColor: emp.color ? emp.color + "33" : "#fff8f0", color: "#222", whiteSpace: "nowrap" }}>
              {emp.name}
            </td>
            {days.map((day) => {
              const dayStr = format(day, "yyyy-MM-dd");
              const dayShifts = shifts.filter((s) => s.employee_id === emp.id && s.date === dayStr);
              return (
                <td key={day.toISOString()} style={{ border: "1px solid #ccc", padding: "5px 8px", verticalAlign: "top", backgroundColor: dayShifts.length > 0 ? (emp.color ? emp.color + "22" : "#fff8f0") : "#fff", color: "#333", minWidth: 100 }}>
                  {dayShifts.length === 0 ? (
                    <span style={{ color: "#aaa", fontSize: 11 }}>OFF</span>
                  ) : (
                    dayShifts.map((s, i) => (
                      <div key={i} style={{ fontWeight: 600, marginBottom: 2 }}>{fmtTime(s.start_time)} - {fmtTime(s.end_time)}</div>
                    ))
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Day view table: employees × 1 day (only shows employees who have a shift)
function DayTable({ day, shifts, employees, filterEmployee }) {
  const dayStr = format(day, "yyyy-MM-dd");
  let displayEmployees = filterEmployee ? employees.filter((e) => e.id === filterEmployee.id) : employees;
  // Only show employees that have shifts this day (unless filtering to one emp)
  if (!filterEmployee) {
    displayEmployees = displayEmployees.filter((e) => shifts.some((s) => s.employee_id === e.id && s.date === dayStr));
  }

  return (
    <table style={{ borderCollapse: "collapse", fontFamily: "Arial, sans-serif", fontSize: 12, width: "100%", minWidth: 400, backgroundColor: "#fff" }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid #ccc", padding: "6px 10px", background: "#f0f0f0", textAlign: "left", fontWeight: 600, color: "#333", width: 160 }}>Employee</th>
          <th style={{ border: "1px solid #ccc", padding: "6px 10px", background: "#f0f0f0", textAlign: "left", fontWeight: 600, color: "#333" }}>Shift(s)</th>
        </tr>
      </thead>
      <tbody>
        {displayEmployees.length === 0 ? (
          <tr><td colSpan={2} style={{ border: "1px solid #ccc", padding: "10px", color: "#aaa", textAlign: "center" }}>No shifts scheduled</td></tr>
        ) : (
          displayEmployees.map((emp, idx) => {
            const dayShifts = shifts.filter((s) => s.employee_id === emp.id && s.date === dayStr);
            return (
              <tr key={emp.id} style={{ backgroundColor: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ border: "1px solid #ccc", padding: "6px 10px", fontWeight: 700, backgroundColor: emp.color ? emp.color + "33" : "#fff8f0", color: "#222" }}>{emp.name}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px 10px", color: "#333" }}>
                  {dayShifts.length === 0 ? (
                    <span style={{ color: "#aaa", fontSize: 11 }}>OFF</span>
                  ) : (
                    dayShifts.map((s, i) => (
                      <span key={i} style={{ fontWeight: 600, marginRight: 12 }}>{fmtTime(s.start_time)} - {fmtTime(s.end_time)}</span>
                    ))
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

// Condensed "send to employee" view
function CondensedView({ weekStart, selectedDay, shifts, employees, isDayView }) {
  const days = isDayView
    ? [selectedDay || weekStart]
    : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const dateLabel = isDayView
    ? format(days[0], "MMMM d")
    : `${format(days[0], "MMMM d")} - ${format(days[days.length - 1], "do")}`;

  return (
    <div style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#fff", padding: "24px 28px", minWidth: 320 }}>
      {employees.map((emp, idx) => {
        const empShifts = days.flatMap((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          return shifts.filter((s) => s.employee_id === emp.id && s.date === dayStr).map((s) => ({ day, s }));
        });
        const hasShifts = empShifts.length > 0;
        return (
          <div key={emp.id} style={{ marginBottom: idx < employees.length - 1 ? 24 : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111", marginBottom: 6 }}>
              {dateLabel} - {emp.name}
            </div>
            {hasShifts ? empShifts.map(({ day, s }, si) => (
              <div key={si} style={{ fontSize: 14, color: "#333", paddingLeft: 4, marginBottom: 2 }}>
                {format(day, "EEE")} {fmtTime(s.start_time)} - {fmtTime(s.end_time)}
              </div>
            )) : (
              <div style={{ fontSize: 14, color: "#999", paddingLeft: 4, fontStyle: "italic" }}>No shifts</div>
            )}
          </div>
        );
      })}
      {employees.length === 0 && (
        <div style={{ fontSize: 13, color: "#aaa" }}>No employees found</div>
      )}
    </div>
  );
}

export default function ExportSchedule({ weekStart, selectedDay, shifts, employees, isDayView }) {
  const [open, setOpen] = useState(false);
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [exportTarget, setExportTarget] = useState(undefined);
  const [condensedPending, setCondensedPending] = useState(false);
  const ref = useRef(null);
  const tableRef = useRef(null);
  const condensedRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowEmpPicker(false); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doExport = async (filterEmployee) => {
    if (!tableRef.current) return;
    const label = isDayView ? format(selectedDay || weekStart, "MMM-d-yyyy") : `${format(weekStart, "MMM-d")}_${format(addDays(weekStart, 6), "MMM-d-yyyy")}`;
    const empLabel = filterEmployee ? `_${filterEmployee.name.replace(/\s+/g, "_")}` : "";
    const filename = `${isDayView ? "day" : "week"}_schedule${empLabel}_${label}.png`;
    await exportToImage(tableRef.current, filename);
    setOpen(false);
    setShowEmpPicker(false);
    setExportTarget(undefined);
  };

  const doCondensedExport = async () => {
    if (!condensedRef.current) return;
    const label = isDayView ? format(selectedDay || weekStart, "MMM-d-yyyy") : `${format(weekStart, "MMM-d")}_${format(addDays(weekStart, 6), "MMM-d-yyyy")}`;
    await exportToImage(condensedRef.current, `schedule_condensed_${label}.png`);
    setOpen(false);
    setCondensedPending(false);
  };

  const renderHiddenTable = (filterEmployee) => {
    const day = selectedDay || weekStart;
    const title = isDayView
      ? `Schedule: ${format(day, "EEEE, MMMM d, yyyy")}${filterEmployee ? ` - ${filterEmployee.name}` : ""}`
      : `Schedule: ${format(weekStart, "MMM d")} - ${format(addDays(weekStart, 6), "MMM d, yyyy")}${filterEmployee ? ` - ${filterEmployee.name}` : ""}`;

    return (
      <div ref={tableRef} style={{ position: "fixed", top: -9999, left: -9999, padding: 16, backgroundColor: "#fff" }}>
        <div style={{ marginBottom: 8, fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, color: "#333" }}>{title}</div>
        {isDayView ? (
          <DayTable day={day} shifts={shifts} employees={employees} filterEmployee={filterEmployee} />
        ) : (
          <WeekTable weekStart={weekStart} shifts={shifts} employees={employees} filterEmployee={filterEmployee} />
        )}
      </div>
    );
  };

  return (
    <div className="relative" ref={ref}>
      {exportTarget !== undefined && renderHiddenTable(exportTarget)}
      {condensedPending && (
        <div ref={condensedRef} style={{ position: "fixed", top: -9999, left: -9999 }}>
          <CondensedView weekStart={weekStart} selectedDay={selectedDay} shifts={shifts} employees={employees} isDayView={isDayView} />
        </div>
      )}

      <button
        onClick={() => { setOpen((v) => !v); setShowEmpPicker(false); }}
        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all text-xs font-medium flex items-center gap-1"
        title="Export schedule"
      >
        Export
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          <button
            onClick={() => { setExportTarget(null); setTimeout(() => doExport(null), 50); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left"
          >
            Export {isDayView ? "Day" : "Full Week"} as Image
          </button>

          <button
            onClick={() => { setCondensedPending(true); setTimeout(doCondensedExport, 80); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left"
          >
            Export Employee Summary
          </button>

          <button
            onClick={() => setShowEmpPicker((v) => !v)}
            className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left"
          >
            <span>Export One Employee…</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showEmpPicker && (
            <div className="border-t border-gray-100 max-h-48 overflow-y-auto">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => { setExportTarget(emp); setTimeout(() => doExport(emp), 50); }}
                  className="w-full flex items-center gap-2.5 px-5 py-2 text-sm text-gray-600 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: emp.color || "#ccc" }} />
                  {emp.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}