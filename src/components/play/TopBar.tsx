/**
 * TopBar — Desktop top navigation
 * LOCKED PROPS: credits, onFeedbackClick, userInitials
 */

import { Coins, MessageSquare, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoIcon from '@/assets/mediaforge-icon.png';

export interface TopBarProps {
  credits: number;
  onFeedbackClick?: () => void;
  userInitials?: string;
}

export function TopBar({ credits, onFeedbackClick, userInitials = 'TA' }: TopBarProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/app/home');
  };

  return (
    <header className="fixed top-3 left-3 right-3 h-9 z-40 flex items-center px-3 bg-transparent border-b border-white/[0.06]">
      {/* Back button */}
      <button
        onClick={handleBack}
        aria-label="Back"
        className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[hsl(var(--text-2))] bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-foreground transition"
      >
        <ArrowLeft size={13} />
      </button>

      <div className="w-2" />

      {/* Logo (icon only) */}
      <img src={logoIcon} alt="MediaForge" className="h-5 w-auto select-none" draggable={false} />

      <div className="flex-1" />

      <button
        onClick={onFeedbackClick}
        className="h-7 px-2.5 rounded-[8px] flex items-center gap-1.5 text-[11px] font-semibold text-[hsl(var(--text-2))] bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition"
      >
        <MessageSquare size={11} />
        Feedback
      </button>

      <div className="w-2" />

      <div className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[10.5px] font-bold text-white bg-gradient-to-br from-[#c15173] to-[#a855f7]">
        {userInitials}
      </div>
    </header>
  );
}
