# Evaluation Framework

This document outlines goals for building an evaluation system that attributes agent failures to the correct layer — tool design, skill gap, or model capability — so the right fix is applied.

---

## Background

The core evaluation question is dual-axis:
1. **Should we improve or add an MCP tool?**
2. **Should we add or improve a skill?**

These are not the same fix and require different signals to distinguish. The evaluation framework must support both standalone run analysis and multi-run comparison across skill/tool variants.

### The Attribution Matrix

```
                  Tool Design Issue
                         ↑
   fix tool alone  │  fix tool + add skill
                   │
 ──────────────────┼──────────────────────→ Skill Gap
                   │
   model limit     │  add/improve skill
                   ↓
```

**Example from a real run:** Claude tried `parts` (doesn't exist), failed, then spent 4 schema exploration calls recovering. The failure lives at the skill gap axis — a skill should map "parts" → `inventoryTypes`. But if the tool's error message had said "did you mean `inventoryTypes`?" instead of a raw GraphQL stack trace, that's a tool fix that helps regardless of skills.

---

## Goal 1: Define a structured failure taxonomy

**Problem:** Free-text annotation notes (`"Gave inventory count instead of inventoryType"`) aren't queryable or aggregatable. You can't find all runs that failed for the same reason without reading each one.

**Suggestion:** Add a `failureMode` enum to run annotations and expand it to support multiple failures per run. Organize by layer:

**Schema navigation failures:**
- `wrong_entity` — mapped domain term to wrong schema type
- `schema_exploration_loop` — multiple consecutive explore calls before finding correct type
- `domain_mapping_gap` — no skill existed to bridge user language to schema

**Query construction failures:**
- `wrong_filter_field` — used a filter field that doesn't exist
- `wrong_response_field` — requested a non-existent response field
- `filter_type_mismatch` — correct field, wrong value type (scalar vs list)
- `pagination_error` — wrong pagination argument names or structure
- `date_format_error` — wrong date format or filter structure

**Tool design failures:**
- `unhelpful_error_message` — error didn't guide recovery (raw stack trace vs. actionable hint)
- `missing_tool` — task required a specific operation that only a generic tool covered
- `tool_scope_too_broad` — too many options increased wrong-usage surface area

**Attribution field on each failure:** `layer: 'tool' | 'skill' | 'model'` — so results can be aggregated by layer across runs.

---

## Goal 2: Capture per-error recovery data

**Problem:** Whether Claude recovered quickly or slowly after a tool error is the key signal for distinguishing tool-layer from skill-layer failures. This isn't currently stored.

**Suggestion:** For each failed tool call, track:
- `recoverySteps: number` — how many steps until the next successful call to the same tool
- `recoveryStrategy: 'schema_exploration' | 'retry_with_fix' | 'abandoned' | null`

**Attribution logic:**
- Recovered in 1 step → error message was useful, tool is probably adequate
- Recovered in 3+ steps of schema exploration → error was unhelpful OR skill should have preempted it
- Never recovered correctly → likely a domain mapping gap (skill needed)

---

## Goal 3: Build an eval config file format

**Problem:** Evaluation criteria are currently only expressible as post-hoc annotation. There's no way to define expected behavior upfront, run evaluations consistently, or compare results across runs.

**Suggestion:** A YAML or JSON eval config file, keyed by `promptId`, that defines weighted criteria and a pass threshold. Criteria should support multiple evaluator types.

**Evaluator types:**

- **`rule`** — deterministic assertion (fast, cheap, no LLM call)
  - `final_answer_contains`, `final_answer_not_contains`, `final_answer_matches` (regex)
  - `max_steps`, `max_errors`, `max_tokens`
  - `tool_called` (existence check, not sequence)
  - `explore_schema_calls_lte` (schema navigation efficiency)

- **`llm_judge`** — flexible quality assessment (handles nuance, costs tokens)
  - Provide a scoring prompt + expected answer
  - Returns a 0–1 score with reasoning
  - Use a cheaper/faster model for high-volume runs

- **`reference`** — compare against a pinned baseline run
  - Flag when step count is significantly worse than baseline
  - Useful for regression detection after a skill or tool change

**Example config:**
```yaml
id: part-types-eval
promptId: part-types-question
description: "Agent should return inventoryType count, not inventory count"

criteria:
  - id: correct_entity
    layer: skill
    type: llm_judge
    weight: 0.5
    prompt: >
      Did the agent answer about inventory types (categories of parts, schema type
      InventoryType) rather than individual inventory items (schema type Inventory)?
      Score 1 if yes, 0 if no.

  - id: no_inventory_confusion
    layer: skill
    type: rule
    weight: 0.2
    assert: final_answer_not_contains
    value: "inventories"

  - id: efficiency
    layer: tool
    type: rule
    weight: 0.2
    assert: max_steps
    value: 6

  - id: schema_navigation
    layer: tool
    type: rule
    weight: 0.1
    assert: explore_schema_calls_lte
    value: 2

scoring:
  pass_threshold: 0.7
  weights: weighted_average
```

Eval results should be stored back into the run JSON under an `evalResults` property so the UI can display pass/fail per criterion.

---

## Goal 4: Support multi-run evaluation suites

**Problem:** Non-deterministic agents can't be fairly evaluated on a single run. The same config might pass 6 out of 10 times. Skill or tool changes need to be measured against a distribution, not a single outcome.

**Suggestion:** A suite runner concept that:
- Executes a config N times (configurable)
- Applies the eval config to each run
- Aggregates: pass rate, average step count, average token cost, error rate, P50/P95 latency
- Stores the suite result separately from individual runs, linked by `promptId` + `configHash`

This makes "skill X improved pass rate from 40% → 80%" a concrete, reproducible statement.

---

## Goal 5: Enable controlled comparison testing

**Problem:** To know whether a skill or tool change actually helped, you need to isolate the variable. Currently there's no structure for intentional A/B or ablation testing.

**Suggestion:** Three structured test strategies, each as a named suite type:

**Ablation runs** — same prompt, same tool, varying skill presence:
- Suite A: no skill (baseline tool behavior)
- Suite B: generic GraphQL guidance skill
- Suite C: domain-specific skill with entity/filter mappings
- Measures each layer's contribution independently

**Regression runs** — after changing a tool, re-run historical failure cases:
- Pin a set of runs that exhibited `schema_exploration_loop` or `wrong_filter_field`
- Re-run after improving error messages
- Pass rate on that set is the regression signal

**Stress prompt library** — prompts designed to trigger known failure modes:
- Prompts using domain language not in the schema (`parts`, `jobs`, `customers` with ambiguous mappings)
- Prompts requiring date filters, pagination, multi-store filtering
- Becomes a fixed test suite runnable against any config combination
- Store these as a first-class resource, not just run configs

---

## Summary Table

| Goal | Concept | Key Fields / Artifacts |
|------|---------|----------------------|
| Structured failure taxonomy | `failureMode[]` on annotation | type enum + `layer: tool\|skill\|model` |
| Per-error recovery tracking | Per-tool-call metadata | `recoverySteps`, `recoveryStrategy` |
| Eval config format | YAML/JSON per `promptId` | criteria, evaluator types, scoring, pass threshold |
| Multi-run suites | Suite runner + aggregate results | pass rate, variance, P50/P95 per suite |
| Controlled comparison | Named suite types | ablation, regression, stress prompt library |
