import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { listEvalConfigs, loadEvalConfig } from './eval-configs'

const TEST_DIR = join(process.cwd(), 'data', 'eval-configs-test')

const VALID_YAML = `
id: test-case-01
description: "A test case"
prompt: "What is 2 + 2?"
criteria:
  - id: correct-answer
    type: final_answer_contains
    value: "4"
    blocking: true
  - id: step-budget
    type: step_count_lte
    value: 3
`

const INVALID_YAML = `
id: bad-case
description: "Missing prompt"
criteria: []
`

beforeAll(async () => {
	await mkdir(TEST_DIR, { recursive: true })
	await writeFile(join(TEST_DIR, 'valid.yaml'), VALID_YAML)
	await writeFile(join(TEST_DIR, 'invalid.yaml'), INVALID_YAML)
	await writeFile(join(TEST_DIR, 'not-yaml.txt'), 'ignored')
})

afterAll(async () => {
	await rm(TEST_DIR, { recursive: true, force: true })
})

describe('listEvalConfigs', () => {
	test('returns only valid yaml files from a directory', async () => {
		const configs = await listEvalConfigs(TEST_DIR)
		expect(configs).toHaveLength(1)
		expect(configs[0].id).toBe('test-case-01')
	})

	test('returns empty array when directory does not exist', async () => {
		const configs = await listEvalConfigs('/nonexistent/path')
		expect(configs).toEqual([])
	})
})

describe('loadEvalConfig', () => {
	test('loads and parses a valid config by id', async () => {
		const config = await loadEvalConfig('test-case-01', TEST_DIR)
		expect(config).not.toBeNull()
		expect(config!.prompt).toBe('What is 2 + 2?')
		expect(config!.criteria).toHaveLength(2)
	})

	test('returns null for unknown id', async () => {
		const config = await loadEvalConfig('does-not-exist', TEST_DIR)
		expect(config).toBeNull()
	})
})