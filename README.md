# Claude Visual Review

SvelteKit tool for evaluating MCP agent runs — test prompts against configured MCP servers, compare skill variants, and score runs against eval criteria.

## Dev Commands

```bash
pnpm dev          # start dev server
pnpm build        # production build
pnpm preview      # preview production build locally
```

## Type Checking

```bash
pnpm check        # one-time type check
pnpm check:watch  # watch mode
```

Run this after editing types or before committing to catch errors early.

## Tests

```bash
pnpm test                      # run all tests
pnpm test -- eval-configs      # run only eval-configs.test.ts
pnpm test -- evaluator         # run only evaluator.test.ts
pnpm test -- server            # run all tests under src/lib/server/
```

The `--` passes the argument to Vitest as a file path filter. Any substring of the test file path works.

## Formatting / Lint

```bash
pnpm format   # auto-format all files (prettier)
pnpm lint     # check formatting + eslint (no auto-fix)
```

## Data Directories

```
data/runs/           # saved run JSON files (one per run)
data/eval-configs/   # eval criteria YAML files (one per test case)
```

Eval configs are YAML files that define a prompt and pass/fail criteria. See `docs/eval-framework.md` for the format.
