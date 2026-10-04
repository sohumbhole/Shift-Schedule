import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

// Keeps the open website in step with changes made through the API (for example by Muse while
// this tab sits in the background). While the tab is visible it asks /api/v1/changes/latest every
// 30 seconds (a tiny request) and refetches the schedule only when something new appeared. It also
// checks right away whenever the tab becomes visible again.
const DATA_KEYS = ["shifts", "timeOffs", "events", "employees", "storeSettings", "apiChanges"];
const INTERVAL_MS = 30000;

export function useLiveRefresh() {
  const queryClient = useQueryClient();
  const lastSeen = useRef(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    let stopped = false;

    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const env = await apiFetch("changes/latest");
        const id = env?.data?.latest_change_id ?? null;
        if (lastSeen.current !== undefined && id !== lastSeen.current) {
          for (const key of DATA_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
        }
        lastSeen.current = id;
      } catch {
        // Offline or signed out: try again on the next tick.
      }
    };

    check();
    const timer = setInterval(check, INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient]);
}
