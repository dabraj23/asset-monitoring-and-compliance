import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type WorkflowModule = 'CONTRACT' | 'VENDOR' | 'ASSET' | 'DRIVER' | 'COMPLIANCE';
export type WorkflowPhase = 'CLASSIFY' | 'EXTRACT' | 'MATCH' | 'VALIDATE' | 'VERIFY' | 'ROUTE' | 'MONITOR';
export interface WorkflowInstruction {
  id: string;
  module: WorkflowModule;
  phase: WorkflowPhase;
  entityId: string;
  categoryId: string;
  prompt: string;
  requiredDocumentTypes: string[];
  requiredFields: string[];
  blocking: boolean;
  active: boolean;
}
export interface DocumentDefinition {
  id: string;
  module: WorkflowModule;
  code: string;
  label: string;
  fields: string[];
  categoryIds: string[];
  entityIds: string[];
  active: boolean;
}
interface Pack { version: number; publishedAt: string; instructions: WorkflowInstruction[]; documents: DocumentDefinition[] }
interface State { activeVersion: number; draft: Pack; history: Pack[] }
const inStudio = (item: { module: WorkflowModule }, studioModule: WorkflowModule) => item.module === studioModule || (studioModule === 'ASSET' && item.module === 'DRIVER');

const root = process.env.PLATFORM_DATA_DIR ? path.resolve(process.env.PLATFORM_DATA_DIR) : path.join(process.cwd(), '.runtime', 'platform');
const file = path.join(root, 'workflow-config.json');
const assertUniqueActiveInstructions = (instructions: WorkflowInstruction[]) => {
  const scopes = new Set<string>();
  for (const item of instructions.filter(instruction => instruction.active)) {
    const scope = [item.module, item.phase, item.entityId, item.categoryId].join('|');
    if (scopes.has(scope)) throw new Error(`More than one active instruction targets ${item.module} / ${item.phase} / ${item.entityId || 'all entities'} / ${item.categoryId || 'all categories'}. Edit or deactivate a duplicate before publishing.`);
    scopes.add(scope);
  }
};
const defaultInstructions: Array<[WorkflowModule, WorkflowPhase, string]> = [
  ['CONTRACT', 'CLASSIFY', 'Identify signed contract, draft, addendum, amendment, renewal, schedule or supporting document. Explain the evidence for the label and never infer a signature from a filename.'],
  ['CONTRACT', 'EXTRACT', 'Extract exact parties, effective and expiry dates, notice periods, clauses, obligations, renewal triggers, amounts and page or clause references. Do not invent missing terms.'],
  ['VENDOR', 'CLASSIFY', 'Identify the vendor document type using document contents, not only its filename. Distinguish company from personnel evidence.'],
  ['VENDOR', 'EXTRACT', 'Extract exact legal identity, TIN, MSIC, business activity and applicable SST or tourism-tax numbers where present, plus registration, licence scope, certificate dates and page references. Do not invent missing tax details or treat uploaded evidence as a live registry check.'],
  ['ASSET', 'CLASSIFY', 'Identify asset register, vehicle registration, road tax, insurance, maintenance, claim, inspection or photo evidence.'],
  ['ASSET', 'EXTRACT', 'Extract plate, chassis or asset identifier, make, model, dates, odometer, cost and document reference. Keep observations separate from verified compliance.'],
  ['DRIVER', 'CLASSIFY', 'Identify driving licence, competency evidence, assignment record or driver photograph.'],
  ['DRIVER', 'EXTRACT', 'Extract person name, licence class and expiry, masking identity numbers in output. Do not infer that a licence is officially valid from its image alone.'],
  ['COMPLIANCE', 'CLASSIFY', 'Classify evidence as corporate licence, employee competency, site inspection, statutory obligation or remediation record. Distinguish LSH employees from vendor personnel and asset-specific certificates.'],
  ['COMPLIANCE', 'EXTRACT', 'Extract the legal entity, site or department, regulation or requirement, owner, due date, licence or certificate number, expiry and source reference. Never mark compliance passed from a document alone.'],
];
const assetValidationDefaults: WorkflowInstruction[] = ['LIGHT_VEHICLE', 'COMMERCIAL_VEHICLE'].map(categoryId => ({ id: crypto.randomUUID(), module: 'ASSET', phase: 'VALIDATE', entityId: '', categoryId, prompt: 'Require current road-tax and insurance evidence for a vehicle. Treat uploaded documents as evidence, not as an official registry verification. Flag missing, expired or unreviewed evidence.', requiredDocumentTypes: ['ROAD_TAX', 'INSURANCE'], requiredFields: ['expiryDate'], blocking: true, active: true }));
const seed: Pack = {
  version: 1, publishedAt: new Date().toISOString(),
  instructions: [...defaultInstructions.map(([module, phase, prompt]) => ({ id: crypto.randomUUID(), module, phase, entityId: '', categoryId: '', prompt, requiredDocumentTypes: [], requiredFields: [], blocking: true, active: true })), ...assetValidationDefaults],
  documents: [
    ['VENDOR', 'SSM_PROFILE', 'SSM company or business profile', ['companyName', 'registrationNumber', 'address']],
    ['VENDOR', 'MYINVOIS_PROFILE', 'MyInvois taxpayer profile or QR', ['tin', 'registrationNumber', 'msic', 'businessActivity']],
    ['VENDOR', 'SST_REGISTRATION', 'SST registration evidence', ['sstNumber']],
    ['VENDOR', 'TOURISM_TAX_REGISTRATION', 'Tourism tax registration evidence', ['tourismTaxNumber']],
    ['ASSET', 'ROAD_TAX', 'Road tax', ['plate', 'expiryDate']],
    ['ASSET', 'INSURANCE', 'Vehicle insurance', ['plate', 'policyNumber', 'expiryDate']],
    ['ASSET', 'MAINTENANCE', 'Service or maintenance evidence', ['plate', 'serviceDate', 'cost', 'odometer']],
    ['ASSET', 'PMA', 'PMA certificate for a specific regulated machine', ['registrationNumber', 'certificateNumber', 'expiryDate']],
    ['ASSET', 'CERTIFICATE_OF_FITNESS', 'Machine Certificate of Fitness', ['registrationNumber', 'certificateNumber', 'expiryDate']],
    ['ASSET', 'PUSPAKOM', 'PUSPAKOM vehicle inspection', ['registrationNumber', 'expiryDate']],
    ['ASSET', 'PROPERTY_INSURANCE', 'Property insurance', ['registrationNumber', 'expiryDate']],
    ['ASSET', 'PROPERTY_UTILITY', 'Property utility bill', ['registrationNumber', 'amount', 'dueDate']],
    ['ASSET', 'TRAFFIC_SUMMONS', 'Traffic summons', ['registrationNumber', 'amount', 'dueDate']],
    ['DRIVER', 'DRIVING_LICENCE', 'Driving licence', ['personName', 'licenceClass', 'expiryDate']],
    ['CONTRACT', 'ADDENDUM', 'Contract addendum', ['effectiveDate', 'changedClauses']],
    ['CONTRACT', 'RENEWAL', 'Contract renewal', ['effectiveDate', 'expiryDate']],
    ['COMPLIANCE', 'CORPORATE_LICENCE', 'Corporate licence or permit', ['entityName', 'licenceNumber', 'expiryDate']],
    ['COMPLIANCE', 'EMPLOYEE_COMPETENCY', 'LSH employee competency', ['personName', 'competencyScope', 'expiryDate']],
    ['COMPLIANCE', 'SITE_INSPECTION', 'Site inspection evidence', ['siteName', 'inspectionDate', 'finding']],
  ].map(([module, code, label, fields]) => ({ id: crypto.randomUUID(), module: module as WorkflowModule, code: code as string, label: label as string, fields: fields as string[], categoryIds: [], entityIds: [], active: true })),
};

class WorkflowStore {
  private state: State | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  async init() {
    if (this.state) return;
    await fs.mkdir(root, { recursive: true });
    try { this.state = JSON.parse(await fs.readFile(file, 'utf8')) as State; }
    catch (error: any) { if (error?.code !== 'ENOENT') throw error; this.state = { activeVersion: 1, draft: structuredClone(seed), history: [structuredClone(seed)] }; }
    if (!this.state.draft.instructions.some(item => item.module === 'COMPLIANCE')) {
      const additions = seed.instructions.filter(item => item.module === 'COMPLIANCE');
      const documents = seed.documents.filter(item => item.module === 'COMPLIANCE');
      this.state.draft.instructions.push(...structuredClone(additions));
      this.state.draft.documents.push(...structuredClone(documents));
      const active = this.state.history.find(item => item.version === this.state!.activeVersion);
      if (active) { active.instructions.push(...structuredClone(additions)); active.documents.push(...structuredClone(documents)); }
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(this.state, null, 2), 'utf8');
      await fs.rename(temporary, file);
    }
    if (!this.state.draft.instructions.some(item => item.module === 'ASSET' && item.phase === 'VALIDATE')) {
      this.state.draft.instructions.push(...structuredClone(assetValidationDefaults));
      this.state.draft.documents.push(...seed.documents.filter(item => item.module === 'ASSET' && !this.state!.draft.documents.some(existing => existing.module === 'ASSET' && existing.code === item.code)));
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(this.state, null, 2), 'utf8');
      await fs.rename(temporary, file);
    }
  }
  private async mutate<T>(operation: (state: State) => T): Promise<T> {
    await this.init();
    const run = this.queue.then(async () => {
      const result = operation(this.state!);
      const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(this.state, null, 2), 'utf8');
      await fs.rename(temporary, file);
      return structuredClone(result);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async view() { await this.init(); return structuredClone(this.state!); }
  async version() { await this.init(); return this.state!.activeVersion; }
  async documents(module: WorkflowModule, version?: number) {
    await this.init();
    const pack = version ? this.state!.history.find(item => item.version === version) : this.state!.history.find(item => item.version === this.state!.activeVersion);
    return structuredClone((pack?.documents || []).filter(item => item.module === module && item.active));
  }
  async resolve(input: { module: WorkflowModule; phase: WorkflowPhase; entityId?: string; categoryId?: string; version?: number }) {
    await this.init();
    const pack = this.state!.history.find(item => item.version === (input.version || this.state!.activeVersion));
    const matches = (pack?.instructions || []).filter(item => item.active && item.module === input.module && item.phase === input.phase
      && (!item.entityId || item.entityId === input.entityId) && (!item.categoryId || item.categoryId === input.categoryId));
    const score = (item: WorkflowInstruction) => (item.entityId ? 2 : 0) + (item.categoryId ? 1 : 0);
    matches.sort((a, b) => score(b) - score(a));
    return matches[0] ? { ...structuredClone(matches[0]), version: pack!.version } : undefined;
  }
  async saveDraftInstruction(input: WorkflowInstruction) {
    return this.mutate(state => {
      const index = state.draft.instructions.findIndex(item => item.id === input.id);
      if (index < 0) state.draft.instructions.push(input); else state.draft.instructions[index] = input;
      return state.draft;
    });
  }
  async saveDraftDocument(input: DocumentDefinition) {
    return this.mutate(state => {
      if (state.draft.documents.some(item => item.id !== input.id && item.module === input.module && item.code === input.code)) throw new Error('This document code already exists in the selected module. Edit the existing type instead.');
      const index = state.draft.documents.findIndex(item => item.id === input.id);
      if (index < 0) state.draft.documents.push(input); else state.draft.documents[index] = input;
      return state.draft;
    });
  }
  async publish() {
    return this.mutate(state => {
      assertUniqueActiveInstructions(state.draft.instructions);
      const version = state.activeVersion + 1;
      const published = { ...structuredClone(state.draft), version, publishedAt: new Date().toISOString() };
      state.history.push(published);
      state.activeVersion = version;
      state.draft = structuredClone(published);
      return published;
    });
  }
  async publishModule(module: WorkflowModule) {
    return this.mutate(state => {
      const active = state.history.find(item => item.version === state.activeVersion)!;
      const priorDraft = structuredClone(state.draft);
      assertUniqueActiveInstructions(priorDraft.instructions.filter(item => inStudio(item, module)));
      const version = state.activeVersion + 1;
      const published: Pack = {
        version, publishedAt: new Date().toISOString(),
        instructions: [...active.instructions.filter(item => !inStudio(item, module)), ...priorDraft.instructions.filter(item => inStudio(item, module))],
        documents: [...active.documents.filter(item => !inStudio(item, module)), ...priorDraft.documents.filter(item => inStudio(item, module))],
      };
      state.history.push(published);
      state.activeVersion = version;
      state.draft = {
        ...structuredClone(published),
        instructions: [...published.instructions.filter(item => inStudio(item, module)), ...priorDraft.instructions.filter(item => !inStudio(item, module))],
        documents: [...published.documents.filter(item => inStudio(item, module)), ...priorDraft.documents.filter(item => !inStudio(item, module))],
      };
      return published;
    });
  }
  async rollback(version: number) {
    return this.mutate(state => {
      const source = state.history.find(item => item.version === version);
      if (!source) throw new Error('Unknown published version.');
      assertUniqueActiveInstructions(source.instructions);
      const published = { ...structuredClone(source), version: state.activeVersion + 1, publishedAt: new Date().toISOString() };
      state.history.push(published);
      state.activeVersion = published.version;
      state.draft = structuredClone(published);
      return published;
    });
  }
  async rollbackModule(module: WorkflowModule, version: number) {
    return this.mutate(state => {
      const source = state.history.find(item => item.version === version);
      const active = state.history.find(item => item.version === state.activeVersion);
      if (!source || !active) throw new Error('Unknown published version.');
      assertUniqueActiveInstructions(source.instructions.filter(item => inStudio(item, module)));
      const priorDraft = structuredClone(state.draft);
      const published: Pack = {
        version: state.activeVersion + 1, publishedAt: new Date().toISOString(),
        instructions: [...active.instructions.filter(item => !inStudio(item, module)), ...source.instructions.filter(item => inStudio(item, module))],
        documents: [...active.documents.filter(item => !inStudio(item, module)), ...source.documents.filter(item => inStudio(item, module))],
      };
      state.history.push(published);
      state.activeVersion = published.version;
      state.draft = {
        ...structuredClone(published),
        instructions: [...published.instructions.filter(item => inStudio(item, module)), ...priorDraft.instructions.filter(item => !inStudio(item, module))],
        documents: [...published.documents.filter(item => inStudio(item, module)), ...priorDraft.documents.filter(item => !inStudio(item, module))],
      };
      return published;
    });
  }
}
export const workflowStore = new WorkflowStore();
