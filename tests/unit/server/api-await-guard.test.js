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
 * BL-1247 guard: `passError` is async and always throws, so a bare `passError(event, e)`
 * statement inside a `catch` lets its rejection escape as an unhandled rejection while the
 * handler resolves `undefined`. It must be `return`ed, `await`ed, or `throw`n. Opt out with
 * `// await-guard: allow-bare-pass-error - <reason>` on the line above the call.
 *
 * A call that is verifiably synchronous and must stay sync (e.g. it feeds
 * `Array#map` inside a non-async helper) can opt out with a comment on the line
 * above the `return`:
 *
 *   // await-guard: allow-sync-return - <reason>
 *   return syncHelper(x)
 */

/**
 * Given the expression of a `return`, find every `CallExpression` that is
 * actually returned without an intervening `await` - unwrapping the shapes a
 * return commonly takes: parentheses, a ternary's two branches, and the
 * right-hand-side-reachable operands of `||` / `??` (either operand can be
 * the value that ends up returned). Anything already wrapped in `await` is
 * left alone (its calls are not visited, since we don't recurse into
 * AwaitExpression), and we don't chase into unrelated expression shapes
 * (member/call arguments, other binary operators, etc.) to avoid over-flagging.
 *
 * @param {import('typescript').Expression} expr
 * @returns {import('typescript').CallExpression[]}
 */
function findUnawaitedCalls(expr) {
  if (ts.isParenthesizedExpression(expr)) return findUnawaitedCalls(expr.expression)
  if (ts.isCallExpression(expr)) return [expr]

  if (ts.isConditionalExpression(expr)) {
    return [...findUnawaitedCalls(expr.whenTrue), ...findUnawaitedCalls(expr.whenFalse)]
  }

  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken || expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return [...findUnawaitedCalls(expr.left), ...findUnawaitedCalls(expr.right)]
  }

  return []
}

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

  // Walks one block (a try/catch/finally body) looking for `return` statements
  // whose value contains an un-awaited call. `checked` gates whether a hit here
  // is actually flagged: a try block is always checked, a catch/finally block
  // only when it belongs to a try/catch that itself has an ancestor try (see
  // visitTop below) - otherwise there's no outer catch for the rejection to
  // reach anyway. Nested TryStatements and nested function bodies are their
  // own scope and are walked independently (by visitTop), not descended into
  // here, so each return is only ever evaluated once.
  const checkReturnsIn = (block, checked) => {
    const visit = (node) => {
      if (checked && ts.isReturnStatement(node) && node.expression) {
        const calls = findUnawaitedCalls(node.expression)

        if (calls.length && !hasAllowComment(node)) {
          violations.push({ file, line: lineOf(node), text: node.getText(sourceFile).trim().slice(0, 160) })
        }
      }

      if (ts.isFunctionLike(node)) return
      if (ts.isTryStatement(node)) return

      ts.forEachChild(node, visit)
    }

    ts.forEachChild(block, visit)
  }

  // `tryDepth` counts ancestor TryStatements strictly above the current node
  // (in any of their try/catch/finally zones). A TryStatement's own try block
  // is always checked; its catch/finally are checked only once `tryDepth >= 1`,
  // i.e. this try/catch itself sits inside an outer try/catch.
  const visitTop = (node, tryDepth) => {
    if (ts.isTryStatement(node)) {
      checkReturnsIn(node.tryBlock, true)
      if (node.catchClause) checkReturnsIn(node.catchClause.block, tryDepth >= 1)
      if (node.finallyBlock) checkReturnsIn(node.finallyBlock, tryDepth >= 1)
    }

    const nextDepth = ts.isTryStatement(node) ? tryDepth + 1 : tryDepth

    ts.forEachChild(node, (child) => visitTop(child, nextDepth))
  }

  visitTop(sourceFile, 0)

  return violations
}

/**
 * Stops at function-like nodes: a bare passError inside a nested callback within a catch is
 * not flagged (intentional limit; that callback is its own scope).
 *
 * @param {string} file absolute path, used only for error messages
 * @param {string} text file contents
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function findBarePassErrorInCatch(file, text) {
  const scriptKind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind)
  const violations = []

  const isBarePassError = (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'passError'

  const hasAllowComment = (node) => {
    const leadingText = node.getFullText(sourceFile).slice(0, node.getStart(sourceFile) - node.getFullStart())

    return /await-guard:\s*allow-bare-pass-error/.test(leadingText)
  }

  const visitCatch = (node) => {
    if (isBarePassError(node) && !hasAllowComment(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

      violations.push({ file, line, text: node.getText(sourceFile).trim().slice(0, 160) })
    }

    if (ts.isFunctionLike(node)) return

    ts.forEachChild(node, visitCatch)
  }

  const visit = (node) => {
    if (ts.isCatchClause(node)) ts.forEachChild(node.block, visitCatch)

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return violations
}

const scanGlobs = ['server/api/**/*.js', 'server/api/**/*.ts', 'server/routes/**/*.js', 'server/routes/**/*.ts']

function scanRepo(finder = findUnawaitedTryReturns) {
  const root = process.cwd()
  const files = scanGlobs.flatMap((pattern) => globSync(pattern, { cwd: root }))
  const violations = []

  for (const relPath of files) {
    const absPath = join(root, relPath)
    const text = readFileSync(absPath, 'utf8')

    violations.push(...finder(relPath, text))
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

  it('flags an un-awaited call in either branch of a ternary return', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    const ctx = await useRequestContext(event)

    return ctx.localizedHost ? getSystemPagesMap(ctx) : ctx
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/ternary-return.js', fixture)

    expect(violations).toHaveLength(1)
    expect(violations[0].text).toContain('getSystemPagesMap(ctx)')
  })

  it('does not flag a ternary return once both branches are awaited or plain', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    const ctx = await useRequestContext(event)

    return ctx.localizedHost ? await getSystemPagesMap(ctx) : ctx
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/ternary-return-fixed.js', fixture)

    expect(violations).toEqual([])
  })

  it('flags an un-awaited call on either side of || or ??', () => {
    const orFixture = `
export default defineEventHandler(async (event) => {
  try {
    return cached || fetchSomething(event)
  } catch (e) {
    passError(event, e)
  }
})
`
    const nullishFixture = `
export default defineEventHandler(async (event) => {
  try {
    return cached ?? fetchSomething(event)
  } catch (e) {
    passError(event, e)
  }
})
`

    expect(findUnawaitedTryReturns('fixtures/or-return.js', orFixture)).toHaveLength(1)
    expect(findUnawaitedTryReturns('fixtures/nullish-return.js', nullishFixture)).toHaveLength(1)
  })

  it('unwraps a parenthesized return to find the un-awaited call inside', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    return (fetchSomething(event))
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/parenthesized-return.js', fixture)

    expect(violations).toHaveLength(1)
    expect(violations[0].text).toContain('fetchSomething(event)')
  })

  it('flags an un-awaited return inside a catch/finally whose try is nested inside an outer try', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    try {
      return await fetchSomething(event)
    } catch (innerErr) {
      return fetchFallback(event)
    }
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/nested-catch-return.js', fixture)

    expect(violations).toHaveLength(1)
    expect(violations[0].text).toContain('fetchFallback(event)')
  })

  it('does not flag an un-awaited return inside a catch with no outer try', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    return await fetchSomething(event)
  } catch (e) {
    return fetchFallback(event)
  }
})
`
    const violations = findUnawaitedTryReturns('fixtures/top-level-catch-return.js', fixture)

    expect(violations).toEqual([])
  })

  it('has no bare `passError(...)` statement inside a catch block (BL-1247)', () => {
    const violations = scanRepo(findBarePassErrorInCatch)

    if (violations.length) {
      const report = violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join('\n')

      throw new Error(
        `Found ${violations.length} bare passError call(s) inside a catch block. ` +
        `passError is async and always throws, so it must be returned/awaited or its rejection is unhandled ` +
        `and the handler resolves undefined. Use "return passError(...)", or opt out with ` +
        `"// await-guard: allow-bare-pass-error - <reason>" on the line above:\n${report}`,
      )
    }

    expect(violations).toEqual([])
  })

  it('flags a fixture with a bare passError inside a catch', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    return await fetchSomething(event)
  } catch (e) {
    passError(event, e)
  }
})
`
    const violations = findBarePassErrorInCatch('fixtures/bare-pass-error.js', fixture)

    expect(violations).toHaveLength(1)
    expect(violations[0].text).toContain('passError(event, e)')
  })

  it('does not flag a returned, awaited, or thrown passError, nor one outside a catch', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    return await fetchSomething(event)
  } catch (e) {
    if (a) return passError(event, e)
    if (b) await passError(event, e)
    throw await passError(event, e)
  }
})
export const helper = (event, e) => { passError(event, e) }
`

    expect(findBarePassErrorInCatch('fixtures/ok-pass-error.js', fixture)).toEqual([])
  })

  it('respects the bare passError opt-out comment', () => {
    const fixture = `
export default defineEventHandler(async (event) => {
  try {
    return await fetchSomething(event)
  } catch (e) {
    // await-guard: allow-bare-pass-error - fire-and-forget audit path
    passError(event, e)
  }
})
`

    expect(findBarePassErrorInCatch('fixtures/opt-out-pass-error.js', fixture)).toEqual([])
  })
})
