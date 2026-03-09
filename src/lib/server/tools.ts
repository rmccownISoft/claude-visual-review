export function filterTools(
    tools: Record<string, unknown>,
    disabledTools: string[]
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(tools).filter(([name]) => !disabledTools.includes(name))
    )
}
