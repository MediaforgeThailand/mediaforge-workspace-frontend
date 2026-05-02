import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole } from "lucide-react";
import { useNodes, type Node } from "@xyflow/react";
import { useCanvasCollaborationStore } from "./canvasCollaboration";

function getAbsolutePosition(
  node: Node,
  byId: Map<string, Node>,
): { x: number; y: number } | null {
  if (!node.position || typeof node.position.x !== "number") return null;
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  for (let i = 0; i < 16 && parentId; i += 1) {
    const parent = byId.get(parentId);
    if (!parent || !parent.position) break;
    x += parent.position.x ?? 0;
    y += parent.position.y ?? 0;
    parentId = parent.parentId;
  }
  return { x, y };
}

const CanvasLockBadges = memo(() => {
  const nodes = useNodes();
  const clientId = useCanvasCollaborationStore((state) => state.clientId);
  const locks = useCanvasCollaborationStore((state) => state.nodeLocks);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(".react-flow__viewport") as HTMLElement | null;
      if (el) setPortalTarget(el);
      else requestAnimationFrame(find);
    };
    find();
    return () => {
      cancelled = true;
    };
  }, []);

  const badges = useMemo(() => {
    const now = Date.now();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return Object.values(locks)
      .filter((lock) => lock.clientId !== clientId && lock.expiresAt > now)
      .map((lock) => {
        const node = byId.get(lock.nodeId);
        if (!node) return null;
        const pos = getAbsolutePosition(node, byId);
        if (!pos) return null;
        return {
          lock,
          left: pos.x,
          top: pos.y - 30,
        };
      })
      .filter(Boolean) as Array<{
        lock: (typeof locks)[string];
        left: number;
        top: number;
      }>;
  }, [clientId, locks, nodes]);

  if (!portalTarget || badges.length === 0) return null;

  return createPortal(
    <>
      {badges.map(({ lock, left, top }) => (
        <div
          key={`${lock.nodeId}:${lock.clientId}`}
          className="ws-node-lock-badge"
          style={{
            left,
            top,
            borderColor: lock.color,
            color: lock.color,
          }}
        >
          <LockKeyhole className="h-3 w-3" />
          <span>{lock.name}</span>
        </div>
      ))}
    </>,
    portalTarget,
  );
});

CanvasLockBadges.displayName = "CanvasLockBadges";
export default CanvasLockBadges;
