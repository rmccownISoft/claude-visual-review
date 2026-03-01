# Future Improvements

## Setup Prompt (Pre-run Auth) ← implement next

**Problem:** MCP servers often require an authentication tool call before any other tools work. Currently the user has to bake auth into the main prompt, which conflates setup with the actual eval task.

**Solution:** Add an optional `setupPrompt` field to the New Run form and `RunConfig`. When provided, it runs before the main prompt as a mandatory system instruction.

**Changes required:**

1. **`src/lib/types.ts`** — add `setupPrompt?: string` to `RunConfig`

2. **`src/routes/api/run/+server.ts`** — update `buildInstructions`:
   ```ts
   function buildInstructions(skills: Skill[], setupPrompt?: string): string {
       const base = 'You are a helpful assistant. Use the available tools to answer the user\'s question thoroughly.'
       let instructions = base
       if (setupPrompt) {
           instructions += `\n\nBefore doing anything else, you MUST complete this setup step:\n${setupPrompt}\n\nOnce setup is complete, proceed with the user's actual task.`
       }
       if (skills.length === 0) return instructions
       const skillList = skills.map(s => `- **${s.name}**: ${s.description}`).join('\n')
       return `${instructions}\n\nYou have the following skills available. When a task matches a skill's description, call the \`loadSkill\` tool with that skill's name before proceeding — it will return the full instructions.\n\n${skillList}`
   }
   ```
   Update call site (line ~102): `instructions: buildInstructions(config.skills, config.setupPrompt),`

3. **`src/routes/+page.svelte`** — add state, include in config, add textarea to form:
   - `let setupPrompt = $state('')`
   - In `startRun()`: `setupPrompt: setupPrompt || undefined` in config object
   - Add between Headers and Skills sections:
   ```svelte
   <div class="space-y-1">
       <label class="text-sm font-medium text-gray-700" for="setupPrompt">
           Setup prompt <span class="font-normal text-gray-400">(optional)</span>
       </label>
       <textarea
           id="setupPrompt"
           bind:value={setupPrompt}
           rows={3}
           placeholder="e.g. Login to the MCP server with user: x, password: y at storeId 5"
           class="w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
       ></textarea>
       <p class="text-xs text-gray-400">Runs before the main prompt. Leave blank if not needed.</p>
   </div>
   ```

**Note:** Credentials typed into the setup prompt are stored in `data/runs/*.json` in plaintext — acceptable for a local tool. A future "MCP profiles" feature (Option B) would store credentials separately and reference them by name.

---

## Skill Labeling at Install Time ← implement after setup prompt

**Problem:** Skills are identified by their `name` field in `SKILL.md` frontmatter. Installing two versions of the same skill would produce a name conflict in the agent's `skillMap`, and only one could be active at a time.

**Proposed fix (Option A — label at install time):**
- Add an optional "Install as…" text field next to the file picker on the `/skills` page
- If provided, the label overrides the ZIP root directory name as the storage directory and the agent-facing skill name
- Example: install `my-skill.zip` twice as `my-skill-v1` and `my-skill-v2` — both appear as selectable skills on the New Run form
- The Skills list shows both the label (directory name) and the internal `name` from SKILL.md for clarity

**Implementation:**
- `installSkillFromZip(buffer, alias?: string)` — if alias provided, use it as `rootDir` instead of the ZIP's root directory name
- `POST /api/skills` accepts an optional `label` form field alongside `file`
- `Skill` type gains an `id: string` field (the directory name / alias) separate from `name` (from frontmatter) — `id` is what the agent uses, `name` is display-only
- New Run form checkboxes key on `id`; `skillMap` keys on `id`

---

## Skill Progressive Disclosure

**Current behavior:** When `loadSkill` is called, the tool returns the full skill content including all reference files pre-inlined into a single blob. This happens because `listSkills()` runs `collectMdFiles()` at load time and concatenates every `.md` file in the skill directory into `skill.content`.

**Native Claude Desktop/Code behavior:** Claude reads `SKILL.md` first via bash, then fetches individual reference files on demand as needed for the specific task. Scripts are executed and only their output enters context — the script source never loads.

**The gap:** No intra-skill lazy loading. A skill with 10 reference files loads all 10 into context the moment `loadSkill` is called, even if the task only needed 1.

**Proposed fix:**
1. Stop pre-inlining reference files in `listSkills()` — return only the `SKILL.md` body
2. Add a `readSkillFile(skillName, path)` tool alongside `loadSkill` that reads a single file from the skill directory on demand
3. `SKILL.md` references other files by relative path; Claude calls `readSkillFile` to fetch them individually

**Benefit:** Zero token cost for reference files the task doesn't touch. Matches the progressive context loading model Claude Desktop/Code uses natively.

## Model Selection & Extended Thinking (Reasoning)

**Current state:** Model is hardcoded to `claude-sonnet-4-5` in `src/routes/api/run/+server.ts`. Extended thinking (reasoning) is not enabled — it requires explicit opt-in via `providerOptions`.

**Opportunity:** Exposing model selection and `providerOptions` in the New Run form would make this tool significantly more useful as an eval platform — you could directly compare runs across models or reasoning configurations.

**Proposed additions to the New Run form:**
- Model selector (e.g. `claude-sonnet-4-5`, `claude-opus-4-6`, `claude-haiku-4-5`)
- "Enable reasoning" toggle with a budget tokens input (min ~1000, typical ~10000–16000)

**Agent wiring:** Pass `providerOptions` to `ToolLoopAgent`:
```ts
providerOptions: {
  anthropic: {
    thinking: { type: 'enabled', budgetTokens: config.budgetTokens }
  }
}
```

**UI rendering:** When reasoning is enabled, the AI SDK includes `reasoning` parts in `UIMessage`. These need to be rendered in `MessageList` — likely as a collapsible "Thinking…" block above the model's final text response.

**Data model:** `RunConfig` would need `model: string` and optional `thinking?: { budgetTokens: number }` fields so reasoning configuration is stored with the run for later comparison.

**Benefit:** Core eval use case — run the same prompt with/without reasoning, or across models, and compare outputs side by side.

## MCP Tool Selection

**Problem:** All tools from the connected MCP server are passed to the agent. When a skill covers the same behavior as an MCP tool, there's no way to disable the tool to isolate or test the skill-based approach.

**Proposed design:**
- Expand `POST /api/mcp-check` response to include tool names: `{ ok: true, toolCount: N, tools: string[] }`
- After a successful connection check on the New Run form, show a collapsible checklist of available tools (all checked by default)
- User can deselect tools to exclude from the run
- `RunConfig` gains `disabledTools: string[]` — stored with the run for reproducibility
- In `POST /api/run`, filter `mcpTools` after `mcpClient.tools()`:
  ```ts
  const filteredTools = Object.fromEntries(
      Object.entries(mcpTools).filter(([name]) => !config.disabledTools.includes(name))
  )
  ```

**UX:** Tool checklist only appears after a successful connection check, keeping the form clean until the server is confirmed reachable.

**Benefit:** Enables controlled eval comparisons — e.g. run with tool disabled to verify the skill handles the task alone, then run with tool enabled to compare behavior.
