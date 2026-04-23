import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "mf-session-id";

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/**
 * Tracks this user's presence on a shared Realtime channel.
 * Call once at the app root level.
 */
export function usePresenceTracker() {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const sessionId = getSessionId();

    const channel = supabase.channel("online-users", {
      config: { presence: { key: sessionId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        // no-op, just keep alive
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            session_id: sessionId,
            online_at: new Date().toISOString(),
            page: window.location.pathname,
          });
        }
      });

    channelRef.current = channel;

    // Update page on navigation
    const updatePage = () => {
      if (channelRef.current) {
        channelRef.current.track({
          session_id: sessionId,
          online_at: new Date().toISOString(),
          page: window.location.pathname,
        });
      }
    };

    // Listen to popstate for SPA navigation
    window.addEventListener("popstate", updatePage);

    return () => {
      window.removeEventListener("popstate", updatePage);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);
}

/**
 * Subscribe to the online-users presence channel and return count + state.
 * Use in Admin Dashboard only.
 */
import { useState } from "react";

export function useOnlineCount() {
  const [count, setCount] = useState(0);
  const [presenceState, setPresenceState] = useState<Record<string, any[]>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase.channel("online-users");

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPresenceState(state);
        setCount(Object.keys(state).length);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return { count, presenceState };
}
