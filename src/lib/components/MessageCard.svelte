<script lang="ts">
    import type { Snippet } from 'svelte'

    type Props = {
        label: string 
        role: 'user' | 'assistant' | 'system'
        children: Snippet 
    }

    let { label, role, children } = $props()

    let open = $state(true)

    const headerClass = $derived(
        role === 'user'      ? 'bg-blue-50 text-blue-800 border-blue-200' :
        role === 'assistant' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                               'bg-purple-50 text-purple-800 border-purple-200'
    )
</script>

<div class="rounded border border-gray-200 overflow-hidden">
    <button
        class="w-full flex items-center justify-between px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide border-b {headerClass}"
        onclick={() => open = !open}
    >
        <span>{label}</span>
        <span class="text-gray-400">{open ? '▲' : '▼'}</span>
    </button>
    {#if open}
        <div class="p-4">
            {@render children()}
        </div>
    {/if}
</div>