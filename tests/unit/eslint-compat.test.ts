import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ESLint } from 'eslint'

test('ESLint 10 executes the real Next.js, React, Hooks, accessibility and TypeScript rules', async () => {
  assert.match(ESLint.version, /^10\./)
  const linter = new ESLint()
  const fixtures = [
    { rule: 'react/jsx-key', code: 'export default function Example() { return <>{[1,2].map(value => <span>{value}</span>)}</> }' },
    { rule: 'react-hooks/rules-of-hooks', code: 'import {useState} from "react"; export default function Example({enabled}: {enabled: boolean}) { if (enabled) useState(0); return null }' },
    { rule: 'jsx-a11y/alt-text', code: 'export default function Example() { return <img src="/logo.webp" /> }' },
    { rule: '@next/next/no-sync-scripts', code: 'export default function Example() { return <script src="https://example.com/a.js" /> }' },
    { rule: '@typescript-eslint/no-unused-vars', code: 'export default function Example() { const unused = 1; return null }' },
    { rule: 'import/no-anonymous-default-export', code: 'export default {}' },
  ]
  for (const { rule, code } of fixtures) {
    const [result] = await linter.lintText(code, { filePath: 'components/__eslint_compat_fixture__.tsx' })
    assert.equal(result.fatalErrorCount, 0, rule)
    assert.ok(result.messages.some(message => message.ruleId === rule), `${rule} must still detect violations`)
  }
})
