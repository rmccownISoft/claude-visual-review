<script lang="ts">
	import { Chat, type UIMessage } from '@ai-sdk/svelte'
	import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, type LanguageModelUsage } from 'ai'
	import type { ToolImplementations } from '$lib/chatTypes'

	type ChatMetadata = {
		usage?: LanguageModelUsage
	}

	type ChatMessage = UIMessage<ChatMetadata>

	type Props = {
		toolImplementations: ToolImplementations
	}

	let { toolImplementations }: Props = $props()

	let inputText = $state('')
	let messagesDiv: HTMLDivElement | undefined = $state(undefined)

	// Calculate cumulative token usage across all assistant messages
	let totalTokens = $derived(() => {
		return chat.messages
			.filter(m => m.role === 'assistant' && m.metadata?.usage)
			.reduce((sum, m) => {
				const usage = m.metadata?.usage
				if (usage?.totalTokens !== undefined) {
					return sum + usage.totalTokens
				} else if (usage?.inputTokens !== undefined && usage?.outputTokens !== undefined) {
					return sum + usage.inputTokens + usage.outputTokens
				}
				return sum
			}, 0)
	})

	const chat = new Chat<ChatMessage>({
		transport: new DefaultChatTransport({
			api: '/api/chat'
		}),
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		async onToolCall({ toolCall }) {
			if ((toolCall as any).dynamic) return

			const toolName = toolCall.toolName
			
			// Log tool call initiation
			console.log(`[Chat] Tool call initiated: ${toolName}`, {
				toolCallId: toolCall.toolCallId,
				input: toolCall.input
			})

			try {
				let result: any

				if (toolName === 'search_logs') {
					result = await toolImplementations.search_logs(toolCall.input as any)
					console.log(`[Chat] Tool call succeeded: ${toolName}`, {
						toolCallId: toolCall.toolCallId,
						resultCount: Array.isArray(result) ? result.length : 'N/A'
					})
					chat.addToolOutput({ tool: toolName as any, toolCallId: toolCall.toolCallId, output: result })
				} else if (toolName === 'get_app_names') {
					result = await toolImplementations.get_app_names()
					console.log(`[Chat] Tool call succeeded: ${toolName}`, {
						toolCallId: toolCall.toolCallId,
						appCount: Array.isArray(result) ? result.length : 'N/A'
					})
					chat.addToolOutput({ tool: toolName as any, toolCallId: toolCall.toolCallId, output: result })
				} else if (toolName === 'get_log_by_id') {
					result = await toolImplementations.get_log_by_id(toolCall.input as any)
					console.log(`[Chat] Tool call succeeded: ${toolName}`, {
						toolCallId: toolCall.toolCallId,
						logId: (toolCall.input as any)?.id
					})
					chat.addToolOutput({ tool: toolName as any, toolCallId: toolCall.toolCallId, output: result })
				} else if (toolName === 'get_current_view') {
					result = toolImplementations.get_current_view()
					console.log(`[Chat] Tool call succeeded: ${toolName}`, {
						toolCallId: toolCall.toolCallId
					})
					chat.addToolOutput({ tool: toolName as any, toolCallId: toolCall.toolCallId, output: result })
				} else if (toolName === 'set_filters') {
					toolImplementations.set_filters(toolCall.input as any)
					result = { success: true, message: 'Filters updated' }
					console.log(`[Chat] Tool call succeeded: ${toolName}`, {
						toolCallId: toolCall.toolCallId,
						filters: (toolCall.input as any)?.filters,
						mode: (toolCall.input as any)?.mode
					})
					chat.addToolOutput({ tool: toolName as any, toolCallId: toolCall.toolCallId, output: result })
				} else {
					console.warn(`[Chat] Unknown tool called: ${toolName}`)
				}
			} catch (err) {
				const errorText = err instanceof Error ? err.message : String(err)
				console.error(`[Chat] Tool call failed: ${toolName}`, {
					toolCallId: toolCall.toolCallId,
					error: errorText,
					stack: err instanceof Error ? err.stack : undefined
				})
				chat.addToolOutput({
					tool: toolCall.toolName as any,
					toolCallId: toolCall.toolCallId,
					state: 'output-error',
					errorText
				})
			}
		}
	})

	$effect(() => {
		console.log('auto scroll effect called')
		// Auto-scroll to bottom when messages change
		chat.messages
		if (messagesDiv) {
			messagesDiv.scrollTop = messagesDiv.scrollHeight
		}
	})

	function handleSubmit(event: Event) {
		event.preventDefault()
		const text = inputText.trim()
		if (!text || chat.status === 'streaming') return
		chat.sendMessage({ text })
		inputText = ''
	}
</script>

<div class="d-flex flex-column h-100" style="min-height: 0;">
	<!-- Token usage header -->
	{#if totalTokens() > 0}
		<div class="border-bottom px-3 py-2 d-flex justify-content-between align-items-center" style="background: #f8f9fa;">
			<span class="text-muted" style="font-size: 0.75rem;">Conversation Total</span>
			<span class="badge" style="background: #6c757d; font-size: 0.7rem;">
				🪙 {totalTokens().toLocaleString()} tokens
			</span>
		</div>
	{/if}

	<!-- Message list -->
	<div
		bind:this={messagesDiv}
		class="flex-grow-1 overflow-auto p-3"
		style="min-height: 0;"
	>
		{#each chat.messages as message (message.id)}
			<div class="mb-3">
				<div class="d-flex justify-content-between align-items-center mb-1">
					<div class="fw-semibold text-capitalize" style="font-size: 0.75rem; color: {message.role === 'user' ? '#0d6efd' : '#6c757d'};">
						{message.role === 'user' ? 'You' : 'Assistant'}
					</div>
					{#if message.role === 'assistant' && message.metadata?.usage}
						{@const usage = message.metadata.usage}
						<div class="text-muted" style="font-size: 0.65rem;">
							{#if usage.inputTokens !== undefined && usage.outputTokens !== undefined}
								<span title="Input tokens: {usage.inputTokens}, Output tokens: {usage.outputTokens}, Total: {usage.totalTokens ?? (usage.inputTokens + usage.outputTokens)}">
									🪙 {usage.totalTokens ?? (usage.inputTokens + usage.outputTokens)} tokens
								</span>
							{/if}
						</div>
					{/if}
				</div>

				{#each message.parts as part, i (i)}
					{#if part.type === 'text'}
						<div style="white-space: pre-wrap; font-size: 0.9rem;">{part.text}</div>
					{:else if isToolUIPart(part)}
						{@const toolDisplayName = part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5)}
						<div class="d-inline-flex align-items-center gap-1 px-2 py-1 rounded mt-1" style="background: #f8f9fa; border: 1px solid #dee2e6; font-size: 0.75rem;">
							{#if part.state === 'input-streaming' || part.state === 'input-available'}
								<span class="spinner-border spinner-border-sm" style="width: 0.75rem; height: 0.75rem;" role="status" aria-hidden="true"></span>
								<span class="text-muted">{toolDisplayName}</span>
							{:else if part.state === 'output-available'}
								<span style="color: #198754;">&#10003;</span>
								<span class="text-muted">{toolDisplayName}</span>
							{:else if part.state === 'output-error'}
								<span style="color: #dc3545;">&#9888;</span>
								<span class="text-danger">{toolDisplayName}: {part.errorText ?? 'Error'}</span>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/each}

		{#if chat.messages.length === 0}
			<div class="text-muted text-center mt-4" style="font-size: 0.875rem;">
				Ask anything about your logs...
			</div>
		{/if}
	</div>

	<!-- Input form -->
	<div class="border-top p-2">
		<form onsubmit={handleSubmit} class="d-flex gap-2">
			<input
				type="text"
				class="form-control form-control-sm"
				placeholder="Type a message..."
				bind:value={inputText}
				disabled={chat.status === 'streaming'}
			/>
			<button
				type="submit"
				class="btn btn-primary btn-sm"
				disabled={chat.status === 'streaming' || !inputText.trim()}
			>
				{#if chat.status === 'streaming'}
					<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
				{:else}
					Send
				{/if}
			</button>
		</form>
	</div>
</div>
