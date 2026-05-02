/**
 * PromptMentionTextarea — contentEditable div with @mention and #textvar autocomplete.
 * @mentions reference image/video nodes → rendered as blue pills, serialized as @[Label](nodeId).
 * #textvars reference text input nodes → rendered as green pills, serialized as #[Label](nodeId).
 * Both are atomic DOM spans with contentEditable={false}.
 *
 * State format: plain text with @[Label](nodeId) and #[Label](nodeId) tokens.
 */
import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ImagePlus, Film, MessageSquare, Sparkles, Type, AlertCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { countPromptChars } from "@/lib/promptLimits";

/* ── Types ── */

interface PromptMentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  excludeNodeId?: string;
  allowedNodeTypes?: string[];
  /** Additional node types allowed for # text variable injection */
  allowedTextVarTypes?: string[];
  /** Maximum allowed characters (after stripping mention tokens). When set, a counter is shown. */
  maxLength?: number | null;
  /** When set, restrict the mention dropdown to ONLY this set of node ids
   *  (intersected with `allowedNodeTypes` / `allowedTextVarTypes`). Used by
   *  workspace tool nodes to show only nodes connected via an upstream
   *  edge — typing `@` in a Video Gen prompt should only surface nodes
   *  that are actually wired into this node's input ports, not every
   *  asset on the canvas. Pass `null` (default) to keep the legacy
   *  "show every node of the allowed types" behaviour (e.g. TextNode
   *  uses globally-mentionable assets). */
  allowedNodeIds?: ReadonlySet<string> | null;
}

interface MentionOption {
  nodeId: string;
  label: string;
  type: string;
  icon: "image" | "video" | "text" | "ai" | "textvar";
  /** Whether this is a text variable (# trigger) or image/media mention (@ trigger) */
  isTextVar?: boolean;
}

/* ── Constants ── */

const ICON_MAP = {
  image: ImagePlus,
  video: Film,
  text: MessageSquare,
  ai: Sparkles,
  textvar: Type,
};

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;
const TEXTVAR_REGEX = /#\[([^\]]+)\]\(([^)]+)\)/g;
/** Combined regex that matches both @ and # tokens */
const ALL_TOKEN_REGEX = /([#@])\[([^\]]+)\]\(([^)]+)\)/g;

function normalizePromptTokens(raw: string): string {
  return raw
    .replace(/##+\[\[([^\]]+)\]\]\(([^)]+)\)/g, "#[$1]($2)")
    .replace(/#\[\[([^\]]+)\]\]\(([^)]+)\)/g, "#[$1]($2)")
    .replace(/##+\[([^\]]+)\]\(([^)]+)\)/g, "#[$1]($2)")
    .replace(/@@+\[\[([^\]]+)\]\]\(([^)]+)\)/g, "@[$1]($2)")
    .replace(/@\[\[([^\]]+)\]\]\(([^)]+)\)/g, "@[$1]($2)")
    .replace(/@@+\[([^\]]+)\]\(([^)]+)\)/g, "@[$1]($2)");
}

/* ── Helpers ── */

function getNodeIcon(nodeType: string, data: Record<string, unknown>): MentionOption["icon"] {
  if (nodeType === "textInputNode" || nodeType === "textNode") return "textvar";
  if (nodeType === "inputNode" || nodeType === "assetNode") {
    return (data.fieldType as string) === "video" ? "video" : "image";
  }
  if (nodeType === "chatAiNode") return "text";
  if (nodeType === "outputNode") {
    const t = data.outputType as string;
    return t === "video" ? "video" : t === "audio" ? "text" : "image";
  }
  // Workspace tool-node types — pick the icon by the gen kind they
  // produce. We look at the most-recent generation (if any) so a
  // freshly-created node still gets a sensible default icon while
  // its label is empty.
  if (nodeType === "imageGenNode") return "image";
  if (nodeType === "videoGenNode") return "video";
  if (nodeType === "audioGenNode" || nodeType === "mergeAudioNode")
    return "text";
  if (nodeType === "videoToPromptNode") return "text";
  if (nodeType === "imageTo3dNode") return "image";
  if (nodeType === "removeBackgroundNode") return "image";
  // Fallback to whichever the latest generation says it is — covers
  // any new tool node the schema adds without a hardcoded entry.
  const gens = Array.isArray(data.generations)
    ? (data.generations as Array<{ type?: string }>)
    : [];
  if (gens.length > 0) {
    const t = gens[0]?.type;
    if (t === "video") return "video";
    if (t === "image") return "image";
    if (t === "text") return "text";
  }
  return "ai";
}

function getNodeDisplayLabel(data: Record<string, unknown>): string {
  // Resolution order matters — different node families store the
  // user-editable display name in different places:
  //
  //   • Workspace tool nodes (ImageGen / VideoGen / ChatAi / Banana
  //     / Kling / etc.) save their title-input value under
  //     `data.params.nodeName`. This is the path the rename UI
  //     writes to, so it has to come FIRST or a renamed tool node
  //     will keep showing the schema's default displayName.
  //   • Legacy flow nodes occasionally use a top-level
  //     `data.nodeName` — kept as a fallback so historical canvases
  //     don't lose their labels.
  //   • AssetNode / TextNode / GroupNode write to `data.label`.
  //
  // Empty / whitespace-only strings skip to the next candidate
  // (otherwise clearing the title input would leave the dropdown
  // showing nothing instead of the next sensible default).
  const params = data.params as Record<string, unknown> | undefined;
  const candidates = [params?.nodeName, data.nodeName, data.label];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return "Untitled";
}

/**
 * Parse raw string → array of segments for rendering into DOM.
 * Handles both @[Label](nodeId) and #[Label](nodeId) tokens.
 */
function parseSegments(raw: string): Array<{ type: "text"; text: string } | { type: "mention"; label: string; nodeId: string } | { type: "textvar"; label: string; nodeId: string }> {
  const normalizedRaw = normalizePromptTokens(raw);
  const segments: Array<{ type: "text"; text: string } | { type: "mention"; label: string; nodeId: string } | { type: "textvar"; label: string; nodeId: string }> = [];
  let lastIndex = 0;
  const regex = new RegExp(ALL_TOKEN_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalizedRaw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: normalizedRaw.slice(lastIndex, match.index) });
    }
    const trigger = match[1]; // @ or #
    segments.push({
      type: trigger === "#" ? "textvar" : "mention",
      label: match[2],
      nodeId: match[3],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < normalizedRaw.length) {
    segments.push({ type: "text", text: normalizedRaw.slice(lastIndex) });
  }
  return segments;
}

/**
 * Read DOM of contentEditable back into raw string with @[Label](nodeId) and #[Label](nodeId) tokens.
 */
function domToRaw(container: HTMLElement): string {
  let result = "";
  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const nodeId = el.getAttribute("data-mention-id");
      const label = el.getAttribute("data-mention-label");
      const isTextVar = el.classList.contains("textvar-pill");
      if (nodeId && label) {
        const prefix = isTextVar ? "#" : "@";
        result += `${prefix}[${label}](${nodeId})`;
      } else if (el.tagName === "BR") {
        result += "\n";
      } else {
        result += domToRaw(el);
      }
    }
  });
  return result;
}

/**
 * Restore caret to a character offset within a contentEditable element.
 * Walks DOM nodes counting raw text length (mentions count as their token length).
 */
function restoreCaretByOffset(container: HTMLElement, targetOffset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = targetOffset;

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? "").length;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        sel!.removeAllRanges();
        sel!.addRange(range);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const mentionId = el.getAttribute("data-mention-id");
      const mentionLabel = el.getAttribute("data-mention-label");
      if (mentionId && mentionLabel) {
        const isTextVar = el.classList.contains("textvar-pill");
        const prefix = isTextVar ? "#" : "@";
        const tokenLen = `${prefix}[${mentionLabel}](${mentionId})`.length;
        if (remaining <= tokenLen) {
          // Place cursor after this mention
          const range = document.createRange();
          range.setStartAfter(el);
          range.collapse(true);
          sel!.removeAllRanges();
          sel!.addRange(range);
          return true;
        }
        remaining -= tokenLen;
        return false;
      }
      if (el.tagName === "BR") {
        if (remaining <= 1) {
          const range = document.createRange();
          range.setStartAfter(el);
          range.collapse(true);
          sel!.removeAllRanges();
          sel!.addRange(range);
          return true;
        }
        remaining -= 1;
        return false;
      }
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  }

  walk(container);
  // If offset exceeds content, place at end
  if (remaining > 0) placeCaretAtEnd(container);
}

/**
 * Place caret at end of a contentEditable element.
 */
function placeCaretAtEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ── Component ── */

const PromptMentionTextarea = memo(({
  value,
  onChange,
  placeholder,
  className,
  excludeNodeId,
  allowedNodeTypes = ["inputNode", "assetNode"],
  allowedTextVarTypes = ["textInputNode"],
  maxLength,
  allowedNodeIds = null,
}: PromptMentionTextareaProps) => {
  const { t } = useLanguage();
  const { getNodes } = useReactFlow();
  const editorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mentionRangeRef = useRef<Range | null>(null);

  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCaretRect, setMentionCaretRect] = useState<{ top: number; left: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  /** Tracks which trigger character activated the dropdown: "@" or "#" */
  const activeTriggerRef = useRef<"@" | "#">("@");

  // Track whether we're doing an internal DOM update to avoid re-render loops
  const suppressSync = useRef(false);

  /* ── Mention options (@ trigger — image/video/ai nodes) ──
   *
   * The list is filtered down to nodes that:
   *   1. Aren't this same node (no self-mention)
   *   2. Have an allowed type (default: assets / inputs)
   *   3. Are in the `allowedNodeIds` set IF one was provided
   *      (workspace tool nodes pass the set of upstream-connected
   *      node ids so the dropdown only surfaces nodes the prompt
   *      can actually resolve at run time).
   * Setting `allowedNodeIds = null` keeps the legacy "every node of
   * the allowed types is mentionable" behaviour — used by TextNode
   * which doesn't have input ports. */
  const mentionOptions = useMemo((): MentionOption[] => {
    const nodes = getNodes();
    return nodes
      .filter((n) => {
        if (n.id === excludeNodeId) return false;
        if (!allowedNodeTypes.includes(n.type || "")) return false;
        if (allowedNodeIds && !allowedNodeIds.has(n.id)) return false;
        return true;
      })
      .map((n) => {
        const data = n.data as Record<string, unknown>;
        return {
          nodeId: n.id,
          label: getNodeDisplayLabel(data),
          type: n.type || "unknown",
          icon: getNodeIcon(n.type || "", data),
        };
      });
  }, [getNodes, excludeNodeId, allowedNodeTypes, allowedNodeIds]);

  /* ── Text var options (# trigger — textInputNode) ──
   * Same connection-aware filter as @ mentions: a #variable that
   * references a TextNode the user hasn't actually wired up would
   * silently fail at run time, so we hide them from the dropdown. */
  const textVarOptions = useMemo((): MentionOption[] => {
    const nodes = getNodes();
    return nodes
      .filter((n) => {
        if (n.id === excludeNodeId) return false;
        if (!allowedTextVarTypes.includes(n.type || "")) return false;
        if (allowedNodeIds && !allowedNodeIds.has(n.id)) return false;
        return true;
      })
      .map((n) => {
        const data = n.data as Record<string, unknown>;
        return {
          nodeId: n.id,
          label: getNodeDisplayLabel(data),
          type: n.type || "unknown",
          icon: "textvar" as const,
          isTextVar: true,
        };
      });
  }, [getNodes, excludeNodeId, allowedTextVarTypes, allowedNodeIds]);

  const filteredOptions = useMemo(() => {
    const baseOptions = activeTriggerRef.current === "#" ? textVarOptions : mentionOptions;
    if (!mentionQuery) return baseOptions;
    const q = mentionQuery.toLowerCase();
    return baseOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [mentionOptions, textVarOptions, mentionQuery]);

  useEffect(() => { setSelectedIndex(0); }, [filteredOptions.length]);

  /* ── Sync React state → DOM (only when value changes externally) ── */
  useEffect(() => {
    if (suppressSync.current) {
      suppressSync.current = false;
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;

    // Compare current DOM raw text with incoming value — skip if equivalent
    const normalizedValue = normalizePromptTokens(value);
    const currentRaw = normalizePromptTokens(domToRaw(editor));
    if (currentRaw === normalizedValue) return;

    // Save cursor position relative to character offset
    const sel = window.getSelection();
    const hadFocus = document.activeElement === editor;
    let savedOffset = -1;
    if (hadFocus && sel && sel.rangeCount > 0) {
      // Calculate character offset of cursor in the raw text
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.startContainer, range.startOffset);
      const preDiv = document.createElement("div");
      preDiv.appendChild(preRange.cloneContents());
      savedOffset = domToRaw(preDiv).length;
    }

    // Build DOM from parsed segments
    const segments = parseSegments(normalizedValue);
    const frag = document.createDocumentFragment();
    segments.forEach((seg) => {
      if (seg.type === "text") {
        const lines = seg.text.split("\n");
        lines.forEach((line, i) => {
          if (line) frag.appendChild(document.createTextNode(line));
          if (i < lines.length - 1) frag.appendChild(document.createElement("br"));
        });
      } else {
        const isTextVar = seg.type === "textvar";
        const span = document.createElement("span");
        span.contentEditable = "false";
        span.setAttribute("data-mention-id", seg.nodeId);
        span.setAttribute("data-mention-label", seg.label);
        span.className = isTextVar ? "textvar-pill" : "mention-pill";
        const allOpts = [...mentionOptions, ...textVarOptions];
        const option = allOpts.find((o) => o.nodeId === seg.nodeId);
        const iconName = option?.icon ?? (isTextVar ? "textvar" : "ai");
        const iconText = iconName === "image" ? "🖼" : iconName === "video" ? "🎬" : iconName === "textvar" ? "📝" : iconName === "text" ? "💬" : "✨";
        span.innerHTML = `<span class="${isTextVar ? "textvar-pill-icon" : "mention-pill-icon"}">${iconText}</span>${option?.label ?? seg.label}`;
        frag.appendChild(span);
      }
    });

    editor.innerHTML = "";
    editor.appendChild(frag);

    // Restore cursor to saved character offset
    if (hadFocus && sel && savedOffset >= 0) {
      restoreCaretByOffset(editor, savedOffset);
    }
  }, [value, mentionOptions, textVarOptions]);

  /* ── Read DOM → raw string on every input ── */
  const syncFromDom = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const raw = normalizePromptTokens(domToRaw(editor));
    const normalizedValue = normalizePromptTokens(value);
    if (raw !== normalizedValue) {
      suppressSync.current = true;
      onChange(raw);
    }
  }, [onChange, value]);

  /* ── Detect @ or # trigger ── */
  const checkForMentionTrigger = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { setShowMentions(false); mentionRangeRef.current = null; return; }

    const range = sel.getRangeAt(0);
    if (!range.collapsed) { setShowMentions(false); mentionRangeRef.current = null; return; }

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setShowMentions(false); mentionRangeRef.current = null; return; }

    const textBefore = (node.textContent ?? "").slice(0, range.startOffset);

    // Check for both triggers — pick the latest one
    const lastAt = textBefore.lastIndexOf("@");
    const lastHash = textBefore.lastIndexOf("#");
    const triggerPos = Math.max(lastAt, lastHash);
    if (triggerPos < 0) { setShowMentions(false); mentionRangeRef.current = null; return; }

    const triggerChar = triggerPos === lastHash ? "#" : "@";
    const query = textBefore.slice(triggerPos + 1);
    if (query.includes("\n") || query.length > 30) { setShowMentions(false); mentionRangeRef.current = null; return; }

    activeTriggerRef.current = triggerChar;

    const mentionRange = document.createRange();
    mentionRange.setStart(node, triggerPos);
    mentionRange.setEnd(node, range.startOffset);
    mentionRangeRef.current = mentionRange.cloneRange();

    const rect = mentionRange.getBoundingClientRect();

    // Guard: if no mentionable nodes exist for this trigger, silently drop the
    // dropdown instead of showing an empty popover. Workspace-side assetNodes
    // re-use this component; when the current graph has zero of them the list
    // would otherwise render as an empty floating panel.
    const optionsForTrigger =
      triggerChar === "#" ? textVarOptions : mentionOptions;
    if (optionsForTrigger.length === 0) {
      setShowMentions(false);
      mentionRangeRef.current = null;
      return;
    }

    setShowMentions(true);
    setMentionQuery(query);
    setMentionCaretRect({ top: rect.top, left: rect.left });
  }, [mentionOptions, textVarOptions]);

  const handleInput = useCallback(() => {
    syncFromDom();
    // Save range on every input as failsafe
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      mentionRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
    checkForMentionTrigger();
  }, [syncFromDom, checkForMentionTrigger]);

  /** Continuously track cursor position so we never lose it */
  const saveCurrentRange = useCallback(() => {
    if (showMentions && mentionRangeRef.current) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      mentionRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, [showMentions]);

  /* ── Insert mention ── */
  const insertMention = useCallback((option: MentionOption) => {
    const editor = editorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel) return;

    // Step 1: Restore saved range BEFORE focus (focus resets selection to 0)
    const savedRange = mentionRangeRef.current;
    if (!savedRange) return;

    // Ensure editor has focus without losing the range
    if (document.activeElement !== editor) {
      editor.focus();
    }

    // Restore the exact range that covers "@query"
    sel.removeAllRanges();
    sel.addRange(savedRange);

    // Step 2: Delete the @query text
    savedRange.deleteContents();

    // Step 3: Create pill span (atomic block)
    const isTextVar = option.isTextVar || option.icon === "textvar";
    const span = document.createElement("span");
    span.contentEditable = "false";
    span.setAttribute("data-mention-id", option.nodeId);
    span.setAttribute("data-mention-label", option.label);
    span.className = isTextVar ? "textvar-pill" : "mention-pill";
    const iconText = option.icon === "image" ? "🖼" : option.icon === "video" ? "🎬" : option.icon === "textvar" ? "📝" : option.icon === "text" ? "💬" : "✨";
    span.innerHTML = `<span class="${isTextVar ? "textvar-pill-icon" : "mention-pill-icon"}">${iconText}</span>${option.label}`;

    // Step 4: Insert span + trailing space at the collapsed range position
    savedRange.insertNode(span);

    const trailingSpace = document.createTextNode("\u00A0");
    span.parentNode?.insertBefore(trailingSpace, span.nextSibling);

    // Step 5: Move cursor after the trailing space
    const newRange = document.createRange();
    newRange.setStart(trailingSpace, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    mentionRangeRef.current = null;
    setShowMentions(false);
    setMentionQuery("");

    // Sync to state
    syncFromDom();
  }, [syncFromDom]);

  /* ── Keyboard handling ── */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // CRITICAL: Stop Backspace/Delete from bubbling to React Flow (which would delete the node)
    if (e.key === "Backspace" || e.key === "Delete") {
      e.stopPropagation();
    }

    if (showMentions && filteredOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i + 1) % filteredOptions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i - 1 + filteredOptions.length) % filteredOptions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        insertMention(filteredOptions[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        setShowMentions(false);
        return;
      }
    }

    // Prevent Enter from creating <div> wrappers — insert <br> instead
    if (e.key === "Enter" && !e.shiftKey && !showMentions) {
      e.preventDefault();
      e.stopPropagation();
      document.execCommand("insertLineBreak");
      syncFromDom();
    }
  }, [showMentions, filteredOptions, selectedIndex, insertMention, syncFromDom]);

  /* ── Copy: write raw @[Label](id) to clipboard ── */
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    // Extract selected fragment and convert mention spans to raw tokens
    const frag = sel.getRangeAt(0).cloneContents();
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(frag);
    const rawText = domToRaw(tempDiv);
    e.clipboardData.setData("text/plain", rawText);
  }, []);

  /* ── Paste: insert plain text and re-render any @[...](id) as pills ── */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const editor = editorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    // Delete any current selection first
    const range = sel.getRangeAt(0);
    range.deleteContents();

    // Parse pasted text for mention tokens and build DOM fragment
    const segments = parseSegments(text);
    const frag = document.createDocumentFragment();
    let lastNode: Node | null = null;

    segments.forEach((seg) => {
      if (seg.type === "text") {
        const lines = seg.text.split("\n");
        lines.forEach((line, i) => {
          if (line) {
            const tn = document.createTextNode(line);
            frag.appendChild(tn);
            lastNode = tn;
          }
          if (i < lines.length - 1) {
            const br = document.createElement("br");
            frag.appendChild(br);
            lastNode = br;
          }
        });
      } else {
        const isTextVar = seg.type === "textvar";
        const span = document.createElement("span");
        span.contentEditable = "false";
        span.setAttribute("data-mention-id", seg.nodeId);
        span.setAttribute("data-mention-label", seg.label);
        span.className = isTextVar ? "textvar-pill" : "mention-pill";
        const allOpts = [...mentionOptions, ...textVarOptions];
        const option = allOpts.find((o) => o.nodeId === seg.nodeId);
        const iconName = option?.icon ?? (isTextVar ? "textvar" : "ai");
        const iconText = iconName === "image" ? "🖼" : iconName === "video" ? "🎬" : iconName === "textvar" ? "📝" : iconName === "text" ? "💬" : "✨";
        span.innerHTML = `<span class="${isTextVar ? "textvar-pill-icon" : "mention-pill-icon"}">${iconText}</span>${option?.label ?? seg.label}`;
        frag.appendChild(span);
        lastNode = span;
      }
    });

    range.insertNode(frag);

    // Move cursor to end of pasted content
    if (lastNode) {
      const newRange = document.createRange();
      newRange.setStartAfter(lastNode);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    syncFromDom();
  }, [syncFromDom, mentionOptions, textVarOptions]);

  useEffect(() => {
    if (!showMentions) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        editorRef.current && !editorRef.current.contains(e.target as Node)
      ) {
        mentionRangeRef.current = null;
        setShowMentions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMentions]);

  const stopDrag = useCallback((e: React.MouseEvent) => { e.stopPropagation(); }, []);

  /* ── Dropdown position (portal to body for z-index safety) ── */
  const dropdownStyle = useMemo(() => {
    if (!mentionCaretRect || !editorRef.current) return {};
    const editorRect = editorRef.current.getBoundingClientRect();
    return {
      position: "fixed" as const,
      left: Math.max(editorRect.left, Math.min(mentionCaretRect.left, editorRect.right - 220)),
      top: mentionCaretRect.top - 4,
      transform: "translateY(-100%)",
      width: Math.min(260, editorRect.width),
    };
  }, [mentionCaretRect]);

  // Treat whitespace-only values (newlines, spaces) as empty so the
  // placeholder reappears after the user types something then deletes
  // it all. Chrome leaves a stray `<br>` inside an empty contenteditable
  // — `domToRaw` faithfully converts that to `"\n"`, and without this
  // trim the resulting string was truthy and `is-empty` never came
  // back, so the placeholder stayed gone forever (user reported the
  // gen node turning into a blank black box after a delete-all).
  const isEmpty = !normalizePromptTokens(value).trim();

  // ── Character count + over-limit detection ──
  const charCount = useMemo(() => countPromptChars(value), [value]);
  const overLimit = typeof maxLength === "number" && maxLength > 0 && charCount > maxLength;
  const nearLimit = typeof maxLength === "number" && maxLength > 0 && !overLimit && charCount >= Math.floor(maxLength * 0.9);

  /* 2026-05 fix: when the prompt grows past `max-h-[200px]`, React
   *  Flow used to eat the wheel event before the contentEditable
   *  could scroll — `.nowheel` sat on the OUTER wrapper, not the
   *  scrollable element itself, so wheels on a tall prompt panned
   *  the canvas instead of scrolling the prompt. The user couldn't
   *  reach lines that were clipped above/below the visible window.
   *
   *  Fix is two-fold:
   *    1. Put `nowheel` directly on the scrollable contentEditable
   *       so React Flow ignores wheels there.
   *    2. Defensive `onWheel` handler that calls stopPropagation
   *       only when the element has scroll headroom in the wheel
   *       direction — that way an at-edge wheel still bubbles up to
   *       the canvas (so the user can keep panning past the prompt
   *       once they've hit the top/bottom). */
  const handlePromptWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const goingUp = e.deltaY < 0;
    const goingDown = e.deltaY > 0;
    // We can absorb the wheel if there's still room to scroll that direction.
    const canScroll = (goingDown && !atBottom) || (goingUp && !atTop);
    if (canScroll) {
      e.stopPropagation();
    }
  }, []);

  return (
    <div className="relative nodrag nopan" onMouseDown={stopDrag}>
      {/* Editable div */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={saveCurrentRange}
        onMouseUp={saveCurrentRange}
        onKeyDown={handleKeyDown}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onClick={stopDrag}
        onMouseDown={stopDrag}
        onWheel={handlePromptWheel}
        onBlur={() => { syncFromDom(); setTimeout(() => setShowMentions(false), 150); }}
        data-placeholder={placeholder}
        className={cn(
          "prompt-editable",
          /* nowheel must sit on the scrollable element (not the
           *  parent) — React Flow checks the event.target's class
           *  list, not its ancestors, when deciding whether to pan. */
          "nowheel nodrag nopan",
          "w-full bg-transparent border rounded px-2 py-1.5",
          overLimit ? "border-red-500/70" : "border-white/[0.06]",
          "text-[11px] leading-[1.5] tracking-normal font-sans",
          "text-white/80 caret-white/70",
          /* max-h bumped 200 → 280 so common long prompts fit
           *  without scrolling at all. The defensive wheel handler
           *  + scrollbar-thin override below keep the experience
           *  smooth when content does exceed the cap. */
          "min-h-[40px] max-h-[280px] overflow-y-auto",
          "focus:outline-none",
          overLimit ? "focus:border-red-400" : "focus:border-white/20",
          "break-words whitespace-pre-wrap",
          "transition-colors",
          "cursor-text select-text",
          isEmpty && "is-empty",
          className,
        )}
        /* Inline scrollbar override: the global rule in index.css
         *  hides every native scrollbar (`scrollbar-width: none`),
         *  but we want a slim track here so the user can SEE that
         *  the prompt is scrollable and grab the thumb with the
         *  mouse. Inline style wins over the `* { ... !important }`
         *  global because of CSS specificity ordering for inline
         *  styles. */
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.18) transparent" }}
        role="textbox"
        aria-multiline="true"
      />

      {/* Character counter (only when maxLength is provided) */}
      {typeof maxLength === "number" && maxLength > 0 && (
        <div className="flex items-center justify-between gap-1.5 mt-1 px-0.5">
          {overLimit ? (
            <span className="flex items-center gap-1 text-[9.5px] font-medium text-red-400">
              <AlertCircle className="w-2.5 h-2.5" />
              {t("promptOverLimit", { over: charCount - maxLength })}
            </span>
          ) : <span />}
          <span
            className={cn(
              "ml-auto font-mono text-[9.5px] tabular-nums",
              overLimit ? "text-red-400 font-semibold" : nearLimit ? "text-amber-400" : "text-white/35",
            )}
          >
            {charCount.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        </div>
      )}

      {/* Mention dropdown (portalled) */}
      {showMentions && filteredOptions.length > 0 && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="nodrag nopan z-[9999] max-h-[180px] overflow-y-auto rounded-lg border border-white/10 bg-[hsl(220_15%_12%)] shadow-xl shadow-black/40 py-1 backdrop-blur-xl"
        >
          <div className="px-2 py-1 text-[9px] text-white/30 font-semibold tracking-wider uppercase">
            {activeTriggerRef.current === "#" ? "Inject text variable" : "Reference a node"}
          </div>
          {filteredOptions.map((option, idx) => {
            const Icon = ICON_MAP[option.icon];
            return (
              <button
                key={option.nodeId}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  insertMention(option);
                }}
                onMouseDown={(e) => e.preventDefault()}
                className={cn(
                  "flex items-center gap-2 w-full text-left px-2 py-1.5 text-[11px] transition-colors",
                  idx === selectedIndex
                    ? "bg-white/[0.08] text-white/90"
                    : "text-white/60 hover:bg-white/[0.05] hover:text-white/80",
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0 text-white/40" />
                <span className="truncate font-medium">{option.label}</span>
                <span className="ml-auto text-[9px] text-white/20 font-mono shrink-0">
                  {option.type.replace("Node", "")}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {showMentions && filteredOptions.length === 0 && mentionQuery && createPortal(
        <div
          style={dropdownStyle}
          className="z-[9999] rounded-lg border border-white/10 bg-[hsl(220_15%_12%)] shadow-xl py-3 text-center"
        >
          <span className="text-[10px] text-white/30">{t("nodeNoMatchingNodes")}</span>
        </div>,
        document.body,
      )}
    </div>
  );
});

PromptMentionTextarea.displayName = "PromptMentionTextarea";
export default PromptMentionTextarea;

/**
 * Extracts structured mention references from a prompt string.
 * Returns an array of semantic pointers that can be resolved at execution time.
 * NOTE: Full URL resolution happens server-side in execute-pipeline-step.
 */
export interface MentionPointer {
  nodeId: string;
  label: string;
  fullToken: string;
  /** Whether this is a text variable (#) or image mention (@) */
  isTextVar?: boolean;
}

export function extractMentionPointers(prompt: string): MentionPointer[] {
  const pointers: MentionPointer[] = [];
  const regex = new RegExp(MENTION_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prompt)) !== null) {
    pointers.push({ nodeId: match[2], label: match[1], fullToken: match[0] });
  }
  return pointers;
}

/** Extract text variable (#[Label](nodeId)) pointers from prompt */
export function extractTextVarPointers(prompt: string): MentionPointer[] {
  const pointers: MentionPointer[] = [];
  const regex = new RegExp(TEXTVAR_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prompt)) !== null) {
    pointers.push({ nodeId: match[2], label: match[1], fullToken: match[0], isTextVar: true });
  }
  return pointers;
}

/**
 * Client-side preview resolver — replaces @[Label](nodeId) and #[Label](nodeId) 
 * with human-readable labels for display purposes only.
 */
export function resolveMentionsForPreview(
  prompt: string,
  nodes: Array<{ id: string; type?: string; data: Record<string, unknown> }>,
): string {
  // Resolve @ mentions
  let result = prompt.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return `[${label}]`;
    if (node.type === "inputNode") return `[Image: ${label}]`;
    if (node.type === "bananaProNode" || node.type === "klingVideoNode") return `[Output: ${label}]`;
    if (node.type === "chatAiNode") return `[Text: ${label}]`;
    return `[${label}]`;
  });
  // Resolve # text variables
  result = result.replace(/#\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return `[${label}]`;
    if (node.type === "textInputNode") {
      const textValue = (node.data as Record<string, unknown>).textValue as string | undefined;
      return textValue ? `"${textValue}"` : `[Text: ${label}]`;
    }
    return `[${label}]`;
  });
  return result;
}
