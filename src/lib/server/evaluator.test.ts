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