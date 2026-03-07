import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, X, Ribbon } from "lucide-react";

const COLOR_OPTIONS = [
  "#FF8C00", "#3B82F6", "#10B981", "#8B5CF6",
  "#EC4899", "#F59E0B", "#06B6D4", "#EF4444",
  "#6366F1", "#14B8A6", "#F97316", "#84CC16",
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function UnavailableRow({ block, onChange, onRemove }) {
  const isAllDay = block.start_time === "00:00" && block.end_time === "23:59";

  const toggleAllDay = () => {
    if (isAllDay) {
      onChange({ ...block, start_time: "09:00", end_time: "17:00" });
    } else {
      onChange({ ...block, start_time: "00:00", end_time: "23:59" });
    }
  };

  return (
    <div className="flex items-center gap-2 py-1.5 flex-wrap">
      <Select value={block.day} onValueChange={(v) => onChange({ ...block, day: v })}>
        <SelectTrigger className="h-8 text-xs w-28 shrink-0">
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent>
          {DAYS.map((d) => (
            <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!isAllDay && (
        <>
          <Input
            type="time"
            value={block.start_time}
            onChange={(e) => onChange({ ...block, start_time: e.target.value })}
            className="h-8 text-xs w-28 shrink-0"
          />
          <span className="text-gray-400 text-xs shrink-0">to</span>
          <Input
            type="time"
            value={block.end_time}
            onChange={(e) => onChange({ ...block, end_time: e.target.value })}
            className="h-8 text-xs w-28 shrink-0"
          />
        </>
      )}

      <button
        onClick={toggleAllDay}
        className={`h-8 px-2 rounded-md text-xs font-medium border transition-colors shrink-0 ${
          isAllDay ? "bg-orange-100 border-orange-300 text-orange-600" : "border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
        }`}
      >
        All day
      </button>

      <button
        onClick={onRemove}
        className="text-gray-300 hover:text-red-400 transition-colors ml-auto shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function EmployeeModal({ open, onClose, employee, onSave, onDelete }) {
  const [form, setForm] = useState({
    name: "", title: "", available_hours: "",
    min_hours: "", max_hours: "", notes: "",
    color: COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)],
    food_safety_certified: false,
  });
  const [unavailable, setUnavailable] = useState([]);
  const [touched, setTouched] = useState({});

  useEffect(() => {
    if (employee) {
      setForm({
        name: employee.name || "",
        title: employee.title || "",
        available_hours: employee.available_hours || "",
        min_hours: employee.min_hours || "",
        max_hours: employee.max_hours || "",
        notes: employee.notes || "",
        color: employee.color || COLOR_OPTIONS[0],
        food_safety_certified: employee.food_safety_certified || false,
      });
      setUnavailable(employee.unavailable_hours || []);
    } else {
      setForm({
        name: "", title: "", available_hours: "",
        min_hours: "", max_hours: "", notes: "",
        color: COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)],
        food_safety_certified: false,
      });
      setUnavailable([]);
    }
    setTouched({});
  }, [employee, open]);

  const addUnavailable = () => {
    setUnavailable([...unavailable, { day: "Monday", start_time: "09:00", end_time: "17:00" }]);
  };

  const updateUnavailable = (i, val) => {
    setUnavailable(unavailable.map((b, idx) => idx === i ? val : b));
  };

  const removeUnavailable = (i) => {
    setUnavailable(unavailable.filter((_, idx) => idx !== i));
  };

  const handleSave = () => {
    if (!form.name || !form.title || !form.min_hours) {
      setTouched({ name: true, title: true, min_hours: true });
      return;
    }
    onSave({
      ...form,
      min_hours: form.min_hours ? Number(form.min_hours) : undefined,
      max_hours: form.max_hours ? Number(form.max_hours) : undefined,
      unavailable_hours: unavailable,
      food_safety_certified: form.food_safety_certified,
    });
    onClose();
  };

  const isEditing = !!employee;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Employee" : "Add New Employee"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="Full name"
                className={touched.name && !form.name ? "border-red-400 focus-visible:ring-red-400" : ""}
              />
            </div>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, title: true }))}
                placeholder="e.g., Line Cook"
                className={touched.title && !form.title ? "border-red-400 focus-visible:ring-red-400" : ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Available Hours</Label>
            <Input value={form.available_hours} onChange={(e) => setForm({ ...form, available_hours: e.target.value })} placeholder="e.g., Mon-Fri 9am-5pm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min Hours / Week *</Label>
              <Input
                type="number"
                value={form.min_hours}
                onChange={(e) => setForm({ ...form, min_hours: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, min_hours: true }))}
                placeholder="e.g., 20"
                className={touched.min_hours && !form.min_hours ? "border-red-400 focus-visible:ring-red-400" : ""}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Hours / Week</Label>
              <Input type="number" value={form.max_hours} onChange={(e) => setForm({ ...form, max_hours: e.target.value })} placeholder="e.g., 40" />
            </div>
          </div>

          {/* Unavailable Hours */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Label>Unavailable Hours</Label>
              <button
                onClick={addUnavailable}
                className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {unavailable.length === 0 ? (
              <div className="text-xs text-gray-400 py-1">None</div>
            ) : (
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 divide-y divide-gray-100">
                {unavailable.map((block, i) => (
                  <UnavailableRow
                    key={i}
                    block={block}
                    onChange={(val) => updateUnavailable(i, val)}
                    onRemove={() => removeUnavailable(i)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-lg transition-all duration-150 ${form.color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
            <input
              type="checkbox"
              id="food_safety_certified"
              checked={form.food_safety_certified}
              onChange={(e) => setForm({ ...form, food_safety_certified: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-green-600 cursor-pointer"
            />
            <label htmlFor="food_safety_certified" className="flex items-center gap-2 cursor-pointer flex-1">
              <Ribbon className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Food Safety Certified</span>
            </label>
          </div>
          </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {isEditing && (
            <Button variant="ghost" size="sm" onClick={() => { onDelete(employee.id); onClose(); }} className="text-red-500 hover:text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.title || !form.min_hours} className="bg-orange-500 hover:bg-orange-600">
              {isEditing ? "Save Changes" : "Add Employee"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}