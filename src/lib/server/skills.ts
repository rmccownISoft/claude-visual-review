export type Skill = {
    name: string 
    description: string 
    content: string //markdown body 
}
// TODO: come back to this later https://ai-sdk.dev/docs/agents/building-agents
// TODO: supposed to be yaml format, we could use a yaml parser
export function parseSkillFile(rawContent: string): Skill | null {
    // Skill files start with --- and have a closing ---
	const frontmatterMatch = rawContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/m)
	if (!frontmatterMatch) return null

	const frontmatter = frontmatterMatch[1]
	const body = frontmatterMatch[2].trim()

	// Extract name and description from frontmatter lines
	const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim()
	const description = frontmatter.match(/^description:\s*['"]?([\s\S]*?)['"]?\s*$/m)?.[1]?.trim()

	if (!name || !description) return null

	return { name, description, content: body }
}