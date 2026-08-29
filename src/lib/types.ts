import type { UIMessage } from 'ai'


export type EvalRun = {
	id: string
	timestamp: string
	config: RunConfig
	uiMessages: UIMessage[]
	summary: RunSummary
	annotation: {
		notes: string
		savedAt: string | null
		rating: 'good' | 'bad' | null // Review article(s) for other possibilities though this is user subjective
	}
	// Evals
	skillSnapshots: Record<string, string> //skill id for full content at run time?
	evalResult?: EvalResult
}

export type RunConfig = {
	mcpServerUrl: string
	mcpHeaders: Record<string, string>
	skills: Skill[]
	disabledTools?: string[]
	prompt: string
	setupPrompt?: string
	maxSteps: number
	// Eval fields 
	testCaseId?: string // links to yaml 
	experiment?: string // groups related runs 
	label?: string // describes the variant ex: 'no skill', 'skill v2' etc
}

export type RunListItem = Omit<EvalRun, 'uiMessages'>

export type RunSummary = {
	toolCallCount: number
	skillLoadCount: number
	stepCount: number
	finishReason: string
	finalAnswer: string
	totalInputTokens: number
	totalOutputTokens: number
	durationMs: number
	// Added for evals
	toolCallsByName: Record<string, number> // {explore_schema: 4, query: 2}
	skillsRead: string[] // skill ids loaded during run 
	errorCount: number // failed too calls
}

export type Skill = {
    id: string          // storage key: directory name or .md filename stem (e.g. "open-sales-orders-v2")
    name: string        // frontmatter display name (e.g. "open-sales-orders")
    description: string
    content: string     // markdown body
}

// Types for the actual evals 
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