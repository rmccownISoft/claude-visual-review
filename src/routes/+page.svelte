<script lang="ts">
    import { goto } from '$app/navigation'
    import { SvelteSet } from 'svelte/reactivity'
    import type { PageData } from './$types'

    let { data }: { data: PageData } = $props()

    let url = $state('')
    let headers = $state<{ key: string; value: string }[]>([])
    let selectedSkillNames = $state(new SvelteSet<string>())
    let prompt = $state('')
    let maxSteps = $state(20)
    let running = $state(false)
    let streamOutput = $state('')
    let runError = $state<string | null>(null)
    // MCP status
    let checkStatus = $state<{ ok: boolean; message: string } | null>(null)
    let checking = $state(false)

    function toggleSkill(name: string) {
        selectedSkillNames.has(name) ? selectedSkillNames.delete(name) : selectedSkillNames.add(name)
    }

    function addHeader() {
        headers = [...headers, { key: '', value: '' }]
    }

    function removeHeader(i: number) {
        headers = headers.filter((_, j) => j !== i)
    }

    // Checks that the MCP server can be reached
    async function checkServer() {
        checking = true
        checkStatus = null
        const mcpHeaders = Object.fromEntries(
            headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value])
        )
        try {
            const res = await fetch('/api/mcp-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, headers: mcpHeaders })
            })
            const data = await res.json()
            checkStatus = data.ok
                ? { ok: true, message: `✓ Connected — ${data.toolCount} tool${data.toolCount === 1 ? '' : 's'}` }
                : { ok: false, message: data.error ?? 'Connection failed' }
        } catch {
            checkStatus = { ok: false, message: 'Network error' }
        }
        checking = false
    }

    async function startRun() {
        running = true
        streamOutput = ''
        runError = null
        let capturedRunId: string | null = null

        const mcpHeaders = Object.fromEntries(
            headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value])
        )
        const selectedSkills = data.skills.filter(s => selectedSkillNames.has(s.name))

        const config = { mcpServerUrl: url, mcpHeaders, skills: selectedSkills, prompt, maxSteps }

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
                if (line.startsWith('0:')) {
                    try { streamOutput += JSON.parse(line.slice(2)) } catch {}
                } else if (line.startsWith('2:')) {
                    try {
                        const parts = JSON.parse(line.slice(2)) as unknown[]
                        for (const part of parts) {
                            if (part && typeof part === 'object') {
                                const p = part as Record<string, unknown>
                                if (typeof p.runId === 'string') capturedRunId = p.runId
                                const d = p.data
                                if (d && typeof d === 'object' && typeof (d as Record<string, unknown>).runId === 'string')
                                    capturedRunId = (d as Record<string, unknown>).runId as string
                            }
                        }
                    } catch {}
                } else if (line.startsWith('3:')) {
                    try { runError = JSON.parse(line.slice(2)) } catch {} // for midstream errors from AI SDK
                }
            }
        }

        running = false
        if (capturedRunId) {
            await goto(`/runs/${capturedRunId}`)
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
        {#if streamOutput}
            <pre class="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap overflow-auto max-h-96">{streamOutput}</pre>
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

        <!-- <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700" for="url">MCP Server URL</label>
            <input
                id="url"
                bind:value={url}
                type="url"
                placeholder="https://..."
                class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
        </div> -->
        <div class="space-y-1">
            <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-gray-700" for="url">MCP Server URL</label>
                <button
                    onclick={checkServer}
                    disabled={!url.trim() || checking}
                    class="bg-transparent text-xs text-gray-600 font-semibold py-1.5 px-3 border border-gray-300 rounded
                           enabled:hover:bg-gray-100 enabled:hover:border-gray-400
                           disabled:cursor-not-allowed disabled:text-gray-400 disabled:border-gray-200"
                >
                    {checking ? 'Checking...' : 'Test connection'}
                </button>
            </div>
            <input
                id="url"
                bind:value={url}
                type="url"
                placeholder="https://..."
                class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {#if checkStatus}
                <p class="text-xs" class:text-green-600={checkStatus.ok} class:text-red-600={!checkStatus.ok}>
                    {checkStatus.message}
                </p>
            {/if}
        </div>
        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700">Headers</span>
                <button onclick={addHeader} class="text-xs text-blue-600 hover:underline">+ Add header</button>
            </div>
            {#each headers as header, i (i)}
                <div class="flex gap-2">
                    <input
                        bind:value={header.key}
                        placeholder="key"
                        class="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                        bind:value={header.value}
                        placeholder="value"
                        class="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                        onclick={() => removeHeader(i)}
                        class="px-2 text-gray-400 hover:text-gray-600"
                        aria-label="Remove header"
                    >×</button>
                </div>
            {:else}
                <p class="text-xs text-gray-400">No headers. Click "+ Add header" to add one.</p>
            {/each}
        </div>

        {#if data.skills.length > 0}
            <div class="space-y-2">
                <span class="text-sm font-medium text-gray-700">Skills</span>
                <div class="space-y-1.5">
                    {#each data.skills as skill (skill.name)}
                        <label class="flex cursor-pointer items-start gap-2.5">
                            <input
                                type="checkbox"
                                checked={selectedSkillNames.has(skill.name)}
                                onchange={() => toggleSkill(skill.name)}
                                class="mt-0.5 rounded border-gray-300"
                            />
                            <span class="text-sm">
                                <span class="font-medium text-gray-800">{skill.name}</span>
                                <span class="ml-1.5 text-gray-500">{skill.description}</span>
                            </span>
                        </label>
                    {/each}
                </div>
            </div>
        {/if}

        <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700" for="prompt">Prompt</label>
            <textarea
                id="prompt"
                bind:value={prompt}
                rows={6}
                placeholder="Enter the prompt for the agent..."
                class="w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            ></textarea>
        </div>

        <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700" for="maxSteps">Max Steps</label>
            <input
                id="maxSteps"
                bind:value={maxSteps}
                type="number"
                min={1}
                max={100}
                class="w-24 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
        </div>

        <button
            onclick={startRun}
            disabled={!url.trim() || !prompt.trim()}
            class="w-full rounded bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
            Start Run
        </button>
    </div>
{/if}
