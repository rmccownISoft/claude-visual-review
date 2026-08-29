# TypeScript Patterns Reference

Quick reference for patterns that appear in this codebase.

---

## Discriminated Unions

A union where one shared field (the **discriminant**) tells you which variant you have.

### The pattern

```typescript
type Shape =
  | { kind: 'circle';    radius: number }
  | { kind: 'rectangle'; width: number; height: number }
```

`kind` is the discriminant. TypeScript uses it to narrow the type in a switch:

```typescript
function area(shape: Shape): number {
    switch (shape.kind) {
        case 'circle':
            return Math.PI * shape.radius ** 2   // TypeScript knows radius exists here
        case 'rectangle':
            return shape.width * shape.height     // TypeScript knows width/height exist here
    }
}
```

Without the discriminant, TypeScript can't know which fields are safe to access.

### Where this appears in the project

`EvalCriterion` in `src/lib/types.ts` — five variants, all keyed on `type`:

```typescript
type EvalCriterion =
  | { type: 'final_answer_contains';  value: string;  blocking?: boolean }
  | { type: 'step_count_lte';         value: number }
  | { type: 'tool_call_count_lte';    value: number;  tool?: string }
  // ...
```

The evaluator switches on `type` to know which fields to read.

### Zod discriminated unions

Zod uses the same discriminant to pick which schema to validate against:

```typescript
const ShapeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('circle'),    radius: z.number() }),
    z.object({ kind: z.literal('rectangle'), width: z.number(), height: z.number() }),
])

ShapeSchema.parse({ kind: 'circle', radius: 5 })       // ✓
ShapeSchema.parse({ kind: 'circle', width: 5 })        // ✗ — radius required
ShapeSchema.parse({ kind: 'triangle', sides: 3 })      // ✗ — unknown kind
```

**Why not `z.union()`?** That tries each branch in order until one passes. `z.discriminatedUnion()` jumps straight to the right branch using the discriminant — faster, and the error messages tell you *which* branch failed instead of all of them.

### Practice

Try adding a new variant to `ShapeSchema` — say `{ kind: 'square', side: number }` — and update the `area` function. TypeScript will warn you if the switch is missing a case.

---

## Type Predicates

A way to teach TypeScript what a runtime check actually proves about a type.

### The problem

`Array.filter()` doesn't narrow types automatically:

```typescript
const items: (string | null)[] = ['a', null, 'b', null, 'c']

const strings = items.filter(x => x !== null)
// TypeScript still thinks: (string | null)[]  ← wrong, we filtered nulls out
```

### The solution

A type predicate is a special return annotation: `x is SomeType`

```typescript
const strings = items.filter((x): x is string => x !== null)
// Now TypeScript knows: string[]  ✓
```

The syntax `(x): x is string` means: "if this function returns true, I promise `x` is a `string`." The runtime check (`x !== null`) is what actually enforces that promise — TypeScript trusts you.

### Where this appears in the project

`src/lib/server/eval-configs.ts` — after parsing YAML files, some may be `null` (invalid):

```typescript
const results: (EvalConfig | null)[] = await Promise.all(files.map(parseConfigFile))

return results.filter((c): c is EvalConfig => c !== null)
// returns EvalConfig[]  ← TypeScript knows no nulls remain
```

### When you need it

Any time you `filter()` a mixed-type array and TypeScript still shows the original union type after filtering. Common cases:

```typescript
// Filtering nulls/undefined
array.filter((x): x is Thing => x != null)

// Filtering by type
array.filter((x): x is Dog => x instanceof Dog)

// Filtering by discriminant
array.filter((x): x is Circle => x.kind === 'circle')
```

### Practice

Start with this and make TypeScript happy without using `as` or `!`:

```typescript
const values: (number | undefined)[] = [1, undefined, 2, undefined, 3]

// Goal: numbers should be number[], not (number | undefined)[]
const numbers = values.filter(???)

const doubled = numbers.map(n => n * 2)  // should compile without errors
```
