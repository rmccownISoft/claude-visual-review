<script lang="ts">
    import { goto } from '$app/navigation'
    import { untrack } from 'svelte'
    import { resolve } from '$app/paths'
    import type { PageData } from './$types'
    import { nextVersionId, saveAsLabel } from '$lib/skillVersioning'
    import type { RunConfig } from '$lib/types'
    import RunConfigForm from '$lib/components/RunConfigForm.svelte'

    let { data }: { data: PageData } = $props()

    // Editor state
    let content = $state(untrack(() => data.rawContent))
    let saving = $state(false)
    let saveError = $state<string | null>(null)

    // Run config state (bound to RunConfigForm)
    let url = $state('')
    let headers = $state<{ key: string; value: string }[]>([])
    let prompt = $state('')
    let setupPrompt = $state('')
    let maxSteps = $state(20)
    let disabledTools = $state<string[]>([])
    let selectedOtherSkillIds = $state<string[]>([])

    let configOpen = $state(true)
    let running = $state(false)
    let runError = $state<string | null>(null)

    const storageKey = untrack(() => `skill-editor-config-${data.skill.id.replace(/-v\d+$/, '')}`)
    const nextId = $derived(nextVersionId(data.skill.id, data.allIds))
    const saveLabel = $derived(saveAsLabel(data.skill.id, data.allIds))

    async function startRun() {
        running = true
        runError = null

        const mcpHeaders = Object.fromEntries(
            headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value])
        )
        const otherSelected = data.otherSkills.filter(s => selectedOtherSkillIds.includes(s.id))
        const config: RunConfig = {
            mcpServerUrl: url,
            mcpHeaders,
            skills: [data.skill, ...otherSelected],
            prompt,
            maxSteps,
            setupPrompt: setupPrompt || undefined,
            disabledTools
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

        if (!res.body) {
            runError = 'No response body from server.'
            running = false
            return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let streamBuffer = ''
        let capturedRunId: string | null = null
        let streamError = false

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
                        await reader.cancel()
                        streamError = true
                        break
                    }
                } catch {}
            }
            if (streamError) break
        }

        running = false
        if (capturedRunId) {
            await goto(resolve(`/runs/${capturedRunId}`))
        } else if (!runError) {
            runError = 'Run failed — server did not return a run ID.'
        }
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
    <div class="px-6 py-3 border-b border-gray-200 text-xs text-gray-500 flex items-center gap-1.5 flex-shrink-0">
        <a href="/skills" class="hover:text-gray-700">Skills</a>
        <span>/</span>
        <span class="text-gray-800 font-medium">{data.skill.id}</span>
        <span>/</span>
        <span>Edit</span>
    </div>

    <!-- Run config panel -->
    <div class="border-b border-gray-200 bg-white flex-shrink-0">
        <!-- Panel header — always visible -->
        <div class="flex items-center justify-between px-4 py-2">
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

        {#if configOpen}
            <div class="px-4 pb-4 pt-1 space-y-4 max-h-80 overflow-y-auto border-t border-gray-100">
                <RunConfigForm
                    bind:url
                    bind:headers
                    bind:prompt
                    bind:setupPrompt
                    bind:maxSteps
                    bind:disabledTools
                    bind:selectedSkillIds={selectedOtherSkillIds}
                    optionalSkills={data.otherSkills}
                    {storageKey}
                />
            </div>
        {/if}
    </div>

    <!-- Editor — takes all remaining space -->
    <div class="flex-1 flex flex-col min-h-0 p-4 gap-2">
        <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0" for="skill-editor">SKILL.md</label>
        <textarea
            id="skill-editor"
            bind:value={content}
            spellcheck="false"
            class="flex-1 font-mono text-sm rounded border border-gray-300 p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
        ></textarea>
    </div>
</div>
