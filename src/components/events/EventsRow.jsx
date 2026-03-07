import React from "react";
import { isSameDay, isWithinInterval, format, addDays } from "date-fns";
import { Plus } from "lucide-react";

export default function EventsRow({ day, weekStart, events = [], onAddEvent, onEditEvent, isWeekView = false }) {
  if (isWeekView) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Sort events chronologically within the week
    const weekEvents = events.filter((evt) => {
      const start = new Date(evt.start_date + "T00:00:00");
      const end = new Date(evt.end_date + "T23:59:59");
      return isWithinInterval(start, { start: weekStart, end: weekEnd }) ||
             isWithinInterval(end, { start: weekStart, end: weekEnd }) ||
             (start <= weekStart && end >= weekEnd);
    }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    return (
      <div className="flex border-b border-gray-100 bg-purple-50/30">
        {/* Sidebar */}
        <div className="w-40 sm:w-48 shrink-0 border-r border-gray-100 px-3 py-2 flex items-center">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Events</span>
        </div>

        {/* Day cells with hover add buttons */}
        {days.map((dayCell) => {
          const dayStart = new Date(dayCell);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayCell);
          dayEnd.setHours(23, 59, 59, 999);

          const dayEventsForCell = weekEvents.filter((evt) => {
            const evtStart = new Date(evt.start_date + "T00:00:00");
            const evtEnd = new Date(evt.end_date + "T23:59:59");
            return isWithinInterval(dayStart, { start: evtStart, end: evtEnd }) ||
                   (evtStart >= dayStart && evtStart <= dayEnd);
          });

          return (
            <div
              key={dayCell.toISOString()}
              className="flex-1 border-r border-gray-50 last:border-r-0 px-1 py-2 flex flex-wrap items-start gap-1 content-start cursor-pointer group hover:bg-purple-100/40 transition-colors"
              onClick={() => onAddEvent(dayCell)}
            >
              {dayEventsForCell.map((evt) => (
                <button
                  key={evt.id}
                  onClick={(e) => { e.stopPropagation(); onEditEvent(evt); }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate hover:opacity-90 transition-opacity block"
                  style={{ backgroundColor: evt.color || "#8B5CF6" }}
                  title={evt.name}
                >
                  {evt.name}
                </button>
              ))}
              {dayEventsForCell.length === 0 && (
                <Plus className="w-3 h-3 text-purple-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Day view
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  const relevantEvents = events.filter((evt) => {
    const evtStart = new Date(evt.start_date + "T00:00:00");
    const evtEnd = new Date(evt.end_date + "T23:59:59");
    return isWithinInterval(dayStart, { start: evtStart, end: evtEnd }) ||
           (evtStart >= dayStart && evtStart <= dayEnd);
  }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  return (
    <div className="flex border-b border-gray-100 bg-purple-50/30">
      <div className="w-40 sm:w-48 shrink-0 border-r border-gray-100 px-3 py-2 flex items-center">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Events</span>
      </div>
      <div className="flex-1 px-3 py-2 flex items-center gap-1.5 flex-wrap cursor-pointer group hover:bg-purple-100/40 transition-colors"
           onClick={() => onAddEvent(day)}>
        {relevantEvents.map((evt) => (
          <button
            key={evt.id}
            onClick={(e) => { e.stopPropagation(); onEditEvent(evt); }}
            className="px-2 py-1 rounded-md text-xs font-semibold text-white truncate hover:opacity-90 transition-opacity"
            style={{ backgroundColor: evt.color || "#8B5CF6" }}
            title={`${evt.name}${evt.notes ? '\n' + evt.notes : ''}`}
          >
            {evt.name}
          </button>
        ))}
        <Plus className="w-3 h-3 text-purple-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}