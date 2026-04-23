/**
 * OutputNode — Terminal display node.
 * Test2 redesign: emerald accent, 16:9 placeholder when no result,
 * mono "terminal · no params" footer.
 */
import { memo, useCallback } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Video, Image, Volume2 } from "lucide-react";
import BaseNodeWrapper from "./BaseNodeWrapper";
import { useLanguage } from "@/contexts/LanguageContext";

export interface OutputNodeData {
  label: string;
  outputType: "video" | "image" | "audio";
}

const ICONS = {
  video: Video,
  image: Image,
  audio: Volume2,
};

const OutputNode = memo(({ id, data, selected }: NodeProps) => {
  const { t } = useLanguage();
  const d = data as unknown as OutputNodeData;
  const type = d.outputType || "video";
  const Icon = ICONS[type] || Video;
  const { setNodes } = useReactFlow();

  const handleTitleChange = useCallback(
    (name: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: name } } : n)),
      );
    },
    [id, setNodes],
  );

  const title = d.label || `${type[0].toUpperCase() + type.slice(1)} Output`;
  const portLabel = type.toUpperCase();

  return (
    <BaseNodeWrapper
      title={title}
      badge="OUTPUT"
      accent="emerald"
      icon={Icon}
      inputs={[{ id: "default", label: portLabel, color: "emerald", dim: true }]}
      selected={selected}
      width={260}
      onTitleChange={handleTitleChange}
      footerLeft="terminal · no params"
    >
      {/* Placeholder media tile (16:9) */}
      <div
        className="fs-upload-zone flex flex-col items-center justify-center gap-1 py-6"
        style={{ aspectRatio: "16 / 9" }}
      >
        <Icon className="w-5 h-5 text-emerald-300/55" />
        <p className="text-[10.5px] text-white/45">{t("nodeResultHere")}</p>
      </div>
    </BaseNodeWrapper>
  );
});

OutputNode.displayName = "OutputNode";
export default OutputNode;
