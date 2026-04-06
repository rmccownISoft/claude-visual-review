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
                    <!-- Experiment + Label (shown instead of run id when set) -->
                    {#if run.config.experiment || run.config.label}
                        <div class="text-xs font-medium text-gray-800 truncate">
                            {#if run.config.experiment}<span class="text-gray-500">{run.config.experiment}</span>{/if}
                            {#if run.config.experiment && run.config.label} · {/if}
                            {#if run.config.label}{run.config.label}{/if}
                        </div>
                    {:else}
                        <div class="font-mono text-xs text-gray-800 truncate">{run.id}</div>
                    {/if}

                    <div class="text-xs text-gray-400 mt-0.5">
                        {new Date(run.timestamp).toLocaleString()}
                    </div>

                    <div class="mt-1 space-y-0.5">
                        <div class="text-xs text-gray-600 truncate">
                            <span class="font-semibold">Prompt:</span> {run.config.prompt}
                        </div>
                        <div class="text-xs text-gray-600">
                            <span class="font-semibold">Steps:</span> {run.summary.stepCount}
                            · <span class="font-semibold">Tools:</span> {run.summary.toolCallCount}
                        </div>
                    </div>

                    <!-- Eval result badge -->
                    {#if run.evalResult}
                        <div class="mt-1.5 flex items-center gap-1.5">
                            <span
                                class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold"
                                class:bg-green-100={run.evalResult.passed}
                                class:text-green-700={run.evalResult.passed}
                                class:bg-red-100={!run.evalResult.passed}
                                class:text-red-700={!run.evalResult.passed}
                            >
                                {run.evalResult.passed ? 'PASS' : 'FAIL'}
                            </span>
                            <span class="text-xs text-gray-500">quality: {run.evalResult.qualityScore}%</span>
                        </div>
                    {:else if run.annotation.rating}
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

