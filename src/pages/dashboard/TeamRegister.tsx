import { useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import useDocumentTitle from "@/hooks/useDocumentTitle";

const ADMIN_CONSOLE_URL =
  (import.meta.env.VITE_ADMIN_CONSOLE_URL as string | undefined) ||
  "https://mediaforge-admin-hub.vercel.app/org/console";
const TEAM_SEAT_PRICE_USD = 10;
const TEAM_SEAT_PRICE_THB = 290;

export default function TeamRegister() {
  useDocumentTitle("Team registration - MediaForge");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState(() => user?.email?.split("@")[1] ?? "");
  const [seats, setSeats] = useState("5");

  return (
    <div className="min-h-full bg-[hsl(0_0%_5%)] text-zinc-100">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <Button variant="ghost" className="mb-6 text-zinc-400" onClick={() => navigate("/app/settings?tab=team")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to settings
        </Button>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl bg-white/[0.05] p-6">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200">
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold">Create a Team workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              {`Team is for companies that want member approvals, shared credit pools, per-team budgets, and a company Admin Console. Seat billing is $${TEAM_SEAT_PRICE_USD} or THB ${TEAM_SEAT_PRICE_THB} per active member. Credits are top-up based on actual usage.`}
            </p>

            <div className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <Label>Company name</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="CMO Group" className="bg-black/30 border-white/10" />
              </div>
              <div className="grid gap-2">
                <Label>Company domain</Label>
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com" className="bg-black/30 border-white/10" />
              </div>
              <div className="grid gap-2">
                <Label>Estimated seats</Label>
                <Input value={seats} onChange={(e) => setSeats(e.target.value)} inputMode="numeric" className="bg-black/30 border-white/10" />
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-black/30 p-4">
              <div className="text-xs uppercase tracking-[0.12em] text-zinc-500">Next step</div>
              <p className="mt-1 text-sm text-zinc-300">
                The Admin Console handles real member approval and billing. This registration screen is the user-facing entry point; domain verification and payment wiring attach here next.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <a href={ADMIN_CONSOLE_URL}>Open Admin Console</a>
              </Button>
              <Button variant="outline" onClick={() => navigate("/app/settings?tab=team")}>
                Review team status
              </Button>
            </div>
          </section>

          <aside className="space-y-3">
            <Feature icon={<ShieldCheck className="h-4 w-4" />} title="Admin approval" body="Same-domain users create pending requests until an admin approves them." />
            <Feature icon={<Users className="h-4 w-4" />} title={`$${TEAM_SEAT_PRICE_USD} / THB ${TEAM_SEAT_PRICE_THB} seats`} body="Only active approved members count toward seat billing." />
            <Feature icon={<CheckCircle2 className="h-4 w-4" />} title="Team credit pools" body="Company credits stay central, then admins allocate budgets into teams." />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-white/[0.05] p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-200">{icon}</div>
      <div className="text-sm font-medium text-zinc-100">{title}</div>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{body}</p>
    </div>
  );
}
