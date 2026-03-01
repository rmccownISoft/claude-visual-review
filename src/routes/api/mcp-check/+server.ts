import { createMCPClient } from '@ai-sdk/mcp'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
    const { url, headers } = await request.json() as { url: string; headers: Record<string, string> }

    let client: Awaited<ReturnType<typeof createMCPClient>>
    try {
        client = await createMCPClient({ transport: { type: 'http', url, headers } })
    } catch (err) {
        return json({ ok: false, error: `Connection failed: ${err instanceof Error ? err.message : String(err)}` })
    }

    try {
        const tools = await client.tools()
        await client.close()
        return json({ ok: true, toolCount: Object.keys(tools).length })
    } catch (err) {
        await client.close().catch(() => {})
        return json({ ok: false, error: `Failed to load tools: ${err instanceof Error ? err.message : String(err)}` })
    }
}