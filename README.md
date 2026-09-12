<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Asset Monitoring and Vendor Compliance

This application combines fleet/asset management with a configurable vendor onboarding and compliance platform for Malaysia.

Vendor Management includes:

- Dynamic company and personnel requirements driven by category, activity and role.
- CIDB, DOSH, OSHA, MOTAC, CTOS, bank, commercial and organisation-defined rule packs.
- Unstructured document upload, classification, structured extraction and persisted background verification jobs.
- Review-safe official-source connectors: restricted or unavailable checks create human follow-ups and never pass silently.
- Rule versioning and impact previews, staged approvals, suspension/blacklisting, expiry alerts, email outbox and annual weighted performance reviews.
- Links between vendors, qualified operators and Asset Management records.

The hybrid demo stores JSON and uploaded evidence under `.runtime/vendor-management`. Writes are atomic and the folder is gitignored. Adapter contracts for future database, object storage, API, webhook and SFTP integrations are in `server/vendorAdapters.ts`.

View your app in AI Studio: https://ai.studio/apps/477544d0-83f6-40df-991d-98e229b1bbcd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Optionally set `GEMINI_API_KEY` in `.env.local` for AI extraction and grounded public-source checks. Without a key, the platform records the limitation and creates review tasks.
3. Run the app:
   `npm run dev`

## Verify

- TypeScript: `npm run lint`
- Rule engine: `npm test`
- Production bundle: `npm run build`
