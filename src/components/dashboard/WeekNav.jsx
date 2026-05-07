import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, Copy, Trash2, Pencil } from "lucide-react";
import { format, endOfWeek, startOfWeek } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ExportSchedule from "./ExportSchedule";
import DayNotesModal from "./DayNotesModal";

export default function WeekNav({ currentWeekStart, selectedDay, onPrev, onNext, onToday, isDayView, onCopyPreviousWeek, shifts, employees, onClearWeek, onNavigateToWeek, onNavigateToDay }) {
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setConfirmClear(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex items-center gap-3 w-full">
      <Button variant="outline" size="sm" onClick={onToday} className="text-sm font-medium">
        Today
      </Button>
      {/* Fixed-width nav so the right arrow never shifts */}
      <div className="flex items-center" style={{ flexShrink: 0 }}>
        <Button variant="ghost" size="icon" className="h-8 w-8" style={{ flexShrink: 0 }} onClick={onPrev}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1 mx-1 text-center cursor-pointer hover:text-orange-500 transition-colors group" style={{ width: 200, flexShrink: 0, justifyContent: "center" }}>
              <span className="text-base font-semibold text-gray-900 group-hover:text-orange-500 transition-colors">
                {format(currentWeekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-orange-500 transition-colors shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={isDayView ? selectedDay : currentWeekStart}
              onSelect={(date) => {
                if (date) {
                  if (isDayView && onNavigateToDay) {
                    onNavigateToDay(date);
                  } else if (onNavigateToWeek) {
                    onNavigateToWeek(startOfWeek(date, { weekStartsOn: 1 }));
                  }
                  setCalOpen(false);
                }
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon" className="h-8 w-8" style={{ flexShrink: 0 }} onClick={onNext}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Week-level copy/clear dropdown - only shown in week view */}
      {!isDayView && (
        <div className="relative ml-1" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300 transition-all text-sm font-medium"
          >
            <Copy className="w-3.5 h-3.5" />
            <ChevronDown className="w-3 h-3" />
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <button
                onClick={() => { setOpen(false); onCopyPreviousWeek(); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left"
              >
                <Copy className="w-4 h-4 text-gray-400" />
                Copy previous week's schedule
              </button>

              <div className="border-t border-gray-100 mt-1 pt-1">
                {confirmClear ? (
                  <div className="px-3.5 py-2.5">
                    <p className="text-xs text-red-600 font-semibold mb-2">Clear all shifts this week?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmClear(false); setOpen(false); onClearWeek(); }}
                        className="flex-1 px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-md transition-colors"
                      >
                        Yes, clear
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="flex-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear all shifts this week
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes button - week view only */}
      {!isDayView && (
        <button
          onClick={() => setNotesOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-400 text-blue-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-500 transition-all text-sm font-medium"
          title="Week notes"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Notes</span>
        </button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Export schedule */}
      <ExportSchedule
        weekStart={currentWeekStart}
        selectedDay={selectedDay}
        shifts={shifts}
        employees={employees}
        isDayView={isDayView}
      />

      <DayNotesModal open={notesOpen} onClose={() => setNotesOpen(false)} weekStart={currentWeekStart} />
    </div>
  );
}