/**
 * tl-update.mjs — refresh vendor/telegram-api.tl from upstream TDLib
 * ====================================================================
 *
 * PURPOSE
 * -------
 * Fetches TDLib's current `telegram_api.tl` schema, strips the fixed MTProto-core
 * preamble lines that are duplicated by GramJS's own bundled schema.tl, and writes
 * the result to `vendor/telegram-api.tl`. This is a RELEASE-TIME step: run it,
 * review the diff, commit it. It never touches `node_modules/` — that's
 * `scripts/tl-apply.mjs` (run separately, wired as the `postinstall` hook).
 *
 * USAGE
 * -----
 *   node scripts/tl-update.mjs
 *   npm run tl:update
 *
 * This script has no CLI options — it always fetches the `master` branch's
 * current schema and overwrites vendor/telegram-api.tl in place.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA_URL = 'https://raw.githubusercontent.com/tdlib/td/master/td/generate/scheme/telegram_api.tl'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const OUTPUT_PATH = resolve(REPO_ROOT, 'vendor/telegram-api.tl')

// Exact-match preamble lines (MTProto core types, already defined elsewhere in GramJS).
const EXACT_DROP_LINES = new Set([
  'int ? = Int;',
  'long ? = Long;',
  'double ? = Double;',
  'string ? = String;',
  'bytes = Bytes;',
  'int256 = Int256;',
])

// Prefix-match preamble lines (constructors GramJS does not need vendored).
const PREFIX_DROP_LINES = ['ipPort#', 'ipPortSecret#', 'accessPointRule#', 'help.configSimple#']

async function main() {
  let text
  try {
    const res = await fetch(SCHEMA_URL)
    if (!res.ok) {
      console.error(`tl-update: fetch of ${SCHEMA_URL} failed with HTTP ${res.status} ${res.statusText}`)
      process.exit(1)
    }
    text = await res.text()
  } catch (err) {
    console.error(`tl-update: network error fetching ${SCHEMA_URL}: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  const inputLines = text.split('\n')
  const outputLines = inputLines.filter((line) => {
    const trimmed = line.trim()
    if (EXACT_DROP_LINES.has(trimmed)) return false
    if (PREFIX_DROP_LINES.some((prefix) => trimmed.startsWith(prefix))) return false
    return true
  })

  const output = outputLines.join('\n').replace(/\n*$/, '\n')

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, output, 'utf-8')

  console.log(
    `tl-update: ${inputLines.length} lines fetched -> ${outputLines.length} lines written -> ${OUTPUT_PATH}`
  )
}

main()
