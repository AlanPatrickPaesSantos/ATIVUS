import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/shared/styles/scrollbars.css'), 'utf8')

test('defines the dark ATIVUS scrollbar theme for Firefox and Chromium browsers', () => {
  expect(stylesheet).toContain('scrollbar-color: var(--sigat-border-strong) var(--sigat-night)')
  expect(stylesheet).toContain('::-webkit-scrollbar-thumb')
  expect(stylesheet).toContain('::-webkit-scrollbar-track')
})
