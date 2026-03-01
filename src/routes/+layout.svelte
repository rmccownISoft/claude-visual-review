<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state'

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen flex flex-col">
    <nav class="bg-gray-900 text-white px-6 py-3 flex items-center gap-6 shrink-0">
        <span class="font-semibold text-lg">MCP Eval</span>
        <a
            href="/"
            class="text-sm hover:text-white transition-colors"
            class:text-white={page.url.pathname === '/'}
            class:text-gray-400={page.url.pathname !== '/'}
        >
            New Run
        </a>
        <a
            href="/runs"
            class="text-sm hover:text-white transition-colors"
            class:text-white={page.url.pathname.startsWith('/runs')}
            class:text-gray-400={!page.url.pathname.startsWith('/runs')}
        >
            Runs
        </a>
    </nav>

    <main class="flex-1 min-h-0">
        {@render children()}
    </main>
</div>