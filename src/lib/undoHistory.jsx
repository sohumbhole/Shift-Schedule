import React, { createContext, useContext, useRef, useState } from "react";

const MAX_STACK = 20;

// Each entry shape:
// {
//   type: string            - e.g. 'MOVE_SHIFT', 'ADD_SHIFT', etc.
//   description: string     - human-readable label for the toast
//   page: 'dashboard' | 'employees'
//   weekStart: string|null  - 'YYYY-MM-DD' week to navigate to
//   dayDate: string|null    - 'YYYY-MM-DD' day to open in day view
//   backward: any           - data needed to undo
//   forward: any            - data needed to redo
// }

const UndoHistoryContext = createContext(null);

export function UndoHistoryProvider({ children }) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [, forceRender] = useState(0);
  const tick = () => forceRender((n) => n + 1);

  const push = (entry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
    redoStack.current = []; // new action always clears the redo stack
    tick();
  };

  // Returns the entry (now on redoStack) so the caller can mutate its IDs after execution
  const undo = () => {
    if (undoStack.current.length === 0) return null;
    const entry = undoStack.current.pop();
    redoStack.current.push(entry);
    tick();
    return entry;
  };

  // Returns the entry (now on undoStack) so the caller can mutate its IDs after execution
  const redo = () => {
    if (redoStack.current.length === 0) return null;
    const entry = redoStack.current.pop();
    undoStack.current.push(entry);
    tick();
    return entry;
  };

  return (
    <UndoHistoryContext.Provider value={{
      push,
      undo,
      redo,
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
    }}>
      {children}
    </UndoHistoryContext.Provider>
  );
}

export function useUndoHistory() {
  return useContext(UndoHistoryContext);
}
