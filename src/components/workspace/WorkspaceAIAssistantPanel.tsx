/**
 * Workspace AI Assistant — "คุยกับ Max" panel.
 *
 * Two model providers, picked via the dropdown in the header:
 *   - "gemini-3.1-pro-preview"  (Google Gemini 3.1)
 *   - "gpt-5.5"                  (OpenAI ChatGPT 5.5)
 * The edge function (`workspace-chat`) routes to the right provider
 * based on the slug. The user's choice persists in localStorage so
 * they don't have to reselect every time the panel mounts.
 *
 * Max is a prompt-writing coach. The system prompt steers him to:
 *   - Reply in Thai (concise, professional, no filler)
 *   - When proposing a prompt, ALWAYS include an English block in
 *     a fenced ```prompt … ``` code block so the user can copy it
 *     verbatim into a generator node
 *   - Speak the language of camera / editing / lighting / aspect
 *     ratios, etc.
 *
 * Each fenced code block in an assistant reply renders as a card
 * with a copy button so the user can grab the prompt with one tap.
 *
 * Persistence:
 *   - Conversations are stored per-canvas in
 *     `workspace_chat_conversations` + `workspace_chat_messages`
 *     (RLS-scoped to auth.uid()).
 *   - Guests' chats stay in-memory only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  AlertTriangle,
  Copy as CopyIcon,
  Check as CheckIcon,
  Paperclip,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useWorkspaceStore,
  type ChatAttachment,
} from "@/store/useWorkspaceStore";

const EDGE_FUNCTION = "workspace-chat";

/* ── Model registry ──────────────────────────────────────────
 * Slug = the value the edge function gets in `body.model`. The
 * function checks the slug prefix to decide which provider to
 * call, so don't rename without updating the backend. */
type AssistantModel = {
  slug: string;
  label: string;
  caption: string;
};
const MODELS: AssistantModel[] = [
  {
    slug: "gemini-3.1-pro-preview",
    label: "Gemini 3.1",
    caption: "Google · ละเอียด",
  },
  {
    slug: "gpt-5.5",
    label: "ChatGPT 5.5",
    caption: "OpenAI · เสียงคล้ายมนุษย์",
  },
];
const MODEL_STORAGE_KEY = "workspace-ai-model";
const DEFAULT_MODEL_SLUG = MODELS[0].slug;

function loadStoredModel(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL_SLUG;
  try {
    const v = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (v && MODELS.some((m) => m.slug === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_MODEL_SLUG;
}

/* ── System prompt — Max's persona ───────────────────────────
 * Thai-first, prompt-writing focused. Concise. Always emits
 * English prompts inside fenced code blocks so the frontend can
 * render a copy button. */
const SYSTEM_PROMPT = `คุณคือ "Max" ผู้ช่วยมืออาชีพประจำ MediaForge — โฟกัสเรื่องเดียว: ช่วย user เขียน prompt สำหรับงาน AI image / video / editing ให้ออกมาดีที่สุด

# น้ำเสียง
- ตอบเป็นภาษาไทย เสียงนุ่ม สุภาพ มืออาชีพ
- กระชับ ไม่อธิบายเยอะ ไม่มีคำเปิดเปลือง ๆ ("ได้ค่ะ", "แน่นอนครับ", ฯลฯ)
- ใช้ bullet สั้น ๆ ถ้าจำเป็น

# รูปแบบการเสนอ prompt (สำคัญมาก)
ทุกครั้งที่เสนอหรือปรับ prompt ให้ส่งกลับเสมอ 2 ส่วน:

1. **คำอธิบายภาษาไทย** (สั้น 1-3 บรรทัด) บอกว่า prompt นี้สื่อถึงอะไร / เน้นอะไร
2. **Prompt ภาษาอังกฤษ** ใน code block ด้วย format นี้ทุกครั้ง:

\`\`\`prompt
<English prompt here, ready to paste into the model>
\`\`\`

ภาษาอังกฤษคือเวอร์ชันที่ user จะ copy ไปใช้กับ image/video model — เพราะฉะนั้นต้อง:
- เขียนภาษาอังกฤษเสมอ ไม่ใช่ไทย
- เขียนให้พร้อมใช้งานทันที (no placeholders)
- ใส่ comma-separated descriptors แบบ industry-standard
- หากมี negative prompt ให้แยกเป็น code block ที่สอง: \`\`\`negative ... \`\`\`

# ความรู้ที่ใช้
- **Cinematography**: pan, tilt, dolly, push-in / pull-out, crane, tracking, handheld, POV, OTS, dutch angle, low/high angle, close-up / medium / wide / establishing shot
- **Lighting**: golden hour, key/rim/fill light, three-point, soft / hard, chiaroscuro, backlit, practicals, natural light
- **Lens / Look**: anamorphic, 35mm, shallow DOF, bokeh, motion blur, film grain, cinematic, photorealistic, hyperrealistic, film noir
- **Editor / Color**: color grading, LUT, contrast, saturation, vignette, teal & orange, desaturate, lift gamma gain
- **Format**: aspect ratio (16:9, 9:16, 1:1, 4:3), resolution (1K / 2K / 4K), duration (3–15s for video)

# โมเดลใน workspace (แนะนำได้)
- **Image**: Nano Banana 2 / Pro, GPT Image 2, SeedDream 4.5 / 5.0 / 5.0 Lite
- **Video**: Kling 2.6 Pro / Motion Pro, Kling 3.0 Pro / Motion / Omni v3, SeedDance 1.0 / 1.0 Fast / 1.5
- **Utility**: Background Remove, Merge Audio + Video, Video → Prompt
- **Element refs (Kling Omni)**: เก็บ character / object ไว้ใช้ซ้ำข้าม scene

# กติกา
- ห้ามแต่งฟีเจอร์ที่โมเดลไม่รองรับ ถ้าไม่แน่ใจให้บอก
- ห้ามเขียน intro หรือ filler ก่อนเข้าเนื้อ
- prompt อังกฤษไม่เกิน 300 คำ ยกเว้น user สั่ง
- ถ้า user ถามเรื่องนอกหัวข้อ prompt-writing ตอบสั้น ๆ แล้วชวนกลับมาที่ prompt`;

const WorkspaceAIAssistantPanel = () => {
  const messages = useWorkspaceStore((s) => s.chatMessages);
  const isStreaming = useWorkspaceStore((s) => s.chatIsStreaming);
  const addChatMessage = useWorkspaceStore((s) => s.addChatMessage);
  const setChatStreaming = useWorkspaceStore((s) => s.setChatStreaming);
  const clearChat = useWorkspaceStore((s) => s.clearChat);
  const current = useWorkspaceStore((s) => s.current);
  const { user } = useAuth();

  const [input, setInput] = useState("");
  const [modelSlug, setModelSlug] = useState<string>(() => loadStoredModel());
  /** Pending images to send with the next message (paste or upload).
   *  Stored as base64 data URLs so we can render the preview chips
   *  AND ship them straight to the chat edge function. */
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist model choice across sessions.
  useEffect(() => {
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, modelSlug);
    } catch {
      /* ignore */
    }
  }, [modelSlug]);

  /* ── Load conversation when the canvas changes ────────── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Always start fresh visually when the canvas changes.
      clearChat();
      if (!user?.id || !current?.id) return;

      const { data: conv } = await supabase
        .from("workspace_chat_conversations")
        .select("id")
        .eq("user_id", user.id)
        .eq("canvas_id", current.id)
        .maybeSingle();

      if (cancelled || !conv) return;

      const { data: msgs } = await supabase
        .from("workspace_chat_messages")
        .select("role, content")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      for (const m of msgs ?? []) {
        addChatMessage({ role: m.role as any, content: m.content });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only on auth or canvas change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, current?.id]);

  /* ── Auto-scroll to bottom on new messages ────────────── */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isStreaming]);

  /** Compact snapshot of the canvas for the assistant's system prompt. */
  const buildCanvasContext = useCallback(() => {
    if (!current) return null;
    return {
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
  }, [current]);

  /** Insert both user + assistant messages into Postgres (idempotent per send). */
  const persistTurn = useCallback(
    async (userText: string, assistantText: string) => {
      if (!user?.id || !current?.id) return;

      // Get or create the single conversation for this canvas.
      const { data: existing } = await supabase
        .from("workspace_chat_conversations")
        .select("id")
        .eq("user_id", user.id)
        .eq("canvas_id", current.id)
        .maybeSingle();

      let conversationId: string | undefined = existing?.id;
      if (!conversationId) {
        const { data: created, error: createErr } = await supabase
          .from("workspace_chat_conversations")
          .insert({
            user_id: user.id,
            canvas_id: current.id,
            title: current.name || "New chat",
          })
          .select("id")
          .single();
        if (createErr) return; // fail silently; in-memory state already updated
        conversationId = created.id;
      }

      const { error: insertErr } = await supabase
        .from("workspace_chat_messages")
        .insert([
          { conversation_id: conversationId, role: "user", content: userText },
          { conversation_id: conversationId, role: "assistant", content: assistantText },
        ]);
      if (insertErr) {
        // Don't crash the UI — the in-memory chat is fine. But warn
        // the user so they don't trust the persisted history.
        console.warn("[ai-assistant] persist failed:", insertErr);
        toast.warning(
          "Chat saved locally only — couldn't write to history (refresh will lose it).",
        );
      }
    },
    [user?.id, current?.id, current?.name],
  );

  const onSubmit = async () => {
    const text = input.trim();
    const attachments = pendingAttachments;
    // Allow sending if EITHER text OR an attachment is present —
    // a user might paste an image and just hit send to ask "what is
    // this?" without typing.
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
        .chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        }));

      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
        body: {
          model: modelSlug,
          system_prompt: SYSTEM_PROMPT,
          messages: outgoing,
          canvas_context: buildCanvasContext(),
        },
      });

      if (error) throw error;

      assistantText =
        (data as { content?: string } | null)?.content ?? "(empty reply)";
      addChatMessage({ role: "assistant", content: assistantText });

      void persistTurn(text, assistantText);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      assistantText = `⚠️ ${msg}`;
      addChatMessage({
        role: "assistant",
        content:
          `⚠️ Chat failed: ${msg}\n\n` +
          `If this is the first time: ตรวจว่าได้ตั้ง OPENAI_API_KEY ` +
          `และ GEMINI_API_KEY (หรือ GOOGLE_AI_STUDIO_KEY) ` +
          `ใน Supabase project secrets.`,
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

  /* ── Image attachment handling ─────────────────────────────
   * Both paste (Ctrl+V from a screenshot / browser drag) and the
   * paperclip upload button end up here. We cap the per-image
   * size so a careless paste of a 20MB PNG doesn't slam the chat
   * function — the toast tells the user what to do. */
  const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB
  const ingestImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("รองรับเฉพาะไฟล์รูปภาพ");
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(
          `รูปใหญ่เกิน ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB ลองย่อก่อนวาง`,
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (!dataUrl.startsWith("data:")) return;
        setPendingAttachments((prev) => [
          ...prev,
          { mime: file.type, dataUrl },
        ]);
      };
      reader.onerror = () => toast.error("อ่านไฟล์รูปไม่สำเร็จ");
      reader.readAsDataURL(file);
    },
    [],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItems = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (imageItems.length === 0) return; // text paste — let it through
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
      // Reset so picking the SAME file twice in a row still triggers
      // a change event.
      e.target.value = "";
    },
    [ingestImageFile],
  );

  const removeAttachment = useCallback(
    (index: number) =>
      setPendingAttachments((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  const activeModel = useMemo(
    () => MODELS.find((m) => m.slug === modelSlug) ?? MODELS[0],
    [modelSlug],
  );

  return (
    // Outer wrapper provided by WorkspaceRightSidebar tab shell.
    <div className="flex h-full flex-col text-zinc-200">
      {/* Compact strip — just the model selector and a one-line
       *  caption. The "คุยกับ Max" title lives in the sidebar tab
       *  itself now, so we don't duplicate it here. */}
      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-zinc-900/50 bg-zinc-950 p-0.5">
          {MODELS.map((m) => (
            <button
              key={m.slug}
              type="button"
              onClick={() => setModelSlug(m.slug)}
              className={cn(
                "rounded px-2 py-1 text-[10.5px] font-medium transition-colors",
                m.slug === modelSlug
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
              title={m.caption}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 truncate text-[10px] text-zinc-500">
          ผู้ช่วยเขียน prompt · {activeModel.caption}
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="mt-6 text-center text-[11px] leading-relaxed text-zinc-500">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-zinc-600" />
            ทักมาเลยครับ บอก Max ว่าอยากได้รูปหรือวิดีโอแบบไหน
            <div className="mt-3 space-y-1.5 text-left text-zinc-600">
              <div className="rounded bg-zinc-900/50 px-2 py-1.5">
                "อยากได้ภาพ product shot นาฬิกาบนพื้นหินอ่อน แสง golden hour"
              </div>
              <div className="rounded bg-zinc-900/50 px-2 py-1.5">
                "ช่วยปรับ prompt นี้ให้กล้อง dolly-in ช้า ๆ"
              </div>
              <div className="rounded bg-zinc-900/50 px-2 py-1.5">
                "Element ของ Kling Omni ใช้ตอนไหน"
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
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            Max กำลังคิด…
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-2">
        {/* Attachment chips — show pending images that will be sent
         *  with the next message. Each chip has its own X to drop
         *  it before sending. */}
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingAttachments.map((att, i) => (
              <div
                key={i}
                className="group relative h-12 w-12 overflow-hidden rounded bg-white/[0.04]"
              >
                <img
                  src={att.dataUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white/90 opacity-0 transition-opacity hover:bg-black group-hover:opacity-100"
                  title="ลบรูปนี้"
                >
                  <XIcon className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Hidden file input — driven by the paperclip button. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFilePicked}
            className="hidden"
          />
          {/* Paperclip — triggers the file picker. */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="rounded bg-zinc-900/50 p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="แนบรูป (หรือ Ctrl+V วางจาก clipboard)"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="พิมพ์ที่อยากได้ หรือวาง prompt / รูป ให้ Max ดู…"
            rows={2}
            disabled={isStreaming}
            className="flex-1 resize-none rounded bg-zinc-900/50 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={(!input.trim() && pendingAttachments.length === 0) || isStreaming}
            className="rounded bg-zinc-200 p-1.5 text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            title="ส่ง (Enter)"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-600">
          <span>Enter = ส่ง · Shift+Enter = บรรทัดใหม่ · Ctrl+V = วางรูป</span>
          {!user && <span className="text-amber-600/80">guest — ไม่บันทึก</span>}
          {user && current && (
            <span className="truncate pl-2">{current.nodes.length} nodes</span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Message bubble ─────────────────────────────────────────
 *
 * Parses `content` for fenced code blocks (\`\`\`lang\n…\`\`\`)
 * and renders each as a CodeBlock card with a Copy button. Plain
 * text chunks render as `whitespace-pre-wrap` paragraphs so the
 * model's bullet/Markdown still reads cleanly even though we're
 * not running a full Markdown renderer. */

interface ContentSegment {
  kind: "text" | "code";
  text: string;
  lang?: string;
}

const FENCE_RE = /```([\w-]*)\n?([\s\S]*?)```/g;

function parseContent(content: string): ContentSegment[] {
  const out: ContentSegment[] = [];
  let lastEnd = 0;
  // Reset the regex's lastIndex — it's a stateful global regex.
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
  const isError = content.startsWith("⚠️");
  const segments = useMemo(
    () => (isUser || isError ? null : parseContent(content)),
    [content, isUser, isError],
  );

  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-xs leading-relaxed",
        isUser
          ? "ml-6 bg-zinc-800 text-zinc-100"
          : isError
            ? "border border-amber-900/60 bg-amber-950/20 text-amber-200"
            : "bg-zinc-900 text-zinc-200",
      )}
    >
      <div className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-wide text-zinc-500">
        {isError && <AlertTriangle className="h-2.5 w-2.5" />}
        {isUser ? "คุณ" : isError ? "System" : "Max"}
      </div>
      {/* User-attached images render above the text. */}
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

/* ── Code block with copy button ──────────────────────────── */

const CodeBlock = ({ lang, text }: { lang?: string; text: string }) => {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("คัดลอก prompt แล้ว");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy ไม่สำเร็จ");
    }
  }, [text]);

  // Friendly label: "prompt" / "negative" / language → uppercase
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
        className={cn(
          "flex items-center justify-between border-b px-2 py-1 text-[9px] font-mono uppercase tracking-wider",
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
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] normal-case",
            copied
              ? "bg-emerald-500/20 text-emerald-300"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
          )}
          title="คัดลอก"
        >
          {copied ? (
            <>
              <CheckIcon className="h-3 w-3" />
              คัดลอกแล้ว
            </>
          ) : (
            <>
              <CopyIcon className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-100">
        {text}
      </pre>
    </div>
  );
};

export default WorkspaceAIAssistantPanel;
