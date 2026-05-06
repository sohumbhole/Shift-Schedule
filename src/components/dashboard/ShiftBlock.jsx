import React from "react";
import { X } from "lucide-react";

export default function ShiftBlock({ shift, onDelete, onClick }) {
  const bgColor = shift.color || "#FF8C00";

  return (
    <div
      onClick={() => onClick?.(shift)}
      className="group relative flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 hover:shadow-sm"
      style={{
        backgroundColor: bgColor + "20",
        borderLeft: `3px solid ${bgColor}`,
        color: bgColor,
      }}
    >
      <div className="truncate flex-1">
        <span className="font-semibold">{shift.employee_name}</span>
        <span className="ml-1.5 opacity-70">
          {shift.start_time}-{shift.end_time}
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(shift.id);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/50"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}