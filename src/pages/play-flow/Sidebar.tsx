import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Home, Search, Clock, Workflow, CreditCard, Settings } from "lucide-react";

export default function Sidebar() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const sidebarItems = [
    { icon: Home, label: t("pfHome"), route: "/app/home" },
    { icon: Search, label: t("pfExplore"), route: "/app/home" },
    { icon: Clock, label: t("pfHistory"), route: "/app/history" },
    { icon: Workflow, label: t("pfFlowStudio"), route: "/app/flow-studio" },
  ];
  const bottomItems = [
    { icon: CreditCard, label: t("pfCreditsNav"), route: "/app/pricing" },
    { icon: Settings, label: t("pfSettings"), route: "/app/settings" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-11 bg-[#060e20] border-r border-white/5 flex-col items-center py-4 gap-5 z-20">
        <div className="flex flex-col items-center gap-4">
          {sidebarItems.map((item) => (
            <Tooltip key={item.route}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(item.route)}
                  className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-[#1a1c2e] transition-colors"
                >
                  <item.icon className="w-[14px] h-[14px] text-[#c7c5cd]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#1a1c2e] border-white/10 text-[#dae2fd] text-[10px]">
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex flex-col items-center gap-4">
          {bottomItems.map((item) => (
            <Tooltip key={item.route}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(item.route)}
                  className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-[#1a1c2e] transition-colors"
                >
                  <item.icon className="w-[14px] h-[14px] text-[#c7c5cd]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#1a1c2e] border-white/10 text-[#dae2fd] text-[10px]">
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </aside>
    </TooltipProvider>
  );
}
