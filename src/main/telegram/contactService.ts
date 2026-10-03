/**
 * contactService.ts — main-process-only, non-blocking wrapper around contacts.AddContact
 * (ADD-05 main-process half, D-08).
 *
 * D-08: contact-add is NOT part of the AddExecutor run. This is a standalone service that
 * Phase 15's "Add to contacts" checkbox calls through the `target:addContact` IPC handler
 * (Plan 14-10). It skips the call when the resolved target is already a contact. Every
 * failure path (including an RPC error) resolves to { ok: false, code } instead of raising.
 */

import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { RateLimitGovernor } from './governor'

export interface ContactServiceDeps {
  client: { invoke(request: unknown): Promise<unknown> }
  governor: RateLimitGovernor
  resolver: {
    getResolvedUser(): {
      id: bigint
      accessHash: bigint
      name?: string
      contact?: boolean
    } | null
  }
}

export interface ContactService {
  addIfMissing(): Promise<{ ok: boolean; code?: string }>
}

export function createContactService(deps: ContactServiceDeps): ContactService {
  return {
    async addIfMissing(): Promise<{ ok: boolean; code?: string }> {
      // D-08: a missing resolution is treated as nothing-to-do, not a failure.
      const resolved = deps.resolver.getResolvedUser()
      if (!resolved) return { ok: true }

      // D-08: already a contact — skip the call entirely.
      if (resolved.contact) return { ok: true }

      const inputUser = new Api.InputPeerUser({
        userId: bigInt(resolved.id.toString()),
        accessHash: bigInt(resolved.accessHash.toString()),
      })

      try {
        await deps.governor.run(() =>
          deps.client.invoke(
            new Api.contacts.AddContact({
              id: inputUser,
              firstName: resolved.name || 'Contact',
              lastName: '',
              phone: '',
            })
          )
        )
        return { ok: true }
      } catch (err) {
        // D-08: swallow — every failure resolves to { ok: false, code } instead of raising.
        const msg = (err as { errorMessage?: string })?.errorMessage ?? 'UNKNOWN'
        return { ok: false, code: msg }
      }
    },
  }
}
