# Future Improvements

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

## Manual API and MCP configuration + local deployment via Docker 

## API version fetcher (Portainer api or project tags similar to deploy tool)

## Manual Skill editing 

## Skill Labeling/Versioning/Annotations

## Skill Viewing