import type {
  Contract,
  ContractClause,
  ContractConfiguration,
  ContractDashboardData,
  ContractNotification,
  ContractObligation,
  ContractOwnerSet,
  CorporateEntity,
  ContractEmailOutboxItem,
  ContractReviewIssue,
} from '../src/contractTypes.ts';

const dateOnly = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateOnly(date);
};
const shiftMonths = (value: string, months: number) => {
  const date = new Date(`${value}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return dateOnly(date);
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const calculateNoticeDeadline = (expiryDate?: string, noticePeriodDays?: number) => {
  if (!expiryDate || !noticePeriodDays) return undefined;
  return shiftDays(expiryDate, -noticePeriodDays);
};

export const applicableApprovalStages = (contract: Contract, configuration: ContractConfiguration) => configuration.approvalStages
  .filter(stage => stage.valueThreshold === undefined || contract.value >= stage.valueThreshold);

export const nextApprovalStage = (contract: Contract, configuration: ContractConfiguration) => {
  const latestSubmission = contract.approvals.reduce((last, event, index) => event.decision === 'SUBMITTED' ? index : last, -1);
  if (latestSubmission < 0) return undefined;
  const currentCycle = contract.approvals.slice(latestSubmission + 1);
  return applicableApprovalStages(contract, configuration).find(stage => !currentCycle.some(event => event.stage === stage.name && event.decision === 'APPROVED'));
};

export const createSeedConfiguration = (): ContractConfiguration => ({
  playbookVersion: 1,
  playbookRules: [
    { id: 'playbook-termination', name: 'Termination notice protection', clauseType: 'Termination', applicableContractTypes: [], entityIds: [], principalActivities: [], required: true, preferredPosition: 'Termination for convenience should require at least 30 days written notice. Material breach should include a reasonable cure period.', redFlagTerms: ['without notice', 'at any time without cause'], risk: 'HIGH', ownerRole: 'Legal', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'playbook-liability', name: 'Liability control', clauseType: 'Liability', applicableContractTypes: ['Service Agreement', 'Master Services Agreement', 'Purchase Agreement'], entityIds: [], principalActivities: [], required: true, preferredPosition: 'Aggregate liability should be capped with carefully defined carve-outs approved by Legal.', redFlagTerms: ['unlimited liability', 'all losses whatsoever', 'consequential loss'], risk: 'CRITICAL', ownerRole: 'Legal', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'playbook-compliance', name: 'Regulatory and licence continuity', clauseType: 'Compliance', applicableContractTypes: ['Service Agreement', 'Master Services Agreement'], entityIds: [], principalActivities: ['Construction', 'Facilities management', 'Mechanical and electrical services'], required: true, preferredPosition: 'Supplier must maintain applicable registrations, licences, competent personnel and evidence throughout the term.', redFlagTerms: ['commercially reasonable efforts to comply'], risk: 'HIGH', ownerRole: 'Compliance', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'playbook-data', name: 'Personal data protection', clauseType: 'Data Protection', applicableContractTypes: ['Non-Disclosure Agreement', 'Service Agreement', 'Master Services Agreement'], entityIds: [], principalActivities: [], required: true, preferredPosition: 'Require applicable data protection compliance, limited use, security controls and prompt incident notification.', redFlagTerms: ['unrestricted use of data', 'perpetual right to use personal data'], risk: 'HIGH', ownerRole: 'Legal / Data Protection', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ],
  contractTypes: ['Non-Disclosure Agreement', 'Master Services Agreement', 'Service Agreement', 'Purchase Agreement', 'Lease', 'Employment', 'Memorandum of Understanding', 'Other'],
  clauseTypes: ['Term & Renewal', 'Payment', 'Service Levels', 'Termination', 'Liability', 'Indemnity', 'Insurance', 'Confidentiality', 'Data Protection', 'Compliance', 'Audit Rights', 'Deliverables', 'Notice', 'Governing Law', 'Other'],
  alertDays: [90, 60, 30, 14, 7, 0],
  approvalStages: [
    { id: 'business', name: 'Business Review', role: 'Contract Owner' },
    { id: 'legal', name: 'Legal Review', role: 'Legal' },
    { id: 'finance', name: 'Finance Review', role: 'Finance', valueThreshold: 100000 },
    { id: 'authority', name: 'Approval Authority', role: 'Authorised Signatory' },
  ],
  templates: [
    {
      id: 'nda-mutual', name: 'Mutual NDA', contractType: 'Non-Disclosure Agreement',
      description: 'Approved starting point for two-way confidential information exchange.', approved: true, version: 1,
      requiredClauseTypes: ['Confidentiality', 'Term & Renewal', 'Governing Law', 'Data Protection'], updatedAt: new Date().toISOString(),
      content: `MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is made on {{effectiveDate}} between {{entityLegalName}}, company registration number {{entityRegistrationNumber}}, of {{entityAddress}} ("Company") and {{counterpartyName}}, company registration number {{counterpartyRegistrationNumber}} ("Counterparty").

1. PURPOSE
The parties wish to exchange confidential information for {{purpose}}.

2. CONFIDENTIALITY
Each receiving party must protect Confidential Information using at least reasonable care and use it only for the Purpose. These obligations continue for three years after disclosure.

3. PERMITTED DISCLOSURE
Disclosure is permitted only to personnel who need to know and are bound by equivalent confidentiality obligations, or where required by law.

4. DATA PROTECTION
Each party must comply with applicable Malaysian data protection requirements and promptly notify the other of a material data incident.

5. TERM AND TERMINATION
This Agreement starts on {{effectiveDate}} and expires on {{expiryDate}} unless terminated earlier by 30 days' written notice.

6. GOVERNING LAW
This Agreement is governed by the laws of Malaysia.

Signed for and on behalf of the parties by their authorised representatives.`,
    },
    {
      id: 'services-standard', name: 'Standard Services Agreement', contractType: 'Service Agreement',
      description: 'Company-approved services template with operational, compliance and monitoring clauses.', approved: true, version: 2,
      requiredClauseTypes: ['Payment', 'Service Levels', 'Termination', 'Liability', 'Insurance', 'Compliance', 'Audit Rights'], updatedAt: new Date().toISOString(),
      content: `SERVICES AGREEMENT

This Agreement is entered into on {{effectiveDate}} by {{entityLegalName}} ("Company") and {{counterpartyName}} ("Supplier") for {{purpose}}.

1. SERVICES AND DELIVERABLES
Supplier shall provide the services described in the approved statement of work and meet all agreed milestones and service levels.

2. FEES AND INVOICING
The contract value is {{currency}} {{value}}. Valid invoices are payable within 30 days after acceptance of the relevant deliverable.

3. COMPLIANCE
Supplier shall maintain all licences, registrations, competent personnel and insurance required for the services and provide renewed evidence before expiry.

4. PERFORMANCE AND REPORTING
Supplier shall submit a monthly performance report. Company may require a corrective-action plan for any material service failure.

5. INSURANCE
Supplier shall maintain adequate insurance throughout the Term and provide the certificate and renewal evidence on request.

6. AUDIT
Company may audit compliance records on reasonable notice. Supplier shall retain supporting records for seven years.

7. TERM, RENEWAL AND TERMINATION
The Agreement starts on {{effectiveDate}}, expires on {{expiryDate}}, and may be terminated for material breach or on 60 days' written notice. There is no automatic renewal unless agreed in writing.

8. LIABILITY AND INDEMNITY
Each party remains responsible for losses caused by its negligence, wilful misconduct or breach, subject to the agreed liability framework.

9. GOVERNING LAW
This Agreement is governed by the laws of Malaysia.`,
    },
  ],
});

const assignment = (role: CorporateEntity['roleAssignments'][number]['role'], name: string, email: string, department: string, activity?: string) => ({
  id: crypto.randomUUID(), role, name, email, department, activity,
});

export const createSeedEntities = (): CorporateEntity[] => {
  const now = new Date().toISOString();
  const groupId = 'entity-axcelasia-group';
  const consultingId = 'entity-axcelasia-consulting';
  return [
    {
      id: groupId, legalName: 'Axcelasia Group Berhad', displayName: 'Axcelasia Group', entityType: 'GROUP',
      registrationNumber: '201501035750', jurisdiction: 'Malaysia', registeredAddress: 'Kuala Lumpur, Malaysia', aliases: ['Axcelasia'],
      principalActivities: ['Investment holding', 'Corporate shared services'], businessUnits: ['Group Corporate Services'], sites: ['Group Office'],
      effectiveFrom: '2015-09-29', active: true,
      roleAssignments: [
        assignment('LEGAL_OWNER', 'Aisha Rahman', 'legal@axcelasia.example', 'Group Legal'),
        assignment('FINANCE_OWNER', 'Marcus Lee', 'finance@axcelasia.example', 'Group Finance'),
        assignment('ESCALATION_OWNER', 'Group General Counsel', 'gc@axcelasia.example', 'Group Legal'),
        assignment('SIGNATORY', 'Group CEO', 'ceo@axcelasia.example', 'Executive', undefined),
      ], createdAt: now, updatedAt: now,
    },
    {
      id: consultingId, parentId: groupId, legalName: 'Axcelasia Consulting Sdn Bhd', displayName: 'Consulting Malaysia', entityType: 'SUBSIDIARY',
      registrationNumber: '201801012345', jurisdiction: 'Malaysia', registeredAddress: 'Kuala Lumpur, Malaysia', aliases: ['ACS', 'Axcelasia Consulting'],
      principalActivities: ['Governance, risk and compliance consulting', 'Technology advisory'], businessUnits: ['GRC Advisory', 'Digital Solutions'], sites: ['Kuala Lumpur Office', 'Client Sites'],
      effectiveFrom: '2018-03-21', active: true,
      roleAssignments: [
        assignment('CONTRACT_OWNER', 'Daniel Wong', 'daniel.wong@axcelasia.example', 'Commercial'),
        assignment('MONITORING_OWNER', 'Nadia Karim', 'nadia.karim@axcelasia.example', 'Operations'),
        assignment('RENEWAL_OWNER', 'Nadia Karim', 'nadia.karim@axcelasia.example', 'Operations'),
        assignment('COMPLIANCE_OWNER', 'Farah Lim', 'farah.lim@axcelasia.example', 'Risk & Compliance'),
      ], createdAt: now, updatedAt: now,
    },
    {
      id: 'entity-axcelasia-builders', parentId: groupId, legalName: 'LSH Best Builders Sdn Bhd', displayName: 'LSH Best Builders', entityType: 'SUBSIDIARY',
      registrationNumber: '202001019876', jurisdiction: 'Malaysia', registeredAddress: 'Selangor, Malaysia', aliases: ['LSHBB', 'LSH Builders'],
      principalActivities: ['Construction', 'Facilities management', 'Mechanical and electrical services'], businessUnits: ['Projects', 'Facilities', 'Procurement'], sites: ['Selangor Yard', 'Project Sites'],
      effectiveFrom: '2020-06-15', active: true,
      roleAssignments: [
        assignment('CONTRACT_OWNER', 'Amir Hakim', 'amir.hakim@lsh.example', 'Commercial'),
        assignment('MONITORING_OWNER', 'Siti Amina', 'siti.amina@lsh.example', 'Contract Management'),
        assignment('RENEWAL_OWNER', 'Siti Amina', 'siti.amina@lsh.example', 'Contract Management'),
        assignment('COMPLIANCE_OWNER', 'Ravi Kumar', 'ravi.kumar@lsh.example', 'HSE'),
      ], createdAt: now, updatedAt: now,
    },
  ];
};

export const resolveEntity = (entities: CorporateEntity[], candidates: { legalName?: string; registrationNumber?: string; aliases?: string[] }) => {
  const registration = normalize(candidates.registrationNumber || '');
  if (registration) {
    const exact = entities.find(entity => normalize(entity.registrationNumber) === registration);
    if (exact) return { entityId: exact.id, confidence: 1, reason: 'Exact company registration number match.' };
  }
  const names = [candidates.legalName || '', ...(candidates.aliases || [])].map(normalize).filter(Boolean);
  const ranked = entities.map(entity => {
    const entityNames = [entity.legalName, entity.displayName, ...entity.aliases].map(normalize);
    const exact = names.some(name => entityNames.includes(name));
    const contains = names.some(name => entityNames.some(entityName => entityName.includes(name) || name.includes(entityName)));
    return { entity, confidence: exact ? 0.96 : contains ? 0.78 : 0 };
  }).sort((a, b) => b.confidence - a.confidence);
  return ranked[0]?.confidence ? { entityId: ranked[0].entity.id, confidence: ranked[0].confidence, reason: 'Entity name or alias match.' } : undefined;
};

const findAssignment = (entities: CorporateEntity[], entity: CorporateEntity | undefined, role: CorporateEntity['roleAssignments'][number]['role'], activity?: string) => {
  let current = entity;
  while (current) {
    const candidates = current.roleAssignments.filter(item => item.role === role);
    const activityMatch = candidates.find(item => item.activity && normalize(item.activity) === normalize(activity || ''));
    if (activityMatch) return activityMatch;
    const general = candidates.find(item => !item.activity);
    if (general) return general;
    current = entities.find(item => item.id === current?.parentId);
  }
  return undefined;
};

export const deriveOwners = (entities: CorporateEntity[], entityId: string, activity?: string): ContractOwnerSet => {
  const entity = entities.find(item => item.id === entityId);
  const lookup = (role: CorporateEntity['roleAssignments'][number]['role']) => findAssignment(entities, entity, role, activity);
  const contract = lookup('CONTRACT_OWNER');
  const monitoring = lookup('MONITORING_OWNER');
  const legal = lookup('LEGAL_OWNER');
  const renewal = lookup('RENEWAL_OWNER') || monitoring;
  return {
    contractOwnerName: contract?.name || '', contractOwnerEmail: contract?.email || '',
    monitoringOwnerName: monitoring?.name || '', monitoringOwnerEmail: monitoring?.email || '',
    legalOwnerName: legal?.name || '', legalOwnerEmail: legal?.email || '',
    renewalOwnerName: renewal?.name || '', renewalOwnerEmail: renewal?.email || '',
  };
};

export const applyTemplateContext = (content: string, contract: Pick<Contract, 'counterpartyName' | 'counterpartyRegistrationNumber' | 'purpose' | 'value' | 'currency' | 'effectiveDate' | 'expiryDate'>, entity?: CorporateEntity) => {
  const values: Record<string, string> = {
    entityLegalName: entity?.legalName || '[Legal entity]', entityRegistrationNumber: entity?.registrationNumber || '[Registration number]',
    entityAddress: entity?.registeredAddress || '[Registered address]', counterpartyName: contract.counterpartyName || '[Counterparty]',
    counterpartyRegistrationNumber: contract.counterpartyRegistrationNumber || '[Counterparty registration number]', purpose: contract.purpose || '[Purpose]',
    value: String(contract.value || '[Value]'), currency: contract.currency || 'MYR', effectiveDate: contract.effectiveDate || '[Effective date]', expiryDate: contract.expiryDate || '[Expiry date]',
  };
  return content.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? `[${key}]`);
};

export const getObligationDueDate = (obligation: ContractObligation) => obligation.nextDueDate || obligation.dueDate;

export const refreshObligationStatus = (obligation: ContractObligation, onDate = dateOnly()): ContractObligation => {
  if (['COMPLETED', 'WAIVED', 'DRAFT', 'WAITING'].includes(obligation.status)) return obligation;
  const due = getObligationDueDate(obligation);
  if (!due) return { ...obligation, status: 'OPEN' };
  if (due < onDate) return { ...obligation, status: 'OVERDUE' };
  if (due <= shiftDays(onDate, Math.max(...obligation.alertDays, 30))) return { ...obligation, status: 'DUE_SOON' };
  return { ...obligation, status: 'OPEN' };
};

export const validateActivation = (contract: Contract) => {
  const gaps: string[] = [];
  if (!contract.primaryEntityId) gaps.push('Primary legal entity is not confirmed.');
  if (!contract.counterpartyName) gaps.push('Counterparty is missing.');
  if (!contract.owners.contractOwnerEmail) gaps.push('Contract owner is not assigned.');
  if (!contract.owners.monitoringOwnerEmail) gaps.push('Monitoring owner is not assigned.');
  if (!contract.owners.legalOwnerEmail) gaps.push('Legal owner is not assigned.');
  const signedDocument = contract.documents.find(document => document.authoritative && document.signed);
  if (!signedDocument) gaps.push('No authoritative signed document is identified.');
  else if (signedDocument.extractionStatus !== 'COMPLETED') gaps.push('The authoritative document still requires contract-intelligence review.');
  if (contract.source === 'SIGNED_UPLOAD' && !contract.clauses.length) gaps.push('No operative clauses have been captured from the signed contract.');
  if (contract.clauses.some(clause => clause.material && clause.reviewStatus !== 'CONFIRMED')) gaps.push('Material clauses still require human confirmation.');
  if (contract.obligations.some(obligation => !obligation.ownerEmail || !obligation.monitoringOwnerEmail)) gaps.push('Every obligation must have an accountable and monitoring owner.');
  if (contract.obligations.some(obligation => obligation.status === 'DRAFT')) gaps.push('New obligations must be reviewed and activated.');
  if (contract.documents.some(document => document.changeReviewStatus === 'PENDING')) gaps.push('An addendum, amendment or renewal awaits change-impact review.');
  if (contract.documents.some(document => document.authoritative && document.suggestedDocumentType && document.suggestedDocumentType !== document.documentType && (document.classificationConfidence || 0) >= 0.8 && !document.classificationConfirmed)) gaps.push('An authoritative document has a high-confidence AI classification mismatch that needs reviewer confirmation.');
  if ((contract.reviewIssues || []).some(issue => issue.status === 'OPEN' && ['HIGH', 'CRITICAL'].includes(issue.severity))) gaps.push('High-risk playbook issues must be resolved or explicitly accepted.');
  return gaps;
};

const playbookApplies = (contract: Contract, rule: ContractConfiguration['playbookRules'][number]) => rule.active
  && (!rule.applicableContractTypes.length || rule.applicableContractTypes.includes(contract.contractType))
  && (!rule.entityIds.length || rule.entityIds.includes(contract.primaryEntityId))
  && (!rule.principalActivities.length || rule.principalActivities.some(activity => normalize(activity) === normalize(contract.principalActivity)));

export const evaluateContractAgainstPlaybook = (contract: Contract, configuration: ContractConfiguration): ContractReviewIssue[] => {
  const previous = new Map((contract.reviewIssues || []).map(issue => [issue.id, issue]));
  const issues: ContractReviewIssue[] = [];
  const add = (issue: ContractReviewIssue) => {
    const prior = previous.get(issue.id);
    issues.push(prior && prior.status !== 'OPEN' ? { ...issue, status: prior.status, resolution: prior.resolution, resolvedAt: prior.resolvedAt } : issue);
  };
  for (const rule of configuration.playbookRules.filter(rule => playbookApplies(contract, rule))) {
    const clauses = contract.clauses.filter(clause => normalize(clause.clauseType) === normalize(rule.clauseType));
    if (rule.required && !clauses.length) add({ id: `review-${rule.id}-missing`, ruleId: rule.id, type: 'MISSING_REQUIRED_CLAUSE', title: `${rule.clauseType} clause is required`, detail: `${rule.name}: ${rule.preferredPosition}`, severity: rule.risk, ownerRole: rule.ownerRole, status: 'OPEN', createdAt: new Date().toISOString() });
    for (const clause of clauses) {
      if (clause.confidence < 0.75) add({ id: `review-${clause.id}-confidence`, clauseId: clause.id, type: 'LOW_CONFIDENCE', title: `Confirm low-confidence ${clause.clauseType} extraction`, detail: `${clause.sourceReference} was extracted at ${Math.round(clause.confidence * 100)}% confidence.`, severity: clause.material ? 'HIGH' : 'MEDIUM', ownerRole: rule.ownerRole, status: 'OPEN', createdAt: new Date().toISOString() });
      const matchedFlags = rule.redFlagTerms.filter(term => normalize(clause.sourceText).includes(normalize(term)));
      if (matchedFlags.length || clause.deviation.trim()) {
        const detail = [clause.deviation.trim(), matchedFlags.length ? `Red-flag language: ${matchedFlags.join(', ')}.` : '', `Preferred position: ${rule.preferredPosition}`].filter(Boolean).join(' ');
        add({ id: `review-${rule.id}-${clause.id}`, ruleId: rule.id, clauseId: clause.id, type: 'PLAYBOOK_DEVIATION', title: `${rule.name} deviation`, detail, severity: rule.risk, ownerRole: rule.ownerRole, status: 'OPEN', createdAt: new Date().toISOString() });
        const riskRank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
        if (riskRank[rule.risk] > riskRank[clause.risk]) clause.risk = rule.risk;
      }
    }
  }
  return issues;
};

export const createObligationFromClause = (
  clause: ContractClause,
  contract: Contract,
  entities: CorporateEntity[],
  input: Partial<ContractObligation> = {},
): ContractObligation => {
  const entityId = input.entityId || clause.applicableEntityIds[0] || contract.primaryEntityId;
  const owners = deriveOwners(entities, entityId, contract.principalActivity);
  const now = new Date().toISOString();
  return refreshObligationStatus({
    id: input.id || crypto.randomUUID(), clauseId: clause.id, entityId,
    responsibleParty: input.responsibleParty || clause.responsibleParty,
    title: input.title || clause.heading || `${clause.clauseType} obligation`,
    action: input.action || clause.sourceText,
    ownerName: input.ownerName || owners.contractOwnerName,
    ownerEmail: input.ownerEmail || owners.contractOwnerEmail,
    monitoringOwnerName: input.monitoringOwnerName || owners.monitoringOwnerName,
    monitoringOwnerEmail: input.monitoringOwnerEmail || owners.monitoringOwnerEmail,
    escalationOwnerName: input.escalationOwnerName || owners.legalOwnerName,
    dueDate: input.dueDate,
    nextDueDate: input.nextDueDate,
    recurrence: input.recurrence || 'ON_EVENT', alertDays: input.alertDays || [90, 60, 30, 14, 7, 0],
    evidenceRequired: input.evidenceRequired || 'Evidence of completion', blocking: input.blocking ?? clause.material,
    predecessorId: input.predecessorId, trigger: input.trigger || (input.predecessorId ? 'ON_PREDECESSOR_COMPLETION' : 'IMMEDIATE'),
    triggerOffsetDays: Math.max(0, Number(input.triggerOffsetDays || 0)), actionKind: input.actionKind || 'STANDARD', linkedDocumentId: input.linkedDocumentId,
    status: input.status || (input.predecessorId ? 'WAITING' : 'OPEN'), completionEvidence: input.completionEvidence,
    createdAt: input.createdAt || now, updatedAt: now,
  });
};

export const validateObligationDependency = (obligations: ContractObligation[], obligationId: string, predecessorId?: string) => {
  if (!predecessorId) return;
  if (predecessorId === obligationId) throw new Error('An obligation cannot depend on itself.');
  const predecessor = obligations.find(item => item.id === predecessorId);
  if (!predecessor) throw new Error('The predecessor obligation does not belong to this contract.');
  const visited = new Set<string>([obligationId]);
  let current: ContractObligation | undefined = predecessor;
  while (current) {
    if (visited.has(current.id)) throw new Error('This dependency would create a circular obligation chain.');
    visited.add(current.id);
    current = obligations.find(item => item.id === current?.predecessorId);
  }
};

export const releaseDependentObligations = (obligations: ContractObligation[], completedId: string, completedAt = new Date().toISOString()) => {
  const completedDate = completedAt.slice(0, 10);
  const released: string[] = [];
  const updated = obligations.map(item => {
    if (item.predecessorId !== completedId || item.status !== 'WAITING') return item;
    released.push(item.id);
    const next = { ...item, status: 'OPEN' as const, dueDate: shiftDays(completedDate, item.triggerOffsetDays), updatedAt: completedAt };
    return refreshObligationStatus(next, completedDate);
  });
  return { obligations: updated, releasedIds: released };
};

export const completeObligation = (obligation: ContractObligation, evidence: string, completedAt = new Date().toISOString()) => {
  if (['WAITING', 'DRAFT', 'COMPLETED', 'WAIVED'].includes(obligation.status)) throw new Error('This obligation is not ready for completion.');
  if (!evidence.trim()) throw new Error('Completion evidence or notes are required.');
  if (obligation.recurrence && !['ONCE', 'ON_EVENT'].includes(obligation.recurrence)) {
    const current = obligation.nextDueDate || obligation.dueDate || dateOnly();
    const months = obligation.recurrence === 'MONTHLY' ? 1 : obligation.recurrence === 'QUARTERLY' ? 3 : 12;
    return refreshObligationStatus({ ...obligation, completionEvidence: evidence, completedAt, nextDueDate: shiftMonths(current, months), status: 'OPEN', updatedAt: completedAt });
  }
  return { ...obligation, completionEvidence: evidence, completedAt, status: 'COMPLETED' as const, updatedAt: completedAt };
};

export const buildContractDashboard = (
  contracts: Contract[], configuration: ContractConfiguration, onDate = dateOnly(),
): ContractDashboardData => {
  const monitoredContracts = contracts.filter(contract => ['ACTIVE', 'RENEWAL_REVIEW'].includes(contract.status));
  const upcoming = monitoredContracts.flatMap(contract => {
    const obligationItems: ContractDashboardData['upcoming'] = contract.obligations.filter(obligation => !['WAITING', 'COMPLETED', 'WAIVED', 'DRAFT'].includes(obligation.status)).map(obligation => ({
      contractId: contract.id, contractTitle: contract.title, obligationId: obligation.id, title: obligation.title,
      dueDate: getObligationDueDate(obligation) || '', owner: obligation.ownerName || 'Unassigned', status: refreshObligationStatus(obligation, onDate).status,
    })).filter(item => item.dueDate);
    const renewal: ContractDashboardData['upcoming'] = contract.noticeDeadline ? [{ contractId: contract.id, contractTitle: contract.title, obligationId: undefined, title: 'Renewal / termination notice decision', dueDate: contract.noticeDeadline, owner: contract.owners.renewalOwnerName || 'Unassigned', status: contract.noticeDeadline < onDate ? 'OVERDUE' : 'OPEN' }] : [];
    return [...obligationItems, ...renewal];
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const notifications: ContractNotification[] = [];
  const outbox: ContractEmailOutboxItem[] = [];
  for (const item of upcoming) {
    const days = Math.ceil((new Date(`${item.dueDate}T00:00:00`).getTime() - new Date(`${onDate}T00:00:00`).getTime()) / 86400000);
    if (!(days < 0 || configuration.alertDays.includes(days))) continue;
    const key = `${item.contractId}-${item.obligationId || 'renewal'}-${item.dueDate}-${days}`;
    const email = contracts.find(contract => contract.id === item.contractId)?.obligations.find(obligation => obligation.id === item.obligationId)?.monitoringOwnerEmail
      || contracts.find(contract => contract.id === item.contractId)?.owners.renewalOwnerEmail || '';
    const severity = days < 0 ? 'CRITICAL' as const : days <= 14 ? 'WARNING' as const : 'INFO' as const;
    const message = days < 0 ? `${Math.abs(days)} day(s) overdue.` : days === 0 ? 'Due today.' : `Due in ${days} day(s).`;
    notifications.push({ id: key, contractId: item.contractId, contractTitle: item.contractTitle, obligationId: item.obligationId, ownerEmail: email, title: item.title, message, dueDate: item.dueDate, severity, createdAt: new Date().toISOString() });
    if (email) outbox.push({ id: key, contractId: item.contractId, to: email, subject: `[${severity}] ${item.title} — ${item.contractTitle}`, body: `${message} Due date: ${item.dueDate}. Open the contract workspace to review and record evidence.`, status: 'PENDING_DEMO', createdAt: new Date().toISOString() });
  }

  const obligations = monitoredContracts.flatMap(contract => contract.obligations.map(obligation => refreshObligationStatus(obligation, onDate)));
  return {
    totalContracts: contracts.length,
    activeContracts: monitoredContracts.length,
    draftsInReview: contracts.filter(contract => ['DRAFT', 'LEGAL_REVIEW', 'APPROVAL_PENDING', 'APPROVED'].includes(contract.status)).length,
    entityReview: contracts.filter(contract => contract.status === 'ENTITY_REVIEW').length,
    renewalsDue: monitoredContracts.filter(contract => contract.noticeDeadline && contract.noticeDeadline >= onDate && contract.noticeDeadline <= shiftDays(onDate, 90)).length,
    obligationsDueSoon: obligations.filter(obligation => obligation.status === 'DUE_SOON').length,
    overdueObligations: obligations.filter(obligation => obligation.status === 'OVERDUE').length,
    unassignedObligations: contracts.flatMap(contract => contract.obligations).filter(obligation => !obligation.ownerEmail || !obligation.monitoringOwnerEmail).length,
    openReviewIssues: contracts.reduce((total, contract) => total + (contract.reviewIssues || []).filter(issue => issue.status === 'OPEN').length, 0),
    upcoming: upcoming.slice(0, 30), notifications: notifications.slice(0, 50), outbox: outbox.slice(0, 50),
  };
};

export const createSeedContracts = (entities: CorporateEntity[]): Contract[] => {
  const entity = entities.find(item => item.id === 'entity-axcelasia-builders')!;
  const owners = deriveOwners(entities, entity.id, 'Facilities management');
  const now = new Date().toISOString();
  const expiryDate = shiftDays(dateOnly(), 120);
  const contract: Contract = {
    id: 'contract-demo-facilities', contractNumber: 'CTR-2026-0001', title: 'Facilities Preventive Maintenance Agreement', contractType: 'Service Agreement',
    source: 'SIGNED_UPLOAD', status: 'ACTIVE', primaryEntityId: entity.id, coveredEntityIds: [entity.id], businessUnit: 'Facilities', principalActivity: 'Facilities management', siteOrProject: 'Selangor Yard',
    counterpartyName: 'Metro Engineering Services Sdn Bhd', counterpartyRegistrationNumber: '201901009999', purpose: 'Preventive maintenance for lifts and regulated equipment',
    value: 360000, currency: 'MYR', effectiveDate: shiftDays(dateOnly(), -245), expiryDate, noticePeriodDays: 60, noticeDeadline: shiftDays(expiryDate, -60), autoRenewal: false,
    owners, templateId: 'services-standard', familyType: 'STANDALONE',
    documents: [{ id: 'demo-doc', fileName: 'Facilities Maintenance Agreement - Signed.pdf', mimeType: 'application/pdf', size: 1424000, sha256: 'demo-only', version: 1, documentType: 'SIGNED_CONTRACT', authoritative: true, signed: true, uploadedAt: now, extractionStatus: 'COMPLETED', changeReviewStatus: 'NOT_APPLICABLE', storagePath: 'seed/demo.pdf' }],
    clauses: [], obligations: [], approvals: [], draftContent: '', draftVersions: [], activationGaps: [], reviewIssues: [], auditTrail: [{ id: crypto.randomUUID(), type: 'CONTRACT_ACTIVATED', actor: 'Admin User', summary: 'Signed contract intelligence reviewed and monitoring activated.', createdAt: now }], createdAt: now, updatedAt: now,
  };
  const insuranceClause: ContractClause = { id: 'clause-insurance-demo', clauseNumber: '5', heading: 'Maintain insurance', clauseType: 'Insurance', sourceText: 'Supplier shall maintain adequate insurance throughout the Term and provide renewal evidence before expiry.', sourceReference: 'page 7, clause 5', risk: 'HIGH', deviation: '', applicableEntityIds: [entity.id], responsibleParty: 'COUNTERPARTY', confidence: 0.98, reviewStatus: 'CONFIRMED', material: true };
  const reportClause: ContractClause = { id: 'clause-report-demo', clauseNumber: '4.2', heading: 'Monthly performance report', clauseType: 'Service Levels', sourceText: 'Supplier shall submit its performance report within five business days after each month end.', sourceReference: 'page 6, clause 4.2', risk: 'MEDIUM', deviation: '', applicableEntityIds: [entity.id], responsibleParty: 'COUNTERPARTY', confidence: 0.96, reviewStatus: 'CONFIRMED', material: true };
  contract.clauses = [insuranceClause, reportClause];
  contract.obligations = [
    createObligationFromClause(insuranceClause, contract, entities, { title: 'Obtain renewed insurance certificate', action: 'Request, validate and store the supplier insurance renewal before current cover expires.', dueDate: shiftDays(dateOnly(), 25), evidenceRequired: 'Valid insurance certificate and verification note', blocking: true }),
    createObligationFromClause(reportClause, contract, entities, { title: 'Review monthly performance report', action: 'Receive the supplier performance report, review SLA results and record any corrective action.', recurrence: 'MONTHLY', nextDueDate: shiftDays(dateOnly(), 5), evidenceRequired: 'Accepted monthly report or corrective-action record', blocking: false }),
  ];
  return [contract];
};
