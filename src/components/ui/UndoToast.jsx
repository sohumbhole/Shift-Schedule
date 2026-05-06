import React, { useEffect, useState } from "react";
import { Undo2, Redo2 } from "lucide-react";

// Floating toast shown after each undo/redo action.
// The parent gives it a unique `toastKey` to force a remount (and restart the
// fade-in/auto-dismiss timer) whenever a new action fires.
export default function UndoToast({ message, isRedo, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    // Small delay so the CSS transition is visible
    const show = setTimeout(() => setVisible(true), 10);
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 3000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [message, onDismiss]);

  if (!message) return null;

  const Icon = isRedo ? Redo2 : Undo2;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl pointer-events-none transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <Icon className="w-4 h-4 text-orange-400 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
