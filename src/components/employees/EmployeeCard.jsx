import React from "react";
import { Card } from "@/components/ui/card";
import { Clock, FileText, CalendarOff, Award } from "lucide-react";

export default function EmployeeCard({ employee, onClick, onAddTimeOff }) {
  const color = employee.color || "#FF8C00";

  return (
    <Card
      onClick={() => onClick(employee)}
      className="p-4 cursor-pointer hover:shadow-md transition-all duration-200 border-gray-100 hover:border-gray-200 group"
    >
      <div className="flex items-start gap-3.5">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ backgroundColor: color }}
        >
          {employee.name?.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-orange-600 transition-colors">
              {employee.name}
            </h3>
            {employee.food_safety_certified && (
              <div className="flex items-center gap-1 shrink-0 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                <Award className="w-3 h-3 text-green-600" />
                <span className="text-xs font-semibold text-green-600">Certified</span>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{employee.title}</p>
          <div className="flex items-center gap-4 mt-2.5">
            {employee.min_hours && (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{employee.min_hours}-{employee.max_hours || "∞"} hrs</span>
              </div>
            )}
            {employee.notes && (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <FileText className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{employee.notes}</span>
              </div>
            )}
          </div>
        </div>
        {onAddTimeOff && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddTimeOff(employee); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-orange-500 shrink-0 p-1"
            title="Add time off"
          >
            <CalendarOff className="w-4 h-4" />
          </button>
        )}
      </div>
    </Card>
  );
}