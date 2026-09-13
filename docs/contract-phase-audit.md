# Contract management: Phase 1–4 coverage and remaining controls

Reviewed 13 September 2026. This is an implementation audit, not legal advice or a claim that every Malaysian instrument has the same regulatory treatment.

## Delivered in the hybrid demo

| Phase | Working scope |
| --- | --- |
| 1. Corporate context | Add and maintain group entities, subsidiaries, parent relationships, principal activities, sites, aliases and role assignments. Map each contract and obligation to its legal entity and monitoring owner. Circular entity parenting is rejected. |
| 2. Smart Files | Preserve originals with hashes, create a contract family, group documents into signed, lifecycle-change, draft and evidence folders, and run persisted background analysis. AI extracts metadata, clauses and obligations when a configured provider can read the file. Manual classification, clause capture and source-review sign-off are available. |
| 3. Obligation monitoring | Register one-off and recurring obligations, predecessor/successor chains, completion-triggered deadlines and required addendum/renewal evidence. Waiting successors are not prematurely alerted. Accepted lifecycle documents are required before upload-type obligations can be completed. In-app notifications and a demo email outbox are generated for monitored contracts. |
| 4. New contracts | Start from an approved template, edit text, request an AI revision, save/restore draft versions, download a Word-compatible draft, route through a value-sensitive business/legal/finance/authority approval sequence, upload the signed copy and activate monitoring after review. |

## Deliberate review gates

- An addendum, amendment, renewal or schedule is not applied to live dates or obligations merely because it was uploaded. It needs a signed-copy confirmation and an audited accept/reject decision. Accepted AI-proposed clauses and obligations still require human confirmation.
- A high-confidence AI mismatch between the selected and suggested document types needs reviewer confirmation before the document can support activation.
- If AI extraction is unavailable, the original stays preserved but does not count as automatically verified. A reviewer must capture operative terms with page references and sign off the review.
- Draft contracts do not generate live obligation alerts. Existing active monitoring continues during renewal review.

## Not complete for production

1. **Amendment supersession.** The system stores an accepted change and adds new clauses, but it does not determine which old clauses or open obligations were legally superseded, accrued, waived or preserved. Add explicit clause-to-clause supersession decisions, impact preview and review of every affected obligation before relying on a consolidated contract position.
2. **Document authenticity and execution.** “Signed” is a human assertion. There is no digital-signature validation, signatory-authority check, e-signature provider, witnessing/notarisation flow or counterparty acknowledgement. Electronic contracting needs instrument-specific legal review; Malaysia's [Electronic Commerce Act 2006](https://www.investmalaysia.gov.my/media/tv5jwefp/electronic-commerce-act-2006.pdf) has both recognition rules and exclusions.
3. **Stamp duty and retention.** No stamp-duty applicability decision, payment integration, stamp certificate, filing deadline or record-retention enforcement exists. HASiL's current [STSDS guidance](https://www.hasil.gov.my/en/duti-setem/sistem-taksir-sendiri-duti-setem-stsds/) describes phased self-assessment and a seven-year record-keeping requirement for stamped instruments. These should be configurable obligations, with legal/tax ownership.
4. **Privacy and security.** Demo storage is disk-backed JSON and gitignored uploads, not an encrypted, access-controlled enterprise repository. Add authentication, role-based permissions, tenant/entity segregation, encryption and key management, malware scanning, backup/restore, retention/deletion policies and tamper-evident audit. Malaysia's [Personal Data Protection Department](https://www.pdp.gov.my/ppdpv1/en/introduction/) describes duties relevant to personal data in commercial transactions.
5. **AI extraction coverage.** Gemini needs a working configured API key. PDF/image and other MIME support, OCR quality, long-document limits, tables, annexures, bilingual documents and DOCX/XLSX reliability need a tested conversion/extraction pipeline. No success claim should be made merely because the file type is accepted for upload. Low-confidence content requires manual review.
6. **Background operations.** Jobs persist and restart, but there is no production queue, retry policy, dead-letter queue, observability, scheduled re-analysis of newly due obligations, mailbox/host-to-host ingestion, webhook/SFTP intake or outbound email delivery. Dashboard evaluation creates in-app and demo-outbox entries only.
7. **Editor and negotiation.** The editor is text-based with version history and AI revisions. It is not yet a WYSIWYG DOCX editor, clause-level redline, counterparty negotiation workspace or side-by-side amendment comparison. Template version numbers exist, but full immutable template-history snapshots do not.
8. **Approval authority.** The sequence is enforced, but every event currently uses the demo Admin User. Real requester/reviewer/approver identities, delegation, signatory limits, separation of duties and authenticated approval evidence are still needed.
9. **Contract-family intelligence.** Parent/child contracts and related-document links exist, but the repository does not yet produce a legally reviewed consolidated “current terms” view across master agreement, SOW, change order, renewal and addendum. Cross-contract obligations and conflicts need explicit graph and priority rules.
10. **Commercial completeness.** Add configurable workflows for variation orders, price/indexation, acceptance criteria, payment milestones, tax/invoicing, warranties, guarantees/bonds, assignment, change of control, dispute steps, governing law, termination assistance, data return/deletion, survival periods, insurance, performance security and close-out. The current playbook and extracted obligations are a starting point, not an exhaustive contract taxonomy.

## Recommended production gates

Before treating the module as a system of record: validate representative real contracts (including scanned and bilingual examples); obtain legal/tax sign-off for clause and stamp-duty rules; implement authenticated approvals and durable secured storage; prove alert delivery and restoration; and run an amendment-impact test that shows exactly which obligations survive, change or terminate.
