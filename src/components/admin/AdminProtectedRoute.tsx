import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import PageLoadingAnim from "@/components/ui/PageLoadingAnim";

export default function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAdminAuth();

  if (loading) {
    return <PageLoadingAnim />;
  }

  if (!admin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
