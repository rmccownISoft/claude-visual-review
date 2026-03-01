<script lang="ts">
    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import { page } from '$app/state'

    let { children } = $props();
</script>

{#snippet navLink(href: string, label: string, active: boolean)}
    <a
        {href}
        class="text-sm px-3 py-1.5 rounded transition-colors
               {active ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}"
    >{label}</a>
{/snippet}

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen flex flex-col">
    <nav class="bg-gray-900 text-white px-6 py-3 flex items-center shrink-0">
        <span class="font-semibold text-lg mr-6">MCP Eval</span>
        <div class="flex gap-1">
            {@render navLink('/', 'New Run', page.url.pathname === '/')}
            {@render navLink('/runs', 'Runs', page.url.pathname.startsWith('/runs'))}
            {@render navLink('/skills', 'Skills', page.url.pathname.startsWith('/skills'))}
        </div>
    </nav>

    <main class="flex-1 min-h-0">
        {@render children()}
    </main>
</div>
