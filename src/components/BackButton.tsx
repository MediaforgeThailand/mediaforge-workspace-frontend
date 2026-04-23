import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  fallback?: string;
  label?: string;
}

const BackButton = ({ fallback = "/app/home", label = "Back" }: BackButtonProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className="gap-1 text-slate-400 hover:text-white hover:bg-white/[0.04] -ml-2 mb-4"
    >
      <ChevronLeft className="w-4 h-4" />
      {label}
    </Button>
  );
};

export default BackButton;
