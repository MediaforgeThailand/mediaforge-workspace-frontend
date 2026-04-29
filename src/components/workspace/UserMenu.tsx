/**
 * Top-right user menu — avatar dropdown for the workspace surfaces.
 *
 * The slim workspace sidebar (Home / Spaces / Community / Projects /
 * All tools / Stock) intentionally doesn't expose account links;
 * those live here in the header instead, the same shape Magnific
 * and Figma use.
 *
 * Items:
 *   • Account label (email + display name) — non-interactive
 *   • Upgrade        → /app/pricing (prominent CTA button)
 *   • Settings       → /app/settings
 *   • Plan & billing → /app/pricing
 *   • Theme          → toggle the ThemeProvider value
 *   • Sign out       → AuthContext.signOut() then bounce to /auth
 *
 * Designed as a drop-in for any PageHeader rightSlot. It owns its
 * own state (the dropdown open/close); the parent only needs to
 * mount it where the avatar should sit.
 */

import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  LogOut,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "next-themes";

export function UserMenu() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const initial =
    (profile?.display_name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-inset ring-white/[0.08] transition-all hover:ring-white/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40 lg:h-8 lg:w-8"
        aria-label="Account menu"
      >
        <Avatar className="h-10 w-10 lg:h-8 lg:w-8">
          <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-gradient-to-br from-fuchsia-500/40 to-violet-600/40 text-[11px] font-semibold text-white">
            {initial}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-60 border-white/[0.08] bg-[hsl(0_0%_8%)] text-zinc-200"
      >
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-gradient-to-br from-fuchsia-500/40 to-violet-600/40 text-[12px] font-semibold text-white">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-zinc-100">
              {profile?.display_name || "Member"}
            </div>
            <div className="truncate text-[11px] text-zinc-500">
              {user?.email}
            </div>
          </div>
        </DropdownMenuLabel>

        {/* Prominent Upgrade CTA — sits between the account header
         *  and the menu list. Mirrors the reference profile layout
         *  (big purple button + quieter "Plan & billing" row below).
         *  TODO: hide this when the user is on the highest tier (Pro)
         *  once subscription state is reliably populated; for now we
         *  always show it. */}
        <div className="px-2 py-2">
          <button
            type="button"
            onClick={() => navigate("/app/pricing")}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-violet-600 px-3 text-[12.5px] font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 lg:min-h-0 lg:py-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade
          </button>
        </div>

        <DropdownMenuSeparator className="bg-white/[0.06]" />

        {/* Account links. Settings stays on top; Plan & billing
         *  duplicates the Upgrade CTA's destination but follows the
         *  reference layout (loud CTA + quiet row). */}
        <DropdownMenuItem
          onSelect={() => navigate("/app/settings")}
          className="min-h-11 cursor-pointer gap-2 text-[12.5px] focus:bg-white/[0.06] focus:text-zinc-50 lg:min-h-0"
        >
          <SettingsIcon className="h-3.5 w-3.5 text-zinc-400" />
          Settings
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => navigate("/app/pricing")}
          className="min-h-11 cursor-pointer gap-2 text-[12.5px] focus:bg-white/[0.06] focus:text-zinc-50 lg:min-h-0"
        >
          <CreditCard className="h-3.5 w-3.5 text-zinc-400" />
          Plan &amp; billing
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-white/[0.06]" />

        {/* Theme toggle stays inside the menu so the workspace
         *  surfaces don't need their own theme button anywhere
         *  else. The icon flips to mirror the next state. */}
        <DropdownMenuItem
          onSelect={(e) => {
            // Don't auto-close the menu on theme toggle so the user
            // can preview both states without re-opening — Radix
            // closes by default; preventDefault keeps it open.
            e.preventDefault();
            setTheme(theme === "dark" ? "light" : "dark");
          }}
          className="min-h-11 cursor-pointer gap-2 text-[12.5px] focus:bg-white/[0.06] focus:text-zinc-50 lg:min-h-0"
        >
          {theme === "dark" ? (
            <Sun className="h-3.5 w-3.5 text-zinc-400" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-zinc-400" />
          )}
          Switch to {theme === "dark" ? "light" : "dark"}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-white/[0.06]" />

        <DropdownMenuItem
          onSelect={handleSignOut}
          className="min-h-11 cursor-pointer gap-2 text-[12.5px] text-red-300 focus:bg-red-500/10 focus:text-red-200 lg:min-h-0"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
