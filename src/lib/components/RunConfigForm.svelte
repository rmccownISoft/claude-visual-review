<script lang="ts">
    import { untrack } from 'svelte'
    import type { Skill } from '$lib/types'

    type Header = { key: string; value: string }

    let {
        url = $bindable(''),
        headers = $bindable<Header[]>([]),
        prompt = $bindable(''),
        setupPrompt = $bindable(''),
        maxSteps = $bindable(20),
        disabledTools = $bindable<string[]>([]),
        selectedSkillIds = $bindable<string[]>([]),
        optionalSkills = [] as Skill[],
        storageKey = undefined as string | undefined,
    } = $props()

    let availableTools = $state<string[]>([])
    let checkStatus = $state<{ ok: boolean; message: string } | null>(null)
    let checking = $state(false)

    // Load from localStorage on init (skipped server-side)
    // untrack: storageKey is a stable prop — intentional one-time read
    if (untrack(() => storageKey) && typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem(untrack(() => storageKey)!)
            if (saved) {
                const cfg = JSON.parse(saved)
                url = cfg.url ?? ''
                headers = cfg.headers ?? []
                prompt = cfg.prompt ?? ''
                setupPrompt = cfg.setupPrompt ?? ''
                maxSteps = cfg.maxSteps ?? 20
                disabledTools = cfg.disabledTools ?? []
            }
        } catch {}
    }

    function persistConfig() {
        if (!storageKey || typeof localStorage === 'undefined') return
        localStorage.setItem(storageKey, JSON.stringify({
            url, headers, prompt, setupPrompt, maxSteps, disabledTools
        }))
    }

    function addHeader() {
        headers = [...headers, { key: '', value: '' }]
    }

    function removeHeader(i: number) {
        headers = headers.filter((_, j) => j !== i)
        persistConfig()
    }

    function toggleTool(name: string) {
        disabledTools = disabledTools.includes(name)
            ? disabledTools.filter(t => t !== name)
            : [...disabledTools, name]
        persistConfig()
    }

    function toggleSkill(id: string) {
        selectedSkillIds = selectedSkillIds.includes(id)
            ? selectedSkillIds.filter(s => s !== id)
            : [...selectedSkillIds, id]
    }

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
            const json = await res.json()
            checkStatus = json.ok
                ? { ok: true, message: `✓ Connected — ${json.toolCount} tool${json.toolCount === 1 ? '' : 's'}` }
                : { ok: false, message: json.error ?? 'Connection failed' }
            availableTools = json.tools?.length ? json.tools : []
        } catch {
            checkStatus = { ok: false, message: 'Network error' }
        }
        checking = false
    }
</script>

<!-- MCP Server URL + Test Connection -->
<div class="space-y-1">
    <div class="flex items-center justify-between">
        <label class="text-sm font-medium text-gray-700" for="cfg-url">MCP Server URL</label>
        <button
            onclick={checkServer}
            disabled={!url.trim() || checking}
            class="bg-transparent text-xs text-gray-600 font-semibold py-1 px-2.5 border border-gray-300 rounded
                   enabled:hover:bg-gray-100 enabled:hover:border-gray-400
                   disabled:cursor-not-allowed disabled:text-gray-400 disabled:border-gray-200"
        >
            {checking ? 'Checking...' : 'Test Connection & Retrieve Tool List'}
        </button>
    </div>
    <input
        id="cfg-url"
        bind:value={url}
        oninput={persistConfig}
        type="url"
        placeholder="https://..."
        class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
    {#if checkStatus}
        <p class="text-xs" class:text-green-600={checkStatus.ok} class:text-red-600={!checkStatus.ok}>
            {checkStatus.message}
        </p>
    {/if}
    {#if availableTools.length > 0}
        <details>
            <summary class="text-sm text-gray-600 cursor-pointer">Available Tools ({availableTools.length})</summary>
            <div class="mt-2 flex flex-col gap-1 pl-1">
                {#each availableTools as tool (tool)}
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!disabledTools.includes(tool)}
                            onchange={() => toggleTool(tool)}
                            class="rounded border-gray-300"
                        />
                        <span class="text-sm text-gray-800">{tool}</span>
                    </label>
                {/each}
            </div>
        </details>
    {/if}
</div>

<!-- Headers -->
<div class="space-y-2">
    <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700">Headers</span>
        <button onclick={addHeader} class="text-xs text-blue-600 hover:underline">+ Add header</button>
    </div>
    {#each headers as header, i (i)}
        <div class="flex gap-2">
            <input
                bind:value={header.key}
                oninput={persistConfig}
                placeholder="key"
                class="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
                bind:value={header.value}
                oninput={persistConfig}
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

<!-- Skills -->
{#if optionalSkills.length > 0}
    <div class="space-y-1.5">
        <span class="text-sm font-medium text-gray-700">Skills</span>
        <div class="space-y-1.5">
            {#each optionalSkills as skill (skill.id)}
                <label class="flex cursor-pointer items-start gap-2.5">
                    <input
                        type="checkbox"
                        checked={selectedSkillIds.includes(skill.id)}
                        onchange={() => toggleSkill(skill.id)}
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

<!-- Setup Prompt -->
<div class="space-y-1">
    <label class="text-sm font-medium text-gray-700" for="cfg-setup">
        Setup prompt <span class="font-normal text-gray-400">(optional)</span>
    </label>
    <textarea
        id="cfg-setup"
        bind:value={setupPrompt}
        oninput={persistConfig}
        rows={3}
        placeholder="e.g. Login to the MCP server with user: x, password: y at storeId 5"
        class="w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    ></textarea>
    <p class="text-xs text-gray-400">Runs before the main prompt. Leave blank if not needed.</p>
</div>

<!-- Prompt -->
<div class="space-y-1">
    <label class="text-sm font-medium text-gray-700" for="cfg-prompt">Prompt</label>
    <textarea
        id="cfg-prompt"
        bind:value={prompt}
        oninput={persistConfig}
        rows={6}
        placeholder="Enter the prompt for the agent..."
        class="w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    ></textarea>
</div>

<!-- Max Steps -->
<div class="space-y-1">
    <label class="text-sm font-medium text-gray-700" for="cfg-steps">Max Steps</label>
    <input
        id="cfg-steps"
        bind:value={maxSteps}
        oninput={persistConfig}
        type="number"
        min={1}
        max={100}
        class="w-24 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
</div>
