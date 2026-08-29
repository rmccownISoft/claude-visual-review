# Multi-Provider / Model Support for Eval Runs

## Context

The eval runner currently hardcodes `anthropic('claude-sonnet-4-6')` in `src/routes/api/run/+server.ts`. This means all eval runs use the same model, making it impossible to compare performance across providers (e.g., Anthropic vs. OpenAI) or model versions.

The goal is to allow the model to be selected per run via `RunConfig`, so evals can compare model behavior directly — for example, running the same prompt against `claude-sonnet-4-6` and `gpt-5.4` side by side.

---

## Approach: AI SDK Provider Registry

The Vercel AI SDK v6 provides `createProviderRegistry`, which registers multiple providers and exposes them via a `"provider:model-id"` string. This is the correct pattern — it requires minimal code change at the call site and is designed exactly for this use case.

Model IDs verified against the Vercel AI Gateway (April 2026):
- `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-6`, `anthropic/claude-haiku-4-5`
- `openai/gpt-5.4`, `openai/gpt-5.4-pro`, `openai/gpt-5.4-mini`, `openai/gpt-5.4-nano`

---

## Changes Required

### 1. New file: `src/lib/server/registry.ts`

Create a provider registry using installed provider packages:

```ts
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createProviderRegistry } from 'ai'

export const registry = createProviderRegistry({ anthropic, openai })
```

### 2. `src/lib/types.ts` — add `model` to `RunConfig`

```ts
export type RunConfig = {
  // ...existing fields...
  model?: string  // e.g. "anthropic:claude-sonnet-4-6" or "openai:gpt-5.4"
}
```

### 3. `src/routes/api/run/+server.ts` — replace hardcoded model

```ts
// before
model: anthropic('claude-sonnet-4-6'),

// after
model: registry.languageModel(config.model ?? 'anthropic:claude-sonnet-4-6'),
```

Remove the `createAnthropic` import once no longer referenced directly.

### 4. `src/lib/components/RunConfigForm.svelte` — add model field

Add a `model` bindable prop and a text input (or dropdown) to the form. A text input is fine initially — a curated dropdown of known-good models can come later.

### 5. `package.json` — install OpenAI provider

```
pnpm add @ai-sdk/openai
```

### 6. `.env` — add API key

```
OPENAI_API_KEY=sk-...
```

---

## Model ID Format

The registry uses `provider:model-id` as the separator (colon by default):

| Provider  | Example model string              |
|-----------|-----------------------------------|
| Anthropic | `anthropic:claude-sonnet-4-6`     |
| Anthropic | `anthropic:claude-opus-4-6`       |
| OpenAI    | `openai:gpt-5.4`                  |
| OpenAI    | `openai:gpt-5.4-pro`              |

The default when `config.model` is absent should remain `anthropic:claude-sonnet-4-6`.

---

## Display: Show Model in Run UI

Once `model` is stored in `RunConfig` (and therefore in saved run JSON), it should be surfaced in:

- The **Config card** in `MessageList.svelte` — already shows `mcpServerUrl`, skills, max steps; add model here
- The **Runs sidebar** in `runs/+page.svelte` — optionally show model alongside experiment/label badges

---

## What NOT to Do

- Do not use the `gateway` provider from AI SDK for this — it routes through Vercel's infrastructure and requires a Vercel account/token. Direct provider packages are simpler for a local eval tool.
- Do not hardcode a list of allowed models server-side — pass whatever string `config.model` contains to the registry and let it fail loudly if the model doesn't exist.
- Do not add per-provider API key fields to `RunConfig` — keys belong in `.env` only.

---

## Open Questions

1. Should the model field in `RunConfigForm` be a free-text input or a curated dropdown? A dropdown reduces typos but requires maintaining a list. A free-text input with a placeholder showing the default is simpler to start.
2. Should adding a new provider (e.g., Google, xAI) require a code change to `registry.ts`, or should the registry auto-discover installed provider packages? Code change is fine for now.
3. The `runs/+page.svelte` sidebar shows `experiment` and `label` — should `model` be a first-class filter/grouping dimension there too?
