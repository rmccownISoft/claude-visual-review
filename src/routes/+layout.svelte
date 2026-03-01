<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state'

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen flex flex-col">
    <nav class="bg-gray-900 text-white px-6 py-3 flex items-center shrink-0">
        <span class="font-semibold text-lg mr-6">MCP Eval</span>
        <div class="flex gap-1">
            <a
                href="/"
                class="text-sm px-3 py-1.5 rounded transition-colors
                       {page.url.pathname === '/'
                           ? 'bg-white/15 text-white'
                           : 'text-gray-400 hover:text-white hover:bg-white/10'}"
            >
                New Run
            </a>
            <a
                href="/runs"
                class="text-sm px-3 py-1.5 rounded transition-colors
                       {page.url.pathname.startsWith('/runs')
                           ? 'bg-white/15 text-white'
                           : 'text-gray-400 hover:text-white hover:bg-white/10'}"
            >
                Runs
            </a>
        </div>
    </nav>

    <main class="flex-1 min-h-0">
        {@render children()}
    </main>
</div>