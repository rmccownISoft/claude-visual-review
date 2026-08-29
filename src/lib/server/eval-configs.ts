import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { parse } from 'yaml'
import { z } from 'zod'
import type { EvalConfig } from '$lib/types'

const EVAL_CONFIGS_DIR = join(process.cwd(), 'data', 'eval-configs')

// TODO: need to understand discriminated unions and how they're used here
const EvalCriterionSchema = z.discriminatedUnion('type', [
	z.object({ id: z.string(), type: z.literal('final_answer_contains'), value: z.string(), blocking: z.boolean().optional() }),
	z.object({ id: z.string(), type: z.literal('final_answer_not_contains'), value: z.string(), blocking: z.boolean().optional() }),
	z.object({ id: z.string(), type: z.literal('tool_called'), tool: z.string(), blocking: z.boolean().optional() }),
	z.object({ id: z.string(), type: z.literal('step_count_lte'), value: z.number() }),
	z.object({ id: z.string(), type: z.literal('tool_call_count_lte'), value: z.number(), tool: z.string().optional() }),
])

// To validate required top-level yaml fields
const EvalConfigSchema = z.object({
	id: z.string(),
	description: z.string(),
	prompt: z.string(),
	criteria: z.array(EvalCriterionSchema),
})

// Reads a yaml file, has two error paths: 1. filesystem 2. schema validation
async function parseConfigFile(filePath: string): Promise<EvalConfig | null> {
	try {
		const raw = await readFile(filePath, 'utf-8')
		const parsed = parse(raw)
		const result = EvalConfigSchema.safeParse(parsed)
		if (!result.success) {
			console.warn(`Invalid eval config at ${filePath}:`, result.error.issues)
			return null
		}
		return result.data as EvalConfig  // Guess we can get away with this here b/c of Zod validation
	} catch {
		return null
	}
}

// Reads yaml files in the directory, parses, filters out failed ones
export async function listEvalConfigs(dir = EVAL_CONFIGS_DIR): Promise<EvalConfig[]> {
	try {
		const files = (await readdir(dir)).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
		const results = await Promise.all(files.map(f => parseConfigFile(join(dir, f))))
		return results.filter((c): c is EvalConfig => c !== null) // Never seen this one, supposedly says after filtered out nulls, will only contain EvalConfig
	} catch {
		return []
	}
}

// Loads all configs then finds by an id.  This isn't great for a large number of files 
export async function loadEvalConfig(id: string, dir = EVAL_CONFIGS_DIR): Promise<EvalConfig | null> {
	const configs = await listEvalConfigs(dir)
	return configs.find(c => c.id === id) ?? null
}