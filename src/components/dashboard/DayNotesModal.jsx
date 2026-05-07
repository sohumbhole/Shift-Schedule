import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/api";
import { format } from "date-fns";

const MAX_CHARS = 2000;

export default function DayNotesModal({ open, onClose, weekStart }) {
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  // yyyy-MM-dd string used as the key inside metadata.week_notes
  const weekKey = weekStart ? format(weekStart, "yyyy-MM-dd") : null;

  // Shares the same React Query cache as Dashboard - no extra network call
  const { data: storeSettings = [] } = useQuery({
    queryKey: ["storeSettings"],
    queryFn: () => api.entities.StoreSettings.list(),
  });
  const settings = storeSettings[0] || null;

  // Populate textarea with existing note each time the modal opens
  useEffect(() => {
    if (open && weekKey) {
      const existing = settings?.metadata?.week_notes?.[weekKey] || "";
      setNotes(existing);
    }
  }, [open, weekKey, settings]);

  const saveMutation = useMutation({
    mutationFn: async (noteText) => {
      const currentMeta = settings?.metadata || {};
      const newMeta = {
        ...currentMeta,
        week_notes: {
          ...(currentMeta.week_notes || {}),
          [weekKey]: noteText,
        },
      };
      if (settings) {
        await api.entities.StoreSettings.update(settings.id, { metadata: newMeta });
      } else {
        await api.entities.StoreSettings.create({ metadata: newMeta });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!settings || !weekKey) return;
      const currentMeta = settings.metadata || {};
      const weekNotes = { ...(currentMeta.week_notes || {}) };
      delete weekNotes[weekKey];
      const newMeta = { ...currentMeta, week_notes: weekNotes };
      await api.entities.StoreSettings.update(settings.id, { metadata: newMeta });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
      setNotes("");
      onClose();
    },
  });

  const handleChange = (e) => {
    setNotes(e.target.value.slice(0, MAX_CHARS));
  };

  const isSaving = saveMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const isBusy = isSaving || isDeleting;
  const atLimit = notes.length >= MAX_CHARS;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg flex flex-col h-[68vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Notes for the week</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 gap-2">
          <Label className="shrink-0">Notes</Label>
          <div className="relative flex-1 min-h-0">
            <Textarea
              value={notes}
              onChange={handleChange}
              placeholder="Add notes for this week..."
              className="h-full resize-none pb-7"
              disabled={isBusy}
            />
            <span
              className={`absolute bottom-3 right-3 text-xs pointer-events-none select-none transition-colors ${
                atLimit ? "text-red-500 font-medium" : "text-gray-300"
              }`}
            >
              {notes.length} / {MAX_CHARS}
            </span>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteMutation.mutate()}
            disabled={isBusy}
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate(notes)}
              disabled={isBusy}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
