/**
 * ERP pricing manager — admin UI for managing rows in `credit_costs`.
 *
 * Lives at /app/org-admin/pricing. Replaces the workflow of "INSERT INTO
 * credit_costs ..." in the SQL editor when ops needs to add prices for a
 * new model.
 *
 * Auth gate
 * ─────────
 * Same shape as the rest of org-admin: must be signed in, plus must be a
 * teacher or `org_admin` membership row. The underlying
 * `admin_workspace_pricing` edge function uses the service role and is
 * `verify_jwt: false`, so the gate is purely cosmetic — the real
 * protection is "this URL isn't linked from anywhere a non-admin sees".
 * Once admin auth is federated across projects we can tighten this.
 *
 * Layout
 * ──────
 *   - Filter bar (feature dropdown + model search)
 *   - Table of pricing rows (feature, model, cost, pricing_type,
 *     duration, has_audio, label, created_at, actions)
 *   - "Add new model" → modal form (same form is reused for edit)
 *   - Delete → confirmation alert dialog
 *
 * All writes go through the React Query hooks in useAdminPricing,
 * which optimistically update the cached list and roll back on error.
 */

import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import {
  usePricingList,
  useCreatePrice,
  useUpdatePrice,
  useDeletePrice,
} from "@/hooks/useAdminPricing";
import {
  FEATURE_OPTIONS,
  PRICING_TYPE_OPTIONS,
  type CreditCostRow,
  type PricingFeature,
  type PricingType,
  type UpsertCreditCostInput,
} from "@/lib/adminPricingApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Coins, Loader2, Pencil, Plus, Search, Trash2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  FEATURE_OPTIONS.map((o) => [o.value, o.label]),
);

const PRICING_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PRICING_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export default function OrgAdminPricingPage() {
  const { user } = useAuth();
  const isOrgAdmin = useIsOrgAdmin();
  const navigate = useNavigate();

  const [featureFilter, setFeatureFilter] = useState<"all" | PricingFeature>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CreditCostRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CreditCostRow | null>(null);

  const list = usePricingList();
  const createMut = useCreatePrice();
  const updateMut = useUpdatePrice();
  const deleteMut = useDeletePrice();

  // Auth gating must run before render so we don't fetch from the edge
  // function for a user who isn't allowed to see the page anyway.
  if (!user) return <Navigate to="/auth" replace />;
  if (!isOrgAdmin) return <Navigate to="/app/workspace" replace />;

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (featureFilter !== "all" && row.feature !== featureFilter) return false;
      if (q) {
        const hay = `${row.model ?? ""} ${row.label ?? ""} ${row.feature}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list.data, featureFilter, search]);

  const handleSubmit = async (input: Omit<UpsertCreditCostInput, "id">) => {
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, input });
        toast.success(`Updated ${input.label}`);
        setEditing(null);
      } else {
        await createMut.mutateAsync(input);
        toast.success(`Added ${input.label}`);
        setCreating(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync(deleting.id);
      toast.success(`Deleted ${deleting.label}`);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/org-admin")} className="-ml-2 mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Admin
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Coins className="h-7 w-7 text-primary" />
            Pricing Manager
          </h1>
          <p className="text-sm text-muted-foreground">
            Edit credit costs for AI models. Changes affect new generations immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
          >
            {list.isFetching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add new model
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter</CardTitle>
          <CardDescription>Narrow the list by feature or search by model name.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[200px_1fr]">
            <div>
              <Label className="text-xs">Feature</Label>
              <Select
                value={featureFilter}
                onValueChange={(v) => setFeatureFilter(v as "all" | PricingFeature)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All features</SelectItem>
                  {FEATURE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Search by model or label</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="gpt-image, kling, tripo3d..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {filtered.length} row{filtered.length === 1 ? "" : "s"}
            {list.data && filtered.length !== list.data.length && (
              <span className="text-muted-foreground text-sm ml-2">
                (of {list.data.length} total)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {list.isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : list.error ? (
            <div className="px-6 py-8 text-center text-destructive text-sm">
              Failed to load pricing: {(list.error as Error).message}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              No matching pricing rows. Try clearing the filter or click "Add new model".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Pricing type</TableHead>
                    <TableHead className="text-right">Duration (s)</TableHead>
                    <TableHead className="text-center">Audio</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge variant="secondary">
                          {FEATURE_LABEL[row.feature] ?? row.feature}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.model ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{row.cost}</TableCell>
                      <TableCell className="text-xs">
                        {row.pricing_type
                          ? (PRICING_TYPE_LABEL[row.pricing_type] ?? row.pricing_type)
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {row.duration_seconds ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {row.has_audio ? "Yes" : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">{row.label}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditing(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleting(row)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit modal — same form, mode picked by `editing` */}
      <PricingFormDialog
        open={creating || editing !== null}
        initial={editing}
        saving={createMut.isPending || updateMut.isPending}
        onCancel={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSubmit={handleSubmit}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pricing row?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  <span className="font-semibold">{deleting.label}</span> ({deleting.feature}
                  {deleting.model ? ` / ${deleting.model}` : ""}). Once deleted, calls to
                  this model will fall back to default pricing or fail.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Pricing form dialog (add / edit) ───────────────────────────────────

interface PricingFormDialogProps {
  open: boolean;
  initial: CreditCostRow | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: Omit<UpsertCreditCostInput, "id">) => void | Promise<void>;
}

function PricingFormDialog({ open, initial, saving, onCancel, onSubmit }: PricingFormDialogProps) {
  // Local form state. Resets every time the dialog reopens via the `key`
  // on the inner component below.
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit pricing row" : "Add new model"}</DialogTitle>
          <DialogDescription>
            Cost is in credits. For per-second models, set duration to the typical clip
            length and the cost will be applied per generation; runtime billing reads
            `pricing_type` to decide whether to multiply.
          </DialogDescription>
        </DialogHeader>
        {/* `key` forces remount when switching between create/edit so the
         *  controlled inputs reset cleanly. */}
        <PricingFormFields
          key={initial?.id ?? "new"}
          initial={initial}
          saving={saving}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

function PricingFormFields({ initial, saving, onCancel, onSubmit }: Omit<PricingFormDialogProps, "open">) {
  const [feature, setFeature] = useState<string>(initial?.feature ?? "image");
  const [model, setModel] = useState(initial?.model ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const [pricingType, setPricingType] = useState<string>(initial?.pricing_type ?? "fixed");
  const [duration, setDuration] = useState(
    initial?.duration_seconds != null ? String(initial.duration_seconds) : "",
  );
  const [hasAudio, setHasAudio] = useState(Boolean(initial?.has_audio));

  const showDuration = pricingType === "fixed" || pricingType === "per_second";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const costNum = Number(cost);
    if (!Number.isFinite(costNum) || costNum <= 0) {
      toast.error("Cost must be a positive number");
      return;
    }
    if (!feature) {
      toast.error("Pick a feature");
      return;
    }
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    let durationNum: number | null = null;
    if (showDuration && duration.trim()) {
      durationNum = Number(duration);
      if (!Number.isFinite(durationNum) || durationNum < 0) {
        toast.error("Duration must be a non-negative number");
        return;
      }
    }
    onSubmit({
      feature,
      model: model.trim() || null,
      label: label.trim(),
      cost: costNum,
      pricing_type: pricingType || null,
      duration_seconds: durationNum,
      has_audio: hasAudio,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="feature">Feature</Label>
          <Select value={feature} onValueChange={setFeature}>
            <SelectTrigger id="feature">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEATURE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pricing-type">Pricing type</Label>
          <Select value={pricingType} onValueChange={(v: PricingType | string) => setPricingType(v)}>
            <SelectTrigger id="pricing-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRICING_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="model">Model identifier</Label>
        <Input
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-image-1, kling-v2.5-pro, tripo3d-v2..."
        />
        <p className="text-xs text-muted-foreground mt-1">
          The exact identifier the runtime sends. Leave blank only for default-tier rows.
        </p>
      </div>

      <div>
        <Label htmlFor="label">Display label</Label>
        <Input
          id="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="GPT Image — High quality"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cost">Cost (credits)</Label>
          <Input
            id="cost"
            type="number"
            min="0"
            step="any"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="10"
            required
          />
        </div>
        {showDuration && (
          <div>
            <Label htmlFor="duration">Duration (seconds)</Label>
            <Input
              id="duration"
              type="number"
              min="0"
              step="any"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="5"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label htmlFor="has-audio" className="cursor-pointer">Has audio</Label>
          <p className="text-xs text-muted-foreground">
            Set when this video tier comes with generated audio (affects billing tier).
          </p>
        </div>
        <Switch id="has-audio" checked={hasAudio} onCheckedChange={setHasAudio} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {initial ? "Save changes" : "Add model"}
        </Button>
      </DialogFooter>
    </form>
  );
}
