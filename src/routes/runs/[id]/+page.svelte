<script lang="ts">
    import type { PageData } from './$types'
    import MessageList from '$lib/components/MessageList.svelte'

    let { data } = $props()

    let notes = $derived(data.run.annotation.notes)
    let rating = $derived(data.run.annotation.rating)
    let savedAt = $derived(data.run.annotation.savedAt)
    let saving = $state(false)


    async function save() {
        saving = true
        const res = await fetch(`/api/runs/${data.run.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes, rating })
        })
        if (res.ok) savedAt = new Date().toISOString()
        saving = false
    }
</script>

<div class="flex h-full">
    <!-- Messages (Step 8 will fill this in) -->
    <div class="flex-1 min-w-0 overflow-y-auto">
        <MessageList
            config={data.run.config}
            summary={data.run.summary}
            messages={data.run.uiMessages}
        />
    </div>

    <!-- Annotation panel -->
    <aside class="w-72 shrink-0 border-l border-gray-200 flex flex-col gap-4 p-4 overflow-y-auto">
        <div>
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Rating</h3>
            <div class="flex gap-2">
                <button
                    onclick={() => rating = rating === 'good' ? null : 'good'}
                    class="flex-1 py-1.5 rounded border text-sm font-medium transition-colors"
                    class:bg-green-600={rating === 'good'}
                    class:text-white={rating === 'good'}
                    class:border-green-600={rating === 'good'}
                    class:border-gray-300={rating !== 'good'}
                    class:text-gray-600={rating !== 'good'}
                >
                    👍 Good
                </button>
                <button
                    onclick={() => rating = rating === 'bad' ? null : 'bad'}
                    class="flex-1 py-1.5 rounded border text-sm font-medium transition-colors"
                    class:bg-red-500={rating === 'bad'}
                    class:text-white={rating === 'bad'}
                    class:border-red-500={rating === 'bad'}
                    class:border-gray-300={rating !== 'bad'}
                    class:text-gray-600={rating !== 'bad'}
                >
                    👎 Bad
                </button>
            </div>
        </div>

        <!-- Eval Results -->
        {#if data.run.evalResult}
            {@const evalResult = data.run.evalResult}
            <div>
                <h3 class="text-sm font-semibold text-gray-700 mb-2">Eval Results</h3>
                <div class="flex items-center gap-2 mb-2">
                    <span
                        class="inline-flex items-center rounded px-2 py-0.5 text-sm font-bold"
                        class:bg-green-100={evalResult.passed}
                        class:text-green-700={evalResult.passed}
                        class:bg-red-100={!evalResult.passed}
                        class:text-red-700={!evalResult.passed}
                    >
                        {evalResult.passed ? 'PASS' : 'FAIL'}
                    </span>
                    <span class="text-sm text-gray-500">Quality: {evalResult.qualityScore}%</span>
                </div>
                <div class="space-y-1">
                    {#each evalResult.criteriaResults as cr (cr.id)}
                        <div class="flex items-start gap-1.5 text-xs">
                            <span class={cr.passed ? 'text-green-600' : 'text-red-500'}>
                                {cr.passed ? '✓' : '✗'}
                            </span>
                            <span class="text-gray-700 flex-1">{cr.id}</span>
                            {#if cr.actual !== undefined}
                                <span class="text-gray-400 font-mono">{cr.actual}</span>
                            {/if}
                            {#if cr.blocking}
                                <span class="text-gray-400 text-[10px] uppercase tracking-wide">blocking</span>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Tool Call Breakdown -->
        {#if Object.keys(data.run.summary.toolCallsByName ?? {}).length > 0}
            <div>
                <h3 class="text-sm font-semibold text-gray-700 mb-1.5">Tool Calls</h3>
                <div class="space-y-0.5">
                    {#each Object.entries(data.run.summary.toolCallsByName) as [tool, count] (tool)}
                        <div class="flex justify-between text-xs">
                            <span class="font-mono text-gray-700">{tool}</span>
                            <span class="text-gray-500">{count}</span>
                        </div>
                    {/each}
                    {#if (data.run.summary.errorCount ?? 0) > 0}
                        <div class="flex justify-between text-xs text-red-500 pt-0.5 border-t border-gray-100 mt-0.5">
                            <span>errors</span>
                            <span>{data.run.summary.errorCount}</span>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        <div class="flex flex-1 flex-col gap-1">
            <label for="notes" class="text-sm font-semibold text-gray-700">Notes</label>
            <textarea
                id="notes"
                bind:value={notes}
                class="flex-1 resize-none rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Add notes..."
            ></textarea>
        </div>

        <div class="flex flex-col gap-1">
            <button
                onclick={save}
                disabled={saving}
                class="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? 'Saving...' : 'Save Annotation'}
            </button>
            {#if savedAt}
                <p class="text-center text-xs text-gray-400">
                    Saved {new Date(savedAt).toLocaleString()}
                </p>
            {/if}
        </div>

        {#if data.run.config.skills.length === 1 && data.run.config.skills[0].id}
            <div class="pt-2 border-t border-gray-100">
                <a
                    href="/skills/{data.run.config.skills[0].id}/edit"
                    class="text-xs text-blue-600 hover:text-blue-800"
                >
                    Edit skill → {data.run.config.skills[0].id}
                </a>
            </div>
        {/if}
    </aside>
</div>