import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check as CheckIcon,
  Copy as CopyIcon,
  Paperclip,
  Send,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  useWorkspaceStore,
  type ChatAttachment,
} from "@/store/useWorkspaceStore";

const EDGE_FUNCTION = "workspace-chat";
const CHAT_MODEL_SLUG = "gpt-5.5";
const CHAT_CONTEXT_MESSAGE_LIMIT = 10;
const HISTORY_LOAD_LIMIT = 20;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = `You are MediaForge Prompt Assistant, a professional prompt-writing specialist.

Your single job is to turn the user's natural-language intent into a clear, production-ready prompt for AI image, video, editing, or utility nodes in MediaForge.

Rules:
- Reply in the user's language. If the user writes Thai, answer in Thai.
- Be concise and professional. Avoid filler and long teaching.
- Ask at most one targeted question only when the user's goal is impossible to infer.
- When you propose or rewrite a prompt, always include:
  1. A short explanation in the user's language.
  2. An English prompt inside a fenced code block with the language tag prompt.
- The English prompt must be ready to paste into a generator node.
- Keep the English prompt under 300 words unless the user explicitly asks for a longer prompt.
- Use concrete creative direction: subject, composition, lighting, camera movement, lens, mood, texture, aspect ratio, duration, and constraints when relevant.
- If a negative prompt is useful, include a second fenced code block with the language tag negative.
- Do not mention unsupported model capabilities. If unsure, say what is safe to assume from the visible canvas context.
- Do not use legacy assistant names.`;

type ChatRole = "user" | "assistant" | "system";

type ChatRow = {
  role: ChatRole;
  content: string;
  created_at?: string;
};

type ConversationRow = {
  id: string;
};

function compactMessage(m: {
  role: ChatRole;
  content: string;
  attachments?: ChatAttachment[];
}) {
  return {
    role: m.role,
    content: m.content,
    attachments: m.attachments,
  };
}

const WorkspaceAIAssistantPanel = ({ showHeader = true }: { showHeader?: boolean }) => {
  const { t: i18n } = useLanguage();
  const messages = useWorkspaceStore((s) => s.chatMessages);
  const isStreaming = useWorkspaceStore((s) => s.chatIsStreaming);
  const addChatMessage = useWorkspaceStore((s) => s.addChatMessage);
  const setChatStreaming = useWorkspaceStore((s) => s.setChatStreaming);
  const clearChat = useWorkspaceStore((s) => s.clearChat);
  const current = useWorkspaceStore((s) => s.current);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const currentWorkspace = useWorkspaceStore((s) =>
    s.current
      ? s.workspaces.find((workspace) => workspace.id === s.current?.workspaceId) ?? null
      : null,
  );
  const projects = useWorkspaceStore((s) => s.projects);
  const { user } = useAuth();

  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projectId =
    current?.projectId ??
    currentWorkspace?.projectId ??
    activeProjectId ??
    null;
  const projectName =
    projects.find((project) => project.id === projectId)?.name ??
    currentWorkspace?.name ??
    current?.name ??
    "Project";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      clearChat();
      if (!user?.id || !projectId) return;

      const db = supabase as any;
      const { data: conv, error: convError } = await db
        .from("workspace_chat_conversations")
        .select("id")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .maybeSingle();

      if (cancelled) return;
      if (convError || !conv) {
        if (convError) {
          console.warn("[prompt-assistant] load conversation failed:", convError);
        }
        return;
      }

      const { data: rows, error: messageError } = await db
        .from("workspace_chat_messages")
        .select("role, content, created_at")
        .eq("conversation_id", (conv as ConversationRow).id)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LOAD_LIMIT);

      if (cancelled) return;
      if (messageError) {
        console.warn("[prompt-assistant] load messages failed:", messageError);
        return;
      }

      for (const row of ([...(rows ?? [])] as ChatRow[]).reverse()) {
        addChatMessage({ role: row.role, content: row.content });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addChatMessage, clearChat, projectId, user?.id]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isStreaming]);

  const buildCanvasContext = useCallback(() => {
    if (!current) return null;
    return {
      project_id: projectId,
      project_name: projectName,
      workspace_id: current.workspaceId,
      workspace_name: currentWorkspace?.name ?? null,
      canvas_id: current.id,
      canvas_name: current.name,
      nodes: current.nodes.map((n) => ({
        id: n.id,
        type: n.type ?? null,
        label: ((n.data as any)?.label ?? (n.data as any)?.params?.nodeName ?? null) as string | null,
        model: ((n.data as any)?.params?.model_name ?? null) as string | null,
      })),
      edges: current.edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    };
  }, [current, currentWorkspace?.name, projectId, projectName]);

  const persistTurn = useCallback(
    async (userText: string, assistantText: string) => {
      if (!user?.id || !current?.id || !projectId) return;

      const db = supabase as any;
      const lookup = () =>
        db
          .from("workspace_chat_conversations")
          .select("id")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .maybeSingle();

      const { data: existing, error: lookupError } = await lookup();
      if (lookupError) {
        console.warn("[prompt-assistant] conversation lookup failed:", lookupError);
        toast.warning(i18n("workspace.aiAssistant.chatSavedLocallyOnlyCouldnTWrite"));
        return;
      }

      let conversationId: string | undefined = (existing as ConversationRow | null)?.id;
      if (!conversationId) {
        const { data: created, error: createError } = await db
          .from("workspace_chat_conversations")
          .insert({
            user_id: user.id,
            project_id: projectId,
            canvas_id: current.id,
            title: projectName || "Prompt Assistant",
          })
          .select("id")
          .single();

        if (createError) {
          const { data: retry } = await lookup();
          conversationId = (retry as ConversationRow | null)?.id;
          if (!conversationId) {
            console.warn("[prompt-assistant] conversation create failed:", createError);
            toast.warning(i18n("workspace.aiAssistant.chatSavedLocallyOnlyCouldnTWrite"));
            return;
          }
        } else {
          conversationId = (created as ConversationRow).id;
        }
      }

      const { error: insertError } = await db
        .from("workspace_chat_messages")
        .insert([
          { conversation_id: conversationId, role: "user", content: userText },
          { conversation_id: conversationId, role: "assistant", content: assistantText },
        ]);

      if (insertError) {
        console.warn("[prompt-assistant] persist failed:", insertError);
        toast.warning(i18n("workspace.aiAssistant.chatSavedLocallyOnlyCouldnTWrite"));
        return;
      }

      void db
        .from("workspace_chat_conversations")
        .update({ updated_at: new Date().toISOString(), title: projectName || "Prompt Assistant" })
        .eq("id", conversationId);
    },
    [current?.id, i18n, projectId, projectName, user?.id],
  );

  const onSubmit = async () => {
    const text = input.trim();
    const attachments = pendingAttachments;
    if ((!text && attachments.length === 0) || isStreaming) return;

    addChatMessage({
      role: "user",
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    setInput("");
    setPendingAttachments([]);
    setChatStreaming(true);

    let assistantText = "";
    try {
      const outgoing = useWorkspaceStore
        .getState()
        .chatMessages.slice(-CHAT_CONTEXT_MESSAGE_LIMIT)
        .map(compactMessage);

      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
        body: {
          model: CHAT_MODEL_SLUG,
          system_prompt: SYSTEM_PROMPT,
          messages: outgoing,
          canvas_context: buildCanvasContext(),
        },
      });

      if (error) throw error;

      assistantText =
        (data as { content?: string } | null)?.content?.trim() || "(empty reply)";
      addChatMessage({ role: "assistant", content: assistantText });
      void persistTurn(text, assistantText);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      assistantText = `Chat failed: ${msg}`;
      addChatMessage({
        role: "assistant",
        content:
          `Chat failed: ${msg}\n\n` +
          "Check that OPENAI_API_KEY is configured in the workspace Supabase project secrets.",
      });
    } finally {
      setChatStreaming(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSubmit();
    }
  };

  const ingestImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error(i18n("workspace.aiAssistant.onlyImageFilesAreSupported"));
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(
          i18n("workspace.aiAssistant.imageIsLargerThanMbResize", {
            size: Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024)),
          }),
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (!dataUrl.startsWith("data:")) return;
        setPendingAttachments((prev) => [...prev, { mime: file.type, dataUrl }]);
      };
      reader.onerror = () => toast.error(i18n("workspace.aiAssistant.couldNotReadImageFile"));
      reader.readAsDataURL(file);
    },
    [i18n],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItems = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      e.preventDefault();
      for (const it of imageItems) {
        const file = it.getAsFile();
        if (file) ingestImageFile(file);
      }
    },
    [ingestImageFile],
  );

  const onFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      for (const f of files) ingestImageFile(f);
      e.target.value = "";
    },
    [ingestImageFile],
  );

  const removeAttachment = useCallback(
    (index: number) => setPendingAttachments((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  return (
    // `prompt-assistant-panel` is the index.css opt-out for the global
    // `.mf-readable` Thai-bump — without it text-[14px] gets promoted to
    // 18.4px / 1.75rem line-height and the chat chrome inflates until
    // each message bubble + code-block line renders ~26px tall and
    // dwarfs the panel. The same class is duplicated on the launcher's
    // <section> so the panel works whether it renders standalone (via
    // showHeader) or wrapped by the launcher chrome.
    <div className="prompt-assistant-panel flex h-full flex-col text-zinc-200">
      {showHeader && <div className="border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/12 text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          {/* All text inside the panel uses pixel-pinned sizes
           *  ≥14px to escape the global `.mf-readable` bump
           *  (text-xs / text-[9-13.5px] all get inflated by index.css
           *  for Thai legibility, which dwarfed the chat chrome). */}
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-zinc-100">Prompt Assistant</div>
            <div className="truncate text-[14px] text-zinc-500">{projectName}</div>
          </div>
          {/* Model badge intentionally hidden — implementation
           *  detail; matches the launcher header. Keep the slot in
           *  case we re-enable a model picker later. */}
        </div>
      </div>}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-[14px] leading-snug text-zinc-500">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-zinc-600" />
            <div className="mx-auto max-w-[240px]">Describe the image, video, or edit you want.</div>
            <div className="mt-3 space-y-1.5 text-left text-zinc-600">
              <div className="rounded bg-zinc-900/60 px-2 py-1.5">
                "Premium product photo for a watch on black marble"
              </div>
              <div className="rounded bg-zinc-900/60 px-2 py-1.5">
                "Turn this idea into a cinematic 9:16 video prompt"
              </div>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role}
            content={m.content}
            attachments={m.attachments}
          />
        ))}

        {isStreaming && (
          <div className="flex items-center gap-1.5 text-[14px] text-zinc-500">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Thinking...
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 p-2">
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingAttachments.map((att, i) => (
              <div
                key={i}
                className="group relative h-12 w-12 overflow-hidden rounded bg-white/[0.04]"
              >
                <img src={att.dataUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white/90 opacity-0 transition-opacity hover:bg-black group-hover:opacity-100"
                  title={i18n("workspace.aiAssistant.removeThisImage")}
                >
                  <XIcon className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFilePicked}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="rounded bg-zinc-900/70 p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            title={i18n("workspace.aiAssistant.attachImageOrCtrlVToPaste")}
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="Ask for a better prompt..."
            rows={1}
            disabled={isStreaming}
            // Pixel-pinned sizing: rem-based `text-xs` was getting
            // bumped to 16.7px by the global `.mf-readable` Thai-
            // legibility rule in index.css, which inflated 2 rows of
            // textarea to ~80px and made the input bar dominate the
            // panel. `text-[14px]` escapes that bump (only 12.5/13/13.5
            // are caught), `min-h-[36px]` matches the 36px send/attach
            // buttons, and `max-h-[120px]` lets the box grow with a
            // long draft but caps the takeover.
            className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-[14px] leading-tight text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={(!input.trim() && pendingAttachments.length === 0) || isStreaming}
            className="rounded-lg bg-zinc-100 p-1.5 text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            title={i18n("workspace.aiAssistant.sendEnter")}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[14px] text-zinc-600">
          {!user ? (
            <span className="text-amber-600/80">{i18n("workspace.aiAssistant.guestNotSaved")}</span>
          ) : (
            <span className="truncate">{projectName}</span>
          )}
          {current && <span>{current.nodes.length} {i18n("common.nodes")}</span>}
        </div>
      </div>
    </div>
  );
};

interface ContentSegment {
  kind: "text" | "code";
  text: string;
  lang?: string;
}

const FENCE_RE = /```([\w-]*)\n?([\s\S]*?)```/g;

function parseContent(content: string): ContentSegment[] {
  const out: ContentSegment[] = [];
  let lastEnd = 0;
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(content)) !== null) {
    if (m.index > lastEnd) {
      out.push({ kind: "text", text: content.slice(lastEnd, m.index) });
    }
    out.push({ kind: "code", lang: m[1] || "text", text: m[2].replace(/\s+$/, "") });
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < content.length) {
    out.push({ kind: "text", text: content.slice(lastEnd) });
  }
  return out;
}

const MessageBubble = ({
  role,
  content,
  attachments,
}: {
  role: string;
  content: string;
  attachments?: ChatAttachment[];
}) => {
  const isUser = role === "user";
  const isError = content.startsWith("Chat failed:");
  const segments = useMemo(
    () => (isUser || isError ? null : parseContent(content)),
    [content, isUser, isError],
  );

  return (
    <div
      // Pixel-pinned text size (`text-[14px]`) escapes the
      // `.mf-readable` Thai-legibility bump in index.css that promoted
      // the previous `text-xs` to 16.7px and made every assistant
      // reply feel like an essay (each line rendered ~26px tall).
      // 14px is small enough to fit a real conversation in the panel
      // and large enough that Thai script stays legible without the
      // global override kicking in.
      className={cn(
        "rounded-lg px-3 py-2 text-[14px] leading-snug",
        isUser
          ? "ml-6 bg-zinc-800 text-zinc-100"
          : isError
            ? "border border-amber-900/60 bg-amber-950/20 text-amber-200"
            : "bg-zinc-900 text-zinc-200",
      )}
    >
      <div className="mb-1 flex items-center gap-1 text-[14px] font-semibold uppercase tracking-wide text-zinc-500">
        {isError && <AlertTriangle className="h-2.5 w-2.5" />}
        {isUser ? "You" : isError ? "System" : "Assistant"}
      </div>
      {attachments && attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {attachments.map((att, i) => (
            <img
              key={i}
              src={att.dataUrl}
              alt=""
              className="max-h-32 max-w-full rounded bg-white/[0.04] object-contain"
            />
          ))}
        </div>
      )}
      {segments ? (
        <div className="space-y-2">
          {segments.map((s, i) =>
            s.kind === "code" ? (
              <CodeBlock key={i} lang={s.lang} text={s.text} />
            ) : (
              <div key={i} className="whitespace-pre-wrap">
                {s.text.replace(/^\n+|\n+$/g, "")}
              </div>
            ),
          )}
        </div>
      ) : content ? (
        <div className="whitespace-pre-wrap">{content}</div>
      ) : null}
    </div>
  );
};

const CodeBlock = ({ lang, text }: { lang?: string; text: string }) => {
  const { t: i18n } = useLanguage();
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(i18n("workspace.aiAssistant.promptCopied"));
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(i18n("workspace.aiAssistant.copyFailed"));
    }
  }, [text, i18n]);

  const tag = (lang || "code").toUpperCase();
  const isPrompt = (lang ?? "").toLowerCase() === "prompt";
  const isNegative = (lang ?? "").toLowerCase() === "negative";

  return (
    <div
      className={cn(
        "relative rounded-md border bg-zinc-950",
        isPrompt && "border-emerald-900/60",
        isNegative && "border-rose-900/60",
        !isPrompt && !isNegative && "border-zinc-800",
      )}
    >
      <div
        // Header strip ("PROMPT", "NEGATIVE", etc.) — text-[14px] so
        // it escapes `.mf-readable` and renders at the literal size.
        // The previous text-[9px] / text-[10px] mix got promoted to
        // ~16px which made the strip taller than the prompt body.
        className={cn(
          "flex items-center justify-between border-b px-2 py-1 text-[14px] font-mono font-semibold uppercase tracking-wider",
          isPrompt && "border-emerald-900/60 text-emerald-400",
          isNegative && "border-rose-900/60 text-rose-400",
          !isPrompt && !isNegative && "border-zinc-800 text-zinc-500",
        )}
      >
        <span>{tag}</span>
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[14px] font-medium normal-case",
            copied
              ? "bg-emerald-500/20 text-emerald-300"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
          )}
          title={i18n("common.copy")}
        >
          {copied ? (
            <>
              <CheckIcon className="h-3 w-3" />
              {i18n("common.copied")}
            </>
          ) : (
            <>
              <CopyIcon className="h-3 w-3" />
              {i18n("common.copy")}
            </>
          )}
        </button>
      </div>
      {/* Code block — `text-[14px]` keeps the prompt readable while
       *  escaping the readability bump (text-[11px] would have been
       *  pushed to 16.1px and dwarfed the message body). leading-snug
       *  keeps multi-line prompts compact. */}
      <pre className="overflow-x-auto whitespace-pre-wrap px-2.5 py-2 font-mono text-[14px] leading-snug text-zinc-100">
        {text}
      </pre>
    </div>
  );
};

export default WorkspaceAIAssistantPanel;
