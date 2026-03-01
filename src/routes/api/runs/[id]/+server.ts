import { json, error } from '@sveltejs/kit'
import { loadRun, updateAnnotation } from '$lib/server/runs'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
	const run = await loadRun(params.id)
	if (!run) throw error(404, 'Run not found')
	return json(run)
}

// Replace part instead of update by replacing whole
export const PATCH: RequestHandler = async ({ params, request }) => {
	const { notes, rating } = await request.json() as { notes: string, rating: 'good' | 'bad' | null }
	const success = await updateAnnotation(params.id, notes, rating)
	if (!success) throw error(404, 'Run not found') // Let Svelte handle 
	return json({ ok: true })
}
