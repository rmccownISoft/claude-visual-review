import { json } from '@sveltejs/kit'
import { listRuns } from '$lib/server/runs'

// Get past runs
export async function GET() {
	const runs = await listRuns()
	return json(runs)
}
