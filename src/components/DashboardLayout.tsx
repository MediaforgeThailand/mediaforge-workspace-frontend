import { useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Outlet } from "react-router-dom";
import InteractiveBackground from "@/components/InteractiveBackground";
import PageTransition from "@/components/PageTransition";
import OnboardingWizard from "@/components/OnboardingWizard";
import DashboardSidebar from "@/components/home/DashboardSidebar";
import MobileBottomNav from "@/components/home/MobileBottomNav";
import { useAuth } from "@/contexts/AuthContext";

const DashboardLayout = () => {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#020403' }}>
      <div className="fixed inset-0 -z-10">
        <InteractiveBackground />
      </div>

      <DashboardSidebar />
      <MobileBottomNav />

      {/* ─── Main Content — full height, offset for sidebar ─── */}
      <main className="md:ml-[96px] px-3 md:px-6 lg:px-8 pt-8 pb-24 md:pb-12 overflow-auto relative z-10 min-h-screen">
        {/* Survey disabled temporarily */}
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default DashboardLayout;
