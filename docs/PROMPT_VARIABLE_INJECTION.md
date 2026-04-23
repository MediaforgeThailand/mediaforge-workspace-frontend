# Prompt Variable Injection (`#` Variables)

> **Status:** Shipped · **Updated:** 2026-04-03

## Overview

Creators can inject **user-supplied text** into AI prompts using `#[Name](node_id)` tokens. This complements the existing `@[Name](node_id)` media mention system.

| Token | Trigger | Node Type | Resolution | Use Case |
|-------|---------|-----------|------------|----------|
| `@[Name](id)` | `@` key | InputNode (image/video) | Aggregate into multimodal array | Reference images |
| `#[Name](id)` | `#` key | TextInputNode | **Direct string replacement** in prompt | Inject text |

## Architecture

```
TextInputNode ──edge──→ AI Node (prompt contains #[Name](id))
                            │
                     Backend resolves token
                            │
                     "#[Name](id)" → "actual text value"
```

## Components

### 1. TextInputNode (`src/components/flow/nodes/TextInputNode.tsx`)

A canvas node with:
- `textarea` — creator default / user input text
- `fieldLabel` — label shown to end-user in PlayFlow
- Source handle `text` (green) — connects to AI nodes

**Data shape:**
```ts
interface TextInputNodeData {
  label: string;
  nodeName?: string;
  fieldLabel?: string;   // "User sees:" label
  textValue?: string;    // the actual text output
  placeholder?: string;
}
```

### 2. Prompt Editor (`src/components/flow/nodes/PromptMentionTextarea.tsx`)

- Typing `#` opens a dropdown of connected **TextInputNode** sources
- Selected node renders as a **green pill** (`.textvar-pill`) vs blue for `@` media
- Serialized to raw string as `#[Node Name](node_id)`
- Custom paste handler preserves token integrity

### 3. Backend Resolution

**Files:** `supabase/functions/run-flow-init/index.ts`, `supabase/functions/execute-pipeline-step/index.ts`

**Function:** `resolveTextVariablesInPrompt(prompt, nodeResults)`

```ts
// Regex: /#\[([^\]]+)\]\(([^)]+)\)/g
// Match: #[Display Name](node_id)
// Replace with: quoted text value from nodeResults map
```

**Example:**
```
Input:  "เพิ่ม Text เขียนว่า #[UserText](node_1)"
Output: "เพิ่ม Text เขียนว่า \"สวัสดีครับ\""
```

Resolution runs **before** the `@` media mention resolution, so text is already inlined when the AI provider receives the final prompt.

## Key Differences from `@` Mentions

| Aspect | `@` Media | `#` Text Variable |
|--------|-----------|-------------------|
| Data type | Image/Video URL | Plain string |
| Resolution | Collected into `images[]` array, sent as multimodal | **String replacement** in prompt body |
| AI receives | Separate image attachments + context instruction | Inline text within the prompt |
| Pill color | Blue | Green |
| CSS class | `.mention-pill` | `.textvar-pill` |

## Consumer Experience (PlayFlow)

When a flow contains `TextInputNode` with `exposed_to_user: true`, PlayFlow renders a text input field with the creator-defined `fieldLabel`. The user's text is stored in `nodeResults[nodeId]` and resolved at execution time.

## Registration

- **Node Palette:** Registered in `src/components/flow/NodePalette.tsx` under `user_input` category
- **Flow Studio:** Node type `textInputNode` mapped in `FlowStudio.tsx` nodeTypes
- **Accent:** Uses `green` accent in `BaseNodeWrapper`
