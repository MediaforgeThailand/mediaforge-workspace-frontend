/**
 * OrgAdminPanel — workspace-side admin view for teachers (primary or co)
 * and org admins. Two views in one page, picked by URL state:
 *   - Class list (default): every class the user can manage
 *   - Class detail (when ?class=:id): pool, members, QR codes, requests, allocate
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTeachingClasses, useIsClassTeacher, useUserClassMemberships } from "@/hooks/useIsOrgUser";
import {
  consumerOrgAdminApi,
  type ClassRow,
  type ClassMember,
  type ClassEnrollmentCode,
  type ClassStudentSpace,
} from "@/lib/orgAdminApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Loader2, ArrowLeft, Coins, Users, RefreshCw, Plus, Minus, Crown,
  QrCode, Trash2, Copy, BookOpen, ClipboardList, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

export default function OrgAdminPanel() {
  const { user, profile } = useAuth();
  const isTeacher = useIsClassTeacher();
  const teaching = useTeachingClasses();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedClassId = params.get("class");
  const orgId = ((profile as any)?.organization_id ?? profile?.org_id ?? null) as string | null;

  if (!user) return <Navigate to="/auth" replace />;
  if (!orgId) return <Navigate to="/app/workspace" replace />;
  if (!isTeacher) return <Navigate to="/app/workspace" replace />;

  if (selectedClassId) {
    return (
      <ClassDetail
        classId={selectedClassId}
        onBack={() => setParams({})}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/workspace")} className="-ml-2 mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Workspace
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Crown className="h-7 w-7 text-primary" />
            My Classes
          </h1>
          <p className="text-sm text-muted-foreground">Classes you teach. Click one to manage.</p>
        </div>
        <CreateClassButton orgId={orgId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teaching</CardTitle>
          <CardDescription>{teaching.length} class{teaching.length === 1 ? "" : "es"}</CardDescription>
        </CardHeader>
        <CardContent>
          {teaching.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              You aren't listed as a teacher on any class yet. Click <span className="font-semibold">Create class</span> to start one.
            </p>
          ) : (
            <ul className="divide-y">
              {teaching.map((c) => (
                <li key={c.class_id}>
                  <button
                    onClick={() => setParams({ class: c.class_id })}
                    className="w-full flex items-center justify-between py-3 px-2 hover:bg-muted/40 rounded text-left"
                  >
                    <div>
                      <div className="font-semibold">{c.class_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.class_code} · {c.role}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Create class dialog ────────────────────────────────────────────────────

function CreateClassButton({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [term, setTerm] = useState("1");
  const [year, setYear] = useState(String(new Date().getFullYear() + 543)); // พ.ศ.
  const [maxStudents, setMaxStudents] = useState("42");
  const [policy, setPolicy] = useState<"manual" | "monthly_reset" | "weekly_drip">("manual");
  const [creditAmount, setCreditAmount] = useState("200");

  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { user } = useAuth();
  const usesRecurringCredits = policy !== "manual";

  const create = useMutation({
    mutationFn: () => consumerOrgAdminApi.createClass(orgId, {
      name: name.trim(),
      term,
      year: parseInt(year, 10) || null as any,
      max_students: parseInt(maxStudents, 10) || null as any,
      credit_policy: policy,
      credit_amount: usesRecurringCredits ? parseInt(creditAmount, 10) || 0 : 0,
      primary_instructor_id: user?.id ?? null,
    } as any),
    onSuccess: ({ class: cls }) => {
      toast.success(`Class "${cls.name}" created (${cls.code})`);
      setOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["mf-um-class-memberships"] });
      // Jump straight into the new class detail
      setParams({ class: cls.id });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create"),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" /> Create class
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a new class</DialogTitle>
            <DialogDescription>
              You'll be set as the primary instructor. Add co-teachers, allocate credit budget, and generate enrolment QRs from the class detail page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Class name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Digital Media" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Term</Label>
                <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="1" />
              </div>
              <div>
                <Label>Year (พ.ศ.)</Label>
                <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2569" />
              </div>
            </div>
            <div>
              <Label>Max students</Label>
              <Input type="number" value={maxStudents} onChange={(e) => setMaxStudents(e.target.value)} />
            </div>
            <div className={usesRecurringCredits ? "grid grid-cols-2 gap-3" : "space-y-3"}>
              <div>
                <Label>Credit policy</Label>
                <select
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  <option value="monthly_reset">Monthly Reset (resets each month)</option>
                  <option value="weekly_drip">Weekly Drip (top up each week)</option>
                  <option value="manual">Manual (teacher grants only)</option>
                </select>
              </div>
              {usesRecurringCredits && (
                <div>
                  <Label>{policy === "monthly_reset" ? "Monthly credits" : "Weekly credits"}</Label>
                  <Input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Class Detail ──────────────────────────────────────────────────────────

function ClassDetail({ classId, onBack }: { classId: string; onBack: () => void }) {
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["class-detail", classId],
    queryFn: () => consumerOrgAdminApi.getClass(classId),
  });
  const members = useQuery({
    queryKey: ["class-members", classId],
    queryFn: () => consumerOrgAdminApi.listClassMembers(classId),
  });
  const codes = useQuery({
    queryKey: ["class-codes", classId],
    queryFn: () => consumerOrgAdminApi.listCodes(classId),
  });
  const requests = useQuery({
    queryKey: ["class-requests", classId],
    queryFn: () => consumerOrgAdminApi.listCreditRequests(classId),
  });
  const spaces = useQuery({
    queryKey: ["class-spaces", classId],
    queryFn: () => consumerOrgAdminApi.listSpaces(classId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["class-detail", classId] });
    qc.invalidateQueries({ queryKey: ["class-members", classId] });
    qc.invalidateQueries({ queryKey: ["class-codes", classId] });
    qc.invalidateQueries({ queryKey: ["class-requests", classId] });
    qc.invalidateQueries({ queryKey: ["class-spaces", classId] });
  };

  if (detail.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!detail.data) return <Navigate to="/app/org-admin" replace />;

  const c = detail.data.class;
  const remaining = detail.data.credit_pool_remaining;
  const pendingCount = detail.data.pending_credit_requests;

  return (
    <div className="min-h-screen bg-background p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" /> All Classes
          </Button>
          <h1 className="text-3xl font-bold">{c.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {c.code}{c.term ? ` · Term ${c.term}/${c.year ?? ""}` : ""}
            {" · "}{c.credit_policy} ({c.credit_amount}/cycle)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Pool summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard label="Class pool" value={c.credit_pool} sub="Allocated by super admin" />
        <SummaryCard label="Consumed" value={c.credit_pool_consumed} sub="By workspace runs" />
        <SummaryCard label="Remaining" value={remaining} highlight sub="Available to grant" />
        <SummaryCard label="Members" value={detail.data.active_member_count} icon={<Users className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="codes">QR Codes</TabsTrigger>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="requests">
            Requests {pendingCount > 0 && <Badge className="ml-1.5">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <MembersPanel
            classId={classId}
            members={members.data?.members ?? []}
            isLoading={members.isLoading}
            spaces={spaces.data?.spaces ?? members.data?.members.flatMap((member) => member.spaces ?? []) ?? []}
            poolRemaining={remaining}
            onChange={refresh}
          />
        </TabsContent>

        <TabsContent value="codes" className="mt-4">
          <CodesPanel
            classId={classId}
            codes={codes.data?.codes ?? []}
            isLoading={codes.isLoading}
            onChange={refresh}
          />
        </TabsContent>

        <TabsContent value="teachers" className="mt-4">
          <TeachersPanel
            classId={classId}
            primaryInstructorId={c.primary_instructor_id}
            teachers={detail.data.teachers}
            onChange={refresh}
          />
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <RequestsPanel
            classId={classId}
            requests={requests.data?.requests ?? []}
            isLoading={requests.isLoading}
            onChange={refresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  label, value, sub, highlight, icon,
}: { label: string; value: number; sub?: string; highlight?: boolean; icon?: React.ReactNode }) {
  return (
    <Card className={highlight ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground tracking-wide">
          {icon ?? <Coins className="h-4 w-4" />} {label}
        </div>
        <div className="text-2xl font-bold mt-1 font-mono">{value.toLocaleString()}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Members panel ──────────────────────────────────────────────────────────

function MembersPanel({
  classId, members, isLoading, spaces, poolRemaining, onChange,
}: {
  classId: string; members: ClassMember[]; isLoading: boolean;
  spaces: ClassStudentSpace[];
  poolRemaining: number; onChange: () => void;
}) {
  const [grantTarget, setGrantTarget] = useState<ClassMember | null>(null);
  const spacesByUser = useMemo(() => {
    const map = new Map<string, ClassStudentSpace[]>();
    for (const space of spaces) {
      const list = map.get(space.user_id) ?? [];
      list.push(space);
      map.set(space.user_id, list);
    }
    return map;
  }, [spaces]);

  if (isLoading) {
    return <div className="py-10 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (members.length === 0) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
      No members yet. Generate a QR code in the next tab and let students scan.
    </CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground bg-muted/30">
            <tr>
              <th className="py-2 px-3">Member</th>
              <th className="py-2 px-3">Student ID</th>
              <th className="py-2 px-3 text-right">Space balance</th>
              <th className="py-2 px-3 text-right">Used</th>
              <th className="py-2 px-3 text-right">Runs (30d)</th>
              <th className="py-2 px-3">Last active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const userSpaces = spacesByUser.get(m.user_id) ?? m.spaces ?? [];
              const primarySpace = userSpaces.find((space) => space.status === "active" || space.status === "submitted")
                ?? userSpaces[0]
                ?? null;
              const lastActivity = primarySpace?.last_activity_at ?? m.last_activity_at;
              return (
              <tr key={m.id} className="border-t hover:bg-muted/30">
                <td className="py-2 px-3">
                  <div className="font-medium">{m.display_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{m.email ?? "—"}</div>
                </td>
                <td className="py-2 px-3 font-mono text-xs">{m.student_code ?? "—"}</td>
                <td className="py-2 px-3 text-right font-mono">
                  {(primarySpace?.credits_balance ?? m.credits_balance).toLocaleString()}
                  {primarySpace && <div className="text-[11px] font-normal text-muted-foreground">{primarySpace.status}</div>}
                </td>
                <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                  {(primarySpace?.credits_lifetime_used ?? m.credits_lifetime_used).toLocaleString()}
                </td>
                <td className="py-2 px-3 text-right">{primarySpace?.generation_count_30d ?? m.model_uses_30d}</td>
                <td className="py-2 px-3 text-xs text-muted-foreground">
                  {lastActivity ? new Date(lastActivity).toLocaleString() : "—"}
                </td>
                <td className="py-2 px-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setGrantTarget(m)}>
                    <Coins className="h-4 w-4 mr-1" /> Space credits
                  </Button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
      <GrantDialog
        target={grantTarget}
        classId={classId}
        spaces={grantTarget ? spacesByUser.get(grantTarget.user_id) ?? grantTarget.spaces ?? [] : []}
        poolRemaining={poolRemaining}
        onClose={() => setGrantTarget(null)}
        onDone={() => { setGrantTarget(null); onChange(); }}
      />
    </Card>
  );
}

function GrantDialog({
  target, classId, spaces, poolRemaining, onClose, onDone,
}: {
  target: ClassMember | null;
  classId: string;
  spaces: ClassStudentSpace[];
  poolRemaining: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"grant" | "revoke">("grant");
  const [reason, setReason] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  useEffect(() => {
    setSelectedSpaceId((current) =>
      current && spaces.some((space) => space.workspace_id === current)
        ? current
        : spaces.find((space) => space.status === "active" || space.status === "submitted")?.workspace_id ?? spaces[0]?.workspace_id ?? "",
    );
  }, [spaces, target?.user_id]);
  const mut = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("no target");
      const n = parseInt(amount, 10);
      if (!Number.isFinite(n) || n === 0) throw new Error("Amount must be a positive integer");
      const signed = mode === "grant" ? n : -n;
      if (!selectedSpaceId) {
        if (mode === "revoke") throw new Error("No class space to revoke from yet.");
        return consumerOrgAdminApi.ensureStudentSpace(classId, target.user_id, n, reason || undefined);
      }
      return consumerOrgAdminApi.grantCredits(classId, target.user_id, selectedSpaceId, signed, reason || undefined);
    },
    onSuccess: (res) => {
      toast.success(
        mode === "grant"
          ? `Granted ${res.granted ?? amount} credits. New balance: ${res.new_balance}`
          : `Revoked ${res.revoked ?? amount} credits.`,
      );
      setAmount(""); setReason("");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!target) return null;
  const selectedSpace = spaces.find((space) => space.workspace_id === selectedSpaceId) ?? null;
  const numericAmount = parseInt(amount, 10);
  const tooMuch = mode === "grant" && Number.isFinite(numericAmount) && numericAmount > poolRemaining;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "grant" ? "Grant credits" : "Revoke credits"}</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{target.display_name ?? target.email}</span>
            {" — current space: "}<span className="font-mono">{(selectedSpace?.credits_balance ?? target.credits_balance).toLocaleString()}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {spaces.length > 0 ? (
            <div>
              <Label>Class space</Label>
              <select
                value={selectedSpaceId}
                onChange={(e) => setSelectedSpaceId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
              >
                {spaces.map((space) => (
                  <option key={space.workspace_id} value={space.workspace_id}>
                    {space.workspace_name ?? space.workspace_id} · {space.credits_balance.toLocaleString()} credits · {space.status}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              This student has no class space yet. The first grant will create one and lock the credits to that space.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant={mode === "grant" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMode("grant")}>
              <Plus className="h-3 w-3 mr-1" /> Grant
            </Button>
            <Button variant={mode === "revoke" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMode("revoke")}>
              <Minus className="h-3 w-3 mr-1" /> Revoke
            </Button>
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" />
            {tooMuch && <p className="text-xs text-destructive mt-1">Class pool only has {poolRemaining.toLocaleString()} credits remaining.</p>}
            {mode === "grant" && !tooMuch && (
              <p className="text-xs text-muted-foreground mt-1">Pool remaining: {poolRemaining.toLocaleString()}</p>
            )}
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="QR scan reward / make-up class / etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!amount || tooMuch || mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Codes panel ────────────────────────────────────────────────────────────

function CodesPanel({
  classId, codes, isLoading, onChange,
}: {
  classId: string; codes: ClassEnrollmentCode[]; isLoading: boolean; onChange: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [showQR, setShowQR] = useState<ClassEnrollmentCode | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => consumerOrgAdminApi.revokeCode(classId, id),
    onSuccess: () => { toast.success("Code revoked"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Enrolment QR codes</CardTitle>
          <CardDescription>
            Generate a code, project the QR for students to scan. Each student can scan one code per class only once.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Create QR</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="py-8 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        : codes.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No active codes.</p>
        : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr><th className="py-2">Code</th><th>Uses</th><th>Expires</th><th>Description</th><th></th></tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 font-mono">{c.code}</td>
                  <td>{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : " / ∞"}</td>
                  <td className="text-xs text-muted-foreground">
                    {c.expires_at ? new Date(c.expires_at).toLocaleString() : "—"}
                  </td>
                  <td className="text-xs text-muted-foreground">{c.description ?? "—"}</td>
                  <td className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => setShowQR(c)}><QrCode className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <CreateCodeDialog
        open={createOpen}
        classId={classId}
        onOpenChange={setCreateOpen}
        onCreated={(c) => { setCreateOpen(false); onChange(); setShowQR(c); }}
      />
      <QRDialog code={showQR} onClose={() => setShowQR(null)} />
    </Card>
  );
}

function CreateCodeDialog({
  open, classId, onOpenChange, onCreated,
}: { open: boolean; classId: string; onOpenChange: (b: boolean) => void; onCreated: (c: ClassEnrollmentCode) => void }) {
  const [maxUses, setMaxUses] = useState("");
  const [creditAmount, setCreditAmount] = useState("250");
  const [expiresMinutes, setExpiresMinutes] = useState<string>("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () => consumerOrgAdminApi.createCode(classId, {
      max_uses: maxUses ? parseInt(maxUses, 10) : null,
      credit_amount: Math.max(0, parseInt(creditAmount, 10) || 0),
      expires_at: expiresMinutes
        ? new Date(Date.now() + parseInt(expiresMinutes, 10) * 60_000).toISOString()
        : null,
      description: description || undefined,
    }),
    onSuccess: ({ code }) => {
      toast.success(`Code ${code.code} created`);
      setMaxUses(""); setCreditAmount("250"); setExpiresMinutes(""); setDescription("");
      onCreated(code);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create enrolment QR</DialogTitle>
          <DialogDescription>
            Students scan this to join the class. They'll receive starting credits per the class's policy.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Credits per student space</Label>
            <Input type="number" min="0" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="250" />
          </div>
          <div>
            <Label>Max enrolments <span className="text-muted-foreground">(blank = unlimited up to class capacity)</span></Label>
            <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="e.g. 42" />
          </div>
          <div>
            <Label>Expires after (minutes) <span className="text-muted-foreground">(blank = never)</span></Label>
            <select
              value={expiresMinutes}
              onChange={(e) => setExpiresMinutes(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              <option value="">No expiry</option>
              <option value="5">5 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="1440">1 day</option>
            </select>
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Week 1 enrolment" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QRDialog({ code, onClose }: { code: ClassEnrollmentCode | null; onClose: () => void }) {
  if (!code) return null;
  const url = `${window.location.origin}/enroll-class/${code.code}`;
  const copy = () => { navigator.clipboard.writeText(url); toast.success("Link copied"); };

  return (
    <Dialog open={!!code} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project this QR for students</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{code.code}</span>
            {code.max_uses ? ` · ${code.max_uses - code.uses_count} of ${code.max_uses} left` : " · unlimited"}
            {` · ${Number(code.credit_amount ?? 0).toLocaleString()} credits / student space`}
            {code.expires_at && ` · expires ${new Date(code.expires_at).toLocaleTimeString()}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4 py-4">
          <div className="bg-white p-4 rounded">
            <QRCodeSVG value={url} size={240} level="M" />
          </div>
          <p className="text-xs text-muted-foreground break-all text-center">{url}</p>
          <Button variant="outline" size="sm" onClick={copy}><Copy className="h-4 w-4 mr-2" /> Copy link</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Teachers panel ─────────────────────────────────────────────────────────

function TeachersPanel({
  classId, primaryInstructorId, teachers, onChange,
}: {
  classId: string;
  primaryInstructorId: string | null;
  teachers: Array<{ user_id: string; role: "primary" | "co" }>;
  onChange: () => void;
}) {
  const [email, setEmail] = useState("");

  const add = useMutation({
    mutationFn: () => consumerOrgAdminApi.addTeacherByEmail(classId, email.trim(), "co"),
    onSuccess: () => {
      toast.success(`Added ${email} as co-teacher`);
      setEmail("");
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => consumerOrgAdminApi.removeTeacher(classId, userId),
    onSuccess: () => { toast.success("Teacher removed"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Combine: primary_instructor (from class row) + ledger teachers
  const all: Array<{ user_id: string; role: "primary" | "co"; from_class_row?: boolean }> = [];
  if (primaryInstructorId
      && !teachers.some((t) => t.user_id === primaryInstructorId)) {
    all.push({ user_id: primaryInstructorId, role: "primary", from_class_row: true });
  }
  all.push(...teachers);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add co-teacher</CardTitle>
          <CardDescription>
            They must already have signed up. After adding, they'll see this class in their "My Classes" panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); if (email) add.mutate(); }}
            className="flex items-end gap-2"
          >
            <div className="flex-1">
              <Label htmlFor="teacher-email">Teacher's email</Label>
              <Input
                id="teacher-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="instructor@silpakorn.edu"
              />
            </div>
            <Button type="submit" disabled={!email || add.isPending}>
              {add.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teaching this class</CardTitle>
        </CardHeader>
        <CardContent>
          {all.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No teachers assigned.</p>
          ) : (
            <ul className="divide-y">
              {all.map((t) => (
                <li key={t.user_id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-mono text-xs">{t.user_id}</div>
                    <Badge variant={t.role === "primary" ? "default" : "outline"} className="mt-1">
                      {t.role}
                    </Badge>
                    {t.from_class_row && (
                      <Badge variant="outline" className="ml-1.5 text-xs">primary instructor</Badge>
                    )}
                  </div>
                  {!t.from_class_row && (
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(t.user_id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Requests panel ─────────────────────────────────────────────────────────

function RequestsPanel({
  classId, requests, isLoading, onChange,
}: {
  classId: string; requests: any[]; isLoading: boolean; onChange: () => void;
}) {
  const review = useMutation({
    mutationFn: ({ id, approve, amount }: { id: string; approve: boolean; amount?: number }) =>
      consumerOrgAdminApi.reviewCreditRequest(id, approve, { amount_granted: amount }),
    onSuccess: () => { toast.success("Reviewed"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading) return <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (requests.length === 0) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
      No credit requests yet.
    </CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Credit requests</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground bg-muted/30">
            <tr><th className="py-2 px-3">Student</th><th>Amount</th><th>Reason</th><th>Status</th><th>When</th><th></th></tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2 px-3 font-mono text-xs">{r.user_id.slice(0, 8)}…</td>
                <td className="py-2 px-3 font-mono">{r.amount_requested}</td>
                <td className="py-2 px-3 text-xs">{r.reason ?? "—"}</td>
                <td className="py-2 px-3">
                  <Badge variant={r.status === "pending" ? "default" : r.status === "approved" ? "secondary" : "outline"}>
                    {r.status}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="py-2 px-3 text-right">
                  {r.status === "pending" && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="default" onClick={() => review.mutate({ id: r.id, approve: true })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, approve: false })}>
                        Deny
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
