import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook that gates an action behind authentication.
 * Usage:
 *   const { requireLogin, LoginDialog } = useLoginRequired();
 *   <Button onClick={() => requireLogin(() => doGenerate())}>Generate</Button>
 *   {LoginDialog}
 */
export const useLoginRequired = () => {
  const { user } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requireLogin = useCallback(
    (action: () => void) => {
      if (user) {
        action();
      } else {
        setPendingAction(() => action);
        setShowLogin(true);
      }
    },
    [user]
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      setShowLogin(open);
      if (!open) setPendingAction(null);
    },
    []
  );

  return {
    requireLogin,
    showLogin,
    onOpenChange,
    isGuest: !user,
  };
};
