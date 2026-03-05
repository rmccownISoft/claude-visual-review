<script lang="ts">
    import { page } from '$app/state'
    import { resolve } from '$app/paths'

    let { data, children } = $props()
</script>

<div class="flex h-full">
    <!-- Sidebar -->
    <aside class="w-72 shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200">
            <h2 class="text-sm font-semibold text-gray-700">Past Runs</h2>
        </div>
        <div class="flex-1 overflow-y-auto">
            {#each data.runs as run (run.id)}
                {@const active = page.url.pathname === `/runs/${run.id}`}
                <a
                    href={resolve(`/runs/${run.id}`)}
                    class="block px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    class:bg-blue-50={active}
                    class:border-l-2={active}
                    class:border-l-blue-500={active}
                >
                    <div class="font-mono text-xs text-gray-800 truncate">{run.id}</div>
                    <div class="text-xs text-gray-400 mt-0.5">
                        {new Date(run.timestamp).toLocaleString()}
                    </div>
                    <div class="run-list-detail">
                        <div class="text-xs text-gray-600 truncate">
                            <span class="font-semibold">Prompt:</span> {run.config.prompt}
                        </div>
                        <div class="text-xs text-gray-600">
                            <span class="font-semibold">Tools:</span> {run.summary.toolCallCount} • <span class="font-semibold">Skills:</span> {run.summary.skillLoadCount}
                        </div>
                    </div>
                    {#if run.annotation.rating}
                        <span class="text-xs {run.annotation.rating === 'good' ? 'text-green-600' : 'text-red-500'}">
                            {run.annotation.rating === 'good' ? '👍' : '👎'}
                        </span>
                    {/if}
                </a>
            {:else}
                <p class="p-4 text-sm text-gray-400">No runs yet.</p>
            {/each}
        </div>
    </aside>

    <!-- Page content -->
    <div class="flex-1 min-w-0 overflow-hidden">
        {@render children()}
    </div>
</div>

<style>
    .run-list-detail {
        margin-top: 0.25rem;
    }
</style>
