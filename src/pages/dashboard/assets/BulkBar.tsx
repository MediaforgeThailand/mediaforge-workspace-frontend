import { X, Download, Trash2 } from "lucide-react";

interface Props {
  count: number;
  onClear: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

export const BulkBar = ({ count, onClear, onDownload, onDelete }: Props) => {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-card/95 backdrop-blur-xl border border-strong rounded-2xl px-4 py-2.5 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
      <button
        onClick={onClear}
        className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <span className="text-[13px] font-semibold text-foreground">
        {count} selected
      </span>
      <div className="w-px h-6 bg-[hsl(220_18%_26%)]" />
      <button
        onClick={onDownload}
        className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold flex items-center gap-1.5 hover:brightness-110"
      >
        <Download className="w-3.5 h-3.5" /> Download {count}
      </button>
      <button
        onClick={onDelete}
        className="h-8 px-3 rounded-lg bg-muted border border-strong text-destructive text-[12px] font-medium flex items-center gap-1.5 hover:bg-destructive/20"
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
    </div>
  );
};
