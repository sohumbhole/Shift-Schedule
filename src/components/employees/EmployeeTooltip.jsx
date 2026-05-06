import React, { useState, useRef } from "react";

const DAYS_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function groupUnavailable(blocks) {
  if (!blocks || blocks.length === 0) return [];
  // Group by day in week order
  const byDay = {};
  blocks.forEach((b) => {
    if (!byDay[b.day]) byDay[b.day] = [];
    byDay[b.day].push(b);
  });
  return DAYS_ORDER.filter((d) => byDay[d]).map((d) => ({ day: d, blocks: byDay[d] }));
}

const TOOLTIP_HEIGHT = 220; // approximate max tooltip height

export default function EmployeeTooltip({ emp, children }) {
  const [pos, setPos] = useState(null);
  const timerRef = useRef(null);

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < TOOLTIP_HEIGHT + 8;
    setPos({
      x: rect.left,
      y: showAbove ? rect.top - 4 : rect.bottom + 4,
      above: showAbove,
    });
  };

  const handleMouseLeave = () => {
    setPos(null);
  };

  const grouped = groupUnavailable(emp.unavailable_hours);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {pos && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: pos.x, top: pos.above ? undefined : pos.y, bottom: pos.above ? window.innerHeight - pos.y : undefined }}
        >
          <div className="bg-gray-900 text-white rounded-xl shadow-2xl p-3 w-56 text-xs">
            {/* Title */}
            <div className="font-semibold text-sm mb-2 text-white">{emp.title}</div>

            {/* Hours */}
            <div className="space-y-1 mb-2">
              {emp.available_hours && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Available</span>
                  <span className="text-gray-100 text-right">{emp.available_hours}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Min / Max</span>
                <span className="text-gray-100">
                  {emp.min_hours ?? "-"} / {emp.max_hours ?? "-"} hrs
                </span>
              </div>
            </div>

            {/* Unavailable hours */}
            {grouped.length > 0 && (
              <>
                <div className="border-t border-gray-700 pt-2 mt-1">
                  <div className="text-gray-400 font-medium mb-1.5">Unavailable</div>
                  <div className="space-y-1">
                    {grouped.map(({ day, blocks }) => (
                      <div key={day} className="flex gap-1.5">
                        <span className="text-gray-400 w-8 shrink-0">{day.slice(0, 3)}</span>
                        <div className="flex flex-col gap-0.5">
                          {blocks.map((b, i) => (
                            <span key={i} className="text-gray-200">
                              {fmtTime(b.start_time)} - {fmtTime(b.end_time)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!emp.available_hours && !emp.min_hours && !emp.max_hours && grouped.length === 0 && (
              <div className="text-gray-500 italic">No details set</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}