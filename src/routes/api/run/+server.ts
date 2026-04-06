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

// Suggested to use createUIMessageStream over createAgentUIStreamResponse so we can inject runId via a writer?
// TODO: check/confirm the above...may not be necessary 

/**
 * Vercel doesn't appear to have a skill loader so instead we'll load the text via tool call
 * Agent sees skill names and descriptions up front but only loads the full instructions when loadSkill called.  This is supposed
 * to be how Claude Desktop/Code loads skills.
 * Note: the anthropic api and others seem to allow skills, Vercel is behind on this
 */

// TODO: replace this if the sdk ever allows skills as an actual feature instead of this workaround
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

// ToolLoopAgent.onFinish fires first (agent done), sets runSummary, closes the MCP client. Then toUIMessageStream.onFinish fires (stream done), and saves the complete run with actual messages.

// Closure discussion 
//The key insight: runSummary isn't passed as an argument to either function — it's just a variable both functions can see because they were both defined in the same outer scope. The JS runtime keeps that variable alive as long as any function references it.
//The reason we need this at all: you can't call one callback from the other (they're both called by the SDK, not by us), and the SDK doesn't provide a single callback that fires with both the steps AND the final messages together.
export async function POST({ request }) {
	const { config } = await request.json() as { config: RunConfig }

    const runId = generateRunId()
    const startTime = Date.now()

	// Get a snapshot of skill content before run starts
	const skillSnapshots: Record<string, string> = Object.fromEntries(
		config.skills.map(s => [s.id, s.content])
	)

    // Build skill lookup, the loadSkill tool reads this 
    const skillMap = new Map(config.skills.map(s => [s.id, s.content]))

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
	
	// TODO: awaited is apparently the lazy way to do this, should figure out the actual returned type here
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
    // Accumulate per-step stats to build the summary in onFinish
    let toolCallCount = 0
    let skillLoadCount = 0
	let errorCount = 0
	const toolCallsByName: Record<string, number> = {}
	const skillsRead: string[] = []

	let runSummary: RunSummary | null = null

    const agent = new ToolLoopAgent({
    	model: anthropic('claude-sonnet-4-6'),
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
			errorCount += (toolResults ?? []).filter((tr) => 'isError' in tr && tr.isError).length
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
		        errorCount
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




