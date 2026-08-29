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