<script lang="ts">
    import { goto } from '$app/navigation'
    import type { PageData } from './$types'
    import { resolve } from '$app/paths'
    import type { RunConfig } from '$lib/types'
    import RunConfigForm from '$lib/components/RunConfigForm.svelte'

    let { data }: { data: PageData } = $props()

    let url = $state('')
    let headers = $state<{ key: string; value: string }[]>([])
    let prompt = $state('')
    let setupPrompt = $state('')
    let maxSteps = $state(20)
    let disabledTools = $state<string[]>([])
    let selectedSkillIds = $state<string[]>([])
    let testCaseId = $state('')
    let experiment = $state('')
    let label = $state('')

    type StreamEvent = { type: 'text'; content: string } | { type: 'tool'; id: string; name: string; done: boolean }
    let running = $state(false)
    let streamEvents = $state<StreamEvent[]>([])
    let runError = $state<string | null>(null)

    async function startRun() {
        running = true
        streamEvents = []
        runError = null
        let capturedRunId: string | null = null

        const mcpHeaders = Object.fromEntries(
            headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value])
        )
        const selectedSkills = data.skills.filter(s => selectedSkillIds.includes(s.id))

        const config: RunConfig = {
            mcpServerUrl: url,
            mcpHeaders,
            skills: selectedSkills,
            prompt,
            maxSteps,
            setupPrompt: setupPrompt || undefined,
            disabledTools,
            testCaseId: testCaseId || undefined,
            experiment: experiment || undefined,
            label: label || undefined
        }

        let res: Response
        try {
            res = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config })
            })
        } catch (err) {
            runError = `Network error: ${err instanceof Error ? err.message : String(err)}`
            running = false
            return
        }

        if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            runError = body.error ?? `Server error ${res.status}`
            running = false
            return
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
                if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
                try {
                    const chunk = JSON.parse(line.slice(6)) as Record<string, unknown>
                    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
                        const last = streamEvents[streamEvents.length - 1]
                        if (last?.type === 'text') {
                            last.content += chunk.delta
                        } else {
                            streamEvents.push({ type: 'text', content: chunk.delta })
                        }
                    } else if (chunk.type === 'tool-input-start') {
                        streamEvents.push({ type: 'tool', id: chunk.toolCallId as string, name: chunk.toolName as string, done: false })
                    } else if (chunk.type === 'tool-result') {
                        const t = streamEvents.find(e => e.type === 'tool' && e.id === chunk.toolCallId)
                        if (t?.type === 'tool') t.done = true
                    } else if (chunk.type === 'data-runId') {
                        const d = chunk.data as Record<string, unknown>
                        if (typeof d?.runId === 'string') capturedRunId = d.runId
                    } else if (chunk.type === 'error' && typeof chunk.errorText === 'string') {
                        runError = chunk.errorText
                    }
                } catch {}
            }
        }

        running = false
        if (capturedRunId) {
            await goto(resolve(`/runs/${capturedRunId}`), { invalidateAll: true }).catch((err) => {
                runError = `Navigation error: ${err instanceof Error ? err.message : String(err)}`
            })
        } else if (!runError) {
            runError = 'Run failed — server did not return a run ID.'
        }
    }
</script>

{#if running}
    <div class="max-w-2xl mx-auto p-6 space-y-4">
        <div class="flex items-center gap-3">
            <div class="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
            <h2 class="text-lg font-semibold text-gray-800">Running...</h2>
        </div>
        {#if streamEvents.length > 0}
            <div class="rounded border border-gray-200 bg-gray-50 p-4 space-y-1 overflow-auto max-h-96">
                {#each streamEvents as event (event)}
                    {#if event.type === 'text'}
                        <p class="whitespace-pre-wrap text-sm text-gray-700">{event.content}</p>
                    {:else}
                        <div class="flex items-center gap-1.5 text-xs {event.done ? 'text-gray-400' : 'text-blue-600'}">
                            <span>{event.done ? '✓' : '⚙'}</span>
                            <span class="font-mono">{event.name}</span>
                            {#if !event.done}<span class="opacity-60">running...</span>{/if}
                        </div>
                    {/if}
                {/each}
            </div>
        {:else}
            <p class="text-sm text-gray-400">Waiting for model output...</p>
        {/if}
        <p class="text-xs text-gray-400">Will redirect to run detail when complete.</p>
    </div>
{:else}
    <div class="max-w-2xl mx-auto p-6 space-y-6">
        <h1 class="text-xl font-semibold text-gray-900">New Run</h1>

        {#if runError}
            <div class="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{runError}</div>
        {/if}

        <RunConfigForm
            bind:url
            bind:headers
            bind:prompt
            bind:setupPrompt
            bind:maxSteps
            bind:disabledTools
            bind:selectedSkillIds
            bind:testCaseId
            bind:experiment
            bind:label
            optionalSkills={data.skills}
        />

        <button
            onclick={startRun}
            disabled={!url.trim() || !prompt.trim()}
            class="w-full rounded bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
            Start Run
        </button>
    </div>
{/if}
