import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('main/index.ts startup order (audit W1, ADD-16)', () => {
  it('registers language channels exactly once, before the first createWindow() in whenReady', () => {
    const src = readFileSync(join(__dirname, 'index.ts'), 'utf8')
    const body = src.slice(src.indexOf('app.whenReady()'))
    const calls = body.split('registerLanguageChannels()').length - 1
    expect(calls).toBe(1)
    const reg = body.indexOf('registerLanguageChannels()')
    const win = body.indexOf('let currentWin = createWindow()')
    expect(reg).toBeGreaterThan(-1)
    expect(win).toBeGreaterThan(-1)
    expect(reg).toBeLessThan(win)
  })
})
