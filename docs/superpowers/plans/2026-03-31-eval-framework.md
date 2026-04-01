# Eval Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured eval criteria, experiment grouping, and run instrumentation so users can measure whether skills or tool changes improve agent correctness and efficiency.

**Architecture:** YAML files in `data/eval-configs/` define prompts + pass/fail criteria. The run executor captures per-tool call counts and skill snapshots. After execution, if a test case is linked, an evaluator scores the run automatically and saves results to the run JSON.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Zod v4, `yaml` npm package (new), Vitest

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `src/lib/types.ts` | Add new fields to `RunConfig`, `RunSummary`, `EvalRun`; add `EvalCriterion`, `EvalConfig`, `EvalCriterionResult`, `EvalResult` |
| Create | `data/eval-configs/sales-performance-2025.yaml` | Sample eval config |
| Create | `src/lib/server/eval-configs.ts` | Load + validate YAML files from `data/eval-configs/` |
| Create | `src/lib/server/eval-configs.test.ts` | Tests for YAML loader |
| Create | `src/lib/server/evaluator.ts` | Score a run against an `EvalConfig` |
| Create | `src/lib/server/evaluator.test.ts` | Tests for all criterion types |
| Modify | `src/routes/api/run/+server.ts` | Track `toolCallsByName`, `skillsRead`, `errorCount`, `skillSnapshots`; trigger eval post-run |
| Create | `src/routes/api/eval-configs/+server.ts` | `GET` — return list of eval configs for form dropdown |
| Modify | `src/lib/components/RunConfigForm.svelte` | Add `testCaseId`, `experiment`, `label` props + UI |
| Modify | `src/routes/runs/+layout.svelte` | Show `experiment`/`label`/pass-fail badge in sidebar |
| Modify | `src/routes/runs/[id]/+page.svelte` | Add eval results panel to annotation sidebar |

---

## Task 1: Install yaml package and create data directory

**Files:**
- Modify: `package.json` (via npm)
- Create: `data/eval-configs/sales-performance-2025.yaml`

- [x] **Step 1: Install yaml**

```bash
npm install yaml
```

Expected: `yaml` appears under `dependencies` in `package.json`.

- [x] **Step 2: Create sample eval config**

Create `data/eval-configs/sales-performance-2025.yaml`:

```yaml
id: sales-performance-2025
description: "Sales performance summary for full year 2025, Store 1"
prompt: "Show me sales performance for ISoft Lincoln for all of 2025"

criteria:
  - id: revenue-total
    type: final_answer_contains
    value: "$72,720.08"
    blocking: true

  - id: transaction-count
    type: final_answer_contains
    value: "26"
    blocking: true

  - id: step-budget
    type: step_count_lte
    value: 6

  - id: schema-exploration
    type: tool_call_count_lte
    tool: explore_schema
    value: 2
```

- [x] **Step 3: Commit**

```bash
git add data/eval-configs/sales-performance-2025.yaml package.json package-lock.json
git commit -m "chore: add yaml dependency and sample eval config"
```

---

## Task 2: Extend types.ts

**Files:**
- Modify: `src/lib/types.ts`

- [x] **Step 1: Replace the contents of `src/lib/types.ts`**

```typescript
import type { UIMessage } from 'ai'

// ---------------------------------------------------------------------------
// Eval criteria — discriminated union keyed on `type`
// ---------------------------------------------------------------------------

export type EvalCriterion =
	| { id: string; type: 'final_answer_contains'; value: string; blocking?: boolean }
	| { id: string; type: 'final_answer_not_contains'; value: string; blocking?: boolean }
	| { id: string; type: 'tool_called'; tool: string; blocking?: boolean }
	| { id: string; type: 'step_count_lte'; value: number }
	| { id: string; type: 'tool_call_count_lte'; value: number; tool?: string }

export type EvalConfig = {
	id: string
	description: string
	prompt: string
	criteria: EvalCriterion[]
}

export type EvalCriterionResult = {
	id: string
	passed: boolean
	blocking: boolean
	actual?: string | number // observed value, for display
}

export type EvalResult = {
	configId: string
	evaluatedAt: string
	passed: boolean      // false if any blocking criterion failed
	qualityScore: number // 0–100 based on non-blocking criteria; 100 if none exist
	criteriaResults: EvalCriterionResult[]
}

// ---------------------------------------------------------------------------
// Run types
// ---------------------------------------------------------------------------

export type RunConfig = {
	mcpServerUrl: string
	mcpHeaders: Record<string, string>
	skills: Skill[]
	disabledTools?: string[]
	prompt: string
	setupPrompt?: string
	maxSteps: number
	// Eval / experiment fields
	testCaseId?: string  // links to a yaml in data/eval-configs/
	experiment?: string  // groups related runs: "sales-perf ablation"
	label?: string       // describes this variant: "no skill", "trimmed skill v2"
}

export type RunSummary = {
	toolCallCount: number
	skillLoadCount: number
	stepCount: number
	finishReason: string
	finalAnswer: string
	totalInputTokens: number
	totalOutputTokens: number
	durationMs: number
	// Per-tool breakdown
	toolCallsByName: Record<string, number> // { explore_schema: 4, query: 2 }
	skillsRead: string[]                    // skill ids actually loaded during run
	errorCount: number                      // failed tool calls
}

export type EvalRun = {
	id: string
	timestamp: string
	config: RunConfig
	uiMessages: UIMessage[]
	summary: RunSummary
	skillSnapshots: Record<string, string> // skill id → full content at run time
	annotation: {
		notes: string
		savedAt: string | null
		rating: 'good' | 'bad' | null
	}
	evalResult?: EvalResult
}

export type RunListItem = Omit<EvalRun, 'uiMessages'>

export type Skill = {
	id: string          // storage key: directory name or .md filename stem
	name: string        // frontmatter display name
	description: string
	content: string     // markdown body
}
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
npm run check
```

Expected: no type errors. Fix any that appear before proceeding.

- [x] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: extend types for eval criteria, experiment tracking, and run instrumentation"
```

---

## Task 3: Eval config loader

**Files:**
- Create: `src/lib/server/eval-configs.ts`
- Create: `src/lib/server/eval-configs.test.ts`

- [x] **Step 1: Write the failing tests first**

Create `src/lib/server/eval-configs.test.ts`:

```typescript
// @vitest-environment node
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { listEvalConfigs, loadEvalConfig } from './eval-configs'

const TEST_DIR = join(process.cwd(), 'data', 'eval-configs-test')

const VALID_YAML = `
id: test-case-01
description: "A test case"
prompt: "What is 2 + 2?"
criteria:
  - id: correct-answer
    type: final_answer_contains
    value: "4"
    blocking: true
  - id: step-budget
    type: step_count_lte
    value: 3
`

const INVALID_YAML = `
id: bad-case
description: "Missing prompt"
criteria: []
`

beforeAll(async () => {
	await mkdir(TEST_DIR, { recursive: true })
	await writeFile(join(TEST_DIR, 'valid.yaml'), VALID_YAML)
	await writeFile(join(TEST_DIR, 'invalid.yaml'), INVALID_YAML)
	await writeFile(join(TEST_DIR, 'not-yaml.txt'), 'ignored')
})

afterAll(async () => {
	await rm(TEST_DIR, { recursive: true, force: true })
})

describe('listEvalConfigs', () => {
	test('returns only valid yaml files from a directory', async () => {
		const configs = await listEvalConfigs(TEST_DIR)
		expect(configs).toHaveLength(1)
		expect(configs[0].id).toBe('test-case-01')
	})

	test('returns empty array when directory does not exist', async () => {
		const configs = await listEvalConfigs('/nonexistent/path')
		expect(configs).toEqual([])
	})
})

describe('loadEvalConfig', () => {
	test('loads and parses a valid config by id', async () => {
		const config = await loadEvalConfig('test-case-01', TEST_DIR)
		expect(config).not.toBeNull()
		expect(config!.prompt).toBe('What is 2 + 2?')
		expect(config!.criteria).toHaveLength(2)
	})

	test('returns null for unknown id', async () => {
		const config = await loadEvalConfig('does-not-exist', TEST_DIR)
		expect(config).toBeNull()
	})
})
```

- [x] **Step 2: Run tests to confirm they fail**

```bash
npm test -- eval-configs
```

Expected: fails with "Cannot find module './eval-configs'".

- [x] **Step 3: Implement the loader**

Create `src/lib/server/eval-configs.ts`:

```typescript
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { parse } from 'yaml'
import { z } from 'zod'
import type { EvalConfig } from '$lib/types'

const EVAL_CONFIGS_DIR = join(process.cwd(), 'data', 'eval-configs')

const EvalCriterionSchema = z.discriminatedUnion('type', [
	z.object({ id: z.string(), type: z.literal('final_answer_contains'), value: z.string(), blocking: z.boolean().optional() }),
	z.object({ id: z.string(), type: z.literal('final_answer_not_contains'), value: z.string(), blocking: z.boolean().optional() }),
	z.object({ id: z.string(), type: z.literal('tool_called'), tool: z.string(), blocking: z.boolean().optional() }),
	z.object({ id: z.string(), type: z.literal('step_count_lte'), value: z.number() }),
	z.object({ id: z.string(), type: z.literal('tool_call_count_lte'), value: z.number(), tool: z.string().optional() }),
])

const EvalConfigSchema = z.object({
	id: z.string(),
	description: z.string(),
	prompt: z.string(),
	criteria: z.array(EvalCriterionSchema),
})

async function parseConfigFile(filePath: string): Promise<EvalConfig | null> {
	try {
		const raw = await readFile(filePath, 'utf-8')
		const parsed = parse(raw)
		const result = EvalConfigSchema.safeParse(parsed)
		if (!result.success) {
			console.warn(`Invalid eval config at ${filePath}:`, result.error.issues)
			return null
		}
		return result.data as EvalConfig
	} catch {
		return null
	}
}

export async function listEvalConfigs(dir = EVAL_CONFIGS_DIR): Promise<EvalConfig[]> {
	try {
		const files = (await readdir(dir)).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
		const results = await Promise.all(files.map(f => parseConfigFile(join(dir, f))))
		return results.filter((c): c is EvalConfig => c !== null)
	} catch {
		return []
	}
}

export async function loadEvalConfig(id: string, dir = EVAL_CONFIGS_DIR): Promise<EvalConfig | null> {
	const configs = await listEvalConfigs(dir)
	return configs.find(c => c.id === id) ?? null
}
```

- [x] **Step 4: Run tests to confirm they pass**

```bash
npm test -- eval-configs
```

Expected: all 4 tests pass.

- [x] **Step 5: Commit**

```bash
git add src/lib/server/eval-configs.ts src/lib/server/eval-configs.test.ts
git commit -m "feat: add eval config YAML loader with Zod validation"
```

---

## Task 4: Evaluator

**Files:**
- Create: `src/lib/server/evaluator.ts`
- Create: `src/lib/server/evaluator.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/server/evaluator.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { evaluateRun } from './evaluator'
import type { EvalRun, EvalConfig } from '$lib/types'

// Minimal EvalRun fixture — only fields the evaluator reads
function makeRun(overrides: Partial<EvalRun['summary']> = {}): EvalRun {
	return {
		id: 'run_test',
		timestamp: '2026-01-01T00:00:00Z',
		config: {
			mcpServerUrl: 'http://localhost',
			mcpHeaders: {},
			skills: [],
			prompt: 'test prompt',
			maxSteps: 20,
		},
		uiMessages: [],
		skillSnapshots: {},
		summary: {
			toolCallCount: 3,
			skillLoadCount: 0,
			stepCount: 4,
			finishReason: 'stop',
			finalAnswer: 'Total revenue is $72,720.08 with 26 transactions.',
			totalInputTokens: 100,
			totalOutputTokens: 50,
			durationMs: 5000,
			toolCallsByName: { explore_schema: 2, query: 1 },
			skillsRead: [],
			errorCount: 0,
			...overrides,
		},
		annotation: { rating: null, notes: '', savedAt: null },
	}
}

describe('final_answer_contains', () => {
	test('passes when value is in final answer', () => {
		const run = makeRun()
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'rev', type: 'final_answer_contains', value: '$72,720.08', blocking: true }],
		}
		const result = evaluateRun(run, config)
		expect(result.passed).toBe(true)
		expect(result.criteriaResults[0].passed).toBe(true)
	})

	test('fails (blocking) when value is absent', () => {
		const run = makeRun()
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'rev', type: 'final_answer_contains', value: '$99,999.00', blocking: true }],
		}
		const result = evaluateRun(run, config)
		expect(result.passed).toBe(false)
		expect(result.criteriaResults[0].passed).toBe(false)
	})
})

describe('final_answer_not_contains', () => {
	test('passes when value is absent from final answer', () => {
		const run = makeRun()
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'no-err', type: 'final_answer_not_contains', value: 'error', blocking: true }],
		}
		const result = evaluateRun(run, config)
		expect(result.criteriaResults[0].passed).toBe(true)
	})

	test('fails when value is present', () => {
		const run = makeRun({ finalAnswer: 'There was an error fetching data.' })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'no-err', type: 'final_answer_not_contains', value: 'error', blocking: true }],
		}
		const result = evaluateRun(run, config)
		expect(result.criteriaResults[0].passed).toBe(false)
	})
})

describe('tool_called', () => {
	test('passes when tool appears in toolCallsByName', () => {
		const run = makeRun({ toolCallsByName: { get_sales_summary: 1, query: 2 } })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'tool', type: 'tool_called', tool: 'get_sales_summary', blocking: true }],
		}
		const result = evaluateRun(run, config)
		expect(result.criteriaResults[0].passed).toBe(true)
	})

	test('fails when tool is absent from toolCallsByName', () => {
		const run = makeRun({ toolCallsByName: { query: 2 } })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'tool', type: 'tool_called', tool: 'get_sales_summary', blocking: true }],
		}
		const result = evaluateRun(run, config)
		expect(result.criteriaResults[0].passed).toBe(false)
	})
})

describe('step_count_lte', () => {
	test('passes when step count is within budget', () => {
		const run = makeRun({ stepCount: 4 })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'steps', type: 'step_count_lte', value: 6 }],
		}
		const result = evaluateRun(run, config)
		expect(result.criteriaResults[0].passed).toBe(true)
		expect(result.criteriaResults[0].actual).toBe(4)
	})

	test('fails when step count exceeds budget', () => {
		const run = makeRun({ stepCount: 10 })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'steps', type: 'step_count_lte', value: 6 }],
		}
		const result = evaluateRun(run, config)
		expect(result.criteriaResults[0].passed).toBe(false)
	})
})

describe('tool_call_count_lte', () => {
	test('checks specific tool when tool field is set', () => {
		const run = makeRun({ toolCallsByName: { explore_schema: 2, query: 1 } })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'explore', type: 'tool_call_count_lte', tool: 'explore_schema', value: 1 }],
		}
		const result = evaluateRun(run, config)
		expect(result.criteriaResults[0].passed).toBe(false)
		expect(result.criteriaResults[0].actual).toBe(2)
	})

	test('checks total tool calls when tool field is omitted', () => {
		const run = makeRun({ toolCallCount: 3 })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'total', type: 'tool_call_count_lte', value: 5 }],
		}
		const result = evaluateRun(run, config)
		expect(result.criteriaResults[0].passed).toBe(true)
		expect(result.criteriaResults[0].actual).toBe(3)
	})
})

describe('qualityScore', () => {
	test('is 100 when all non-blocking criteria pass', () => {
		const run = makeRun({ stepCount: 4, toolCallsByName: { explore_schema: 1 } })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [
				{ id: 'steps', type: 'step_count_lte', value: 6 },
				{ id: 'explore', type: 'tool_call_count_lte', tool: 'explore_schema', value: 2 },
			],
		}
		const result = evaluateRun(run, config)
		expect(result.qualityScore).toBe(100)
	})

	test('is 50 when half of non-blocking criteria pass', () => {
		const run = makeRun({ stepCount: 10, toolCallsByName: { explore_schema: 1 } })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [
				{ id: 'steps', type: 'step_count_lte', value: 6 },       // FAIL (10 > 6)
				{ id: 'explore', type: 'tool_call_count_lte', tool: 'explore_schema', value: 2 }, // PASS
			],
		}
		const result = evaluateRun(run, config)
		expect(result.qualityScore).toBe(50)
	})

	test('is 100 when there are no non-blocking criteria', () => {
		const run = makeRun()
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [
				{ id: 'rev', type: 'final_answer_contains', value: '$72,720.08', blocking: true },
			],
		}
		const result = evaluateRun(run, config)
		expect(result.qualityScore).toBe(100)
	})

	test('passed is true when no blocking criteria exist', () => {
		const run = makeRun({ stepCount: 100 })
		const config: EvalConfig = {
			id: 'c', description: 'd', prompt: 'p',
			criteria: [{ id: 'steps', type: 'step_count_lte', value: 6 }],
		}
		const result = evaluateRun(run, config)
		expect(result.passed).toBe(true) // no blocking criteria → always passes
	})
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- evaluator
```

Expected: fails with "Cannot find module './evaluator'".

- [ ] **Step 3: Implement the evaluator**

Create `src/lib/server/evaluator.ts`:

```typescript
import type { EvalConfig, EvalCriterion, EvalCriterionResult, EvalResult, EvalRun } from '$lib/types'

function evaluateCriterion(criterion: EvalCriterion, run: EvalRun): EvalCriterionResult {
	const blocking = 'blocking' in criterion ? (criterion.blocking ?? false) : false

	switch (criterion.type) {
		case 'final_answer_contains': {
			const passed = run.summary.finalAnswer.includes(criterion.value)
			return { id: criterion.id, passed, blocking }
		}
		case 'final_answer_not_contains': {
			const passed = !run.summary.finalAnswer.includes(criterion.value)
			return { id: criterion.id, passed, blocking }
		}
		case 'tool_called': {
			const actual = run.summary.toolCallsByName[criterion.tool] ?? 0
			const passed = actual > 0
			return { id: criterion.id, passed, blocking, actual }
		}
		case 'step_count_lte': {
			const actual = run.summary.stepCount
			const passed = actual <= criterion.value
			return { id: criterion.id, passed, blocking: false, actual }
		}
		case 'tool_call_count_lte': {
			const actual = criterion.tool
				? (run.summary.toolCallsByName[criterion.tool] ?? 0)
				: run.summary.toolCallCount
			const passed = actual <= criterion.value
			return { id: criterion.id, passed, blocking: false, actual }
		}
	}
}

export function evaluateRun(run: EvalRun, config: EvalConfig): EvalResult {
	const criteriaResults = config.criteria.map(c => evaluateCriterion(c, run))

	const blockingResults = criteriaResults.filter(r => r.blocking)
	const passed = blockingResults.length === 0 || blockingResults.every(r => r.passed)

	const nonBlockingResults = criteriaResults.filter(r => !r.blocking)
	const qualityScore = nonBlockingResults.length === 0
		? 100
		: Math.round((nonBlockingResults.filter(r => r.passed).length / nonBlockingResults.length) * 100)

	return {
		configId: config.id,
		evaluatedAt: new Date().toISOString(),
		passed,
		qualityScore,
		criteriaResults,
	}
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- evaluator
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/evaluator.ts src/lib/server/evaluator.test.ts
git commit -m "feat: add run evaluator with deterministic criteria scoring"
```

---

## Task 5: Instrument run executor

**Files:**
- Modify: `src/routes/api/run/+server.ts`

> **Note for implementer:** Before editing this file, invoke the `ai-sdk` skill to verify the `onStepFinish` callback shape in AI SDK v6 `ToolLoopAgent` — specifically whether `toolResults` is available and how `isError` is surfaced on tool results.

- [ ] **Step 1: Update the POST handler**

Replace `src/routes/api/run/+server.ts` with the following. The changes are:
1. Import `loadEvalConfig` and `evaluateRun`
2. Capture `skillSnapshots` before run starts
3. Track `toolCallsByName`, `skillsRead`, `errorCount` during execution
4. Add new fields to `runSummary`
5. Run evaluation after completion if `testCaseId` is set
6. Pass `skillSnapshots` and `evalResult` to `saveRun`

```typescript
import { createAnthropic } from '@ai-sdk/anthropic'
import { createMCPClient } from '@ai-sdk/mcp'
import {
	ToolLoopAgent,
	stepCountIs,
	tool,
	createUIMessageStream,
	createUIMessageStreamResponse
} from 'ai'
import { z } from 'zod'
import { env } from '$env/dynamic/private'
import { generateRunId, saveRun } from '$lib/server/runs'
import { filterTools } from '$lib/server/tools'
import { loadEvalConfig } from '$lib/server/eval-configs'
import { evaluateRun } from '$lib/server/evaluator'
import type { RunConfig, RunSummary, Skill } from '$lib/types'

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })

function buildInstructions(skills: Skill[], setupPrompt?: string): string {
	const base = 'You are a helpful assistant. Use the available tools to answer the user\'s question thoroughly.'
	let instructions = base
	if (setupPrompt) {
		instructions += `\n\nBefore doing anything else, you MUST complete this setup step:\n${setupPrompt}\n\nOnce setup is complete, proceed with the user's actual task.`
	}
	if (skills.length === 0) return instructions
	const skillList = skills.map(s => `- **${s.id}**: ${s.description}`).join('\n')
	return `${instructions}\n\nYou have the following skills available. When a task matches a skill's description, call the \`loadSkill\` tool with that skill's name before proceeding — it will return the full instructions.\n\n${skillList}`
}

export async function POST({ request }) {
	const { config } = await request.json() as { config: RunConfig }

	const runId = generateRunId()
	const startTime = Date.now()

	// Snapshot skill content before run starts
	const skillSnapshots: Record<string, string> = Object.fromEntries(
		config.skills.map(s => [s.id, s.content])
	)

	const skillMap = new Map(config.skills.map(s => [s.id, s.content]))

	let mcpClient: Awaited<ReturnType<typeof createMCPClient>>
	try {
		mcpClient = await createMCPClient({
			transport: {
				type: 'http',
				url: config.mcpServerUrl,
				headers: config.mcpHeaders
			}
		})
	} catch (err) {
		return new Response(
			JSON.stringify({ error: `MCP connection failed: ${err instanceof Error ? err.message : String(err)}` }),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		)
	}

	let mcpTools: Awaited<ReturnType<typeof mcpClient.tools>>
	try {
		mcpTools = await mcpClient.tools()
	} catch (err) {
		await mcpClient.close()
		return new Response(
			JSON.stringify({ error: `Failed to load MCP tools: ${err instanceof Error ? err.message : String(err)}` }),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		)
	}

	const filteredTools = filterTools(mcpTools, config.disabledTools ?? [])

	// Accumulators
	let toolCallCount = 0
	let skillLoadCount = 0
	let errorCount = 0
	const toolCallsByName: Record<string, number> = {}
	const skillsRead: string[] = []

	let runSummary: RunSummary | null = null

	const agent = new ToolLoopAgent({
		model: anthropic('claude-sonnet-4-5'),
		instructions: buildInstructions(config.skills, config.setupPrompt),
		tools: {
			...filteredTools,
			loadSkill: tool({
				description: 'Load the full instructions for a named skill. Call this when a task matches a skill description.',
				inputSchema: z.object({
					skillName: z.string().describe('The exact name of the skill to load')
				}),
				execute: async ({ skillName }) => {
					skillLoadCount++
					skillsRead.push(skillName)
					return skillMap.get(skillName)
						?? `Skill "${skillName}" not found. Available: ${[...skillMap.keys()].join(', ')}`
				}
			})
		},
		stopWhen: stepCountIs(config.maxSteps ?? 20),
		onStepFinish: ({ toolCalls, toolResults }) => {
			for (const tc of toolCalls ?? []) {
				if (tc.toolName === 'loadSkill') continue
				toolCallCount++
				toolCallsByName[tc.toolName] = (toolCallsByName[tc.toolName] ?? 0) + 1
			}
			errorCount += (toolResults ?? []).filter((tr: { isError?: boolean }) => tr.isError).length
		},
		onFinish: async ({ steps, totalUsage }) => {
			await mcpClient.close()
			const lastStep = steps[steps.length - 1]
			const lastTextStep = [...steps].reverse().find(s => s.text)
			runSummary = {
				toolCallCount,
				skillLoadCount,
				stepCount: steps.length,
				finishReason: lastStep?.finishReason ?? 'unknown',
				finalAnswer: lastTextStep?.text ?? '',
				totalInputTokens: totalUsage.inputTokens ?? 0,
				totalOutputTokens: totalUsage.outputTokens ?? 0,
				durationMs: Date.now() - startTime,
				toolCallsByName,
				skillsRead,
				errorCount,
			}
		}
	})

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			writer.write({ type: 'data-runId', data: { runId } })
			const result = await agent.stream({ prompt: config.prompt })
			writer.merge(result.toUIMessageStream({
				onFinish: async ({ messages }) => {
					if (!runSummary) return

					const evalRun = {
						id: runId,
						timestamp: new Date().toISOString(),
						config,
						uiMessages: messages,
						summary: runSummary,
						skillSnapshots,
						annotation: { rating: null, notes: '', savedAt: null },
					}

					// Auto-evaluate if test case is linked
					let evalResult = undefined
					if (config.testCaseId) {
						const evalConfig = await loadEvalConfig(config.testCaseId)
						if (evalConfig) {
							evalResult = evaluateRun({ ...evalRun, evalResult: undefined }, evalConfig)
						}
					}

					await saveRun({ ...evalRun, evalResult })
				}
			}))
		}
	})

	return createUIMessageStreamResponse({ stream })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check
```

Expected: no errors. If `toolResults` shape causes a type error, check the AI SDK types and adjust the cast accordingly.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/run/+server.ts
git commit -m "feat: instrument run executor with per-tool tracking, skill snapshots, and auto-eval"
```

---

## Task 6: GET /api/eval-configs endpoint

**Files:**
- Create: `src/routes/api/eval-configs/+server.ts`

- [ ] **Step 1: Create the endpoint**

Create `src/routes/api/eval-configs/+server.ts`:

```typescript
import { json } from '@sveltejs/kit'
import { listEvalConfigs } from '$lib/server/eval-configs'

export async function GET() {
	const configs = await listEvalConfigs()
	// Return only id + description + prompt — client doesn't need criteria detail
	return json(configs.map(c => ({ id: c.id, description: c.description, prompt: c.prompt })))
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/eval-configs/+server.ts
git commit -m "feat: add GET /api/eval-configs endpoint"
```

---

## Task 7: Update RunConfigForm

**Files:**
- Modify: `src/lib/components/RunConfigForm.svelte`

> **Note for implementer:** Invoke the `svelte-code-writer` skill before editing this file to verify Svelte 5 patterns for reactive fetch and readonly inputs.

The form needs three new fields:
- **Test Case** — a `<select>` populated from `/api/eval-configs`. Selecting one sets `testCaseId` and copies `prompt` from the config, locking the prompt textarea.
- **Experiment** — free text input for grouping runs.
- **Label** — free text input describing this variant.

All three persist to localStorage via `persistConfig`.

- [ ] **Step 1: Add new props to the script section**

In the `$props()` destructure, add:

```typescript
testCaseId = $bindable(''),
experiment = $bindable(''),
label = $bindable(''),
```

- [ ] **Step 2: Add eval config fetch state and loader**

After the existing `let checking = $state(false)` line, add:

```typescript
type EvalConfigSummary = { id: string; description: string; prompt: string }
let evalConfigs = $state<EvalConfigSummary[]>([])

async function loadEvalConfigs() {
    try {
        const res = await fetch('/api/eval-configs')
        if (res.ok) evalConfigs = await res.json()
    } catch {}
}

// Load eval configs once on mount
$effect(() => {
    loadEvalConfigs()
})

function selectTestCase(id: string) {
    testCaseId = id
    if (id) {
        const config = evalConfigs.find(c => c.id === id)
        if (config) prompt = config.prompt
    }
    persistConfig()
}
```

- [ ] **Step 3: Include new fields in persistConfig**

Replace the `persistConfig` function body:

```typescript
function persistConfig() {
    if (!storageKey || typeof localStorage === 'undefined') return
    localStorage.setItem(storageKey, JSON.stringify({
        url, headers, prompt, setupPrompt, maxSteps, disabledTools,
        testCaseId, experiment, label
    }))
}
```

- [ ] **Step 4: Restore new fields from localStorage**

In the localStorage init block, add after `disabledTools = cfg.disabledTools ?? []`:

```typescript
testCaseId = cfg.testCaseId ?? ''
experiment = cfg.experiment ?? ''
label = cfg.label ?? ''
```

- [ ] **Step 5: Add the new UI sections**

Add the following block above the existing `<!-- Setup Prompt -->` section:

```svelte
<!-- Test Case -->
<div class="space-y-1">
    <label class="text-sm font-medium text-gray-700" for="cfg-testcase">
        Test Case <span class="font-normal text-gray-400">(optional)</span>
    </label>
    <select
        id="cfg-testcase"
        value={testCaseId}
        onchange={(e) => selectTestCase((e.target as HTMLSelectElement).value)}
        class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
        <option value="">— none —</option>
        {#each evalConfigs as cfg (cfg.id)}
            <option value={cfg.id}>{cfg.id} — {cfg.description}</option>
        {/each}
    </select>
</div>

<!-- Experiment + Label -->
<div class="flex gap-2">
    <div class="flex-1 space-y-1">
        <label class="text-sm font-medium text-gray-700" for="cfg-experiment">Experiment</label>
        <input
            id="cfg-experiment"
            bind:value={experiment}
            oninput={persistConfig}
            type="text"
            placeholder="e.g. sales-perf ablation"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
    </div>
    <div class="flex-1 space-y-1">
        <label class="text-sm font-medium text-gray-700" for="cfg-label">Label</label>
        <input
            id="cfg-label"
            bind:value={label}
            oninput={persistConfig}
            type="text"
            placeholder="e.g. no skill"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
    </div>
</div>
```

- [ ] **Step 6: Lock the prompt textarea when a test case is selected**

On the prompt `<textarea>`, add `readonly={!!testCaseId}` and a locked indicator:

```svelte
<div class="space-y-1">
    <div class="flex items-center justify-between">
        <label class="text-sm font-medium text-gray-700" for="cfg-prompt">Prompt</label>
        {#if testCaseId}
            <span class="text-xs text-gray-400">Locked to test case</span>
        {/if}
    </div>
    <textarea
        id="cfg-prompt"
        bind:value={prompt}
        oninput={persistConfig}
        readonly={!!testCaseId}
        rows={6}
        placeholder="Enter the prompt for the agent..."
        class="w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        class:bg-gray-50={!!testCaseId}
        class:text-gray-500={!!testCaseId}
    ></textarea>
</div>
```

- [ ] **Step 7: Find where RunConfigForm is used and pass new props**

Search for usages of `RunConfigForm`:

```bash
grep -r "RunConfigForm" src/ --include="*.svelte" -l
```

For each usage site, add bindings for `testCaseId`, `experiment`, and `label` — and ensure the parent passes them through to the run config sent to `/api/run`.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npm run check
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/RunConfigForm.svelte
git commit -m "feat: add test case selector and experiment/label fields to RunConfigForm"
```

---

## Task 8: Update runs sidebar

**Files:**
- Modify: `src/routes/runs/+layout.svelte`

- [ ] **Step 1: Update each run entry in the sidebar**

Replace the run list item content inside the `<a>` tag. Currently it shows `run.id`, timestamp, prompt, and tool/skill counts. Update to also show experiment/label and pass/fail badge:

```svelte
<a
    href={resolve(`/runs/${run.id}`)}
    class="block px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
    class:bg-blue-50={active}
    class:border-l-2={active}
    class:border-l-blue-500={active}
>
    <!-- Experiment + Label (shown instead of run id when set) -->
    {#if run.config.experiment || run.config.label}
        <div class="text-xs font-medium text-gray-800 truncate">
            {#if run.config.experiment}<span class="text-gray-500">{run.config.experiment}</span>{/if}
            {#if run.config.experiment && run.config.label} · {/if}
            {#if run.config.label}{run.config.label}{/if}
        </div>
    {:else}
        <div class="font-mono text-xs text-gray-800 truncate">{run.id}</div>
    {/if}

    <div class="text-xs text-gray-400 mt-0.5">
        {new Date(run.timestamp).toLocaleString()}
    </div>

    <div class="mt-1 space-y-0.5">
        <div class="text-xs text-gray-600 truncate">
            <span class="font-semibold">Prompt:</span> {run.config.prompt}
        </div>
        <div class="text-xs text-gray-600">
            <span class="font-semibold">Steps:</span> {run.summary.stepCount}
            · <span class="font-semibold">Tools:</span> {run.summary.toolCallCount}
        </div>
    </div>

    <!-- Eval result badge -->
    {#if run.evalResult}
        <div class="mt-1.5 flex items-center gap-1.5">
            <span
                class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold"
                class:bg-green-100={run.evalResult.passed}
                class:text-green-700={run.evalResult.passed}
                class:bg-red-100={!run.evalResult.passed}
                class:text-red-700={!run.evalResult.passed}
            >
                {run.evalResult.passed ? 'PASS' : 'FAIL'}
            </span>
            <span class="text-xs text-gray-500">quality: {run.evalResult.qualityScore}%</span>
        </div>
    {:else if run.annotation.rating}
        <span class="text-xs {run.annotation.rating === 'good' ? 'text-green-600' : 'text-red-500'}">
            {run.annotation.rating === 'good' ? '👍' : '👎'}
        </span>
    {/if}
</a>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/runs/+layout.svelte
git commit -m "feat: show experiment, label, and eval pass/fail badge in runs sidebar"
```

---

## Task 9: Run detail eval results panel

**Files:**
- Modify: `src/routes/runs/[id]/+page.svelte`

> **Note for implementer:** Invoke the `svelte-code-writer` skill before editing this file.

- [ ] **Step 1: Add eval results section to the annotation sidebar**

In `src/routes/runs/[id]/+page.svelte`, add the following block inside the `<aside>` after the Rating section and before the Notes section:

```svelte
<!-- Eval Results -->
{#if data.run.evalResult}
    {@const evalResult = data.run.evalResult}
    <div>
        <h3 class="text-sm font-semibold text-gray-700 mb-2">Eval Results</h3>
        <div class="flex items-center gap-2 mb-2">
            <span
                class="inline-flex items-center rounded px-2 py-0.5 text-sm font-bold"
                class:bg-green-100={evalResult.passed}
                class:text-green-700={evalResult.passed}
                class:bg-red-100={!evalResult.passed}
                class:text-red-700={!evalResult.passed}
            >
                {evalResult.passed ? 'PASS' : 'FAIL'}
            </span>
            <span class="text-sm text-gray-500">Quality: {evalResult.qualityScore}%</span>
        </div>
        <div class="space-y-1">
            {#each evalResult.criteriaResults as cr (cr.id)}
                <div class="flex items-start gap-1.5 text-xs">
                    <span class={cr.passed ? 'text-green-600' : 'text-red-500'}>
                        {cr.passed ? '✓' : '✗'}
                    </span>
                    <span class="text-gray-700 flex-1">{cr.id}</span>
                    {#if cr.actual !== undefined}
                        <span class="text-gray-400 font-mono">{cr.actual}</span>
                    {/if}
                    {#if cr.blocking}
                        <span class="text-gray-400 text-[10px] uppercase tracking-wide">blocking</span>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
{/if}
```

- [ ] **Step 2: Add tool call breakdown**

In the same sidebar, add a tool call breakdown section after the eval results block (or after Rating if no eval result):

```svelte
<!-- Tool Call Breakdown -->
{#if Object.keys(data.run.summary.toolCallsByName ?? {}).length > 0}
    <div>
        <h3 class="text-sm font-semibold text-gray-700 mb-1.5">Tool Calls</h3>
        <div class="space-y-0.5">
            {#each Object.entries(data.run.summary.toolCallsByName) as [tool, count] (tool)}
                <div class="flex justify-between text-xs">
                    <span class="font-mono text-gray-700">{tool}</span>
                    <span class="text-gray-500">{count}</span>
                </div>
            {/each}
            {#if data.run.summary.errorCount > 0}
                <div class="flex justify-between text-xs text-red-500 pt-0.5 border-t border-gray-100 mt-0.5">
                    <span>errors</span>
                    <span>{data.run.summary.errorCount}</span>
                </div>
            {/if}
        </div>
    </div>
{/if}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/runs/[id]/+page.svelte
git commit -m "feat: add eval results panel and tool call breakdown to run detail view"
```

---

## Self-Review

**Spec coverage check:**
- ✅ YAML eval config format with blocking/non-blocking criteria
- ✅ `final_answer_contains`, `final_answer_not_contains`, `tool_called`, `step_count_lte`, `tool_call_count_lte` criterion types
- ✅ `toolCallsByName` and `skillsRead` instrumentation
- ✅ `skillSnapshots` captured at run time
- ✅ `experiment` and `label` on RunConfig
- ✅ `testCaseId` links run to eval config
- ✅ Prompt locked when test case selected
- ✅ Auto-evaluation triggered post-run when `testCaseId` set
- ✅ Runs sidebar shows experiment/label and pass/fail badge
- ✅ Run detail shows per-criterion results and tool call breakdown
- ✅ `RunListItem` inherits all new fields via `Omit<EvalRun, 'uiMessages'>` — no changes needed to `runs.ts`

**Backward compatibility:** All new `RunConfig` and `RunSummary` fields are optional or have safe defaults. Existing saved runs without these fields will not break — `toolCallsByName` can be `undefined` and the UI guards with `?? {}`.

> ⚠️ Existing runs in `data/runs/` do not have `skillSnapshots` or `toolCallsByName`. Add `?? {}` guards in the UI when accessing these fields on older runs.
