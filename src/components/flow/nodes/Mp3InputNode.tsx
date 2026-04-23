import { memo, useCallback, useRef, useState, type DragEvent } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Music, Loader2, X, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import BaseNodeWrapper, { type PortDef } from "./BaseNodeWrapper";
import { NODE_API_SCHEMA } from "./nodeApiSchema";

const SCHEMA = NODE_API_SCHEMA.mp3InputNode;
const MAX_BYTES = 3 * 1024 * 1024; // 3MB

const OUTPUT_PORTS: PortDef[] = SCHEMA.outputs.map((h) => ({
  id: h.id,
  label: h.label,
  color: h.color,
}));

export interface Mp3InputNodeData {
  label?: string;
  nodeName?: string;
  fieldLabel?: string;
  previewUrl?: string;
  fileName?: string;
  storagePath?: string;
  uploading?: boolean;
  params?: Record<string, unknown>;
}

const Mp3InputNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as Mp3InputNodeData;
  const { user } = useAuth();
  const { setNodes } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const updateData = useCallback(
    (updates: Partial<Mp3InputNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...updates } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!user) { toast.error("Please log in to upload files"); return; }
      if (!file.type.startsWith("audio/") && !file.name.toLowerCase().endsWith(".mp3")) {
        toast.error("Only MP3 audio files are supported");
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error("MP3 file is too large (max 3MB)");
        return;
      }

      const localPreview = URL.createObjectURL(file);
      updateData({ previewUrl: localPreview, fileName: file.name, uploading: true });

      const ext = file.name.split(".").pop() || "mp3";
      const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("ai-media")
        .upload(storagePath, file, { contentType: file.type || "audio/mpeg", upsert: true });

      if (uploadErr) {
        toast.error(`Upload failed: ${file.name}`);
        updateData({ previewUrl: undefined, fileName: undefined, uploading: false });
        URL.revokeObjectURL(localPreview);
        return;
      }

      const { data: signedData } = await supabase.storage
        .from("ai-media")
        .createSignedUrl(storagePath, 60 * 60 * 24);

      updateData({
        previewUrl: signedData?.signedUrl || localPreview,
        storagePath,
        fileName: file.name,
        uploading: false,
      });
      URL.revokeObjectURL(localPreview);
    },
    [user, updateData],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = "";
    },
    [handleUpload],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const clearFile = useCallback(() => {
    updateData({ previewUrl: undefined, fileName: undefined, storagePath: undefined, uploading: false });
  }, [updateData]);

  const params = d.params ?? {};
  const nodeName = (params.nodeName as string) || d.nodeName || SCHEMA.displayName;

  return (
    <BaseNodeWrapper
      title={nodeName}
      onTitleChange={(name) =>
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, nodeName: name, params: { ...(n.data as any).params, nodeName: name } } }
              : n,
          ),
        )
      }
      badge="CREATOR"
      accent="amber"
      icon={Music}
      inputs={[]}
      outputs={OUTPUT_PORTS}
      selected={selected}
      width={280}
      footerLeft="MP3 · max 3MB"
      footerRight={d.fileName ? "Uploaded" : "Empty"}
    >
      <div className="px-3 pb-3 pt-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,.mp3"
          className="hidden"
          onChange={handleFileChange}
        />

        {d.previewUrl ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <Music className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
              <span className="text-[11px] text-white/80 truncate flex-1" title={d.fileName}>
                {d.fileName || "audio.mp3"}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                className="text-white/40 hover:text-white/80 transition-colors"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <audio
              src={d.previewUrl}
              controls
              className="w-full h-8"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            disabled={d.uploading}
            className={cn(
              "w-full flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-5 transition-colors",
              isDragOver
                ? "border-amber-400/60 bg-amber-500/10"
                : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]",
              d.uploading && "opacity-60 cursor-wait",
            )}
          >
            {d.uploading ? (
              <Loader2 className="w-4 h-4 text-white/50 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 text-white/40" />
            )}
            <span className="text-[10.5px] text-white/55">
              {d.uploading ? "Uploading…" : "Click or drag MP3 here"}
            </span>
            <span className="text-[9px] text-white/30">Max 3MB</span>
          </button>
        )}
      </div>
    </BaseNodeWrapper>
  );
});

Mp3InputNode.displayName = "Mp3InputNode";
export default Mp3InputNode;
