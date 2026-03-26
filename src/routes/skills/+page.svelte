<script lang="ts">
    import { invalidateAll } from '$app/navigation'
    import type { PageData } from './$types'
    import { groupSkillsByFamily, versionLabel } from '$lib/skillVersioning'

    let { data }: { data: PageData } = $props()

    let fileInput = $state<HTMLInputElement | null>(null)
    let uploading = $state(false)
    let uploadError = $state<string | null>(null)
    let uploadSuccess = $state<string | null>(null)
    let deletingId = $state<string | null>(null)
    let deleteError = $state<string | null>(null)

    let families = $derived(groupSkillsByFamily(data.skills))

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
                await invalidateAll()
            }
        } catch {
            uploadError = 'Network error'
        }
        uploading = false
    }

    async function remove(id: string) {
        deletingId = id
        deleteError = null
        try {
            const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' })
            if (!res.ok) {
                deleteError = `Failed to delete "${id}"`
            } else {
                await invalidateAll()
            }
        } catch {
            deleteError = 'Network error'
        }
        deletingId = null
    }
</script>

<div class="max-w-2xl mx-auto p-6 space-y-8">
    <h1 class="text-xl font-semibold text-gray-900">Skills</h1>

    <section class="space-y-3">
        <h2 class="text-sm font-medium text-gray-700">Installed</h2>
        {#if families.length === 0}
            <p class="text-sm text-gray-400">No skills installed.</p>
        {:else}
            <div class="divide-y divide-gray-100 rounded border border-gray-200">
                {#each families as family (family.baseName)}
                    <div class="px-4 py-3 space-y-2">
                        <!-- Family header -->
                        <div class="flex items-center justify-between">
                            <div>
                                <span class="text-sm font-medium text-gray-800">{family.displayName}</span>
                                <span class="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {family.members.length} {family.members.length === 1 ? 'version' : 'versions'}
                                </span>
                            </div>
                        </div>
                        <p class="text-xs text-gray-500">{family.description}</p>

                        <!-- Version rows -->
                        <div class="pl-3 border-l-2 border-gray-200 space-y-1.5">
                            {#each family.members as { skill, isLatest } (skill.id)}
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs text-gray-600">{versionLabel(skill.id)}</span>
                                        {#if isLatest && family.members.length > 1}
                                            <span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">latest</span>
                                        {/if}
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <a
                                            href="/skills/{skill.id}/edit"
                                            class="text-xs text-blue-600 hover:text-blue-800"
                                        >Edit</a>
                                        <button
                                            onclick={() => remove(skill.id)}
                                            disabled={deletingId === skill.id}
                                            class="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                                        >
                                            {deletingId === skill.id ? 'Deleting…' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
        {#if deleteError}
            <p class="text-xs text-red-600">{deleteError}</p>
        {/if}
    </section>

    <section class="space-y-3">
        <h2 class="text-sm font-medium text-gray-700">Install from file</h2>
        <p class="text-xs text-gray-500">
            Upload a <code>.md</code> file (single skill), or a <code>.skill</code> / <code>.zip</code> archive containing a skill directory with a <code>SKILL.md</code> at its root.
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
