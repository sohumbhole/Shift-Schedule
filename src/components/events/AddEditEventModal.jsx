import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const EVENT_COLORS = [
  "#8B5CF6", // Purple (default)
  "#EF4444", // Red
  "#F97316", // Orange
  "#EAB308", // Yellow
  "#22C55E", // Green
  "#06B6D4", // Cyan
  "#3B82F6", // Blue
  "#EC4899", // Pink
];

export default function AddEditEventModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialDate,
  event = null,
}) {
  const [formData, setFormData] = useState({
    name: "",
    start_date: format(initialDate || new Date(), "yyyy-MM-dd"),
    end_date: format(initialDate || new Date(), "yyyy-MM-dd"),
    all_day: true,
    start_time: "09:00",
    end_time: "17:00",
    notes: "",
    color: "#8B5CF6",
  });

  const [touched, setTouched] = useState({});

  useEffect(() => {
    if (isOpen) {
      setTouched({});
      if (event) {
        setFormData({
          name: event.name || "",
          start_date: event.start_date || format(initialDate || new Date(), "yyyy-MM-dd"),
          end_date: event.end_date || format(initialDate || new Date(), "yyyy-MM-dd"),
          all_day: event.all_day !== false,
          start_time: event.start_time || "09:00",
          end_time: event.end_time || "17:00",
          notes: event.notes || "",
          color: event.color || "#8B5CF6",
        });
      } else {
        setFormData({
          name: "",
          start_date: format(initialDate || new Date(), "yyyy-MM-dd"),
          end_date: format(initialDate || new Date(), "yyyy-MM-dd"),
          all_day: true,
          start_time: "09:00",
          end_time: "17:00",
          notes: "",
          color: "#8B5CF6",
        });
      }
    }
  }, [event, initialDate, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setTouched({ ...touched, name: true });
      return;
    }
    onSave({ ...event, ...formData });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{event ? "Edit Event" : "Create Event"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Event name */}
          <div className="space-y-2">
            <Label>Event Name *</Label>
            <Input
              placeholder="e.g., Spring Break, Catering Event"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              onBlur={() => setTouched({ ...touched, name: true })}
              className={touched.name && !formData.name.trim() ? "border-red-500" : ""}
            />
            {touched.name && !formData.name.trim() && (
              <p className="text-xs text-red-500">Event name is required</p>
            )}
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {EVENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: formData.color === color ? "#000" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          {/* All day toggle */}
          <div className="flex items-center justify-between">
            <Label>All Day Event</Label>
            <Switch
              checked={formData.all_day}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, all_day: checked })
              }
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({ ...formData, start_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={(e) =>
                  setFormData({ ...formData, end_date: e.target.value })
                }
              />
            </div>
          </div>

          {/* Time inputs (if not all day) */}
          {!formData.all_day && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) =>
                    setFormData({ ...formData, start_time: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) =>
                    setFormData({ ...formData, end_time: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="Add notes about this event..."
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              className="h-24"
            />
          </div>

          <DialogFooter className="flex gap-2 justify-between">
            {event && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onDelete(event.id);
                  onClose();
                }}
              >
                Delete
              </Button>
            )}
            <Button type="submit" className="bg-purple-600 hover:bg-purple-700 ml-auto">
              {event ? "Update Event" : "Create Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}