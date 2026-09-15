import { promises as fs } from 'fs';
import path from 'path';
import type {
  Contract,
  ContractConfiguration,
  ContractEmailOutboxItem,
  ContractJob,
  ContractNotification,
  CorporateEntity,
} from '../src/contractTypes.ts';
import { createSeedConfiguration, createSeedContracts, createSeedEntities } from './contractEngine.ts';

const storageRoot = process.env.CONTRACT_DATA_DIR
  ? path.resolve(process.env.CONTRACT_DATA_DIR)
  : path.join(process.cwd(), '.runtime', 'contract-management');
const uploadRoot = path.join(storageRoot, 'uploads');

interface StoreState {
  entities: CorporateEntity[];
  contracts: Contract[];
  configuration: ContractConfiguration;
  jobs: ContractJob[];
  notifications: ContractNotification[];
  outbox: ContractEmailOutboxItem[];
}

const files: Record<keyof StoreState, string> = {
  entities: path.join(storageRoot, 'entities.json'),
  contracts: path.join(storageRoot, 'contracts.json'),
  configuration: path.join(storageRoot, 'configuration.json'),
  jobs: path.join(storageRoot, 'jobs.json'),
  notifications: path.join(storageRoot, 'notifications.json'),
  outbox: path.join(storageRoot, 'email-outbox.json'),
};

const readJson = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn(`Unable to read ${filePath}; using defaults.`, error?.message);
    return fallback;
  }
};

const atomicWrite = async (filePath: string, value: unknown) => {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rename(temporaryPath, filePath);
      return;
    } catch (error: any) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) || attempt === 7) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
};

class ContractStore {
  private state: StoreState | null = null;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  async init() {
    if (this.state) return;
    await fs.mkdir(uploadRoot, { recursive: true });
    const seedEntities = createSeedEntities();
    const seedConfiguration = createSeedConfiguration();
    const storedConfiguration = await readJson<ContractConfiguration>(files.configuration, seedConfiguration);
    this.state = {
      entities: await readJson(files.entities, seedEntities),
      contracts: await readJson(files.contracts, createSeedContracts(seedEntities)),
      configuration: {
        ...seedConfiguration,
        ...storedConfiguration,
        playbookVersion: storedConfiguration.playbookVersion || seedConfiguration.playbookVersion,
        playbookRules: storedConfiguration.playbookRules || seedConfiguration.playbookRules,
      },
      jobs: await readJson(files.jobs, []),
      notifications: await readJson(files.notifications, []),
      outbox: await readJson(files.outbox, []),
    };
    this.state.entities = this.state.entities.map(entity => ({ ...entity, aliases: entity.aliases || [], principalActivities: entity.principalActivities || [], businessUnits: entity.businessUnits || [], sites: entity.sites || [], ownershipInterests: entity.ownershipInterests || [], roleAssignments: entity.roleAssignments || [] }));
    this.state.contracts = this.state.contracts.map(contract => ({ ...contract, coveredEntityIds: contract.coveredEntityIds || [], documents: (contract.documents || []).map(document => ({ ...document, changeReviewStatus: document.changeReviewStatus || 'NOT_APPLICABLE' })), clauses: contract.clauses || [], obligations: (contract.obligations || []).map(obligation => ({ ...obligation, trigger: obligation.trigger || 'IMMEDIATE', triggerOffsetDays: obligation.triggerOffsetDays || 0, actionKind: obligation.actionKind || 'STANDARD' })), approvals: contract.approvals || [], draftVersions: contract.draftVersions || [], activationGaps: contract.activationGaps || [], reviewIssues: contract.reviewIssues || [], auditTrail: contract.auditTrail || [] }));
    let jobsChanged = false;
    this.state.jobs = this.state.jobs.map(job => {
      if (!['QUEUED', 'CLASSIFYING', 'ENTITY_RESOLUTION', 'EXTRACTING_CLAUSES', 'GENERATING_OBLIGATIONS'].includes(job.stage)) return job;
      jobsChanged = true;
      return { ...job, stage: 'QUEUED', progress: 0, message: 'Recovered after server restart.', updatedAt: new Date().toISOString() };
    });
    await Promise.all([
      atomicWrite(files.entities, this.state.entities),
      atomicWrite(files.configuration, this.state.configuration),
      atomicWrite(files.contracts, this.state.contracts),
      jobsChanged ? atomicWrite(files.jobs, this.state.jobs) : Promise.resolve(),
    ]);
  }

  private async mutate<T>(collection: keyof StoreState, change: (state: StoreState) => T | Promise<T>) {
    await this.init();
    const operation = this.mutationQueue.then(async () => {
      const result = await change(this.state!);
      await atomicWrite(files[collection], this.state![collection]);
      return result;
    });
    this.mutationQueue = operation.catch(() => undefined);
    return operation;
  }

  async entities() { await this.init(); return structuredClone(this.state!.entities); }
  async entity(id: string) { await this.init(); const value = this.state!.entities.find(item => item.id === id); return value ? structuredClone(value) : undefined; }
  async saveEntity(entity: CorporateEntity) {
    return this.mutate('entities', state => {
      const index = state.entities.findIndex(item => item.id === entity.id);
      if (index >= 0) state.entities[index] = structuredClone(entity); else state.entities.push(structuredClone(entity));
      return structuredClone(entity);
    });
  }

  async contracts() { await this.init(); return structuredClone(this.state!.contracts); }
  async contract(id: string) { await this.init(); const value = this.state!.contracts.find(item => item.id === id); return value ? structuredClone(value) : undefined; }
  async saveContract(contract: Contract) {
    return this.mutate('contracts', state => {
      const index = state.contracts.findIndex(item => item.id === contract.id);
      if (index >= 0) state.contracts[index] = structuredClone(contract); else state.contracts.push(structuredClone(contract));
      return structuredClone(contract);
    });
  }

  async configuration() { await this.init(); return structuredClone(this.state!.configuration); }
  async saveConfiguration(configuration: ContractConfiguration) { return this.mutate('configuration', state => { state.configuration = structuredClone(configuration); return structuredClone(configuration); }); }

  async jobs() { await this.init(); return structuredClone(this.state!.jobs); }
  async job(id: string) { await this.init(); const value = this.state!.jobs.find(item => item.id === id); return value ? structuredClone(value) : undefined; }
  async saveJob(job: ContractJob) {
    return this.mutate('jobs', state => {
      const index = state.jobs.findIndex(item => item.id === job.id);
      if (index >= 0) state.jobs[index] = structuredClone(job); else state.jobs.unshift(structuredClone(job));
      return structuredClone(job);
    });
  }

  async saveNotifications(notifications: ContractNotification[]) { return this.mutate('notifications', state => { state.notifications = structuredClone(notifications); return structuredClone(notifications); }); }
  async saveOutbox(outbox: ContractEmailOutboxItem[]) { return this.mutate('outbox', state => { state.outbox = structuredClone(outbox); return structuredClone(outbox); }); }

  async saveUpload(contractId: string, documentId: string, fileName: string, data: Buffer) {
    const targetDirectory = path.join(uploadRoot, contractId, documentId);
    await fs.mkdir(targetDirectory, { recursive: true });
    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._ -]/g, '_');
    const target = path.join(targetDirectory, safeName);
    await fs.writeFile(target, data);
    return path.relative(storageRoot, target).replace(/\\/g, '/');
  }

  absoluteUploadPath(relativePath: string) {
    const absolute = path.resolve(storageRoot, relativePath);
    if (!absolute.startsWith(path.resolve(uploadRoot))) throw new Error('Invalid upload path');
    return absolute;
  }
}

export const contractStore = new ContractStore();
