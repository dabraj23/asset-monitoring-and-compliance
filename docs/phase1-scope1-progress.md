# Phase 1 scope-one progress — Contract, Vendor, Asset

Updated 14 September 2026. This is an implementation and verification record, not a claim of production readiness. Compliance Management, AutoCount, live internal-system feeds and real email-provider delivery are outside this scope.

## Built and exercised

| Module | Working Phase 1 workflows | Automated checks |
| --- | --- | --- |
| Contract | Up to 25 PDF/Word/other files per bundle; document-first signed intake; entity/party/term extraction when Gemini is configured; manual fallback; clause and addendum review; side-by-side draft/amendment comparison; comments; explicit clause supersession and consolidated current terms; extracted-clause/obligation search; staged drafting/approval; chained obligations; owner work; structured payment milestones, owner settlement and separate manual reconciliation; controlled termination/close-out. | API tests cover intake, 25-file staging, activation gates, renewal chain, payments/reconciliation, owner work, close-out and current terms. Search is over extracted data, not a full-text index of every original file. |
| Vendor | Durable pre-creation document cases with 25-file limit, source preservation, AI prefill or visible manual review; editable profiles and tax data; category/personnel requirements; approved governing Contract link; CIDB/DOSH/OSHA applicability; external and manual verification; site-specific named roster, induction and competency checks; owner follow-ups; measured KPI/incident evidence and annual weighted assessments; linked risk cases; approval/lifecycle decisions and audit. | Tests cover contract-status hand-off, site/roster gates, expiry and competency blocking, KPI evidence, persisted intake, risk-case approval gate and same-entity asset/operator links. Restricted official sources never become an automatic pass. |
| Asset & Driver | Separate registers; dated driver–vehicle allocation with licence and duplicate-allocation checks; property, vehicles, machinery and equipment; road tax, insurance, PMA/CoF/PUSPAKOM, maintenance, claims, accidents, summons and property actions; mileage/operating-hour thresholds; owners, follow-ups and successor actions; document queue accepting PDF/Word/spreadsheets/CSV/photos; admin-published custom evidence types with replacement history and category/entity validation. | Tests cover licence/entity assignment gates, operating-hour due status, successor history, PMA intake, custom document acceptance and published requirement pass/fail behaviour. |

All three modules retain original uploaded evidence and use human review before an AI proposal updates a record. Entity checks are enforced in API routes and file downloads; shared-entity visibility still needs end-to-end user-role penetration testing before live data.

## Current limitations and next acceptance work

1. Run responsive browser-flow tests with synthetic group/entity/owner accounts: 25 mixed files, unknown entity, review corrections, rule publishing, owner follow-up, site roster change, payment reconciliation and executive drill-down. The current suite is primarily TypeScript/API/rule tests.
2. Validate real Gemini extraction quality, confidence thresholds and source references on approved sample documents. Without a configured working key, jobs correctly stop for manual review; a passing mock or no-key test is not proof of extraction quality.
3. Contract knowledge search covers extracted current clauses, obligations and filenames only. It does not yet index all original PDF/Word text, and extracted results must be checked against the source.
4. Vendor CTOS/bank checks remain uploaded-document evidence or manual verification until credentials exist. CAPTCHA/login-restricted registries remain review tasks. DOSH automation covers supported public records, not every DOSH record class.
5. Asset evidence updates are human-confirmed. No claim is made that official JPJ/PUSPAKOM/PMA registry checks or telemetry feeds are integrated. Live status is computed from accepted records and configured due rules.
6. Email reminders remain in the durable outbox, not delivered. Real SMTP/provider activation and internal host-to-host connections are Phase 2; the local laptop demo must not label them live.
7. The secure cloud pilot, approved data region, backup/restore and live-data migration are not complete. Keep the demo on synthetic/redacted data until these are approved and tested.

The 14 September 2026 code checks pass after these additions: TypeScript, 57 API/rule tests and a Vite production build. Vite reports a large JavaScript chunk; code splitting remains a performance improvement, not a test failure. The saved Gemini key reaches the provider from the network-enabled laptop server, but the current project returns HTTP 429 for the default model; live AI extraction remains unverified until quota permits a successful request.
