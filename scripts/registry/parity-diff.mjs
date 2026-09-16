#!/usr/bin/env node
/**
 * Parity diff (p02-10, BL-990) — documented entry point.
 *
 *   node scripts/registry/parity-diff.mjs --env stg --multi-site-code bl2 \
 *        --dmsm-base https://<dmsm-host>/api --composition-base https://<head-host> \
 *        [--site <code>] [--resume] [--checkpoint <path>]
 *
 * The flags, sources, exit codes and classification rules are all documented on
 * `./parity-cli.mjs`, which this file loads. Everything here is the Node preflight, and nothing
 * else belongs here.
 *
 * ## Why this file is a shell
 *
 * The pipeline compares against the REAL projection and the REAL leak detector rather than a
 * restatement of them, so its dependency graph reaches two TypeScript sources —
 * `shared/utils/leak-detection.ts` and `server/utils/site-registry/projection.ts`. Node can import
 * those only where type stripping is available: it arrived behind a flag in 22.6 and is on by
 * default from 22.18, so the command above dies with an opaque `ERR_UNKNOWN_FILE_EXTENSION` on
 * Node 20 and 21 — versions `package.json` still declares supported (`engines.node: ">=20.0.0"`).
 *
 * Making the graph plain JavaScript instead would mean either converting two production modules
 * that carry the type surface the runtime and `projection.test-d.ts` depend on, or keeping a second
 * divergent copy of the classification rules — exactly the duplication this design rejects. A
 * loader dependency is out for the same reason (no new deps). So the minimum Node version is
 * enforced here, at the one boundary that actually needs it, rather than raised repo-wide: Nuxt and
 * Vitest transpile these imports and are unaffected, so a repo-wide `engines` bump would be a
 * project-level decision this script has no standing to make.
 *
 * The check is a capability probe, not version arithmetic: `process.features.typescript` reports
 * what the running binary will actually do, so a supported version launched with
 * `--no-experimental-strip-types` is caught too. It is deliberately conservative — an unreadable
 * probe refuses with an explanation rather than proceeding into the opaque loader crash.
 *
 * @module scripts/registry/parity-diff
 */

import process from 'node:process'
import { pathToFileURL } from 'node:url'

/** First Node release with type stripping on by default. */
export const MIN_NODE_VERSION = '22.18.0'

/**
 * Explain why this Node cannot load the pipeline, or return `undefined` when it can.
 *
 * Pure, and parameterized so the unit suite can drive every branch without spawning — though the
 * suite spawns a real `node` as well, because Vitest transpiles the `.ts` imports and so cannot
 * observe the failure this guards against.
 *
 * @param {{typescript?: unknown}} features normally `process.features`
 * @param {string} version normally `process.versions.node`
 * @returns {string | undefined}
 */
export function typeStrippingUnsupported(features = process.features, version = process.versions.node) {
  if (features?.typescript) return undefined

  return (
    `Node ${version} cannot run this CLI: it imports TypeScript modules ` +
    '(shared/utils/leak-detection.ts, server/utils/site-registry/projection.ts) and this build ' +
    'has no type stripping, so the import would fail with ERR_UNKNOWN_FILE_EXTENSION. ' +
    `Use Node >= ${MIN_NODE_VERSION}. Note package.json declares engines.node ">=20.0.0" for the ` +
    'app as a whole; this script needs more than the app does. Refusing to run: a parity gate ' +
    'that cannot load its comparison rules must not be mistaken for one that found no difference.'
  )
}

/* `EXIT_USAGE` from parity-core.mjs is unreachable here by design — importing it would pull in the
 * very TypeScript graph this check exists to guard. Kept in sync with that module's value. */
const EXIT_USAGE = 2

const unsupported = typeStrippingUnsupported()

if (unsupported) {
  process.stderr.write(`parity-diff: ${unsupported}\n`)
  process.exitCode = EXIT_USAGE
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { main } = await import('./parity-cli.mjs')
  await main()
}
