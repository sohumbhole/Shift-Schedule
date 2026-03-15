import React, { useState } from "react";
import { format, addDays, isToday, isSameDay } from "date-fns";
import { Plus, UserPlus, Calendar, Clock, GripVertical, CalendarOff, Award } from "lucide-react";
import EmployeeTooltip from "@/components/employees/EmployeeTooltip";
import EventsRow from "@/components/events/EventsRow";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fmtTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, "0")}${ampm}`;
}

function ShiftPill({ shift, onClick }) {
  const color = shift.color || "#FF8C00";
  const dur = timeToMinutes(shift.end_time) - timeToMinutes(shift.start_time);
  const hrs = dur / 60;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(shift); }}
      className="rounded-md px-2 py-1 cursor-pointer hover:brightness-95 transition-all group relative text-white text-xs font-semibold shadow-sm select-none"
      style={{ backgroundColor: color }}
      title={`${shift.employee_name}: ${fmtTime(shift.start_time)} - ${fmtTime(shift.end_time)} (${hrs.toFixed(1)}h)`}
    >
      <div className="font-semibold truncate">{fmtTime(shift.start_time)} - {fmtTime(shift.end_time)}</div>
      <div className="text-[10px] opacity-80 font-normal truncate">{shift.employee_name.split(" ")[0]}</div>
    </div>
  );
}

const TIME_OFF_STYLES = {
  regular_off: { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-700", label: "Day Off" },
  custom_time_off: { bg: "bg-red-100", border: "border-red-300", text: "text-red-600", label: "Time Off" },
};

function TimeOffPill({ timeOff, onClick }) {
  const style = TIME_OFF_STYLES[timeOff.type] || TIME_OFF_STYLES.regular_off;
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(timeOff); }}
      className={`rounded-md px-2 py-1 cursor-pointer border text-xs font-semibold flex items-center gap-1 ${style.bg} ${style.border} ${style.text} hover:brightness-95 transition-all`}
      title={timeOff.reason ? `${style.label}: ${timeOff.reason}` : style.label}
    >
      {timeOff.type === "regular_off" ? <Calendar className="w-2.5 h-2.5 shrink-0" /> : <Clock className="w-2.5 h-2.5 shrink-0" />}
      <span className="truncate">{style.label}{timeOff.reason ? ` · ${timeOff.reason}` : ""}</span>
    </div>
  );
}

export default function CalendarGrid({ weekStart, shifts, timeOffs = [], events = [], employees, onAddShift, onEditShift, onEditTimeOff, onAddTimeOff, onSelectDay, onAddEvent, onEditEvent, isReorderMode, onReorder }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const navigate = useNavigate();
  const [expandedCell, setExpandedCell] = useState(null);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    const reordered = Array.from(employees);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    onReorder(reordered.map((e) => e.id));
  };

  const EmployeeRow = ({ emp, index, isDragging }) => {
    const empShifts = shifts.filter((s) => s.employee_id === emp.id && days.some((d) => isSameDay(new Date(s.date + "T00:00:00"), d)));
    const totalHrs = empShifts.reduce((sSum, s) => {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      const start = sh * 60 + sm;
      let end = eh * 60 + em;
      if (end <= start) end += 24 * 60;
      return sSum + (end - start) / 60;
    }, 0);

    const MAX_VISIBLE_ITEMS = 2;

    const CellContent = ({ day }) => {
      const dayShifts = shifts
        .filter((s) => s.employee_id === emp.id && isSameDay(new Date(s.date + "T00:00:00"), day))
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      const dayTimeOffs = timeOffs.filter((t) => {
        if (t.employee_id !== emp.id) return false;
        const d = format(day, "yyyy-MM-dd");
        const start = t.start_date || t.date;
        const end = t.end_date || start;
        return d >= start && d <= end;
      });

      const allItems = [...dayTimeOffs, ...dayShifts];
      const isExpanded = expandedCell === `${emp.id}-${day.toISOString()}`;
      const visibleItems = isExpanded ? allItems : allItems.slice(0, MAX_VISIBLE_ITEMS);
      const hiddenCount = allItems.length - MAX_VISIBLE_ITEMS;

      return {
        dayShifts,
        dayTimeOffs,
        allItems,
        visibleItems,
        hiddenCount,
        isExpanded,
        cellKey: `${emp.id}-${day.toISOString()}`
      };
    };

    return (
      <div
        className={`flex border-b border-gray-200 last:border-b-0 transition-colors ${
          isDragging ? "bg-orange-50/80 shadow-lg rounded-lg border border-orange-200 z-50" : "hover:bg-gray-50/30"
        }`}
      >
        {/* Employee label */}
        <div className="w-40 sm:w-48 shrink-0 border-r border-gray-100 px-3 py-2 flex items-center gap-2.5 relative">
          {isReorderMode && (
            <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors shrink-0 -ml-1">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
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
            <div className="overflow-hidden min-w-0" style={{ width: 60 }}>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(createPageUrl(`Employees?edit=${emp.id}`)); }}
                className="text-sm font-semibold text-gray-800 truncate hover:text-orange-600 transition-colors block cursor-pointer text-left w-full"
              >{emp.name.split(" ")[0]}</button>
              <div className="text-xs text-gray-400 truncate">{emp.title?.length > 9 ? emp.title.slice(0, 9) + "…" : emp.title}</div>
            </div>
          </EmployeeTooltip>
          <span className="text-xs font-semibold text-gray-500 absolute" style={{ right: 8 }}>
            {totalHrs % 1 === 0 ? totalHrs : totalHrs.toFixed(1)}h
          </span>
        </div>

        {/* Day cells */}
        {days.map((day) => {
          const content = CellContent({ day });
          return (
            <div
              key={day.toISOString()}
              className={"flex-1 border-r border-gray-50 last:border-r-0 px-1 py-1 flex flex-col gap-0.5 max-h-[120px] overflow-hidden relative group " +
                (!isReorderMode ? "cursor-pointer " : "") +
                (isToday(day) ? "bg-orange-50/20" : "")}
              onClick={() => !isReorderMode && content.allItems.length === 0 && onAddShift(day, emp)}
            >
              {content.visibleItems.map((item) => 
                item.type || item.reason !== undefined ? (
                  <TimeOffPill key={item.id} timeOff={item} onClick={onEditTimeOff} />
                ) : (
                  <ShiftPill key={item.id} shift={item} onClick={onEditShift} />
                )
              )}
              
              {content.hiddenCount > 0 && !content.isExpanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedCell(content.cellKey);
                  }}
                  className="text-[10px] font-semibold text-orange-600 hover:text-orange-700 px-1 py-0.5 rounded hover:bg-orange-50 transition-all"
                >
                  +{content.hiddenCount} more
                </button>
              )}

              {content.isExpanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedCell(null);
                  }}
                  className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-50 transition-all"
                >
                  Show less
                </button>
              )}

              {!isReorderMode && content.allItems.length === 0 && (
                <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center gap-1 absolute inset-0 border-2 border-dashed border-orange-200 rounded-md bg-orange-50/40">
                  <div className="flex-1 flex items-center justify-center rounded-md h-full"
                    onClick={(e) => { e.stopPropagation(); onAddShift(day, emp); }}>
                    <Plus className="w-3.5 h-3.5 text-orange-400" />
                  </div>
                  <div className="flex items-center justify-center h-full w-8 shrink-0 border-l border-orange-200"
                    onClick={(e) => { e.stopPropagation(); onAddTimeOff(day, emp); }}
                    title="Add time off">
                    <CalendarOff className="w-3 h-3 text-blue-400" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
       {/* Events row */}
       <EventsRow 
         day={weekStart}
         weekStart={weekStart}
         events={events}
         onAddEvent={onAddEvent}
         onEditEvent={onEditEvent}
         isWeekView={true}
       />

       {/* Day headers */}
       <div className="flex border-b border-gray-200">
        <div className="w-40 sm:w-48 shrink-0 border-r border-gray-100 px-3 py-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {isReorderMode ? "Drag to reorder" : "Employee"}
          </span>
        </div>
        {days.map((day) => (
          <div
            key={day.toISOString()}
            onClick={() => !isReorderMode && onSelectDay && onSelectDay(day)}
            className={"flex-1 px-1 py-2 text-center border-r border-gray-50 last:border-r-0 transition-colors group " +
              (!isReorderMode ? "cursor-pointer hover:bg-orange-50/40 " : "") +
              (isToday(day) ? "bg-orange-50/60" : "")}
          >
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider group-hover:text-orange-500 transition-colors">{format(day, "EEE")}</div>
            <div
              className={"mt-0.5 text-base font-semibold inline-flex items-center justify-center w-7 h-7 rounded-full transition-all " +
                (isToday(day) ? "bg-orange-500 text-white" : "text-gray-900 group-hover:bg-orange-100 group-hover:text-orange-600")}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Employee rows */}
      {employees.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-300 text-sm">
          No employees yet - add employees first
        </div>
      ) : isReorderMode ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="employee-rows">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {employees.map((emp, index) => (
                  <Draggable key={emp.id} draggableId={emp.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        <EmployeeRow emp={emp} index={index} isDragging={snapshot.isDragging} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        employees.map((emp) => (
          <EmployeeRow key={emp.id} emp={emp} index={0} isDragging={false} />
        ))
      )}

      {/* Add employee CTA row */}
      {!isReorderMode && (
        <div className="flex border-t border-gray-200">
          <div className="w-40 sm:w-48 shrink-0 px-3 py-3">
            <a
              href="#employee-list"
              onClick={(e) => { e.preventDefault(); window.location.href = "/employees"; }}
              className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Employee
            </a>
          </div>
        </div>
      )}
    </div>
  );
}