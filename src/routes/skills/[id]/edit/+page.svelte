<script lang="ts">
    import { goto } from '$app/navigation'
    import { SvelteSet } from 'svelte/reactivity'
    import { untrack } from 'svelte'
    import { resolve } from '$app/paths'
    import type { PageData } from './$types'
    import { nextVersionId, saveAsLabel } from '$lib/skillVersioning'
    import type { RunConfig } from '$lib/types'

    let { data }: { data: PageData } = $props()

    // Editor state — untrack signals intentional one-time reads of server-loaded prop data
    let content = $state(untrack(() => data.rawContent))
    let saving = $state(false)
    let saveError = $state<string | null>(null)

    // Run config state — populated from localStorage on mount
    let configOpen = $state(true)
    let url = $state('')
    let headers = $state<{ uid: number; key: string; value: string }[]>([])
    let _headerUid = 0
    let prompt = $state('')
    let setupPrompt = $state('')
    let maxSteps = $state(20)
    let disabledTools = new SvelteSet<string>()
    let selectedOtherSkillIds = new SvelteSet<string>()
    let running = $state(false)
    let runError = $state<string | null>(null)

    const storageKey = untrack(() => `skill-editor-config-${data.skill.id.replace(/-v\d+$/, '')}`)

    const nextId = $derived(nextVersionId(data.skill.id, data.allIds))
    const saveLabel = $derived(saveAsLabel(data.skill.id, data.allIds))

    // Load config from localStorage
    if (typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem(storageKey)
            if (saved) {
                const cfg = JSON.parse(saved)
                url = cfg.url ?? ''
                const loadedHeaders = (cfg.headers ?? []).map((h: { key: string; value: string }, i: number) => ({ uid: i, key: h.key, value: h.value }))
                headers = loadedHeaders
                _headerUid = loadedHeaders.length
                prompt = cfg.prompt ?? ''
                setupPrompt = cfg.setupPrompt ?? ''
                maxSteps = cfg.maxSteps ?? 20
            }
        } catch {}
    }

    function persistConfig() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify({ url, headers: headers.map(h => ({ key: h.key, value: h.value })), prompt, setupPrompt, maxSteps }))
        }
    }

    async function startRun() {
        running = true
        runError = null
        persistConfig()

        const mcpHeaders = Object.fromEntries(
            headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value])
        )
        const otherSelected = data.otherSkills.filter(s => selectedOtherSkillIds.has(s.id))
        const config: RunConfig = {
            mcpServerUrl: url,
            mcpHeaders,
            skills: [data.skill, ...otherSelected],
            prompt,
            maxSteps,
            setupPrompt: setupPrompt || undefined,
            disabledTools: []
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

        // Read stream to get runId, then navigate
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let streamBuffer = ''
        let capturedRunId: string | null = null

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            streamBuffer += decoder.decode(value, { stream: true })
            const lines = streamBuffer.split('\n')
            streamBuffer = lines.pop() ?? ''
            for (const line of lines) {
                if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
                try {
                    const chunk = JSON.parse(line.slice(6)) as Record<string, unknown>
                    if (chunk.type === 'data-runId') {
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
            await goto(resolve(`/runs/${capturedRunId}`))
        } else if (!runError) {
            runError = 'Run failed — server did not return a run ID.'
        }
    }

    function addHeader() {
        headers = [...headers, { uid: _headerUid++, key: '', value: '' }]
    }

    function removeHeader(i: number) {
        headers = headers.filter((_, j) => j !== i)
    }

    async function saveAsVersion() {
        saving = true
        saveError = null
        try {
            const res = await fetch(`/api/skills/${nextId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                saveError = body.error ?? `Error ${res.status}`
            } else {
                await goto(resolve(`/skills/${nextId}/edit`))
            }
        } catch {
            saveError = 'Network error'
        } finally {
            saving = false
        }
    }
</script>

<div class="flex flex-col h-full">
    <!-- Breadcrumb -->
    <div class="px-6 py-3 border-b border-gray-200 text-xs text-gray-500 flex items-center gap-1.5">
        <a href="/skills" class="hover:text-gray-700">Skills</a>
        <span>/</span>
        <span class="text-gray-800 font-medium">{data.skill.id}</span>
        <span>/</span>
        <span>Edit</span>
    </div>

    <!-- Editor -->
    <div class="flex-1 flex flex-col min-h-0 p-4 gap-2">
        <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide" for="skill-editor">SKILL.md</label>
        <textarea
            id="skill-editor"
            bind:value={content}
            spellcheck="false"
            class="flex-1 font-mono text-sm rounded border border-gray-300 p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
        ></textarea>
    </div>

    <!-- Run config panel -->
    <div class="border-t border-gray-200 bg-white">
        <!-- Panel header — always visible -->
        <div class="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <button
                onclick={() => configOpen = !configOpen}
                class="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700"
            >
                <span class="transition-transform {configOpen ? 'rotate-90' : ''}">▶</span>
                Run Config
            </button>
            <div class="flex items-center gap-2">
                {#if saveError}
                    <span class="text-xs text-red-600">{saveError}</span>
                {/if}
                {#if runError}
                    <span class="text-xs text-red-600">{runError}</span>
                {/if}
                <button
                    onclick={saveAsVersion}
                    disabled={saving}
                    class="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    {saving ? 'Saving…' : saveLabel}
                </button>
                <button
                    onclick={startRun}
                    disabled={running || !url.trim() || !prompt.trim()}
                    class="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {running ? 'Running…' : '▶ Run'}
                </button>
            </div>
        </div>

        <!-- Collapsible config fields -->
        {#if configOpen}
            <div class="px-4 py-3 space-y-3 max-h-72 overflow-y-auto">
                <div class="space-y-1">
                    <label class="text-xs font-medium text-gray-700" for="edit-url">MCP Server URL</label>
                    <input
                        id="edit-url"
                        bind:value={url}
                        oninput={persistConfig}
                        type="url"
                        placeholder="http://localhost:3001"
                        class="w-full rounded border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>

                <div class="space-y-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-gray-700">Headers</span>
                        <button onclick={addHeader} class="text-xs text-blue-600 hover:underline">+ Add</button>
                    </div>
                    {#each headers as header, i (header.uid)}
                        <div class="flex gap-2">
                            <input bind:value={header.key} oninput={persistConfig} placeholder="key" class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <input bind:value={header.value} oninput={persistConfig} placeholder="value" class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <button onclick={() => removeHeader(i)} class="px-1.5 text-gray-400 hover:text-gray-600 text-sm">×</button>
                        </div>
                    {/each}
                </div>

                <div class="space-y-1">
                    <label class="text-xs font-medium text-gray-700" for="edit-setup">Setup Prompt <span class="font-normal text-gray-400">(optional)</span></label>
                    <textarea
                        id="edit-setup"
                        bind:value={setupPrompt}
                        oninput={persistConfig}
                        rows={2}
                        placeholder="e.g. login with user: x password: y"
                        class="w-full resize-y rounded border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    ></textarea>
                </div>

                <div class="space-y-1">
                    <label class="text-xs font-medium text-gray-700" for="edit-prompt">Prompt</label>
                    <textarea
                        id="edit-prompt"
                        bind:value={prompt}
                        oninput={persistConfig}
                        rows={3}
                        placeholder="Enter the prompt for the agent..."
                        class="w-full resize-y rounded border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    ></textarea>
                </div>

                <div class="space-y-1">
                    <label class="text-xs font-medium text-gray-700" for="edit-steps">Max Steps</label>
                    <input
                        id="edit-steps"
                        bind:value={maxSteps}
                        oninput={persistConfig}
                        type="number"
                        min={1}
                        max={100}
                        class="w-20 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>

                {#if data.otherSkills.length > 0}
                    <div class="space-y-1">
                        <span class="text-xs font-medium text-gray-700">Additional Skills</span>
                        <div class="space-y-1">
                            {#each data.otherSkills as otherSkill (otherSkill.id)}
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedOtherSkillIds.has(otherSkill.id)}
                                        onchange={() => selectedOtherSkillIds.has(otherSkill.id) ? selectedOtherSkillIds.delete(otherSkill.id) : selectedOtherSkillIds.add(otherSkill.id)}
                                        class="rounded border-gray-300"
                                    />
                                    <span class="text-xs text-gray-700">{otherSkill.id}</span>
                                </label>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
