<script lang="ts">
    import type { UIMessage } from 'ai'
    import { isTextUIPart, isToolUIPart } from 'ai'
    import MessageCard from './MessageCard.svelte'
    import type { RunConfig, RunSummary }  from '$lib/types'



    type Props = {
        config: RunConfig
        summary: RunSummary
        messages: UIMessage[] 
    }

    let { config, summary, messages }: Props = $props()

    function formatDuration(ms: number) {
        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
    }

    function getToolName(part: Parameters<typeof isToolUIPart>[0] & { toolName?: string }): string {
        return 'toolName' in part && part.toolName ? part.toolName : (part.type as string).slice(5)
    }

    function prettyJson(value: unknown): string {
        return JSON.stringify(value, null, 2)
    }

</script>

<div class="flex flex-col gap-3 p-4">
    <!-- Stats bar -->
    <div class="flex flex-wrap gap-x-4 gap-y-0.5 rounded border border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
        <span>{summary.stepCount} steps</span>
        <span>{summary.toolCallCount} tool calls</span>
        <span>{summary.skillLoadCount} skills loaded</span>
        <span>{summary.totalInputTokens.toLocaleString()} in / {summary.totalOutputTokens.toLocaleString()} out tokens</span>
        <span>{formatDuration(summary.durationMs)}</span>
        <span class="capitalize">{summary.finishReason}</span>
    </div>

    <!-- Config -->
    <MessageCard label="Config" role="system">
        <p class="font-mono text-xs text-gray-600">{config.mcpServerUrl}</p>
        {#if config.skills.length > 0}
            <p class="mt-1 text-xs text-gray-500">Skills: {config.skills.map((s: { name: string }) => s.name).join(', ')}</p>
        {/if}
        <p class="mt-1 text-xs text-gray-500">Max steps: {config.maxSteps}</p>
    </MessageCard>

    <!-- Prompt -->
    <MessageCard label="Prompt" role="user">
        <p class="whitespace-pre-wrap text-sm">{config.prompt}</p>
    </MessageCard>

    <!-- Agent conversation -->
    {#each messages as message (message.id)}
        {@const cardRole = message.role === 'user' ? 'user' : 'assistant'}
        <MessageCard label={message.role === 'user' ? 'User' : 'Assistant'} role={cardRole}>
            {#each message.parts as part, i (i)}
                {#if isTextUIPart(part)}
                    <p class="whitespace-pre-wrap text-sm">{part.text}</p>
                {:else if isToolUIPart(part)}
                    {@const toolName = getToolName(part)}
                    <div class="mt-2 overflow-hidden rounded border border-gray-200 font-mono text-xs">
                        <div class="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-1.5">
                            <span class="rounded bg-green-200 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">tool</span>
                            <span class="font-semibold">{toolName}</span>
                            <span class="text-gray-400">{part.state}</span>
                        </div>
                        {#if 'input' in part && part.input != null}
                            <pre class="overflow-x-auto p-3 text-gray-700">{prettyJson(part.input)}</pre>
                        {/if}
                        {#if 'output' in part && part.output != null}
                            <div class="border-t border-gray-200 bg-gray-50 p-3">
                                <pre class="overflow-x-auto text-gray-600">{typeof part.output === 'string' ? part.output : prettyJson(part.output)}</pre>
                            </div>
                        {/if}
                    </div>
                {/if}
                <!-- step-start, reasoning, sources: intentionally skipped -->
            {/each}
        </MessageCard>
    {/each}
</div>