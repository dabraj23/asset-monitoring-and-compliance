# Four-module completeness audit

> Historical baseline only. Several gaps below have since been implemented. See [Phase 1 scope-one progress](./phase1-scope1-progress.md) for the current contract, vendor and asset position.

Reviewed 14 September 2026 against the supplied MECE scope. **AutoCount and other live internal-system integrations are excluded from this audit.** “Present” means there is working code for the stated narrow function, not that the entire module is production-ready. “Partial” means the wider requested workflow cannot yet be demonstrated end to end.

## Executive assessment

| Module | Current position | Main gap before the agreed Phase 1 demo is complete |
| --- | --- | --- |
| Asset Monitoring | Partial | The asset/driver register and document queue work, but property, PMA/Certificate of Fitness, summons, operating-hour maintenance and asset-specific rules are absent. |
| Compliance Management | Not implemented as a shared module | The existing screen is an unsaved local checklist prototype. There is no enterprise obligation, licence, employee-competency or remediation register. |
| Contract Management | Substantial but partial | Document, drafting and obligation flows exist. Structured payment milestones, collaborative redlines/comments and consolidated current terms remain absent. The vendor agreement hand-off is now implemented. |
| Vendor Management | Substantial but partial | Company/person checks and onboarding exist. Contract-status consumption and owner progress/evidence are now implemented; separate vendor/person/site-mobilisation approval remains absent. |

## Ownership rules to enforce

| Information | System of record | Consumer / required link |
| --- | --- | --- |
| Asset, vehicle, machine, property and its inspection/PMA/Certificate of Fitness | Asset | Compliance receives linked status. Vendor may link the responsible supplier/operator. |
| LSH employee CIDB/DOSH competency, licence and site eligibility | Compliance | Asset references operator eligibility where applicable. |
| Vendor personnel CIDB/DOSH competency and site eligibility | Vendor | Compliance receives vendor/site readiness status. |
| Vendor agreement, expiry and contractual payment | Contract | Vendor consumes active/expiring/expired status; it does not own a second agreement copy. |
| Vendor insurance, due diligence, declarations, blacklist and performance | Vendor | Compliance may consume summary status. Contract may consume performance for renewal. |
| Legal/regulatory obligation | Compliance | Relevant modules consume applicability requirements. |
| Contractual obligation and payment | Contract | Vendor/Asset may receive a linked action, without duplicating its source. |

The vendor agreement requirement now reads the linked Contract Management record, including entity, identity, activation and expiry. Older published rule packs with `VENDOR_AGREEMENT` are interpreted as a contract reference at runtime; no published version is silently rewritten. An uploaded vendor agreement alone is not a pass. Other cross-module references remain incomplete. An asset-specific inspection is currently a generic `inspection` document, not a PMA/Certificate of Fitness record ([types.ts](../src/types.ts)).

## 1. Asset Monitoring

| Supplied scope | Status | Evidence and exact gap |
| --- | --- | --- |
| Vehicle, machinery, equipment/crate masters; ownership, location, status | Partial | Categories and ownership/location fields exist. No property category, department/PIC, operating-hour model or equipment-specific master data ([types.ts](../src/types.ts), [assetRoutes.ts](../server/assetRoutes.ts)). |
| Separate driver master, licence expiry and dated allocation | Present for fleet | Driver register and assignment history exist; the API blocks expired licence, cross-entity and duplicate active allocation ([assetRoutes.ts](../server/assetRoutes.ts), [Drivers.tsx](../src/pages/Drivers.tsx)). This is not a full LSH employee competency register. |
| Road tax, insurance, inspection, claims and service history | Partial | Documents, claims and maintenance can be recorded; accepted uploaded evidence updates the asset history ([assetDocumentRoutes.ts](../server/assetDocumentRoutes.ts), [FleetAssets.tsx](../src/pages/FleetAssets.tsx)). PUSPAKOM is not a distinct requirement; accident investigation and traffic summons are not modelled. |
| PMA, Certificate of Fitness, machine inspection and qualified operator linkage | Missing | No machine-certificate type, plant-specific rule, official check or link from the asset to a validated vendor/employee operator. |
| Preventive maintenance by mileage or operating hours; costs and due/overdue actions | Partial | Next date, next odometer and service cost fields exist. No operating-hour trigger, generated work order, recurring schedule or complete due/overdue task lifecycle. |
| Property insurance, maintenance, utilities and statutory inspection | Missing | No property asset or property obligation workflow. |
| Dashboard, alerting and configurable asset rules | Partial | Fleet dashboard and expiry display exist. Asset/driver prompts are now grouped in one studio, but publishing a prompt does not create asset reassessment tasks or a full editable maintenance/statutory rule pack ([WorkflowStudio.tsx](../src/pages/WorkflowStudio.tsx)). |

## 2. Compliance Management

| Supplied scope | Status | Evidence and exact gap |
| --- | --- | --- |
| Regulatory inventory, changes to law and implementation actions | Missing | No shared legal-obligation or regulatory-change store, applicability decision, owner action or change feed. |
| Corporate licences, permits and certifications | Missing | No company/site licence register, expiry jobs or evidence review. The Compliance Prompt Studio has starter types only; nothing in this module calls its AI intake ([workflowStore.ts](../server/workflowStore.ts)). |
| LSH employee onboarding, employment, training, CIDB/DOSH, foreign-worker and site eligibility | Missing | No employee master or employee-level compliance workflow. Vendor personnel checks must not be mistaken for this. |
| Site/department checklist, inspections, photos, findings, remediation and management sign-off | Prototype only | Current checklist values/photos exist only in React memory. Refresh loses them. The former upload/save buttons displayed success without persisting; they have been removed and the page is labelled a prototype ([Compliance.tsx](../src/pages/Compliance.tsx)). |
| KL Tower MOTAC/TOBTAB, fire, SPKA, energy, PPM, gas, ticketing, food licences | Missing as Compliance records | Some document names are included in vendor rules, which is the wrong owner when the licence belongs to LSH/site. PMA for an individual lift or crane should instead be Asset-owned. |
| Compliance dashboard by entity/site/category and monthly report | Missing | The executive overview currently aggregates only Contract, Vendor and Asset ([executiveRoutes.ts](../server/executiveRoutes.ts)). |

The highest-priority build is a server-backed Compliance obligation/licence/employee/checklist domain with entity and site ownership, document intake, findings/remediation, versioned rules, reminders and executive drill-down. Until that exists, this module must not be represented as operational.

## 3. Contract Management

| Supplied scope | Status | Evidence and exact gap |
| --- | --- | --- |
| Entity-mapped repository, classification, metadata, smart files and 25-file intake | Present with review gates | Originals, hashes, jobs, entity mapping, versions and metadata exist. The signed intake screen still asks for considerable profile information before reading files; document-first prefill is not complete ([contractRoutes.ts](../server/contractRoutes.ts), [Contracts.tsx](../src/pages/Contracts.tsx)). |
| Draft → review → approval → executed → active → renewal/expiry | Partial | Drafting and staged approval exist, as do signed activation and renewal review. Termination and close-out lack a dedicated controlled workflow ([contractTypes.ts](../src/contractTypes.ts)). |
| AI drafting, clause review, summaries and amendment comparison | Partial | AI extraction/revision, playbook issues and accepted change proposals exist. No side-by-side redline, clause supersession decision, collaborative comment thread or searchable contract knowledge base. |
| Obligations, notice, successor events, renewal/addendum evidence and My Work | Present for core flow | Dated and chained obligations, owner progress/evidence, outbox reminders and human acceptance gates exist ([contractEngine.ts](../server/contractEngine.ts), [workRoutes.ts](../server/workRoutes.ts)). Email delivery is not live. |
| Contractual payment milestones and dashboard | Partial | A payment may be captured as a generic obligation, but no structured payable/receivable milestone schedule, amount reconciliation or dedicated payment-due dashboard. |
| Vendor agreement hand-off | Present for the core check | Contracts can be linked to a same-entity vendor after registration-number validation. A multi-entity contract may be selected explicitly by a matching vendor in another covered entity. Vendor consumes live status/expiry and blocks approval for missing, draft, expired or mismatched contracts ([vendorAgreement.ts](../server/vendorAgreement.ts), [vendorRoutes.ts](../server/vendorRoutes.ts)). Agreement changes create audited reassessment follow-ups when the Vendor/My Work views or scheduled reminder outbox refresh; human approval is not silently revoked. Direct change-event delivery remains future work. |

The existing focused contract audit ([contract-phase-audit.md](./contract-phase-audit.md)) also identifies signature, stamp-duty, retention and consolidated-terms controls; those remain open unless separately verified.

## 4. Vendor Management

| Supplied scope | Status | Evidence and exact gap |
| --- | --- | --- |
| Company onboarding, categories, documents, tax profile and prefill | Partial | Categories and edit routes exist, with up to 25 files. The wizard now offers document-first prefill for all selected files, conflict notes and visible progress, but this pre-creation prefill is not a durable background job and still requires human review of legal identity/category before the vendor is created. The later upload/verification is persisted ([VendorOnboardingWizard.tsx](../src/components/VendorOnboardingWizard.tsx), [vendorRoutes.ts](../server/vendorRoutes.ts)). |
| Due diligence: CTOS, ABAC, bank, conflict, insurance, tender, legal search | Partial | Rules, evidence extraction and cited legal search exist. CTOS/bank are explicitly document-only/manual without provider credentials. Source quality and adverse-hit decisions still require reviewer judgement ([vendorEngine.ts](../server/vendorEngine.ts), [vendorRoutes.ts](../server/vendorRoutes.ts)). |
| Vendor personnel CIDB/DOSH, role scope, expiry, safety evidence | Partial | Per-person rules and blocking recommendations exist; DOSH connector is implemented for supported public records. CIDB personnel remains CAPTCHA/manual review, and some official searches use grounded web evidence rather than authoritative API verification ([vendorEngine.ts](../server/vendorEngine.ts), [doshConnector.ts](../server/doshConnector.ts)). |
| Distinct vendor approval, personnel approval and site mobilisation readiness | Missing | Vendor has one overall onboarding status and individual requirement results, but no site-specific mobilisation approval object, approved roster snapshot, induction clearance or per-person/site decision ([vendorTypes.ts](../src/vendorTypes.ts)). |
| Ongoing expiry, annual weighted performance, risk, suspension and blacklist | Partial | Notifications/outbox, weighted assessment and lifecycle actions exist. No incident/KPI source capture, automatic site access suspension on personnel expiry or fully separate risk case management. |
| Vendor owner collaboration and dashboard | Partial | Follow-ups appear in My Work and support progress notes, evidence upload/download and completion with owner/entity checks ([MyWork.tsx](../src/pages/MyWork.tsx), [workRoutes.ts](../server/workRoutes.ts)). Dashboard agreement compliance is derived live, but site mobilisation readiness and agreement-specific notification cards remain absent. |

## Cross-module and UI findings

- The collapsible sidebar now groups each module’s register, monitoring, rules and Prompt Studio. Contract and Vendor landing pages focus on the workflow instead of repeating a tab bar. Asset and Driver share a single Asset Prompt Studio area; Compliance, Contract and Vendor each have their own. Module-scoped publishing/restoring keeps another module’s draft unchanged ([Sidebar.tsx](../src/components/Sidebar.tsx), [WorkflowStudio.tsx](../src/pages/WorkflowStudio.tsx), [workflowStore.test.ts](../server/workflowStore.test.ts)).
- The current executive path includes group → entity → activity/site → Contract/Vendor/Asset record, but no Compliance record. The Contract → Vendor agreement hand-off is implemented; other linked status hand-offs remain open ([executiveRoutes.ts](../server/executiveRoutes.ts)).
- The shared intake/asset/vendor/contract pipelines are not yet one configurable process across all four modules. A prompt can be edited for Compliance but is not executed; a new prompt phase does not automatically create the phase’s workflow implementation. Explicit rule semantics and the runtime step sequence must remain separately versioned and tested.
- `My Work` has Contract and Vendor tasks with progress/evidence controls; Asset and Compliance owners do not yet receive tasks there ([workRoutes.ts](../server/workRoutes.ts)).
- Reminder entries are durable outbox records, **not delivered emails**. Live email and live internal-system feeds remain Phase 2 until tested with the organisation’s provider and sources.
- UI review in the local browser confirmed sidebar expand/collapse, module subnavigation, the separate studios and Contract/Vendor workflow landing pages. It also found the misleading Compliance upload/save controls, which were removed. This is a navigation sanity check, not a full responsive or user-acceptance test.

## Completion order (excluding AutoCount)

1. **Contract first.** Complete structured payment milestones, termination/close-out, collaborative review/redline comparison, explicit amendment supersession and consolidated current terms. Replace refresh-time agreement reassessment with direct change-event delivery where needed.
2. **Vendor second.** Convert pre-creation prefill into a durable 25-file case intake, then add separate personnel/site-mobilisation decisions, induction/roster evidence, source-backed risk cases and KPI-backed annual reviews. Keep Contract as the agreement source of truth.
3. **Asset next.** Add property, summons, PMA/Certificate of Fitness, machine/operating-hour maintenance and asset-owned owner tasks and rules.
4. **Compliance last in this sequence.** Build a server-backed entity/site/employee obligation and licence domain, persistent findings/remediation, jobs and executive roll-up. Retire or migrate the local prototype.
5. **Run end-to-end acceptance throughout.** Mixed document/CSV intake, entity scoping, prompt/rule version changes, owner work, follow-up/evidence, cross-module status propagation, expiry/overdue handling and executive reconciliation. Test with synthetic/redacted examples and record the result per scenario.

The current implementation must be described as a **partially implemented Phase 1 demo**, not as the complete four-module platform. Live internal feeds, AutoCount and real email-provider activation are not prerequisites for the demo and are not claimed here.
