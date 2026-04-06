import { json } from '@sveltejs/kit'
import { listEvalConfigs } from '$lib/server/eval-configs'

export async function GET() {
	const configs = await listEvalConfigs()
	// Return only id + description + prompt — client doesn't need criteria detail
	return json(configs.map(c => ({ id: c.id, description: c.description, prompt: c.prompt })))
}