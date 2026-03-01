import { readFile, readdir } from 'fs/promises'
import { join, relative } from 'path'

const SKILLS_DIR = join(process.cwd(), '.agents', 'skills')

export type Skill = {
    name: string 
    description: string 
    content: string //markdown body 
}
/**
 * 
 * To support skill directories with reference files, we'll have to read and inline them
 * 
 * 
 */

// Recursively collect all .md files in a dir, excluding one filename
// It does this? ['.../references/ai-gateway.md', '.../references/common-errors.md', '.../references/devtools.md', '.../references/type-safe-agents.md']

async function collectMdFiles(dir: string, exclude: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...await collectMdFiles(full, exclude))
        } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== exclude) {
            files.push(full)
        }
    }
    return files
}

export async function listSkills(): Promise<Skill[]> {
	// Note: Originally tried to use Awaited but still returned a ts error, never seen that one
	const entries = await readdir(SKILLS_DIR, { withFileTypes: true }).catch(() => null)
	if (!entries) return []

    const results = await Promise.all(
        entries
            .filter(e => e.isDirectory())
            .map(async (entry) => {
                const skillDir = join(SKILLS_DIR, entry.name)
                let raw: string
                try {
                    raw = await readFile(join(skillDir, 'SKILL.md'), 'utf-8')
                } catch {
                    return null
                }

                const skill = parseSkillFile(raw)
                if (!skill) return null

                // Inline supporting .md files so the model gets full context
                const extras = await collectMdFiles(skillDir, 'SKILL.md')
                if (extras.length > 0) {
                    const sections = await Promise.all(
                        extras.map(async (filePath) => {
                            const relPath = relative(skillDir, filePath)
                            const content = await readFile(filePath, 'utf-8')
                            return `\n\n---\n<!-- ${relPath} -->\n${content}`
                        })
                    )
                    skill.content += sections.join('')
                }

                return skill
            })
    )

    return results.filter((s): s is Skill => s !== null)
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