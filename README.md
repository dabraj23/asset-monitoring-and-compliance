<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Asset, Vendor and Contract Intelligence

This application combines fleet/asset management, configurable vendor compliance and an AI-assisted contract lifecycle platform for Malaysia.

Vendor Management includes:

- Dynamic company and personnel requirements driven by category, activity and role.
- CIDB, DOSH, OSHA, MOTAC, CTOS, bank, commercial and organisation-defined rule packs.
- Unstructured document upload, classification, structured extraction and persisted background verification jobs.
- Live DOSH MyKKP verification for competent persons (including crane, scaffolding and steam/boiler roles) and competent companies/FYK registrations, with exact identity, certificate, scope and expiry checks.
- Review-safe official-source connectors: inconclusive, restricted or unavailable checks create human follow-ups and never pass silently.
- Rule versioning and impact previews, staged approvals, suspension/blacklisting, expiry alerts, email outbox and annual weighted performance reviews.
- Links between vendors, qualified operators and Asset Management records.
- Document-prefilled, editable supplier e-Invoice data (TIN, MSIC, business activity and applicable SST/tourism-tax registrations). These are data fields, not a claim that a particular supporting document or live MyInvois validation is mandatory.

The local pilot stores JSON and uploaded evidence under `.runtime/vendor-management`. Writes are atomic and the folder is gitignored. Adapter contracts for future database, object storage, API, webhook and SFTP integrations are in `server/vendorAdapters.ts`.

Contract Management includes:

- Corporate group, subsidiary and joint-venture structures with aliases, principal activities, business units, sites and default role ownership.
- Smart Files for signed agreements, schedules and amendments, with original-file preservation and restart-safe background processing.
- AI-assisted entity resolution, metadata and clause extraction, risk classification, source references and clause-to-obligation conversion.
- Administrator-configurable clause playbooks for required provisions, preferred positions, red-flag terms, severity and entity/activity applicability.
- Audited playbook review queues where deviations must be remediated or explicitly accepted before activation.
- Contract, legal, monitoring, renewal and escalation owners inherited from the correct entity, with per-obligation overrides.
- Configured notice deadlines, recurring obligations, evidence capture, notifications and email-outbox records.
- Controlled new-contract intake, approved templates, a versioned document editor, AI-assisted drafting, legal review, approval and signed-version capture.
- Activation gates that prevent monitoring from starting until the signed source, entity mapping, material clauses and accountable owners are confirmed.
- Links from a contract counterparty to the existing vendor register.

Contract JSON, uploaded originals, background jobs and alert records are stored atomically under `.runtime/contract-management`. Set `CONTRACT_DATA_DIR` when a separate demo storage location is required. Database, object-storage, intelligence, notification, API, webhook and host-to-host ingestion boundaries are defined in `server/contractAdapters.ts`.

The entity-centred workspace also has named accounts, server-side entity access, a collapsed sidebar, an Executive Overview, My Work, a versioned Workflow Studio, a background CSV Intake Queue, separate server-backed Asset and Driver Registers, and an Evidence Queue for vehicle/driver/maintenance/claim documents and photos. Group executives receive masked record summaries and evidence metadata, not raw module records or original files. Owner reminders are written to a durable outbox, not sent as emails.

## Run Locally

**Prerequisites:** Node.js 24 and a local filesystem for `.runtime`.


1. Install dependencies:
   `npm install`
2. Optionally set `GEMINI_API_KEY` in `.env.local` for vendor evidence extraction, contract intelligence, AI drafting and grounded public-source checks. Live DOSH checks do not require Gemini. Without a Gemini key, originals are still preserved and the affected AI steps are marked for review.
   `DOSH_PUBLIC_API_BASE` may be set only when DOSH changes the public MyKKP API base; the current official endpoint is the default.
3. Build and run the local pilot:
   `npm run build`
   `npm start`
4. Open `http://localhost:3000`. On first run, the server prints a one-time setup token. Enter it in the setup form to create the named group administrator and a password of at least 12 characters. Group admins can add named users and assign entity access in Settings.

The Settings screen can save a Gemini key for this laptop pilot, then test the saved key without re-entering it. The key is held in gitignored `.runtime/platform/gemini-key.json` and loaded on restart; it is never returned to or stored in the browser. This local file is not a cloud secret vault. A production cloud pilot requires an approved region, TLS reverse proxy and secret vault before real documents are introduced.

`npm run dev` is available for local development. On restricted Windows filesystems the Vite dependency optimizer may fail to traverse `node_modules`; `npm run build` followed by `npm start` serves the same UI without that optimizer.

## Phase boundaries

Phase 1 is designed for synthetic or redacted demo data: manual 25-file contract/vendor/evidence batches, sample CSV upload, AI proposals and human confirmation, editable workflow prompts and rules, entity-scoped records, executive drill-down, and queued owner reminders. The CSV job stores originals, row outcomes and restart state. Existing browser-local assets remain in local storage until an administrator explicitly imports them into the correct entity; the import retains the browser originals.

The app-managed account and entity-permission model is working locally. A secure cloud pilot has **not** been deployed: cloud region, TLS, backup location and approved data-handling settings must be agreed before any live records move there. Responsive authenticated browser journeys still require a named test account and end-to-end acceptance run with the organisation; the automated suite currently covers rules and APIs.

Phase 2 transport adapters are implemented but **not connected or end-to-end proven**. Set `H2H_SOURCES_FILE` to an access-controlled copy of [h2h-sources.example.json](h2h-sources.example.json) outside the repository after obtaining the actual entity IDs, mappings and credentials. HTTPS pushes use `POST /api/integrations/:sourceId/csv` with a bearer token, `X-Module`, `X-Entity-Id` and `X-Batch-Id`; `GET /api/integrations/:sourceId/jobs/:jobId` returns row-level acknowledgement. SFTP polling uses key authentication and a pinned known-hosts file, leaves incoming files on the source, and can upload an acknowledgement JSON. Both feed the same persisted processor; duplicate source/batch or content submissions reuse the prior job and unknown entity IDs are quarantined for group-admin review. No source runs unless configured.

ERP/HR/fleet reconciliation, actual reminder-email delivery, backup restoration and approved cloud-region rollout still require organisation-provided sources, credentials, infrastructure and data-location approval. Do not describe a queued outbox item or sample CSV as a delivered email or live integration.

## Verify

- TypeScript: `npm run lint`
- Rule engine: `npm test`
- Production bundle: `npm run build`
