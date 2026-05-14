import type { Effect, Transform } from "../types/timeline";

export type RendererType = "webgpu" | "canvas2d";

/**
 * Adapter / device information surfaced to UI for transparency.
 * All renders happen locally; this metadata exists so the user can see
 * which physical device on *their* machine is doing the work.
 */
export interface RendererAdapterInfo {
  type: RendererType;
  /** Vendor reported by the GPU driver, e.g. "intel", "apple", "amd". */
  vendor?: string;
  /** Architecture string, e.g. "rdna-3", "ada-lovelace". */
  architecture?: string;
  /** Device name, often empty for privacy reasons. */
  device?: string;
  /** Driver string for diagnostics. */
  description?: string;
  /** WebGPU compatibility-mode adapter (limited feature set). */
  isCompatibilityMode?: boolean;
  /** Max 2D texture dimension supported by the device. */
  maxTextureDimension2D?: number;
  /** True if the renderer is GPU-accelerated. False = pure CPU canvas2d. */
  isHardwareAccelerated: boolean;
  /** True when we have a real adapter; false if browser hid it. */
  adapterInfoAvailable: boolean;
}

export interface RendererConfig {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  maxTextureCache?: number;
  preferredRenderer?: RendererType;
}

export interface RenderLayer {
  texture: GPUTexture | ImageBitmap;
  transform: Transform;
  effects: Effect[];
  opacity: number;
  borderRadius: number;
}

export interface Renderer {
  readonly type: RendererType;
  initialize(): Promise<boolean>;
  isSupported(): boolean;
  destroy(): void;
  beginFrame(): void;
  renderLayer(layer: RenderLayer): void;
  endFrame(): Promise<ImageBitmap>;
  createTextureFromImage(image: ImageBitmap): GPUTexture | ImageBitmap;
  releaseTexture(texture: GPUTexture | ImageBitmap): void;
  applyEffects(
    texture: GPUTexture | ImageBitmap,
    effects: Effect[],
  ): GPUTexture | ImageBitmap;
  onDeviceLost(callback: () => void): void;
  recreateDevice(): Promise<boolean>;
  resize(width: number, height: number): void;
  getMemoryUsage(): number;
  getDevice(): GPUDevice | null;
  /** Snapshot of adapter metadata for UI display. Cheap; safe to poll. */
  getAdapterInfo(): RendererAdapterInfo;
}

export function isWebGPUSupported(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return "gpu" in navigator && navigator.gpu !== undefined;
}

export function getBestRendererType(preferred?: RendererType): RendererType {
  if (preferred === "canvas2d") {
    return "canvas2d";
  }

  if (isWebGPUSupported()) {
    return "webgpu";
  }

  return "canvas2d";
}

export class RendererFactory {
  private static instance: RendererFactory | null = null;
  private currentRenderer: Renderer | null = null;
  private config: RendererConfig | null = null;

  private constructor() {}

  static getInstance(): RendererFactory {
    if (!RendererFactory.instance) {
      RendererFactory.instance = new RendererFactory();
    }
    return RendererFactory.instance;
  }

  isWebGPUSupported(): boolean {
    return isWebGPUSupported();
  }

  getRendererType(preferred?: RendererType): RendererType {
    return getBestRendererType(preferred);
  }

  async createRenderer(config: RendererConfig): Promise<Renderer> {
    this.config = config;

    // Honor explicit user choice. When the user picks "Force Canvas2D"
    // we skip the WebGPU probe entirely — both to avoid wasting time and
    // so the user can opt out of GPU usage for compatibility.
    const skipWebGPU = config.preferredRenderer === "canvas2d";

    // Try WebGPU first (unless explicitly disabled)
    if (!skipWebGPU && isWebGPUSupported()) {
      try {
        const { WebGPURenderer } = await import("./webgpu-renderer-impl");
        const renderer = new WebGPURenderer(config);
        const initialized = await renderer.initialize();

        if (initialized) {
          this.currentRenderer = renderer;

          return renderer;
        }

        console.warn("[RendererFactory] WebGPU init failed, using Canvas2D");
      } catch (error) {
        console.warn("[RendererFactory] WebGPU error, using Canvas2D:", error);
      }
    }

    // Fallback to Canvas2D
    const { Canvas2DFallbackRenderer } =
      await import("./canvas2d-fallback-renderer");
    const renderer = new Canvas2DFallbackRenderer(config);
    await renderer.initialize();
    this.currentRenderer = renderer;

    return renderer;
  }

  getCurrentRenderer(): Renderer | null {
    return this.currentRenderer;
  }

  destroyRenderer(): void {
    if (this.currentRenderer) {
      this.currentRenderer.destroy();
      this.currentRenderer = null;
    }
  }

  async recreateRenderer(): Promise<Renderer | null> {
    if (!this.config) {
      return null;
    }
    this.destroyRenderer();
    return this.createRenderer(this.config);
  }
}

export function getRendererFactory(): RendererFactory {
  return RendererFactory.getInstance();
}

export async function createRenderer(
  config: RendererConfig,
): Promise<Renderer> {
  return RendererFactory.getInstance().createRenderer(config);
}
