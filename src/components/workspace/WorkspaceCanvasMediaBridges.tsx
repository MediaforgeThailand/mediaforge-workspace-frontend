import { useEffect, useRef, useState } from "react";
import AllAssetsDialog from "./AllAssetsDialog";
import StockPickerDialog from "./StockPickerDialog";

/**
 * Always-mounted bridges between the canvas right-click "Media" menu
 * and the dialogs / file picker that fulfil those actions:
 *
 *   `workspace-trigger-upload`     → opens the hidden OS file picker
 *   `workspace-open-all-assets`    → opens the AllAssetsDialog
 *   `workspace-open-stock`         → opens the StockPickerDialog
 *
 * Picked OS files are forwarded to the canvas via
 * `workspace-upload-files`, which `WorkspaceCanvas` already listens
 * for. The bridges live in this standalone component so they keep
 * working when the right sidebar is collapsed/hidden — Upload, Assets,
 * and Stock from the context menu must never be a dead click.
 */
const WorkspaceCanvasMediaBridges = () => {
  const [allAssetsOpen, setAllAssetsOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onAssets = () => setAllAssetsOpen(true);
    const onStock = () => setStockOpen(true);
    const onUpload = () => fileInputRef.current?.click();
    window.addEventListener("workspace-open-all-assets", onAssets);
    window.addEventListener("workspace-open-stock", onStock);
    window.addEventListener("workspace-trigger-upload", onUpload);
    return () => {
      window.removeEventListener("workspace-open-all-assets", onAssets);
      window.removeEventListener("workspace-open-stock", onStock);
      window.removeEventListener("workspace-trigger-upload", onUpload);
    };
  }, []);

  return (
    <>
      <AllAssetsDialog open={allAssetsOpen} onClose={() => setAllAssetsOpen(false)} />
      <StockPickerDialog open={stockOpen} onClose={() => setStockOpen(false)} />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.glb,.gltf,.usdz,.obj,.fbx"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            window.dispatchEvent(
              new CustomEvent("workspace-upload-files", {
                detail: { files: Array.from(e.target.files) },
              }),
            );
          }
          e.target.value = "";
        }}
      />
    </>
  );
};

export default WorkspaceCanvasMediaBridges;
