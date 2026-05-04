import { createContext, lazy, ReactNode, Suspense, useCallback, useContext, useMemo, useState } from "react";

const AuthModal = lazy(() => import("@/pages/Auth"));

type OpenAuthModalOptions = {
  redirectPath?: string | null;
};

type AuthModalContextValue = {
  openAuthModal: (options?: OpenAuthModalOptions) => void;
  closeAuthModal: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<OpenAuthModalOptions | null>(null);

  const closeAuthModal = useCallback(() => {
    setOptions(null);
  }, []);

  const openAuthModal = useCallback((nextOptions?: OpenAuthModalOptions) => {
    setOptions(nextOptions ?? {});
  }, []);

  const value = useMemo(
    () => ({ openAuthModal, closeAuthModal }),
    [closeAuthModal, openAuthModal],
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      {options && (
        <Suspense fallback={null}>
          <AuthModal
            mode="modal"
            redirectPath={options.redirectPath}
            onClose={closeAuthModal}
          />
        </Suspense>
      )}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) {
    return {
      openAuthModal: () => {},
      closeAuthModal: () => {},
    };
  }
  return context;
}
