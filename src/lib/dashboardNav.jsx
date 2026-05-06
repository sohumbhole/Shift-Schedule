import React, { createContext, useContext, useRef } from "react";

// Lightweight context that lets the undo/redo system tell the Dashboard
// which week/day to navigate to without lifting all of Dashboard's state.
// Dashboard registers a callback on mount; the undo hook calls it.

const DashboardNavContext = createContext(null);

export function DashboardNavProvider({ children }) {
  const callbackRef = useRef(null);
  const getterRef = useRef(null);

  // Dashboard calls register(navigateCb, getStateCb) on mount.
  // navigateCb(weekDate, dayDate) - jumps to week/day
  // getStateCb() - returns { isDayView: bool } so the undo system can
  // preserve the current view instead of forcing a view switch.
  const register = (navigateCb, getStateCb) => {
    callbackRef.current = navigateCb;
    getterRef.current = getStateCb ?? null;
  };
  const navigateTo = (weekDate, dayDate) => {
    if (callbackRef.current) callbackRef.current(weekDate, dayDate);
  };
  const getViewState = () => (getterRef.current ? getterRef.current() : null);

  return (
    <DashboardNavContext.Provider value={{ register, navigateTo, getViewState }}>
      {children}
    </DashboardNavContext.Provider>
  );
}

export function useDashboardNav() {
  return useContext(DashboardNavContext);
}
