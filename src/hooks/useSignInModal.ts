import { useCallback } from "react";
import { useLocation } from "react-router-dom";

import { useAuthModal } from "@/contexts/AuthModalContext";

export function useSignInModal() {
  const location = useLocation();
  const { openAuthModal } = useAuthModal();

  return useCallback(() => {
    openAuthModal({
      redirectPath: `${location.pathname}${location.search}${location.hash}`,
    });
  }, [location.hash, location.pathname, location.search, openAuthModal]);
}
