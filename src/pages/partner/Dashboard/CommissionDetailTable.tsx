import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { CommissionEvent } from "@/hooks/usePartnerStats";

interface Props {
  commissions: CommissionEvent[] | undefined;
  loading: boolean;
}

const STATUS_TONE: Record<CommissionEvent["status"], string> = {
  holding: "bg-muted text-muted-foreground",
  available: "bg-primary/15 text-primary border-primary/30",
  paid: "bg-primary/15 text-primary border-primary/30",
  clawback: "bg-destructive/15 text-destructive border-destructive/30",
  void: "bg-muted text-muted-foreground",
};

type FilterKey = "all" | CommissionEvent["status"];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "holding", label: "Holding" },
  { key: "available", label: "Available" },
  { key: "paid", label: "Paid" },
  { key: "clawback", label: "Clawback" },
];

const fmt = (v: number) =>
  `฿${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CommissionDetailTable = ({ commissions, loading }: Props) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    const rows = commissions ?? [];
    if (filter === "all") return rows;
    return rows.filter((c) => c.status === filter);
  }, [commissions, filter]);

  const counts = useMemo(() => {
    const rows = commissions ?? [];
    return {
      all: rows.length,
      holding: rows.filter((c) => c.status === "holding").length,
      available: rows.filter((c) => c.status === "available").length,
      paid: rows.filter((c) => c.status === "paid").length,
      clawback: rows.filter((c) => c.status === "clawback").length,
    } as Record<FilterKey, number>;
  }, [commissions]);

  return (
    <Card className="p-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between gap-2 text-left">
            <div>
              <h2
                className="text-base font-semibold"
                style={{ letterSpacing: "-0.02em" }}
              >
                Commission details
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                รายการ commission ทั้งหมด ({counts.all} รายการ) — คลิกเพื่อเปิด/ปิด
              </p>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4 space-y-3">
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="ml-1.5 opacity-60">{counts[f.key]}</span>
              </Button>
            ))}
          </div>

          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              ไม่มี commission ในฟิลเตอร์นี้
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Release</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">
                        {new Date(c.created_at).toLocaleDateString("th-TH")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.billing_cycle ?? "—"}
                        {c.cycle_index && c.cycle_index > 1 && (
                          <span className="ml-1">#{c.cycle_index}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {fmt(Number(c.gross_amount_thb))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {(Number(c.commission_rate) * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmt(Number(c.commission_amount_thb))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={STATUS_TONE[c.status]}
                          variant="outline"
                        >
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.status === "holding" && c.hold_until
                          ? `≈ ${new Date(c.hold_until).toLocaleDateString("th-TH")}`
                          : c.status === "paid" && c.paid_at
                          ? `paid ${new Date(c.paid_at).toLocaleDateString("th-TH")}`
                          : c.status === "available" && c.available_at
                          ? `ready ${new Date(c.available_at).toLocaleDateString("th-TH")}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default CommissionDetailTable;
