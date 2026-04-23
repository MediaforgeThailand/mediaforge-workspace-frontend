 import { Navigate, useLocation } from "react-router-dom";
 import { useAuth } from "@/contexts/AuthContext";
 import PageLoadingAnim from "@/components/ui/PageLoadingAnim";

 interface ProtectedRouteProps {
   children: React.ReactNode;
 }

 const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
   const { user, loading } = useAuth();
   const location = useLocation();

   if (loading) {
     return <PageLoadingAnim label="Loading..." />;
   }
 
   if (!user) {
     return <Navigate to="/auth" state={{ from: location }} replace />;
   }
 
   return <>{children}</>;
 };
 
 export default ProtectedRoute;