# Claude Instructions

## Project
SvelteKit + Svelte 5 + Tailwind 4 + AI SDK v6 tool for evaluating MCP agent runs. Uses pnpm.

## REQUIRED: Before suggesting Svelte/SvelteKit code or fixes
Always call `mcp__plugin_svelte_svelte__get-documentation` before suggesting any Svelte or SvelteKit API, import, or fix. Never rely on training data alone — it frequently references deprecated APIs.

## REQUIRED: Before suggesting Vercel AI SDK code or fixes
Always invoke the `ai-sdk` skill before suggesting any Vercel AI SDK API, import, or usage pattern. Training data is frequently outdated for this library.

## Key Conventions
- Use `$app/state` (not deprecated `$app/stores`) — `page.url.pathname` with no `$` prefix
- Avoid `$effect` for syncing state — use `$derived` instead
- `SvelteSet` from `svelte/reactivity` for reactive sets (not native `Set`)
- Can't import from `$lib/server/` in client components — inline types instead
- All shared types live in `$lib/types.ts`

## Reference Docs
Check `docs/` for planning and architecture documents relevant to the current task.

## Workflow
- When a feature or goal from `docs/` is implemented, update the relevant doc to mark it complete.
- Step-by-step walkthrough: explain each change, user implements or asks questions
- User implements changes themselves, or Claude implements with tools after being asked to
- Prefer concise responses
