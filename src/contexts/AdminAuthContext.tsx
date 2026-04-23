import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { AdminAccount, AdminJWTPayload } from "@/types/admin";

interface AdminAuthContextType {
  admin: AdminAccount | null;
  loading: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  adminFetch: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

function parseAdminToken(token: string): AdminJWTPayload | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.type !== "admin" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_token");
    if (stored) {
      const payload = parseAdminToken(stored);
      if (payload) {
        setAdmin({ id: payload.sub, email: payload.email, admin_role: payload.role, display_name: payload.display_name });
      } else {
        sessionStorage.removeItem("admin_token");
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    sessionStorage.setItem("admin_token", data.token);
    setAdmin(data.admin);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("admin_token");
    setAdmin(null);
  }, []);

  const adminFetch = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...params }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, token: sessionStorage.getItem("admin_token"), login, logout, adminFetch }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
