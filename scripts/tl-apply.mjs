/**
 * tl-apply.mjs — apply vendor/telegram-api.tl into node_modules/telegram
 * ==========================================================================
 *
 * PURPOSE
 * -------
 * Makes the vendored layer-229 TL schema (`vendor/telegram-api.tl`) real inside
 * the installed `telegram` (GramJS) package: writes it as the package's `api.tl`,
 * regenerates `apiTl.js` / `schemaTl.js` / `api.d.ts` via the package's own
 * `tl/generateModule.js`, and bumps the `LAYER` constant in `AllTLObjects.js` /
 * `AllTLObjects.d.ts` to 229.
 *
 * Wired as the `postinstall` npm lifecycle hook — runs automatically, unattended,
 * on every `npm install` (every contributor + CI). It is also exposed as
 * `npm run tl:apply` for re-running manually after a branch switch without a
 * fresh `npm install`.
 *
 * Each step fails loudly (non-zero exit + descriptive message) — a postinstall
 * hook must never partially apply and continue silently.
 *
 * Idempotent: running this script twice in a row leaves node_modules/telegram
 * in the same end state both times.
 *
 * USAGE
 * -----
 *   node scripts/tl-apply.mjs
 *   npm run tl:apply
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPECTED_TELEGRAM_VERSION = '2.26.22'
const TARGET_LAYER = 229

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const TELEGRAM_PKG_DIR = resolve(REPO_ROOT, 'node_modules/telegram')
const VENDOR_API_TL = resolve(REPO_ROOT, 'vendor/telegram-api.tl')

function fail(message) {
  console.error(`tl-apply: ${message}`)
  process.exit(1)
}

function main() {
  // 1. Version guard.
  const pkgJsonPath = resolve(TELEGRAM_PKG_DIR, 'package.json')
  if (!existsSync(pkgJsonPath)) {
    fail(
      `cannot find ${pkgJsonPath} — is 'telegram' installed? Run 'npm install' first.`
    )
  }
  let telegramPkg
  try {
    telegramPkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  } catch (err) {
    fail(`failed to parse ${pkgJsonPath}: ${err instanceof Error ? err.message : err}`)
  }
  if (telegramPkg.version !== EXPECTED_TELEGRAM_VERSION) {
    fail(
      `installed 'telegram' package version is '${telegramPkg.version}', expected ` +
        `'${EXPECTED_TELEGRAM_VERSION}'. This script's file-layout assumptions are pinned to ` +
        `${EXPECTED_TELEGRAM_VERSION} — review scripts/tl-apply.mjs compatibility against the new ` +
        `version before proceeding.`
    )
  }

  if (!existsSync(VENDOR_API_TL)) {
    fail(`vendor file not found at ${VENDOR_API_TL} — run 'npm run tl:update' first.`)
  }

  // 2. Ensure static dir.
  const staticDir = resolve(TELEGRAM_PKG_DIR, 'tl/static')
  mkdirSync(staticDir, { recursive: true })

  // 3. Write api.tl (verbatim copy of the vendored schema).
  const apiTlDest = resolve(staticDir, 'api.tl')
  copyFileSync(VENDOR_API_TL, apiTlDest)

  // 4. Reconstruct schema.tl from the package's existing schemaTl.js.
  const schemaTlJsPath = resolve(TELEGRAM_PKG_DIR, 'tl/schemaTl.js')
  if (!existsSync(schemaTlJsPath)) {
    fail(`cannot find ${schemaTlJsPath} — unexpected 'telegram' package layout.`)
  }
  const schemaTlJsContent = readFileSync(schemaTlJsPath, 'utf-8')
  const firstBacktick = schemaTlJsContent.indexOf('`')
  const lastBacktick = schemaTlJsContent.lastIndexOf('`')
  if (firstBacktick === -1 || lastBacktick === -1 || firstBacktick === lastBacktick) {
    fail(`${schemaTlJsPath} did not have the expected 'module.exports = \`...\`;' shape.`)
  }
  const escapedSchema = schemaTlJsContent.slice(firstBacktick + 1, lastBacktick)
  const schemaTl = escapedSchema.replace(/\\`/g, '`')
  const schemaTlDest = resolve(staticDir, 'schema.tl')
  writeFileSync(schemaTlDest, schemaTl, 'utf-8')

  // 5. Regenerate apiTl.js / schemaTl.js / api.d.ts via the package's own generator.
  const generateModulePath = resolve(TELEGRAM_PKG_DIR, 'tl/generateModule.js')
  if (!existsSync(generateModulePath)) {
    fail(`cannot find ${generateModulePath} — unexpected 'telegram' package layout.`)
  }
  try {
    execFileSync(process.execPath, [generateModulePath], { stdio: 'inherit' })
  } catch (err) {
    fail(
      `generateModule.js failed: ${err instanceof Error ? err.message : err}. ` +
        `node_modules/telegram may be left in a partially-regenerated state — ` +
        `consider reinstalling the 'telegram' package and re-running this script.`
    )
  }

  // 6. Bump LAYER in AllTLObjects.js.
  const allTlObjectsJsPath = resolve(TELEGRAM_PKG_DIR, 'tl/AllTLObjects.js')
  bumpLayerConstant(allTlObjectsJsPath, /exports\.LAYER = \d+;/, `exports.LAYER = ${TARGET_LAYER};`)

  // 7. Bump LAYER in AllTLObjects.d.ts.
  const allTlObjectsDtsPath = resolve(TELEGRAM_PKG_DIR, 'tl/AllTLObjects.d.ts')
  bumpLayerConstant(
    allTlObjectsDtsPath,
    /export declare const LAYER = \d+;/,
    `export declare const LAYER = ${TARGET_LAYER};`
  )

  // 8. Sanity boot — require the freshly-regenerated package fresh in a child process.
  const sanityScript = `
    const allTl = require(${JSON.stringify(allTlObjectsJsPath)});
    const { Api } = require(${JSON.stringify(TELEGRAM_PKG_DIR)});
    const hex = (n) => '0x' + (n >>> 0).toString(16);
    console.log('tl-apply: AllTLObjects.LAYER =', allTl.LAYER);
    console.log('tl-apply: Api.ChannelParticipant.CONSTRUCTOR_ID =', hex(Api.ChannelParticipant.CONSTRUCTOR_ID));
  `
  try {
    execFileSync(process.execPath, ['-e', sanityScript], { stdio: 'inherit' })
  } catch (err) {
    fail(
      `sanity boot failed — the regenerated 'telegram' package does not load cleanly: ` +
        `${err instanceof Error ? err.message : err}`
    )
  }

  console.log('tl-apply: done — node_modules/telegram is now at TL layer', TARGET_LAYER)
}

function bumpLayerConstant(filePath, pattern, replacement) {
  if (!existsSync(filePath)) {
    fail(`cannot find ${filePath} — unexpected 'telegram' package layout.`)
  }
  const content = readFileSync(filePath, 'utf-8')
  if (!pattern.test(content)) {
    fail(`${filePath} did not match the expected LAYER pattern ${pattern} — refusing to write a no-op.`)
  }
  const updated = content.replace(pattern, replacement)
  writeFileSync(filePath, updated, 'utf-8')
}

main()
