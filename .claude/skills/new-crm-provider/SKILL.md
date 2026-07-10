---
name: new-crm-provider
description: Guide for adding a new CRM provider (HubSpot, Pipedrive, Close, ...) to the SaaS CRM layer via the provider registry. Use when the user says "add a CRM", "new CRM provider", "integrate HubSpot/Pipedrive/<vendor>", or "support another CRM".
---

# Add a CRM provider

All code lives in `packages/api/modules/crm/lib/` (this repo — NEVER in the engine repo; the engine is a generic LiveKit runtime with zero CRM logic). The registry pattern means downstream code (sync, field-mapping UI, connect cards, live-call tools) is vendor-agnostic: you write one provider file and one import line.

Template to copy: `providers/gohighlevel.ts` (with `ghl-client.ts` for the raw API client and `ghl-oauth.ts` for marketplace OAuth).

## 1. Implement `CrmProvider` — `providers/<vendor>.ts`

Implement the interface from `provider.ts`:

- `type` — stable id, e.g. `"hubspot"`
- `validateConnection()` → `{ accountName? }` (used at connect time)
- `listCustomFields()` / `createCustomField(name)` — contact custom fields for the mapping UI
- `updateContactFields(contactId, fields)` — custom-field writes (`{ fieldId, value }` in the vendor's id space)
- `updateContactStandard(contactId, fields)` — standard record fields (firstName, email, address1, …)
- `addContactTags(contactId, tags)` — MUST be additive/idempotent, never clobber existing tags
- `createContactNote(contactId, body)`
- `contactUrl(contactId)` — deep link or null
- `upsertContactByPhone(phone)` — find-or-create; this is what makes calls sync with zero setup
- the lookup-only phone match (display only — must never create)

Put the raw HTTP client in a sibling `<vendor>-client.ts` if it's nontrivial (see `ghl-client.ts`).

## 2. Register it — bottom of the same file

Call `registerCrmProvider({...})` (from `../registry`) with:

- `type`, `label`, `description` — drives the "connect a CRM" card
- `authType`: `"apiKey"` or `"oauth"` (GHL switches on whether OAuth env creds are configured)
- `connectFields` — what the connect dialog collects for apiKey auth (`name`, `label`, `placeholder`, `help`, `secret: true` for tokens)
- `oauth` (if applicable): `getAuthUrl(state)` + `exchangeCode(code)` → `{ config }` (see `ghl-oauth.ts`; `oauth-state.ts` handles state signing)
- `create(config, ctx)` — factory returning your provider. Use `ctx.persist(config)` to save rotated OAuth tokens (see how `resolve.ts` wires it to `updateSourceConfig`).

## 3. The one import line — `resolve.ts`

Provider modules register by side effect. Add:

```ts
import "./providers/<vendor>";
```

next to the existing `import "./providers/gohighlevel";` in `packages/api/modules/crm/lib/resolve.ts`. That's the whole wiring — `resolveCrmProvider(sourceId)` and `listCrmProviders()` pick it up automatically, and the connect UI renders the new card from the registration metadata.

## 4. Field mapping sanity

No per-vendor mapping code should be needed: the standard-field catalog (`standard-fields.ts`, `contact.*` keys) and mapping resolution (`field-mapping.ts`, `custom-fields.ts`, `normalize.ts`) work off the `CrmProvider` surface. If the vendor forces a mapping-layer change, that's a design smell — raise it before hacking around it.

## 5. Verify

- `pnpm type-check` from repo root.
- `cd apps/saas && pnpm test` — baseline: 2 known failures in flow `compile.test.ts` only, 36 pass.
- Manually exercise connect → `validateConnection` → `listCustomFields` against a sandbox account if credentials are available.
