import { readFile, writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import type { EvalRun, RunListItem } from '$lib/types'

const RUNS_DIR = join(process.cwd(), 'data', 'runs')

// Same shape minus the messages array, used for the run list sidebar

export function generateRunId(): string {
	const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 15)
	const rand = Math.random().toString(36).slice(2, 8)
	return `run_${ts}_${rand}`
}

export async function saveRun(run: EvalRun): Promise<void> {
	const filePath = join(RUNS_DIR, `${run.id}.json`)
	await writeFile(filePath, JSON.stringify(run, null, 2), 'utf-8')
}

export async function loadRun(id: string): Promise<EvalRun | null> {
	try {
		const raw = await readFile(join(RUNS_DIR, `${id}.json`), 'utf-8')
		return JSON.parse(raw) as EvalRun
	} catch {
		return null
	}
}

// Read all files, doesn't scale well
export async function listRuns(): Promise<RunListItem[]> {
	try {
		const files = (await readdir(RUNS_DIR)).filter(f => f.endsWith('.json'))
		const runs = await Promise.all(
			files.map(async (file) => {
				const raw = await readFile(join(RUNS_DIR, file), 'utf-8')
				const { uiMessages: _, ...item } = JSON.parse(raw) as EvalRun
				return item
			})
		)
		return runs.sort((a, b) =>
			new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		)
	} catch {
		return []
	}
}

export async function updateAnnotation(id: string, notes: string, rating: 'good' | 'bad' | null): Promise<boolean> {
	const run = await loadRun(id)
	if (!run) return false
	run.annotation = { rating, notes, savedAt: new Date().toISOString() }
	await saveRun(run)
	return true
}
