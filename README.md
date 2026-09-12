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

The hybrid demo stores JSON and uploaded evidence under `.runtime/vendor-management`. Writes are atomic and the folder is gitignored. Adapter contracts for future database, object storage, API, webhook and SFTP integrations are in `server/vendorAdapters.ts`.

Contract Management includes:

- Corporate group, subsidiary and joint-venture structures with aliases, principal activities, business units, sites and default role ownership.
- Smart Files for signed agreements, schedules and amendments, with original-file preservation and restart-safe background processing.
- AI-assisted entity resolution, metadata and clause extraction, risk classification, source references and clause-to-obligation conversion.
- Contract, legal, monitoring, renewal and escalation owners inherited from the correct entity, with per-obligation overrides.
- Configured notice deadlines, recurring obligations, evidence capture, notifications and email-outbox records.
- Controlled new-contract intake, approved templates, a versioned document editor, AI-assisted drafting, legal review, approval and signed-version capture.
- Activation gates that prevent monitoring from starting until the signed source, entity mapping, material clauses and accountable owners are confirmed.
- Links from a contract counterparty to the existing vendor register.

Contract JSON, uploaded originals, background jobs and alert records are stored atomically under `.runtime/contract-management`. Set `CONTRACT_DATA_DIR` when a separate demo storage location is required. Database, object-storage, intelligence, notification, API, webhook and host-to-host ingestion boundaries are defined in `server/contractAdapters.ts`.

View your app in AI Studio: https://ai.studio/apps/477544d0-83f6-40df-991d-98e229b1bbcd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Optionally set `GEMINI_API_KEY` in `.env.local` for vendor evidence extraction, contract intelligence, AI drafting and grounded public-source checks. Live DOSH checks do not require Gemini. Without a Gemini key, originals are still preserved and the affected AI steps are marked for review.
   `DOSH_PUBLIC_API_BASE` may be set only when DOSH changes the public MyKKP API base; the current official endpoint is the default.
3. Run the app:
   `npm run dev`

## Verify

- TypeScript: `npm run lint`
- Rule engine: `npm test`
- Production bundle: `npm run build`
