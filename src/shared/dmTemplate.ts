/**
 * Shared pure DM template helpers (D-13, D-15, ADD-16).
 *
 * This module is imported by BOTH the main process (`src/main/ipc/templateChannels.ts`'s
 * re-export, consumed by the TEMPLATE_GET/TEMPLATE_SET IPC handlers and AddExecutor's
 * DmTextProvider closure) and the renderer process (the Add review screen's DM preview,
 * Plan 15-10) — it therefore MUST NEVER import the desktop-shell runtime, any Node
 * builtin, or a schema-validation library. The only way to guarantee the review screen's
 * preview renders byte-identically to what AddExecutor actually sends (D-13) is one
 * shared pure function both processes import — not two copies.
 */

// ── Pure render function (D-15) ────────────────────────────────────────────
// Single-brace regex only: {{ }} i18next double-brace syntax is left untouched
// because each pattern requires exactly one literal '{' and one literal '}'
// around the placeholder name — there is no greedy cross-matching into/out of
// a doubled brace pair.

export function renderTemplate(template: string, vars: { name: string; links: string }): string {
  // WR-03: single pass over BOTH placeholders. vars.name is the add target's own Telegram
  // display name — fully attacker/target-controlled. Two sequential .replace() calls would
  // let a name containing the literal substring "{links}" get inserted by the first call and
  // then re-matched and substituted by the second, corrupting the rendered DM. A single regex
  // with a callback never re-scans substituted content.
  return template.replace(/\{name\}|\{links\}/g, (m) => (m === '{name}' ? vars.name : vars.links))
}

// ── Built-in defaults (used when no template is yet persisted) ─────────────

export const DEFAULT_TEMPLATE_EN =
  "Hi {name}! I'd like to add you to a few groups, but your privacy settings are blocking a direct invite. Here are single-use invite links instead (each one expires in 5 days):\n\n{links}"

export const DEFAULT_TEMPLATE_CS =
  'Dobrý den, {name}, rádi bychom Vás přidali do několika skupin, ale Vaše nastavení soukromí brání přímému pozvání. Zde jsou jednorázové pozvánkové odkazy (každý platí 5 dní):\n\n{links}'

// ── Shared length bound (T-15-04) ───────────────────────────────────────────
// Single source of truth for the DM template length bound, consumed by both the
// main-process schema gate (templateChannels.ts's TemplateSetSchema) and the renderer's
// validateDmTemplate (Plan 15-03) — prevents the two bounds from silently drifting apart.

export const DM_TEMPLATE_MAX_LENGTH = 4000
