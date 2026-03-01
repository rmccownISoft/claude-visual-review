import { listRuns } from '$lib/server/runs'
import type { LayoutServerLoad } from './$types'

// Using .server.ts b/c we're reading from filesystem (server)
export const load: LayoutServerLoad = async () => {
    return { runs: await listRuns() }
}
