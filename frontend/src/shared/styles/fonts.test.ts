import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const fontsCss = readFileSync('src/shared/styles/fonts.css', 'utf8')

describe('font assets', () => {
  test('references only locally hosted font files', () => {
    expect(fontsCss).not.toContain('fonts.googleapis.com')
    expect(fontsCss).toContain("@fontsource/archivo/400.css")
    expect(fontsCss).toContain("@fontsource/inter/400.css")
    expect(fontsCss).toContain("@fontsource/jetbrains-mono/400.css")
  })
})
