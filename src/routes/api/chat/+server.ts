import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { z } from 'zod'
import { env } from '$env/dynamic/private'

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a log analysis assistant for an internal application logging platform.
You help engineers search, filter, and understand application logs stored in a MySQL database.

## Available Applications and Their Log Structures

### presage-mcp / enterprise-mcp (MCP Tool Logs)
These logs capture AI tool executions. The meta field contains:
- sessionId: string — groups all tool calls in one AI conversation
- tool.name: string — the tool that was invoked
- tool.parameters.userContext: string — the user's original request
- tool.result.content[].text: string — what the tool returned
- tool.result.isError: boolean — whether it failed
- tool.time: string — execution time (e.g. "247ms")
- gql[]: array of GraphQL queries made during the tool call

### enterprise-api (GraphQL API Logs)
These logs capture API requests. The meta field contains:
- operationName: string
- query: string — the GraphQL query
- variables: object
- totalTime: string
- errors[]: any GraphQL errors

### crystal-reports-server (Crystal Reports Logs)
These logs capture HTTP requests. The meta field contains:
- requestId, method, path, statusCode, duration
- userId, ip, userAgent
- error.message, error.stack (if applicable)

## Filter Parameters
When setting filters, use these field names:
- appName: exact app name (e.g. "presage-mcp", "enterprise-api")
- level: "info", "warn", "error", or "debug"
- textSearch: searches message text and meta JSON
- companyCode: integer company identifier
- mcpSessionId: MCP session ID string
- mcpToolName: MCP tool name string

## Instructions
- When a user wants to see specific logs, call set_filters first, then confirm what you applied.
- Use merge mode by default. Use replace mode only when the user explicitly wants a fresh start.
- When analyzing logs for patterns or summaries, use search_logs and describe what you find.
- Keep responses concise. After setting filters, briefly confirm what was applied.
- If you are unsure which app to filter by, call get_app_names first.
- Call get_current_view to understand what the user is currently looking at before making suggestions.`

export async function POST({ request }) {
	const { messages }: { messages: UIMessage[] } = await request.json()

	// Log incoming request
	console.log(`[Chat API] Request received - ${messages.length} messages in conversation`)
	const lastMessage = messages[messages.length - 1]
	if (lastMessage) {
		console.log(`[Chat API] Last message role: ${lastMessage.role}`)
	}

	try {
		console.log('[Chat API] Calling Anthropic API...')
		
		const result = await streamText({
			model: anthropic('claude-sonnet-4-5-20250929'),
			system: SYSTEM_PROMPT,
			messages: await convertToModelMessages(messages),
			stopWhen: stepCountIs(5),
		tools: {},
		})

		console.log('[Chat API] Anthropic API call initiated successfully, streaming response...')

		return result.toUIMessageStreamResponse({
			messageMetadata({ part }) {
				// Extract usage information from finish events
				if (part.type === 'finish') {
					console.log('[Chat API] Stream finished - Token usage:', part.totalUsage)
					return {
						usage: part.totalUsage
					}
				}
				return undefined
			}
		})
	} catch (error) {
		console.error('[Chat API] Error during Anthropic API call:', error)
		throw error
	}
}
