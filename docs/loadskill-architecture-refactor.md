# loadSkill Architecture Refactor Guide

## Context

This document was produced from a design discussion about how to correctly implement Anthropic-style skill loading in a standalone MCP + skill evaluation tool built with SvelteKit and the Vercel AI SDK v6.

The tool allows users to define MCP servers, select tools, upload SKILL.md files, configure a test prompt, and run an agentic loop to evaluate skill and MCP tool effectiveness.

---

## The Core Problem

### Two unrelated "Skills" concepts — don't confuse them

Anthropic's **API-level Skills** feature (`container` parameter, `skills-2025-10-02` beta header) is a **code execution container system** for file-generating tasks (Excel, PowerPoint, PDF). It is **not** the mechanism Claude.ai uses to load SKILL.md instruction files, and it is not relevant to this tool.

The `providerOptions` path in the Vercel AI SDK does not expose anything useful for SKILL.md-based skill loading. Do not pursue this.

### What Claude.ai actually does (and what to replicate)

Claude.ai's skill system uses a **three-level progressive disclosure** pattern:

1. **Metadata only** — Always in context. The system prompt contains an `available_skills` list with each skill's `name` and `description` (~100 words per skill). Claude reads this to decide if a skill is relevant.
2. **SKILL.md body** — Loaded on demand via a tool call when Claude determines a skill is needed.
3. **Bundled reference files** — Loaded further on demand (also via tool calls) when the skill body instructs Claude to read them.

### What the current implementation does wrong

`listSkills()` runs `collectMdFiles()` at load time and concatenates **every `.md` file in the skill directory** into `skill.content`. This means:

- The full skill content (including all reference files) is returned as one large blob on the first `loadSkill` call
- Progressive disclosure is bypassed entirely — there is no lazy loading
- Claude loses the structural signal of what is "core instructions" vs. "supplementary reference"
- Large reference files (schema docs, query examples, etc.) pollute the context window immediately, which likely degrades MCP tool use quality

---

## Target Architecture

### Tool 1: `listSkills` (existing, keep)

Remains in the system prompt scaffold. Returns a list of available skill names and descriptions only — **no content**. This is what goes into `available_skills`.

```typescript
// Returns only metadata
[
  { name: "my-skill", description: "When to use this skill and what it does..." },
  ...
]
```

### Tool 2: `loadSkill` (modify)

Currently returns the full flattened content blob. Should be changed to return **only the SKILL.md body** (everything after the YAML frontmatter).

It should also return a manifest of available reference files so Claude knows what it can load next if needed.

```typescript
// Returns SKILL.md body + file manifest, NOT all reference files
{
  body: "# My Skill\n\nInstructions here...",
  availableFiles: [
    "references/schema.md",
    "references/examples.md",
    "scripts/helper.py"
  ]
}
```

### Tool 3: `loadSkillFile` (new)

A new tool that loads a single file from within a skill's directory. The SKILL.md body will contain instructions telling Claude when to read which files (this is the existing skill authoring pattern — skills already say things like "Read `references/schema.md` before querying").

```typescript
// Input
{ skillName: string, filePath: string }

// Returns
{ content: string }
```

---

## Implementation Notes

### Parsing SKILL.md correctly

The YAML frontmatter block (between `---` delimiters) should be stripped before returning the body. The frontmatter is metadata for the tool system, not instructions for Claude.

```typescript
function parseSkillMd(raw: string): { meta: SkillMeta; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  return {
    meta: parseYaml(match[1]),
    body: match[2].trim()
  };
}
```

### Building the available_skills system prompt block

Only name and description belong here. Match the format Claude.ai uses:

```
<available_skills>
<skill name="my-skill">When to use this skill and what it does</skill>
<skill name="other-skill">Another skill description</skill>
</available_skills>

When a skill is relevant to the user's request, call loadSkill with the skill name before proceeding. Call loadSkillFile if the skill instructs you to load additional reference files.
```

### File manifest in loadSkill response

Walk the skill directory recursively and return relative paths of all non-SKILL.md files. This lets Claude know what's available without loading it.

```typescript
function getSkillFileManifest(skillDir: string): string[] {
  // Recursively walk skillDir
  // Return paths relative to skillDir root
  // Exclude SKILL.md itself
  // Include .md, .py, .ts, .json, etc.
}
```

### Security consideration

`loadSkillFile` should validate that the requested `filePath` resolves within the skill's directory and does not escape via `../` traversal. Since users upload skills manually this is low risk, but worth a simple check.

---

## Vercel AI SDK Integration

The multi-step tool call pattern works naturally with the Vercel AI SDK's `maxSteps` in `generateText` or `streamText`. No special handling is needed — the sequence will be:

1. Claude reads `available_skills` in system prompt
2. Claude calls `loadSkill("my-skill")` → receives SKILL.md body + file manifest
3. Claude follows skill instructions, potentially calling `loadSkillFile("my-skill", "references/schema.md")`
4. Claude proceeds to use MCP tools as guided by skill content

Each step is a standard tool call/result pair in the message history. The Vercel AI SDK handles this automatically as long as `maxSteps` is set high enough (e.g., `10–20` depending on expected skill depth).

### Prompt caching opportunity

If skill content is stable across eval runs, consider adding `cache_control` to the system prompt. The Vercel AI SDK exposes this via `providerOptions` for the system prompt block. Note that caching tool *results* has limited SDK support — you may need to drop to the raw Anthropic SDK client for that.

---

## What NOT to do

- **Do not** use the Anthropic API `container` parameter or `skills-2025-10-02` beta for this use case
- **Do not** pre-inline all reference files into `loadSkill`'s response
- **Do not** include skill body content in the `available_skills` system prompt block — descriptions only
- **Do not** flatten subdirectory structure — preserve file paths so the skill body's instructions (`"read references/schema.md"`) remain accurate

---

## Questions to Answer in the Codebase

Before implementing, locate and review:

1. Where is `collectMdFiles()` defined and called? This is the primary site of the flattening behavior to remove.
2. Where is the system prompt assembled for `ToolLoopAgent`? The `available_skills` block needs to be generated here from metadata only.
3. How are tools registered with the Vercel AI SDK call? `loadSkillFile` needs to be added here.
4. Is there a skill upload/storage layer? The file manifest walk needs access to the raw directory structure, not a pre-processed blob.
