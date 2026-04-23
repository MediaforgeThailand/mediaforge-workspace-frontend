import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface AuditLogEntry {
  action: string;
  target_table: string;
  target_user_id?: string;
  details?: Record<string, any>;
}

export const useAdminAuditLog = () => {
  const { user } = useAuth();

  const logAction = useCallback(
    async ({ action, target_table, target_user_id, details }: AuditLogEntry) => {
      if (!user) return;
      try {
        await supabase.from("admin_audit_logs" as any).insert({
          admin_user_id: user.id,
          action,
          target_table,
          target_user_id: target_user_id || null,
          details: details || {},
        } as any);
      } catch (err) {
        console.error("[AuditLog] Failed to log action:", err);
      }
    },
    [user]
  );

  return { logAction };
};
