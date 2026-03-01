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
import { generateRunId, saveRun, type EvalRun, type RunSummary } from '$lib/server/runs'
import type { Skill } from '$lib/server/skills'

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })

// Suggested to use createUIMessageStream over createAgentUIStreamResponse so we can inject runId via a writer?
// TODO: check/confirm the above...may not be necessary 

/**
 * Vercel doesn't appear to have a skill loader so instead we'll load the text via tool call
 * Agent sees skill names and descriptions up front but only loads the full instructions when loadSkill called.  This is supposed
 * to be how Claude Desktop/Code loads skills.
 * Note: the anthropic api and others seem to allow skills, Vercel is behind on this
 */

// TODO: replace this if the sdk ever allows skills as an actual feature instead of this workaround
function buildInstructions(skills: Skill[]): string {
	const base = 'You are a helpful assistant. Use the available tools to answer the user\'s question thoroughly.'

	if (skills.length === 0) return base

	const skillList = skills
		.map(s => `- **${s.name}**: ${s.description}`)
		.join('\n')

	return `${base}

You have the following skills available. When a task matches a skill's description, call the \`loadSkill\` tool with that skill's name before proceeding — it will return the full instructions.

${skillList}`
}

// ToolLoopAgent.onFinish fires first (agent done), sets runSummary, closes the MCP client. Then toUIMessageStream.onFinish fires (stream done), and saves the complete run with actual messages.
export async function POST({ request }) {
    const { config } = await request.json() as {
        config: {
            mcpServerUrl: string 
            mcpHeaders: Record<string, string>
            skills: Skill[]
            prompt: string 
            maxSteps: number
        }
    }

    const runId = generateRunId()
    const startTime = Date.now()

    // Build skill lookup, the loadSkill tool reads this 
    const skillMap = new Map(config.skills.map(s => [s.name, s.content]))

    // Fail early if MCP server is unreachable 
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

    const mcpTools = await mcpClient.tools()

    // Accumulate per-step stats to build the summary in onFinish
    let toolCallCount = 0
    let skillLoadCount = 0

	let runSummary: RunSummary | null = null
    const agent = new ToolLoopAgent({
    	model: anthropic('claude-sonnet-4-5'),
    	instructions: buildInstructions(config.skills),
    	tools: {
    		...mcpTools,
    		loadSkill: tool({
    			description: 'Load the full instructions for a named skill. Call this when a task matches a skill description.',
    			inputSchema: z.object({
    				skillName: z.string().describe('The exact name of the skill to load')
    			}),
    			execute: async ({ skillName }) => {
    				skillLoadCount++
    				return skillMap.get(skillName)
    					?? `Skill "${skillName}" not found. Available: ${[...skillMap.keys()].join(', ')}`
    			}
    		})
    	},
    	stopWhen: stepCountIs(config.maxSteps ?? 20),
    	onStepFinish: ({ toolCalls }) => {
    		// Count MCP tool calls (excluding loadSkill which is tracked separately)
    		toolCallCount += (toolCalls ?? []).filter(tc => tc.toolName !== 'loadSkill').length
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
		        durationMs: Date.now() - startTime
		    }
		    // Don't save here — toUIMessageStream.onFinish saves with actual messages
		}
    })
    
	const stream = createUIMessageStream({
	    execute: async ({ writer }) => {
	        writer.write({ type: 'data-runId', data: { runId } })
	        const result = await agent.stream({ prompt: config.prompt })
	        writer.merge(result.toUIMessageStream({
	            onFinish: async ({ messages }) => {
	                if (!runSummary) return
	                await saveRun({
	                    id: runId,
	                    timestamp: new Date().toISOString(),
	                    config,
	                    uiMessages: messages,
	                    summary: runSummary,
	                    annotation: { rating: null, notes: '', savedAt: null }
	                })
	            }
	        }))
	    }
	})

	return createUIMessageStreamResponse({ stream })
}




