# Run Data Improvements

This document outlines goals for enriching the eval run JSON format to support better standalone evaluation and cross-run comparison.

---

## Prioritization

Implement in this order based on what unblocks eval workflows first:

**Implement now:**
- **Goal 3 (summary additions)** — `errorCount`, `toolCallsByName`, `firstSuccessfulQueryStep` are derivable from `uiMessages` at save time with no runtime changes. Directly answers "did the right tools get called" and "how efficient was it."
- **Goal 2 (config: `promptId`, `label`)** — `promptId` groups runs for comparison across skill/config variants. Without it, cross-run analysis has no stable key. `label` (e.g. `"baseline"`, `"with-skill"`) makes variants human-readable.

**Defer:**
- **Goal 1 (snapshot)** — useful for reproducibility but doesn't unblock evals yet.
- **Goal 4 (expectedAnswer, structured grading)** — depends on the eval config format, which isn't designed yet.
- **Goal 5 (skillsUsed heuristic)** — heuristic approach is fragile; `toolCallsByName` on `loadSkill` is sufficient for now.

**After Goals 2 & 3 are implemented:** write `docs/run-format.md` documenting the stable top-level shape, each `uiMessages` part type, and the summary fields. This gives Claude Code a fast reference for analyzing run files without writing a parsing script each time.

---

## Background

The current `EvalRun` shape:

```ts
{
  id, timestamp,
  config: { mcpServerUrl, mcpHeaders, skills, prompt, setupPrompt, maxSteps },
  uiMessages: UIMessage[],
  summary: { toolCallCount, skillLoadCount, stepCount, finishReason, finalAnswer, totalInputTokens, totalOutputTokens, durationMs },
  annotation: { rating, notes, savedAt }
}
```

The gaps below were identified by analyzing real runs and thinking through what evaluation and comparison workflows need.

---

## Goal 1: Separate cloneable config from resolved runtime state

**Problem:** Fields like MCP server version, skill file hashes, and available tool list are resolved at runtime — they aren't things a user sets. Mixing them into `config` makes cloning messy and obscures what actually changed between runs.

**Suggestion:** Add a `snapshot` top-level property that captures resolved state at run start. `config` remains the cloneable user intent; `snapshot` is read-only and re-resolved on each new run.

```
config   → what you'd copy into a "new run" form
snapshot → what the system observed at runtime
```

Fields for `snapshot`:
- `mcpServerVersion` — version string reported by the MCP server
- `availableTools: string[]` — full tool list the MCP server exposed
- `skillVersions: { [name]: string }` — version or content hash per skill
- `resolvedSkillHashes: { [name]: string }` — sha of actual injected skill content

---

## Goal 2: Make config sufficient to reproduce or clone a run

**Problem:** The current config is missing fields that meaningfully affect agent behavior, making it impossible to fully reproduce a run or understand what differed between two runs.

**Suggestion:** Add the following to `config`:

- `model: string` — the Claude model used (e.g. `"claude-sonnet-4-6"`)
- `excludedTools: string[]` — tools intentionally excluded (intent belongs in config; resolved tool list goes in `snapshot`)
- `label: string` — human-readable variant tag (e.g. `"baseline"`, `"with-inventory-skill"`)
- `promptId: string` — stable identifier grouping runs that share the same prompt across clones
- `parentRunId: string | null` — which run this was cloned from; enables lineage tracking

---

## Goal 3: Surface per-tool-call detail for deeper evaluation

**Problem:** The summary only has aggregate token counts and total tool calls. You can't tell which tools were slow, expensive, or repeatedly erroring without reading every message part.

**Suggestion:** Add per-tool-call metadata to each `dynamic-tool` part:

- `latencyMs: number` — time from tool call to response
- `inputTokens` / `outputTokens` — token cost of this specific step
- `stepIndex: number` — unambiguous ordering (currently implicit from part position)

Also add derived fields to `summary`:
- `errorCount: number` — count of `isError: true` tool outputs
- `toolCallsByName: { [toolName]: number }` — distribution of tool usage
- `firstSuccessfulQueryStep: number` — step index of first non-error data response

---

## Goal 4: Enable automated and structured answer grading

**Problem:** The current annotation is a binary `good/bad` rating with free-text notes. This makes it hard to filter, aggregate, or compare runs programmatically. There's also no way to define the expected answer upfront.

**Suggestion:**

Add to `config`:
- `expectedAnswer: string` — the correct answer, defined before the run; enables post-run automated comparison

Expand `annotation`:
- `correctness: boolean | null` — was the final answer correct (separate from overall quality rating)
- `failureMode: 'wrong_answer' | 'incomplete' | 'hallucination' | 'tool_misuse' | 'schema_confusion' | null` — structured failure classification

---

## Goal 5: Track skill effectiveness per run

**Problem:** `skillLoadCount` tells you how many skills were loaded but nothing about whether they helped. A skill that was loaded but whose guidance was ignored is worth knowing about.

**Suggestion:**

Add to `summary` (or a new `skillMetrics` property):
- `skillsUsed: string[]` — skills whose content was observably referenced in the agent's reasoning
- Per-skill token cost — how many tokens each skill added to context

This likely requires some heuristic (e.g. keyword matching between skill content and assistant text parts) or explicit instrumentation in the run server.

---

## Summary Table

| Goal | Where | Fields |
|------|-------|--------|
| Separate runtime state | new `snapshot` | `mcpServerVersion`, `availableTools`, `skillVersions`, `resolvedSkillHashes` |
| Reproducible config | `config` | `model`, `excludedTools`, `label`, `promptId`, `parentRunId` |
| Per-tool detail | tool part + `summary` | `latencyMs`, per-step tokens, `stepIndex`, `errorCount`, `toolCallsByName` |
| Structured grading | `config` + `annotation` | `expectedAnswer`, `correctness`, `failureMode` |
| Skill effectiveness | `summary` or `skillMetrics` | `skillsUsed`, per-skill token cost |
