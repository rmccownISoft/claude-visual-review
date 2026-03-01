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
}

export type RunConfig = {
	mcpServerUrl: string
	mcpHeaders: Record<string, string>
	skills: Skill[]
	prompt: string
	maxSteps: number
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
}

export type Skill = {
    name: string 
    description: string 
    content: string //markdown body 
}