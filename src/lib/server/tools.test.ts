import { describe, it, expect } from 'vitest'
import { filterTools } from './tools'

describe('filterTools', () => {
    it('excludes disabled tools', () => {
        const tools = { search: {}, write: {}, read: {} }
        const result = filterTools(tools, ['write'])
        expect(result).toHaveProperty('search')
        expect(result).toHaveProperty('read')
        expect(result).not.toHaveProperty('write')
    })

    it('returns all tools when disabledTools is empty', () => {
        const tools = { search: {}, write: {} }
        expect(filterTools(tools, [])).toEqual(tools)
    })

    it('excludes multiple disabled tools', () => {
        const tools = { search: {}, write: {}, read: {}, delete: {} }
        const result = filterTools(tools, ['write', 'delete'])
        expect(Object.keys(result)).toEqual(['search', 'read'])
    })

    it('ignores unknown tool names in disabledTools', () => {
        const tools = { search: {}, write: {} }
        const result = filterTools(tools, ['nonexistent'])
        expect(result).toEqual(tools)
    })
})
