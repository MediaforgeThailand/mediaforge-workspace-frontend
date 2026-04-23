import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface CreatorRouteProps {
  children: React.ReactNode;
}

const CreatorRoute = ({ children }: CreatorRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setChecking(false);
      setAllowed(false);
      return;
    }
    (async () => {
      const [{ data: isCreator }, { data: isAdmin }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: user.id, _role: "creator" as any }),
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" as any }),
      ]);
      if (!cancelled) {
        setAllowed(!!isCreator || !!isAdmin);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!allowed) {
    return <Navigate to="/app/home" replace />;
  }

  return <>{children}</>;
};

export default CreatorRoute;
