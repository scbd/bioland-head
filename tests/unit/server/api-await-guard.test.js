import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'node:fs'
import ts from 'typescript'

/**
 * BL-1123 guard: `return someAsyncCall()` inside a `try { ... } catch (e) { ... }`
 * without `await` lets a rejection escape the try, so the catch (and therefore
 * `passError`) never runs. This scans server/api/** and server/routes/** for that
 * shape and fails the build if a new instance shows up.
 *
 * A call that is verifiably synchronous and must stay sync (e.g. it feeds
 * `Array#map` inside a non-async helper) can opt out with a comment on the line
 * above the `return`:
 *
 *   // await-guard: allow-sync-return - <reason>
 *   return syncHelper(x)
 */

/**
 * @param {string} file absolute path, used only for error messages
 * @param {string} text file contents
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function findUnawaitedTryReturns(file, text) {
  const scriptKind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind)
  const violations = []

  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

  const hasAllowComment = (node) => {
    const fullStart = node.getFullStart()
    const leadingText = node.getFullText(sourceFile).slice(0, node.getStart(sourceFile) - fullStart)

    return /await-guard:\s*allow-sync-return/.test(leadingText)
  }

  const walkTryBlock = (block) => {
    const visit = (node) => {
      if (ts.isReturnStatement(node) && node.expression && ts.isCallExpression(node.expression)) {
        if (!hasAllowComment(node)) {
          violations.push({ file, line: lineOf(node), text: node.getText(sourceFile).trim().slice(0, 160) })
        }
      }

      // Don't descend into a nested function's body - it is its own await scope,
      // and (if it has one) its own try/catch is walked separately below.
      if (ts.isFunctionLike(node) && node !== block) return

      ts.forEachChild(node, visit)
    }

    ts.forEachChild(block, visit)
  }

  const visitTop = (node) => {
    if (ts.isTryStatement(node)) walkTryBlock(node.tryBlock)

    ts.forEachChild(node, visitTop)
  }

  visitTop(sourceFile)

  return violations
}

const scanGlobs = ['server/api/**/*.js', 'server/api/**/*.ts', 'server/routes/**/*.js', 'server/routes/**/*.ts']

function scanRepo() {
  const root = process.cwd()
  const files = scanGlobs.flatMap((pattern) => globSync(pattern, { cwd: root }))
  const violations = []

  for (const relPath of files) {
    const absPath = join(root, relPath)
    const text = readFileSync(absPath, 'utf8')

    violations.push(...findUnawaitedTryReturns(relPath, text))
  }

  return violations
}

describe('BL-1123 await-guard: server/api and server/routes try/catch handlers', () => {
  it('has no un-awaited `return <call>()` inside a try block', () => {
    const violations = scanRepo()

    if (violations.length) {
      const report = violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join('\n')

      throw new Error(
        `Found ${violations.length} un-awaited return(s) inside a try block. ` +
        `A rejected promise here escapes the try and its catch/passError never runs. ` +
        `Add "await", or if the call is verifiably synchronous, opt out with ` +
        `"// await-guard: allow-sync-return - <reason>" on the line above:\n${report}`,
      )
    }

    expect(violations).toEqual([])
  })

  it('flags a fixture with an un-awaited return inside a try/catch', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    return fetchSomething(event)
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/bad-handler.js', fixture)

    expect(violations).toHaveLength(1)
    expect(violations[0].text).toContain('fetchSomething(event)')
  })

  it('does not flag an awaited return inside a try/catch', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    return await fetchSomething(event)
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/good-handler.js', fixture)

    expect(violations).toEqual([])
  })

  it('does not flag a return of a plain (non-call) value', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    return result
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/plain-return.js', fixture)

    expect(violations).toEqual([])
  })

  it('respects the explicit sync opt-out comment', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    // await-guard: allow-sync-return - syncHelper is a verified synchronous transform
    return syncHelper(event)
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/opt-out.js', fixture)

    expect(violations).toEqual([])
  })
})
