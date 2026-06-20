/**
 * spike-member-tag.mjs — THROWAWAY DEV-ONLY SPIKE SCRIPT
 * =========================================================
 *
 * PURPOSE
 * -------
 * Empirically probe the five spike questions (Q1–Q5) from the member-tag-action
 * design spec (docs/superpowers/specs/2026-06-20-member-tag-action-design.md §3)
 * using a fresh interactive Telegram login.
 *
 * This script is NOT part of the production build. It must never be imported from
 * src/ or included in the Electron build. It exists solely to gate the TagExecutor
 * feature implementation decision.
 *
 * PREREQUISITES
 * -------------
 * 1. Node 20+ (ESM / .mjs)
 * 2. Run from the repo root: node scripts/spike-member-tag.mjs [options]
 * 3. Create a .env file in the repo root with:
 *      MRSPROPER_API_ID=your_api_id_integer
 *      MRSPROPER_API_HASH=your_api_hash_string
 *    (These are your personal api_id/api_hash from my.telegram.org — never the
 *     official client's pair.)
 * 4. npm install must have been run (uses the telegram package from node_modules)
 *
 * USAGE
 * -----
 *   # Full run — fresh login, prompts for phone/code/2FA, then prompts for confirmation:
 *   node scripts/spike-member-tag.mjs --group @testgroup --user @testuser --tag "TESTTAG"
 *
 *   # Skip re-login by passing a saved StringSession from a prior run:
 *   node scripts/spike-member-tag.mjs --group @testgroup --user @testuser --tag "TESTTAG" \
 *     --session "your_saved_session_string_from_prior_run"
 *
 *   # Skip the typed-"yes" confirmation gate (useful for scripted re-runs):
 *   node scripts/spike-member-tag.mjs --group @testgroup --user @testuser --tag "TESTTAG" \
 *     --confirm
 *
 *   # Test clearing a tag (empty string):
 *   node scripts/spike-member-tag.mjs --group @testgroup --user @testuser --tag ""
 *
 *   # Test max-length boundary (Q4):
 *   node scripts/spike-member-tag.mjs --group @testgroup --user @testuser \
 *     --tag "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
 *
 * FINDINGS TABLE (fill in manually after running)
 * ------------------------------------------------
 * | Q# | Question                                          | Finding |
 * |----|---------------------------------------------------|---------|
 * | Q1 | Does editAdmin+rank with all-false rights set     |         |
 * |    | a member tag on a non-admin WITHOUT promoting?   |         |
 * | Q2 | What is the before/after participant.rank field? |         |
 * |    | Does the type change (e.g. Member → Admin)?      |         |
 * | Q3 | What RPC error is returned if the caller lacks   |         |
 * |    | rights (e.g. not supergroup admin)?               |         |
 * | Q4 | What is the max tag length / charset constraint? |         |
 * |    | Empty string — clears tag or errors?              |         |
 * | Q5 | Does editAdmin work on a basic group (Chat)?     |         |
 * |    | (Expected: channels-only, Chat unsupported)       |         |
 *
 * SECURITY NOTES
 * --------------
 * - The StringSession string printed to stdout gives full account access. Keep it secret.
 *   NEVER paste it into a file that gets committed. Pass it back in via --session on
 *   subsequent runs.
 * - The .env file is gitignored. Never commit api_id/api_hash.
 * - This script uses client.invoke() directly (no helper wrappers) and performs a
 *   write call (channels.EditAdmin). Use a test group you control.
 */

// ── Environment loading (must be first) ───────────────────────────────────────
import 'dotenv/config'

// ── Node built-ins ─────────────────────────────────────────────────────────────
import { createRequire } from 'module'
import * as readline from 'readline'

// ── CJS interop for the `telegram` package (GramJS 2.26.22 is CommonJS) ───────
const require = createRequire(import.meta.url)
const { TelegramClient, Api } = require('telegram')
// StringSession is NOT on the package root in GramJS 2.26.22 — it lives in telegram/sessions
const { StringSession } = require('telegram/sessions')

// ── big-integer (same package used in RemovalExecutor.ts) ─────────────────────
const bigInt = require('big-integer')

// ── CLI argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2)
  const result = {
    group: null,
    user: null,
    tag: null,
    session: null,
    confirm: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--group':
        result.group = args[++i] ?? null
        break
      case '--user':
        result.user = args[++i] ?? null
        break
      case '--tag':
        // Allow empty string for "clear" test; next arg may be '' or next flag
        result.tag = args[++i] ?? ''
        break
      case '--session':
        result.session = args[++i] ?? null
        break
      case '--confirm':
        result.confirm = true
        break
      default:
        // Unknown flag — ignore silently
        break
    }
  }

  return result
}

function printUsageAndExit() {
  console.error(`
Usage: node scripts/spike-member-tag.mjs [options]

Required:
  --group <@username|id>    Test group (supergroup or channel)
  --user  <@username|id>    Target member to tag
  --tag   <string>          Tag string to set (use "" to clear)

Optional:
  --session <StringSession> Saved session string from a prior run (skips login)
  --confirm                 Skip the "yes" confirmation prompt

Environment (from .env):
  MRSPROPER_API_ID          Your Telegram api_id (integer)
  MRSPROPER_API_HASH        Your Telegram api_hash (string)

Examples:
  node scripts/spike-member-tag.mjs --group @mygroup --user @alice --tag "TESTTAG"
  node scripts/spike-member-tag.mjs --group @mygroup --user @alice --tag "" --confirm
  node scripts/spike-member-tag.mjs --group @mygroup --user @alice --tag "TAG" \\
    --session "1BVtsOIABu..." --confirm
`)
  process.exit(1)
}

// ── stdin helpers ──────────────────────────────────────────────────────────────

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createReadlineInterface()
    // Write prompt to stderr so it is always visible even if stdout is redirected
    process.stderr.write(question)
    rl.once('line', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// ── BigInt-safe JSON replacer (handles GramJS BigInt values) ──────────────────

function bigIntReplacer(_, value) {
  return typeof value === 'bigint' ? value.toString() : value
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv)

  // Validate required args
  if (args.group === null || args.user === null || args.tag === null) {
    console.error('ERROR: --group, --user, and --tag are all required.')
    printUsageAndExit()
  }

  // Read credentials from environment
  const apiIdRaw = process.env.MRSPROPER_API_ID
  const apiHash = process.env.MRSPROPER_API_HASH

  if (!apiIdRaw || !apiHash) {
    console.error('ERROR: MRSPROPER_API_ID and MRSPROPER_API_HASH must be set in .env')
    process.exit(1)
  }

  const apiId = parseInt(apiIdRaw, 10)
  if (isNaN(apiId)) {
    console.error('ERROR: MRSPROPER_API_ID must be a valid integer')
    process.exit(1)
  }

  console.log('[SPIKE] spike-member-tag.mjs — member tag empirical probe')
  console.log(`[SPIKE] Group : ${args.group}`)
  console.log(`[SPIKE] User  : ${args.user}`)
  console.log(`[SPIKE] Tag   : "${args.tag}"`)
  console.log()

  // ── Client setup ─────────────────────────────────────────────────────────────

  const session = new StringSession(args.session ?? '')
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    floodSleepThreshold: 60,
  })

  // ── Interactive login ─────────────────────────────────────────────────────────

  await client.start({
    phoneNumber: async () => {
      return await prompt('Enter your phone number (with country code, e.g. +420123456789): ')
    },
    phoneCode: async () => {
      return await prompt('Enter the Telegram auth code sent to your app: ')
    },
    password: async (hint) => {
      const hintText = hint ? ` (hint: ${hint})` : ''
      return await prompt(`Enter your 2FA password${hintText}: `)
    },
    onError: (err) => {
      console.error('[AUTH ERROR]', err.message ?? err)
    },
  })

  // Print session string for reuse — operator must copy this manually
  console.log()
  console.log('[SESSION] StringSession to reuse on next run (--session flag):')
  console.log(client.session.save())
  console.log('[SESSION] KEEP THIS SECRET — it grants full account access.')
  console.log('[SESSION] NEVER commit it to git or write it to a file.')
  console.log()

  // ── Q5: Resolve group entity and detect basic-group ──────────────────────────

  console.log(`[Q5] Resolving group: ${args.group}`)
  let groupEntity
  try {
    groupEntity = await client.getEntity(args.group)
  } catch (err) {
    console.error('[ERROR] Could not resolve group entity:', err.message ?? err)
    await client.disconnect()
    process.exit(1)
  }

  const groupConstructor = groupEntity.className ?? groupEntity.constructor?.name ?? 'Unknown'
  console.log(`[Q5] Group entity constructor: ${groupConstructor}`)
  console.log(`[Q5] Group title  : ${groupEntity.title ?? '(no title)'}`)
  console.log(`[Q5] Group id     : ${groupEntity.id?.toString()}`)
  console.log()

  // Basic group (Chat) does not support channels.EditAdmin — it is a channels-only call
  if (groupConstructor === 'Chat') {
    console.log('[Q5] CONFIRMED — entity is a basic Chat (not a supergroup/channel).')
    console.log('[Q5] channels.EditAdmin is a channels-only RPC; it cannot be used on a basic Chat.')
    console.log('[Q5] Skipping write call. Spike complete for Q5.')
    await client.disconnect()
    process.exit(0)
  }

  // ── Resolve target user entity ────────────────────────────────────────────────

  console.log(`[Q2] Resolving user: ${args.user}`)
  let userEntity
  try {
    userEntity = await client.getEntity(args.user)
  } catch (err) {
    console.error('[ERROR] Could not resolve user entity:', err.message ?? err)
    await client.disconnect()
    process.exit(1)
  }

  console.log(`[Q2] User id        : ${userEntity.id?.toString()}`)
  console.log(`[Q2] User username  : ${userEntity.username ?? '(none)'}`)
  console.log(`[Q2] User firstName : ${userEntity.firstName ?? '(none)'}`)
  console.log(`[Q2] User lastName  : ${userEntity.lastName ?? '(none)'}`)
  console.log()

  // ── Q2 pre-call participant snapshot ─────────────────────────────────────────

  console.log('[Q2 PRE-CALL] Fetching participant state before editAdmin...')
  let preParticipant = null
  try {
    const participants = await client.getParticipants(groupEntity, { search: '' })
    const targetIdStr = userEntity.id?.toString()
    preParticipant = participants.find(
      (p) => p.id?.toString() === targetIdStr
    ) ?? null

    if (preParticipant) {
      console.log('[Q2 PRE-CALL] participant object:')
      console.log(JSON.stringify(preParticipant, bigIntReplacer, 2))
    } else {
      console.log('[Q2 PRE-CALL] Target user not found in participant list.')
    }
  } catch (err) {
    console.error('[Q2 PRE-CALL] Could not fetch participants:', err.message ?? err)
  }
  console.log()

  // ── Build InputChannel and InputPeerUser (mirrors RemovalExecutor.ts pattern) ─

  const channelId = bigInt(groupEntity.id?.toString() ?? '0')
  const channelAccessHash = groupEntity.accessHash
    ? bigInt(groupEntity.accessHash.toString())
    : bigInt.zero

  const inputChannel = new Api.InputChannel({
    channelId,
    accessHash: channelAccessHash,
  })

  const inputUser = new Api.InputPeerUser({
    userId: bigInt(userEntity.id?.toString() ?? '0'),
    accessHash: bigInt(userEntity.accessHash?.toString() ?? '0'),
  })

  // ── Confirmation gate ─────────────────────────────────────────────────────────

  const groupTitle = groupEntity.title ?? args.group
  const groupIdStr = groupEntity.id?.toString() ?? 'unknown'
  const userDisplay =
    userEntity.firstName
      ? `${userEntity.firstName}${userEntity.lastName ? ' ' + userEntity.lastName : ''}` +
        (userEntity.username ? ` (@${userEntity.username})` : '')
      : (userEntity.username ? `@${userEntity.username}` : String(userEntity.id))

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('ABOUT TO CALL: channels.EditAdmin')
  console.log(`  group       : ${groupTitle} (id: ${groupIdStr})`)
  console.log(`  user        : ${userDisplay} (id: ${userEntity.id?.toString()})`)
  console.log(`  rank        : "${args.tag}"`)
  console.log('  adminRights : ChatAdminRights{} (all flags false/omitted)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log()

  if (!args.confirm) {
    const answer = await prompt("Type 'yes' to proceed: ")
    if (answer !== 'yes') {
      console.log('Aborted.')
      await client.disconnect()
      process.exit(0)
    }
  } else {
    console.log('[--confirm flag set] Skipping confirmation prompt. Proceeding...')
  }

  console.log()

  // ── The editAdmin call (Q1 / Q2 / Q3 probe) ──────────────────────────────────

  let editAdminSuccess = false
  try {
    const result = await client.invoke(
      new Api.channels.EditAdmin({
        channel: inputChannel,
        userId: inputUser,
        adminRights: new Api.ChatAdminRights({}), // all flags omitted → all false
        rank: args.tag,
      })
    )
    editAdminSuccess = true
    console.log('[Q1/Q2] editAdmin succeeded. Raw result:')
    console.log(JSON.stringify(result, bigIntReplacer, 2))
    console.log()
    console.log('[Q1] If the call succeeded with all-false adminRights: confirm Q1 by inspecting')
    console.log('[Q1] the POST-CALL participant snapshot below — if rank is set without promotion,')
    console.log('[Q1] Q1 = YES (stock GramJS 2.26.22 can set member tags without admin elevation).')
  } catch (err) {
    console.log('[Q3] RPC error — errorMessage:', err.errorMessage ?? err.message ?? '(none)')
    console.log('[Q3] Full error:')
    console.error(err)
    console.log()
    console.log('[Q3] Common error codes and what they mean:')
    console.log('[Q3]   CHAT_ADMIN_REQUIRED — caller is not an admin in this group')
    console.log('[Q3]   USER_NOT_PARTICIPANT — target user is not a member')
    console.log('[Q3]   USER_ADMIN_INVALID  — cannot demote/tag this user (e.g., owner)')
    console.log('[Q3]   ADMINS_TOO_MUCH     — admin list is full')
    console.log('[Q3]   RANK_INVALID        — tag string rejected (charset or length)')
    console.log('[Q3]   RIGHT_FORBIDDEN     — caller\'s admin rights do not permit EditAdmin')
  }

  console.log()

  // ── Q2 post-call participant snapshot ────────────────────────────────────────

  console.log('[Q2 POST-CALL] Fetching participant state after editAdmin...')
  try {
    const participants = await client.getParticipants(groupEntity, { search: '' })
    const targetIdStr = userEntity.id?.toString()
    const postParticipant = participants.find(
      (p) => p.id?.toString() === targetIdStr
    ) ?? null

    if (postParticipant) {
      console.log('[Q2 POST-CALL] participant object:')
      console.log(JSON.stringify(postParticipant, bigIntReplacer, 2))
      console.log()
      if (preParticipant) {
        const preClass = preParticipant.participant?.className ?? preParticipant.className ?? '?'
        const postClass = postParticipant.participant?.className ?? postParticipant.className ?? '?'
        const preRank = preParticipant.participant?.rank ?? preParticipant.rank ?? '(none)'
        const postRank = postParticipant.participant?.rank ?? postParticipant.rank ?? '(none)'
        console.log('[Q2 DIFF] Participant type before :', preClass)
        console.log('[Q2 DIFF] Participant type after  :', postClass)
        console.log('[Q2 DIFF] Rank before             :', JSON.stringify(preRank))
        console.log('[Q2 DIFF] Rank after              :', JSON.stringify(postRank))
        if (editAdminSuccess) {
          if (preClass !== postClass) {
            console.log('[Q2] PARTICIPANT TYPE CHANGED — user may have been promoted to admin.')
          } else {
            console.log('[Q2] Participant type unchanged — no admin promotion observed.')
          }
          if (preRank !== postRank) {
            console.log('[Q2] Rank field changed — tag was set or cleared.')
          } else {
            console.log('[Q2] Rank field unchanged — tag may not have been applied.')
          }
        }
      }
    } else {
      console.log('[Q2 POST-CALL] Target user not found in participant list.')
    }
  } catch (err) {
    console.error('[Q2 POST-CALL] Could not fetch participants:', err.message ?? err)
  }

  // ── Q4 guidance ───────────────────────────────────────────────────────────────

  console.log()
  console.log('[Q4] To test max-length/charset: re-run with --tag "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" (33 chars)')
  console.log('[Q4]      or --tag "" (empty) and observe the RPC error message above.')
  console.log('[Q4] Expected: Telegram enforces a max of 16 chars for admin rank titles.')
  console.log('[Q4] Observe RANK_INVALID or similar if the limit is exceeded.')

  // ── Graceful disconnect ────────────────────────────────────────────────────────

  console.log()
  console.log('[SPIKE] Done. Disconnecting...')
  await client.disconnect()
  console.log('[SPIKE] Disconnected. Spike complete.')
  process.exit(0)
}

main().catch((err) => {
  console.error('[FATAL]', err)
  process.exit(1)
})
