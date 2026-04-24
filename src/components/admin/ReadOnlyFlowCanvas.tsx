import { Lock } from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import InputNode from "@/components/flow/nodes/InputNode";
import AnimatedEdge from "@/components/flow/AnimatedEdge";
import BananaProNode from "@/components/flow/nodes/BananaProNode";
import KlingVideoNode from "@/components/flow/nodes/KlingVideoNode";
import ChatAiNode from "@/components/flow/nodes/ChatAiNode";
import OutputNode from "@/components/flow/nodes/OutputNode";
import TextInputNode from "@/components/flow/nodes/TextInputNode";
import Mp3InputNode from "@/components/flow/nodes/Mp3InputNode";
import MergeAudioNode from "@/components/flow/nodes/MergeAudioNode";
import SeedDanceNode from "@/components/flow/nodes/SeedDanceNode";
import SeedDreamNode from "@/components/flow/nodes/SeedDreamNode";

const nodeTypes = {
  inputNode: InputNode,
  textInputNode: TextInputNode,
  mp3InputNode: Mp3InputNode,
  mergeAudioNode: MergeAudioNode,
  bananaProNode: BananaProNode,
  klingVideoNode: KlingVideoNode,
  chatAiNode: ChatAiNode,
  seedDanceNode: SeedDanceNode,
  seedDreamNode: SeedDreamNode,
  outputNode: OutputNode,
};

const edgeTypes = { animated: AnimatedEdge };

interface FlowGraphJSON {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
}

interface Props {
  graph: FlowGraphJSON | null | undefined;
}

function CanvasInner({ graph }: Props) {
  if (!graph?.nodes?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 py-12 text-center">
        <p className="text-sm text-muted-foreground">No graph data available</p>
      </div>
    );
  }

  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    draggable: false,
    selectable: false,
    connectable: false,
  }));

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    type: "animated",
  }));

  return (
    <div className="rounded-2xl border border-border bg-[#0d0d1a] relative" style={{ height: 520 }}>
      {/* Read-only badge */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
        <Lock className="w-3 h-3 text-amber-400" />
        <span className="text-[11px] font-medium text-amber-400">Read-only</span>
      </div>

      <ReactFlow
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        defaultEdgeOptions={{ type: "animated" }}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        deleteKeyCode={null}
        connectionLineStyle={{ stroke: "transparent" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.04)"
        />
        <Controls
          className="!bg-[#1a1a2e]/90 !backdrop-blur-xl !border-white/[0.06] !rounded-xl !shadow-2xl [&_button]:!bg-transparent [&_button]:!border-white/[0.06] [&_button]:!text-white/40 [&_button:hover]:!bg-white/[0.06] [&_button:hover]:!text-white/60"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-[#1a1a2e]/80 !backdrop-blur-xl !border-white/[0.06] !rounded-xl"
          nodeColor="rgba(255,255,255,0.1)"
          maskColor="rgba(13,13,26,0.9)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

export default function ReadOnlyFlowCanvas({ graph }: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner graph={graph} />
    </ReactFlowProvider>
  );
}
