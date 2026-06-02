import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BookOpen,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Loader2,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { friendlyError } from "@/lib/friendlyError";
import {
  consumerOrgAdminApi,
  type ClassEnrollmentCode,
  type ClassMember,
  type ClassRow,
  type ClassStudentSpace,
} from "@/lib/orgAdminApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useManageableClasses, type TeacherClass } from "./useTeacherData";

type ModelGroup = {
  id: string;
  label: string;
  description: string;
  modelIds: string[];
};

const DEFAULT_QR_CREDITS = 250;
const DEFAULT_CLASS_POOL = 10000;
const DEFAULT_BLOCKED_MODELS = [
  "seedance-2-0-lite",
  "seedance-2-0-pro",
  "dreamina-seedance-2-0-260128",
  "dreamina-seedance-2-0-fast-260128",
];

const MODEL_GROUPS: ModelGroup[] = [
  {
    id: "image",
    label: "Image",
    description: "Banana, GPT Image, Seedream, Qwen",
    modelIds: [
      "nano-banana-2",
      "nano-banana-pro",
      "gpt-image-2",
      "seedream-5-0-260128",
      "seedream-5-0-lite-260128",
      "seedream-4-5-251128",
      "qwen-image-runpod",
      "qwen-image-edit-2511-runpod",
    ],
  },
  {
    id: "video",
    label: "Video",
    description: "Kling, Veo, Seedance",
    modelIds: [
      "kling-v2-6-pro",
      "kling-v2-6-motion-pro",
      "kling-v3-pro",
      "kling-v3-motion-pro",
      "kling-v3-omni",
      "veo-3.1-generate-001",
      "seedance-1-5-pro-251215",
      "seedance-2-0-lite",
      "seedance-2-0-pro",
      "dreamina-seedance-2-0-260128",
      "dreamina-seedance-2-0-fast-260128",
    ],
  },
  {
    id: "audio",
    label: "Audio",
    description: "Voice, dubbing, subtitles, TTS",
    modelIds: [
      "elevenlabs-multilingual-v2",
      "elevenlabs-turbo-v2-5",
      "elevenlabs-dubbing-voice-clone",
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-pro-preview-tts",
      "auto-suptitle-whisper",
    ],
  },
  {
    id: "utility",
    label: "Utility",
    description: "Upscale, 3D, URL asset",
    modelIds: [
      "gpt-image-2-enhance",
      "tripo3d-v3.1",
      "tripo3d-v3.0",
      "tripo3d-v2.5",
      "tripo3d-p1",
      "hyper3d-gen2-260112",
      "url-to-png",
      "url-to-mp3",
      "url-to-mp4",
    ],
  },
];

const MODEL_LABELS: Record<string, string> = {
  "nano-banana-2": "Nano Banana 2",
  "nano-banana-pro": "Nano Banana Pro",
  "gpt-image-2": "GPT Image 2",
  "seedream-5-0-260128": "Seedream 5",
  "seedream-5-0-lite-260128": "Seedream 5 Lite",
  "seedream-4-5-251128": "Seedream 4.5",
  "qwen-image-runpod": "Qwen Image",
  "qwen-image-edit-2511-runpod": "Qwen Edit",
  "kling-v2-6-pro": "Kling 2.6 Pro",
  "kling-v2-6-motion-pro": "Kling 2.6 Motion",
  "kling-v3-pro": "Kling 3 Pro",
  "kling-v3-motion-pro": "Kling 3 Motion",
  "kling-v3-omni": "Kling 3 Omni",
  "veo-3.1-generate-001": "Google Veo 3.1",
  "seedance-1-5-pro-251215": "Seedance 1.5 Pro",
  "seedance-2-0-lite": "Seedance 2.0 Fast",
  "seedance-2-0-pro": "Seedance 2.0",
  "dreamina-seedance-2-0-260128": "Seedance 2.0 API",
  "dreamina-seedance-2-0-fast-260128": "Seedance 2.0 Fast API",
  "elevenlabs-multilingual-v2": "ElevenLabs Voice",
  "elevenlabs-turbo-v2-5": "ElevenLabs Turbo",
  "elevenlabs-dubbing-voice-clone": "ElevenLabs Dubbing",
  "gemini-3.1-flash-tts-preview": "Gemini TTS",
  "gemini-2.5-pro-preview-tts": "Gemini Pro TTS",
  "auto-suptitle-whisper": "Auto Subtitle",
  "gpt-image-2-enhance": "Upscale",
  "tripo3d-v3.1": "Tripo 3D v3.1",
  "tripo3d-v3.0": "Tripo 3D v3.0",
  "tripo3d-v2.5": "Tripo 3D v2.5",
  "tripo3d-p1": "Tripo 3D P1",
  "hyper3d-gen2-260112": "Hyper3D",
  "url-to-png": "URL to PNG",
  "url-to-mp3": "URL to MP3",
  "url-to-mp4": "URL to MP4",
};

const allModelIds = Array.from(new Set(MODEL_GROUPS.flatMap((group) => group.modelIds)));

function orgIdFromProfile(profile: unknown): string | null {
  const p = profile as { organization_id?: string | null; org_id?: string | null } | null;
  return p?.organization_id ?? p?.org_id ?? null;
}

function classSettings(row?: ClassRow | TeacherClass | null): Record<string, unknown> {
  const settings = (row as { settings?: unknown } | null)?.settings;
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? { ...(settings as Record<string, unknown>) }
    : {};
}

function blockedModelIds(settings: Record<string, unknown>): string[] {
  const raw = settings.blocked_model_ids;
  if (!Array.isArray(raw)) return [...DEFAULT_BLOCKED_MODELS];
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function primarySpace(member: ClassMember): ClassStudentSpace | null {
  const spaces = member.spaces ?? [];
  return (
    spaces.find((space) => space.status === "active") ??
    spaces.find((space) => space.status === "submitted") ??
    spaces[0] ??
    null
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function enrollmentUrl(code: string): string {
  return `${window.location.origin}/enroll-class/${code}`;
}

function parsePositiveInt(value: string, fallback = 0): number {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function TeacherCenter() {
  const { user, profile } = useAuth();
  const orgId = orgIdFromProfile(profile);
  const { data: classes = [], isLoading } = useManageableClasses();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const selectedClassId = params.get("class");
  const effectiveClassId = selectedClassId ?? classes[0]?.id ?? null;

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              University
            </div>
            <div className="mt-1 text-lg font-semibold">Teacher console</div>
            <Button className="mt-4 h-9 w-full justify-center" onClick={() => setCreateOpen(true)} disabled={!orgId}>
              <Plus className="mr-2 h-4 w-4" />
              New class
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading classes
              </div>
            ) : classes.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Create a class to start issuing QR credits.
              </div>
            ) : (
              <div className="space-y-1">
                {classes.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => setParams({ class: cls.id })}
                    className={cn(
                      "w-full rounded-md px-3 py-3 text-left transition",
                      effectiveClassId === cls.id
                        ? "bg-emerald-50 ring-1 ring-emerald-200"
                        : "hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 font-medium">{cls.name}</div>
                      <Badge variant={cls.status === "active" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                        {cls.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {cls.code} · {Number(cls.credit_amount ?? 0).toLocaleString()} credits / join
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-3">
            <BackToWorkspaceButton />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {effectiveClassId ? (
            <ClassConsole classId={effectiveClassId} fallbackClass={classes.find((cls) => cls.id === effectiveClassId) ?? null} />
          ) : (
            <EmptyState canCreate={!!orgId} onCreate={() => setCreateOpen(true)} />
          )}
        </main>
      </div>

      {orgId && (
        <CreateClassDialog
          open={createOpen}
          orgId={orgId}
          onOpenChange={setCreateOpen}
          onCreated={(cls) => {
            setCreateOpen(false);
            setParams({ class: cls.id });
          }}
        />
      )}
    </div>
  );
}

function BackToWorkspaceButton() {
  const navigate = useNavigate();
  return (
    <Button variant="ghost" className="h-9 w-full justify-start text-slate-600" onClick={() => navigate("/app/workspace")}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      Workspace
    </Button>
  );
}

function EmptyState({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-10">
      <div className="max-w-sm text-center">
        <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-4 text-xl font-semibold">No classes yet</h1>
        <p className="mt-2 text-sm text-slate-500">
          Start with one class, then share its QR code with students.
        </p>
        {canCreate && (
          <Button className="mt-5" onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create class
          </Button>
        )}
      </div>
    </div>
  );
}

function ClassConsole({ classId, fallbackClass }: { classId: string; fallbackClass: TeacherClass | null }) {
  const qc = useQueryClient();
  const [selectedCreditTarget, setSelectedCreditTarget] = useState<ClassMember | null>(null);
  const detail = useQuery({
    queryKey: ["teacher-class-detail", classId],
    queryFn: () => consumerOrgAdminApi.getClass(classId),
  });
  const members = useQuery({
    queryKey: ["teacher-class-members", classId],
    queryFn: () => consumerOrgAdminApi.listClassMembers(classId),
  });
  const codes = useQuery({
    queryKey: ["teacher-class-codes", classId],
    queryFn: () => consumerOrgAdminApi.listCodes(classId),
  });

  const cls = detail.data?.class ?? (fallbackClass as unknown as ClassRow | null);
  const classMembers = (members.data?.members ?? []).filter((member) => member.status !== "removed");
  const activeCode = (codes.data?.codes ?? []).find((code) => {
    if (code.expires_at && Date.parse(code.expires_at) <= Date.now()) return false;
    if (code.max_uses && code.uses_count >= code.max_uses) return false;
    return true;
  });
  const remainingPool = detail.data?.credit_pool_remaining ?? Math.max(Number(cls?.credit_pool ?? 0) - Number(cls?.credit_pool_consumed ?? 0), 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["teacher-classes"] });
    qc.invalidateQueries({ queryKey: ["teacher-class-detail", classId] });
    qc.invalidateQueries({ queryKey: ["teacher-class-members", classId] });
    qc.invalidateQueries({ queryKey: ["teacher-class-codes", classId] });
  };

  const endClass = useMutation({
    mutationFn: () => consumerOrgAdminApi.endClass(classId),
    onSuccess: () => {
      toast.success("Class closed");
      refresh();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });

  if (detail.isLoading && !cls) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!cls) {
    return <div className="p-8 text-sm text-slate-500">Class not found.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge variant="outline" className="font-mono">{cls.code}</Badge>
            <span>Created {formatDateTime((cls as any).created_at)}</span>
          </div>
          <h1 className="mt-2 truncate text-3xl font-semibold">{cls.name}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={endClass.isPending}>
                <Ban className="mr-2 h-4 w-4" />
                Close class
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close this class?</AlertDialogTitle>
                <AlertDialogDescription>
                  Students will no longer be able to join with QR codes. Existing class spaces are kept for review and download.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => endClass.mutate()}>Close class</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Students" value={classMembers.length.toLocaleString()} icon={<Users className="h-4 w-4" />} />
        <Metric label="Class pool" value={Number(cls.credit_pool ?? 0).toLocaleString()} icon={<Wallet className="h-4 w-4" />} />
        <Metric label="Available" value={remainingPool.toLocaleString()} icon={<ShieldCheck className="h-4 w-4" />} />
        <Metric label="Credits / join" value={Number(cls.credit_amount ?? 0).toLocaleString()} icon={<QrCode className="h-4 w-4" />} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <QrSection
            classId={classId}
            cls={cls}
            activeCode={activeCode ?? null}
            codes={codes.data?.codes ?? []}
            remainingPool={remainingPool}
            onChanged={refresh}
          />
          <StudentSection
            classId={classId}
            members={classMembers}
            loading={members.isLoading}
            onChanged={refresh}
            onCreditTarget={setSelectedCreditTarget}
          />
        </div>
        <div className="space-y-4">
          <PoolTopUpSection classId={classId} remainingPool={remainingPool} onChanged={refresh} />
          <ModelAccessSection cls={cls} onChanged={refresh} />
          <ManualStudentSection classId={classId} onChanged={refresh} />
          <EmergencyCreditSection classId={classId} members={classMembers} onChanged={refresh} />
        </div>
      </div>

      <CreditDialog
        classId={classId}
        target={selectedCreditTarget}
        onClose={() => setSelectedCreditTarget(null)}
        onChanged={() => {
          setSelectedCreditTarget(null);
          refresh();
        }}
      />
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function QrSection({
  classId,
  cls,
  activeCode,
  codes,
  remainingPool,
  onChanged,
}: {
  classId: string;
  cls: ClassRow;
  activeCode: ClassEnrollmentCode | null;
  codes: ClassEnrollmentCode[];
  remainingPool: number;
  onChanged: () => void;
}) {
  const [credits, setCredits] = useState(String(cls.credit_amount || DEFAULT_QR_CREDITS));
  const [scanLimit, setScanLimit] = useState("");
  const [showAllCodes, setShowAllCodes] = useState(false);
  const createCode = useMutation({
    mutationFn: () => {
      const creditAmount = parsePositiveInt(credits, DEFAULT_QR_CREDITS);
      const maxUses = scanLimit.trim() ? parsePositiveInt(scanLimit, 1) : null;
      return consumerOrgAdminApi.createCode(classId, {
        credit_amount: creditAmount,
        max_uses: maxUses,
      });
    },
    onSuccess: ({ code }) => {
      toast.success(`QR ready: ${code.code}`);
      onChanged();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });
  const revokeCode = useMutation({
    mutationFn: (codeId: string) => consumerOrgAdminApi.revokeCode(classId, codeId),
    onSuccess: () => {
      toast.success("QR code revoked");
      onChanged();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });

  const parsedCredits = parsePositiveInt(credits, 0);
  const parsedLimit = scanLimit.trim() ? parsePositiveInt(scanLimit, 0) : null;
  const requiredPool = parsedLimit ? parsedCredits * parsedLimit : parsedCredits;
  const poolWarning = parsedCredits > 0 && requiredPool > remainingPool;
  const url = activeCode ? enrollmentUrl(activeCode.code) : "";

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <QrCode className="h-5 w-5 text-emerald-600" />
              Student entry
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Share one link. School-domain accounts join automatically and get a class space.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="w-28">
              <Label className="text-xs">Credits / scan</Label>
              <Input className="h-9" type="number" min="1" value={credits} onChange={(event) => setCredits(event.target.value)} />
            </div>
            <div className="w-28">
              <Label className="text-xs">Scan limit</Label>
              <Input className="h-9" type="number" min="1" value={scanLimit} onChange={(event) => setScanLimit(event.target.value)} placeholder="No limit" />
            </div>
            <div className="flex items-end">
              <Button className="h-9" disabled={createCode.isPending || poolWarning || parsedCredits <= 0} onClick={() => createCode.mutate()}>
                {createCode.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                New QR
              </Button>
            </div>
          </div>
        </div>
        {poolWarning && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Add class pool credits first. This QR needs at least {requiredPool.toLocaleString()} credits.
          </div>
        )}
      </CardHeader>
      <CardContent>
        {activeCode ? (
          <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
            <div className="rounded-md border bg-white p-3">
              <QRCodeSVG value={url} size={132} level="M" />
            </div>
            <div className="min-w-0 space-y-3">
              <div>
                <div className="font-mono text-lg font-semibold">{activeCode.code}</div>
                <div className="mt-1 break-all text-sm text-slate-600">{url}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{Number(activeCode.credit_amount ?? 0).toLocaleString()} credits / student</Badge>
                <Badge variant="outline">
                  {activeCode.max_uses ? `${activeCode.uses_count}/${activeCode.max_uses} scans` : `${activeCode.uses_count} scans`}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copy(activeCode.code, "Code")}>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Copy code
                </Button>
                <Button variant="outline" size="sm" onClick={() => copy(url, "Link")}>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Copy link
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAllCodes((value) => !value)}>
                  {showAllCodes ? "Hide old QR" : "Show all QR"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No active QR yet. Set credits per scan and create one.
          </div>
        )}

        {showAllCodes && codes.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Credits</th>
                  <th className="px-3 py-2 font-medium">Scans</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono">{code.code}</td>
                    <td className="px-3 py-2">{Number(code.credit_amount ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2">{code.max_uses ? `${code.uses_count}/${code.max_uses}` : code.uses_count}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" disabled={revokeCode.isPending} onClick={() => revokeCode.mutate(code.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PoolTopUpSection({ classId, remainingPool, onChanged }: { classId: string; remainingPool: number; onChanged: () => void }) {
  const [amount, setAmount] = useState("");
  const addPool = useMutation({
    mutationFn: () => {
      const parsed = parsePositiveInt(amount, 0);
      if (parsed <= 0) throw new Error("amount_must_be_positive");
      return consumerOrgAdminApi.allocateToClass(classId, parsed, "teacher_pool_top_up");
    },
    onSuccess: () => {
      toast.success("Class pool updated");
      setAmount("");
      onChanged();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-emerald-600" />
          Class pool
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md bg-emerald-50 px-3 py-2">
          <div className="text-xs text-emerald-700">Available for QR and emergency grants</div>
          <div className="text-2xl font-semibold tabular-nums">{remainingPool.toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          <Input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Add credits" />
          <Button className="shrink-0" disabled={!amount || addPool.isPending} onClick={() => addPool.mutate()}>
            {addPool.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelAccessSection({ cls, onChanged }: { cls: ClassRow; onChanged: () => void }) {
  const settings = useMemo(() => classSettings(cls), [cls]);
  const initialBlocked = useMemo(() => blockedModelIds(settings), [settings]);
  const [blocked, setBlocked] = useState<string[]>(initialBlocked);
  useEffect(() => setBlocked(initialBlocked), [initialBlocked.join("|")]);

  const save = useMutation({
    mutationFn: () => consumerOrgAdminApi.updateClass(cls.id, {
      settings: {
        ...settings,
        blocked_model_ids: Array.from(new Set(blocked)),
      },
    }),
    onSuccess: () => {
      toast.success("Model access saved");
      onChanged();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });

  const setGroupAllowed = (group: ModelGroup, allowed: boolean) => {
    setBlocked((current) => {
      const next = new Set(current);
      for (const id of group.modelIds) {
        if (allowed) next.delete(id);
        else next.add(id);
      }
      return Array.from(next);
    });
  };
  const toggleModel = (modelId: string) => {
    setBlocked((current) => current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId]);
  };
  const blockSeedance2 = () => {
    setBlocked((current) => Array.from(new Set([...current, ...DEFAULT_BLOCKED_MODELS])));
  };

  const changed = blocked.slice().sort().join("|") !== initialBlocked.slice().sort().join("|");
  const blockedCount = blocked.filter((id) => allModelIds.includes(id)).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-emerald-600" />
            Model access
          </span>
          <Badge variant={blockedCount ? "secondary" : "outline"}>{blockedCount} blocked</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          {MODEL_GROUPS.map((group) => {
            const groupBlocked = group.modelIds.filter((id) => blocked.includes(id)).length;
            const allowed = groupBlocked < group.modelIds.length;
            return (
              <label key={group.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                <Checkbox checked={allowed} onCheckedChange={(value) => setGroupAllowed(group, Boolean(value))} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{group.label}</span>
                  <span className="block text-xs text-slate-500">{group.description}</span>
                </span>
                {groupBlocked > 0 && <Badge variant="outline" className="text-[10px]">{groupBlocked} off</Badge>}
              </label>
            );
          })}
        </div>

        <details className="rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Specific models</summary>
          <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">
            {allModelIds.map((modelId) => {
              const isAllowed = !blocked.includes(modelId);
              return (
                <label key={modelId} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={isAllowed} onCheckedChange={() => toggleModel(modelId)} />
                  <span className={cn(!isAllowed && "text-slate-400 line-through")}>{MODEL_LABELS[modelId] ?? modelId}</span>
                </label>
              );
            })}
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setBlocked([])}>
            <Unlock className="mr-2 h-4 w-4" />
            Allow all
          </Button>
          <Button variant="outline" size="sm" onClick={blockSeedance2}>
            Block Seedance 2.0
          </Button>
          <Button size="sm" disabled={!changed || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save access
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ManualStudentSection({ classId, onChanged }: { classId: string; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [credits, setCredits] = useState("0");
  const addStudent = useMutation({
    mutationFn: () => consumerOrgAdminApi.addStudentByEmail(
      classId,
      email.trim().toLowerCase(),
      Math.max(0, parseInt(credits, 10) || 0),
      studentCode.trim() || undefined,
      "teacher_manual_student",
    ),
    onSuccess: () => {
      toast.success("Student added");
      setEmail("");
      setStudentCode("");
      setCredits("0");
      onChanged();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-emerald-600" />
          Manual student
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Email</Label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@gmail.com" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Student ID</Label>
            <Input value={studentCode} onChange={(event) => setStudentCode(event.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label className="text-xs">Starting credits</Label>
            <Input type="number" min="0" value={credits} onChange={(event) => setCredits(event.target.value)} />
          </div>
        </div>
        <Button className="w-full" disabled={!email.trim() || addStudent.isPending} onClick={() => addStudent.mutate()}>
          {addStudent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add student
        </Button>
      </CardContent>
    </Card>
  );
}

function EmergencyCreditSection({ classId, members, onChanged }: { classId: string; members: ClassMember[]; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("250");
  const grant = useMutation({
    mutationFn: async () => {
      const cleanEmail = email.trim().toLowerCase();
      const parsed = parsePositiveInt(amount, 0);
      if (!cleanEmail || parsed <= 0) throw new Error("email_and_amount_required");
      const member = members.find((candidate) => String(candidate.email ?? "").toLowerCase() === cleanEmail);
      if (!member) {
        return consumerOrgAdminApi.addStudentByEmail(
          classId,
          cleanEmail,
          parsed,
          undefined,
          "teacher_emergency_credit_new_student",
        );
      }
      const space = primarySpace(member);
      if (space?.workspace_id) {
        return consumerOrgAdminApi.grantCredits(
          classId,
          member.user_id,
          space.workspace_id,
          parsed,
          "teacher_emergency_credit",
        );
      }
      return consumerOrgAdminApi.ensureStudentSpace(
        classId,
        member.user_id,
        parsed,
        "teacher_emergency_credit_create_space",
      );
    },
    onSuccess: () => {
      toast.success("Credits added");
      setEmail("");
      setAmount("250");
      onChanged();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Emergency credits
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Student email</Label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@email.com" />
        </div>
        <div className="flex gap-2">
          <Input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <Button className="shrink-0" disabled={!email.trim() || !amount || grant.isPending} onClick={() => grant.mutate()}>
            {grant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentSection({
  classId,
  members,
  loading,
  onChanged,
  onCreditTarget,
}: {
  classId: string;
  members: ClassMember[];
  loading: boolean;
  onChanged: () => void;
  onCreditTarget: (member: ClassMember) => void;
}) {
  const setStatus = useMutation({
    mutationFn: ({ workspaceId, status }: { workspaceId: string; status: "passed" | "ended" }) =>
      consumerOrgAdminApi.setSpaceStatus(classId, workspaceId, status),
    onSuccess: (_, vars) => {
      toast.success(vars.status === "passed" ? "Marked as passed" : "Space ended");
      onChanged();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3 text-lg">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Students
          </span>
          <Badge variant="outline">{members.length} enrolled</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Students will appear here after they scan the QR or are added manually.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Space</th>
                  <th className="px-3 py-2 text-right font-medium">Credits</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const space = primarySpace(member);
                  const locked = space?.status === "passed" || space?.status === "ended";
                  return (
                    <tr key={member.user_id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <div className="font-medium">{member.display_name ?? member.email ?? "Student"}</div>
                        <div className="text-xs text-slate-500">{member.email ?? "-"}</div>
                        <div className="font-mono text-xs text-slate-400">{member.student_code ? `ID ${member.student_code}` : member.user_id.slice(0, 8)}</div>
                      </td>
                      <td className="px-3 py-3">
                        {space ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant={locked ? "secondary" : "outline"} className="text-[10px]">
                                {space.status}
                              </Badge>
                              {space.is_online && <Badge className="bg-emerald-600 text-[10px]">online</Badge>}
                            </div>
                            <div className="mt-1 max-w-[260px] truncate text-xs text-slate-500">
                              {space.workspace_name ?? space.workspace_id}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No space yet</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="font-mono font-semibold">{Number(space?.credits_balance ?? member.credits_balance ?? 0).toLocaleString()}</div>
                        <div className="text-xs text-slate-500">{Number(space?.credits_lifetime_used ?? member.credits_lifetime_used ?? 0).toLocaleString()} used</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => onCreditTarget(member)}>
                            Add credits
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!space?.workspace_id || setStatus.isPending}
                            onClick={() => space?.workspace_id && setStatus.mutate({ workspaceId: space.workspace_id, status: "passed" })}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Pass
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!space?.workspace_id || setStatus.isPending}
                            onClick={() => space?.workspace_id && setStatus.mutate({ workspaceId: space.workspace_id, status: "ended" })}
                          >
                            End
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!space?.workspace_id}
                            onClick={() => space?.workspace_id && window.open(`/app/workspace/${space.workspace_id}`, "_blank", "noopener,noreferrer")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreditDialog({
  classId,
  target,
  onClose,
  onChanged,
}: {
  classId: string;
  target: ClassMember | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [amount, setAmount] = useState("250");
  const [mode, setMode] = useState<"add" | "remove">("add");
  const space = target ? primarySpace(target) : null;
  const grant = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("student_required");
      const parsed = parsePositiveInt(amount, 0);
      if (parsed <= 0) throw new Error("amount_must_be_positive");
      const signed = mode === "add" ? parsed : -parsed;
      if (space?.workspace_id) {
        return consumerOrgAdminApi.grantCredits(
          classId,
          target.user_id,
          space.workspace_id,
          signed,
          mode === "add" ? "teacher_manual_credit" : "teacher_manual_credit_revoke",
        );
      }
      if (mode === "remove") throw new Error("student_space_not_found");
      return consumerOrgAdminApi.ensureStudentSpace(classId, target.user_id, parsed, "teacher_manual_credit_create_space");
    },
    onSuccess: () => {
      toast.success(mode === "add" ? "Credits added" : "Credits removed");
      setAmount("250");
      setMode("add");
      onChanged();
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust credits</DialogTitle>
          <DialogDescription>
            {target?.display_name ?? target?.email ?? "Student"} · current {Number(space?.credits_balance ?? target?.credits_balance ?? 0).toLocaleString()} credits
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={mode === "add" ? "default" : "outline"} onClick={() => setMode("add")}>Add</Button>
            <Button variant={mode === "remove" ? "default" : "outline"} onClick={() => setMode("remove")}>Remove</Button>
          </div>
          <div>
            <Label>Credits</Label>
            <Input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!amount || grant.isPending} onClick={() => grant.mutate()}>
            {grant.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateClassDialog({
  open,
  orgId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  orgId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (cls: ClassRow) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [creditsPerStudent, setCreditsPerStudent] = useState(String(DEFAULT_QR_CREDITS));
  const [classPool, setClassPool] = useState(String(DEFAULT_CLASS_POOL));
  const createClass = useMutation({
    mutationFn: () => consumerOrgAdminApi.createClass(orgId, {
      name: name.trim(),
      credit_policy: "manual",
      credit_amount: parsePositiveInt(creditsPerStudent, DEFAULT_QR_CREDITS),
      credit_pool: Math.max(0, parseInt(classPool, 10) || 0),
      primary_instructor_id: user?.id ?? null,
      max_students: null,
      term: null,
      year: null,
      settings: {
        blocked_model_ids: DEFAULT_BLOCKED_MODELS,
      },
    } as Partial<ClassRow> & { name: string }),
    onSuccess: ({ class: cls }) => {
      toast.success("Class created");
      setName("");
      setCreditsPerStudent(String(DEFAULT_QR_CREDITS));
      setClassPool(String(DEFAULT_CLASS_POOL));
      qc.invalidateQueries({ queryKey: ["teacher-classes"] });
      onCreated(cls);
    },
    onError: (error: any) => toast.error(friendlyError(error?.message ?? error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create class</DialogTitle>
          <DialogDescription>
            Students join by QR/link and receive a class space.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Class name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Digital Media 101" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Credits / student</Label>
              <Input type="number" min="1" value={creditsPerStudent} onChange={(event) => setCreditsPerStudent(event.target.value)} />
            </div>
            <div>
              <Label>Class pool</Label>
              <Input type="number" min="0" value={classPool} onChange={(event) => setClassPool(event.target.value)} />
            </div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Seedance 2.0 is blocked by default because it is high-cost. Teachers can enable it later in Model access.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || createClass.isPending} onClick={() => createClass.mutate()}>
            {createClass.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
