<script lang="ts">
    import { invalidateAll } from '$app/navigation'
    import type { PageData } from './$types'

    let { data }: { data: PageData } = $props()

    let fileInput = $state<HTMLInputElement | null>(null)
    let uploading = $state(false)
    let uploadError = $state<string | null>(null)
    let uploadSuccess = $state<string | null>(null)
    let deletingName = $state<string | null>(null)
    let deleteError = $state<string | null>(null)

    async function install() {
        const file = fileInput?.files?.[0]
        if (!file) return
        uploading = true
        uploadError = null
        uploadSuccess = null
        const formData = new FormData()
        formData.append('file', file)
        try {
            const res = await fetch('/api/skills', { method: 'POST', body: formData })
            const body = await res.json()
            if (!res.ok) {
                uploadError = body.error ?? `Error ${res.status}`
            } else {
                uploadSuccess = `Installed "${body.id}"`
                if (fileInput) fileInput.value = ''
                // TODO: force list refresh, see if there's a more appropriate way to do this
                await invalidateAll() 
            }
        } catch {
            uploadError = 'Network error'
        }
        uploading = false
    }

    async function remove(name: string) {
        deletingName = name
        deleteError = null
        try {
            const res = await fetch(`/api/skills/${name}`, { method: 'DELETE' })
            if (!res.ok) {
                deleteError = `Failed to delete "${name}"`
            } else {
                await invalidateAll()
            }
        } catch {
            deleteError = 'Network error'
        }
        deletingName = null
    }
</script>

<div class="max-w-2xl mx-auto p-6 space-y-8">
    <h1 class="text-xl font-semibold text-gray-900">Skills</h1>

    <section class="space-y-3">
        <h2 class="text-sm font-medium text-gray-700">Installed</h2>
        {#if data.skills.length === 0}
            <p class="text-sm text-gray-400">No skills installed.</p>
        {:else}
            <div class="divide-y divide-gray-100 rounded border border-gray-200">
                {#each data.skills as skill (skill.name)}
                    <div class="flex items-start justify-between gap-4 px-4 py-3">
                        <div>
                            <p class="text-sm font-medium text-gray-800">{skill.name}</p>
                            <p class="text-xs text-gray-500 mt-0.5">{skill.description}</p>
                        </div>
                        <button
                            onclick={() => remove(skill.name)}
                            disabled={deletingName === skill.name}
                            class="shrink-0 text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                        >
                            {deletingName === skill.name ? 'Deleting…' : 'Delete'}
                        </button>
                    </div>
                {/each}
            </div>
        {/if}
        {#if deleteError}
            <p class="text-xs text-red-600">{deleteError}</p>
        {/if}
    </section>

    <section class="space-y-3">
        <h2 class="text-sm font-medium text-gray-700">Install from ZIP</h2>
        <p class="text-xs text-gray-500">
            Upload a <code>.md</code> file (single skill), a <code>.skill</code> or <code>.zip</code> archive containing a skill directory with a <code>SKILL.md</code> at its root.
        </p>
        <div class="flex items-center gap-3">
            <input
                bind:this={fileInput}
                type="file"
                accept=".skill,.zip,.md"
                class="text-sm text-gray-600 file:mr-3 file:rounded file:border file:border-gray-300 file:bg-transparent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-50"
            />
            <button
                onclick={install}
                disabled={uploading}
                class="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {uploading ? 'Installing…' : 'Install'}
            </button>
        </div>
        {#if uploadError}
            <p class="text-xs text-red-600">{uploadError}</p>
        {/if}
        {#if uploadSuccess}
            <p class="text-xs text-green-600">{uploadSuccess}</p>
        {/if}
    </section>
</div>
