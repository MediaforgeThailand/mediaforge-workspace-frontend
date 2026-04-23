export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FlowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ExposedField {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  paramKey: string;
  paramLabel: string;
  paramType: string;
  options?: string[];
  defaultValue: string | number;
  min?: number;
  max?: number;
  step?: number;
}

export interface InputField {
  nodeId: string;
  label: string;
  fieldLabel: string;
  fieldType: "image" | "text" | "video";
  required: boolean;
  accept?: string;
  placeholder?: string;
  exampleImageUrls?: string[];
}

export interface TextInputField {
  nodeId: string;
  label: string;
  fieldLabel: string;
  placeholder?: string;
  defaultValue: string;
  required: boolean;
  exampleText?: string;
}

export type ExecutionState = "idle" | "submitting" | "processing" | "done" | "error" | "insufficient_credits";

export type ExampleMediaItem = { url: string; type: "image" | "video" };
