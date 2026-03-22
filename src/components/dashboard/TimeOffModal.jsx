import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getStoreTimes(storeSettings, date) {
  if (!storeSettings || !date) return { open: "00:00", close: "23:59" };
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  const dayKey = DAY_KEYS[d.getDay()];
  const open = storeSettings[`${dayKey}_open`] || "00:00";
  const close = storeSettings[`${dayKey}_close`] || "23:59";
  return { open, close };
}

export default function TimeOffModal({ open, onClose, date, employee, employees, onSave, onDelete, editTimeOff, storeSettings }) {
  // uiEndDate is purely a UI helper — never sent to the DB.
  // On save we expand the range into individual single-day rows.
  const [form, setForm] = useState({
    employee_id: "",
    date: "",
    uiEndDate: "",
    type: "regular_off",
    full_day: true,
    start_time: "00:00",
    end_time: "23:59",
    reason: "",
  });

  useEffect(() => {
    if (editTimeOff) {
      const dayStr = (editTimeOff.start_date || editTimeOff.date || "").substring(0, 10);
      setForm({
        employee_id: editTimeOff.employee_id || "",
        date: dayStr,
        uiEndDate: dayStr, // editing is always single-day
        type: editTimeOff.type || "regular_off",
        full_day: editTimeOff.full_day !== false,
        start_time: editTimeOff.start_time || "00:00",
        end_time: editTimeOff.end_time || "23:59",
        reason: editTimeOff.reason || "",
      });
    } else {
      const { open: storeOpen, close: storeClose } = getStoreTimes(storeSettings, date);
      const dayStr = date ? format(date, "yyyy-MM-dd") : "";
      setForm({
        employee_id: employee?.id || (employees?.[0]?.id || ""),
        date: dayStr,
        uiEndDate: dayStr,
        type: "regular_off",
        full_day: true,
        start_time: storeOpen,
        end_time: storeClose,
        reason: "",
      });
    }
  }, [editTimeOff, employee, employees, date, open, storeSettings]);

  const handleSave = () => {
    if (!form.employee_id || !form.date) return;
    const emp = employees.find((e) => e.id === form.employee_id);

    // Build all dates in the selected range (inclusive)
    const start = new Date(form.date + "T00:00:00");
    const end = new Date((form.uiEndDate || form.date) + "T00:00:00");
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(format(d, "yyyy-MM-dd"));
    }

    // One payload per day — no end_date field
    const entries = dates.map((dayStr) => {
      const { open: storeOpen, close: storeClose } = getStoreTimes(storeSettings, dayStr);
      return {
        employee_id: form.employee_id,
        employee_name: emp?.name || "",
        date: dayStr,
        type: form.type,
        full_day: form.full_day,
        start_time: form.full_day ? storeOpen : form.start_time,
        end_time: form.full_day ? storeClose : form.end_time,
        reason: form.reason,
      };
    });

    onSave(entries, editTimeOff?.id);
    onClose();
  };

  const isEditing = !!editTimeOff;

  const typeConfig = {
    regular_off: {
      label: "Regular Day Off",
      description: "Scheduled day off given by manager (e.g., weekly day off)",
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-200",
    },
    custom_time_off: {
      label: "Custom Time Off",
      description: "Employee-requested time off for a specific reason",
      color: "text-red-500",
      bg: "bg-red-50 border-red-200",
    },
  };

  const selected = typeConfig[form.type];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Time Off" : "Add Time Off"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setForm({ ...form, type: key })}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                    form.type === key ? cfg.bg + " border-2" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className={`text-xs font-semibold ${form.type === key ? cfg.color : "text-gray-700"}`}>{cfg.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{cfg.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Employee */}
          {!employee && (
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value, uiEndDate: form.uiEndDate < e.target.value ? e.target.value : form.uiEndDate })}
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.uiEndDate}
                min={form.date}
                onChange={(e) => setForm({ ...form, uiEndDate: e.target.value })}
              />
            </div>
          </div>

          {/* Full day toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Full Day</Label>
              <div className="text-xs text-gray-400 mt-0.5">Toggle off to specify a time range</div>
            </div>
            <Switch
              checked={form.full_day}
              onCheckedChange={(v) => setForm({ ...form, full_day: v })}
            />
          </div>

          {/* Time range (shown when not full day) */}
          {!form.full_day && (
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="h-8 text-sm" />
              </div>
              <span className="text-gray-400 mt-5">–</span>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="h-8 text-sm" />
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason / Notes</Label>
            <Textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder={form.type === "custom_time_off" ? "e.g., Doctor's appointment, family event..." : "e.g., Weekly off, manager's discretion..."}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {isEditing && (
            <Button variant="ghost" size="sm" onClick={() => { onDelete(editTimeOff.id); onClose(); }} className="text-red-500 hover:text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-1" /> Remove
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!form.employee_id || !form.date}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {isEditing ? "Save Changes" : "Add Time Off"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}