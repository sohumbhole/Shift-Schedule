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

  // After a failed undo: put the entry back on top of the undo stack.
  // The failed entry is on top of redoStack (put there by undo()).
  // Moving it back means the next Ctrl+Z retries the same operation - the user
  // cannot skip past the failed step and undo earlier entries out of order,
  // which would leave the server in an inconsistent state.
  // If the failure was transient (network blip, etc.) the retry will succeed.
  const rollbackUndo = () => {
    if (redoStack.current.length === 0) return;
    const entry = redoStack.current.pop();
    undoStack.current.push(entry);
    tick();
  };

  // After a failed redo: put the entry back on top of the redo stack.
  // Same principle - Ctrl+Shift+Z keeps retrying the same step instead of
  // skipping ahead to a later one.
  const rollbackRedo = () => {
    if (undoStack.current.length === 0) return;
    const entry = undoStack.current.pop();
    redoStack.current.push(entry);
    tick();
  };

  // When a DELETE undo (or ADD redo) recreates a row and gets a new UUID from
  // the DB, every earlier entry that referenced the old UUID needs updating.
  // Does a shallow scan of each entry's backward/forward objects.
  const patchId = (oldId, newId) => {
    if (!oldId || !newId || oldId === newId) return;
    const patchObj = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const key of Object.keys(obj)) {
        if (obj[key] === oldId) obj[key] = newId;
      }
    };
    [...undoStack.current, ...redoStack.current].forEach((e) => {
      patchObj(e.backward);
      patchObj(e.forward);
    });
    // No tick() needed - this is pure data mutation, canUndo/canRedo are unchanged
  };

  return (
    <UndoHistoryContext.Provider value={{
      push,
      undo,
      redo,
      rollbackUndo,
      rollbackRedo,
      patchId,
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
