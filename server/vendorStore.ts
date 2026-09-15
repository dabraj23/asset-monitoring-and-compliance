import { promises as fs } from 'fs';
import path from 'path';
import type {
  EmailOutboxItem,
  Vendor,
  VendorConfiguration,
  VendorNotification,
  VendorIntakeCase,
  VendorRule,
  VerificationJob,
} from '../src/vendorTypes.ts';
import { createSeedConfiguration } from './vendorEngine.ts';

const storageRoot = process.env.VENDOR_DATA_DIR
  ? path.resolve(process.env.VENDOR_DATA_DIR)
  : path.join(process.cwd(), '.runtime', 'vendor-management');

const uploadRoot = path.join(storageRoot, 'uploads');

interface StoreState {
  vendors: Vendor[];
  intakes: VendorIntakeCase[];
  configuration: VendorConfiguration;
  jobs: VerificationJob[];
  notifications: VendorNotification[];
  outbox: EmailOutboxItem[];
}

const files = {
  vendors: path.join(storageRoot, 'vendors.json'),
  intakes: path.join(storageRoot, 'intakes.json'),
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
  await fs.rename(temporaryPath, filePath);
};

class VendorStore {
  private state: StoreState | null = null;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  async init() {
    if (this.state) return;
    await fs.mkdir(uploadRoot, { recursive: true });
    this.state = {
      vendors: await readJson(files.vendors, []),
      intakes: await readJson(files.intakes, []),
      configuration: await readJson(files.configuration, createSeedConfiguration()),
      jobs: await readJson(files.jobs, []),
      notifications: await readJson(files.notifications, []),
      outbox: await readJson(files.outbox, []),
    };
    this.state.vendors = this.state.vendors.map(vendor => ({
      ...vendor,
      entityId: vendor.entityId || '',
      personnel: vendor.personnel || [], documents: vendor.documents || [], verifications: vendor.verifications || [],
      requirementResults: vendor.requirementResults || [], followUps: vendor.followUps || [], approvals: vendor.approvals || [],
      entityLinks: vendor.entityLinks || [], performanceAssessments: vendor.performanceAssessments || [], performanceEvents: vendor.performanceEvents || [], siteMobilisations: vendor.siteMobilisations || [], auditTrail: vendor.auditTrail || [],
    }));
    const seed = createSeedConfiguration();
    const seedRules = new Map(seed.draftRules.map(rule => [rule.id, rule]));
    const ruleDefaults = (rule: VendorRule): VendorRule => {
      const seeded = seedRules.get(rule.id);
      return {
        ...rule,
        parentRuleId: rule.parentRuleId ?? seeded?.parentRuleId,
        applicabilityMode: rule.applicabilityMode || seeded?.applicabilityMode || 'ALL',
        documentPrompt: rule.documentPrompt || seeded?.documentPrompt || 'Extract exact values from the source with page references. Do not invent missing values.',
        exceptionPrompt: rule.exceptionPrompt || seeded?.exceptionPrompt || 'Route ambiguous, conflicting, incomplete or low-confidence evidence to a human reviewer.',
        minimumConfidence: rule.minimumConfidence ?? seeded?.minimumConfidence ?? 0.8,
        matchTolerance: rule.matchTolerance ?? seeded?.matchTolerance ?? 0,
      };
    };
    this.state.configuration.categories = [
      ...this.state.configuration.categories,
      ...seed.categories.filter(category => !this.state!.configuration.categories.some(existing => existing.id === category.id)),
    ];
    this.state.configuration.draftRules = [
      ...this.state.configuration.draftRules.map(ruleDefaults),
      ...seed.draftRules.filter(rule => !this.state!.configuration.draftRules.some(existing => existing.id === rule.id)),
    ];
    this.state.configuration.publishedVersions = this.state.configuration.publishedVersions.map(version => ({ ...version, rules: version.rules.map(ruleDefaults) }));

    let jobsChanged = false;
    let intakesChanged = false;
    this.state.intakes = this.state.intakes.map(item => {
      if (!['QUEUED', 'EXTRACTING'].includes(item.stage)) return item;
      intakesChanged = true;
      return { ...item, stage: 'QUEUED', message: 'Recovered after server restart.', updatedAt: new Date().toISOString() };
    });
    this.state.jobs = this.state.jobs.map(job => {
      if (!['QUEUED', 'EXTRACTING', 'APPLYING_RULES', 'CHECKING_EXTERNAL_SOURCES'].includes(job.stage)) return job;
      jobsChanged = true;
      return { ...job, stage: 'QUEUED', progress: 0, message: 'Recovered after server restart.', updatedAt: new Date().toISOString() };
    });
    await Promise.all([
      atomicWrite(files.configuration, this.state.configuration),
      intakesChanged ? atomicWrite(files.intakes, this.state.intakes) : Promise.resolve(),
      jobsChanged ? atomicWrite(files.jobs, this.state.jobs) : Promise.resolve(),
    ]);
  }

  private async mutate<T>(collection: keyof StoreState, change: (current: StoreState) => T | Promise<T>): Promise<T> {
    await this.init();
    const operation = this.mutationQueue.then(async () => {
      const result = await change(this.state!);
      await atomicWrite(files[collection], this.state![collection]);
      return result;
    });
    this.mutationQueue = operation.catch(() => undefined);
    return operation;
  }

  async vendors() {
    await this.init();
    return structuredClone(this.state!.vendors);
  }

  async intakes() { await this.init(); return structuredClone(this.state!.intakes); }

  async intake(id: string) { await this.init(); const found = this.state!.intakes.find(item => item.id === id); return found ? structuredClone(found) : undefined; }

  async saveIntake(intake: VendorIntakeCase) {
    return this.mutate('intakes', state => {
      const index = state.intakes.findIndex(item => item.id === intake.id);
      if (index >= 0) state.intakes[index] = structuredClone(intake); else state.intakes.push(structuredClone(intake));
      return structuredClone(intake);
    });
  }

  async saveIntakeUpload(intakeId: string, documentId: string, data: Buffer) {
    const directory = path.join(storageRoot, 'intake-uploads', intakeId);
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, documentId);
    await fs.writeFile(target, data, { flag: 'wx', mode: 0o600 });
    return target;
  }

  async readIntakeUpload(intakeId: string, documentId: string) {
    return fs.readFile(path.join(storageRoot, 'intake-uploads', intakeId, documentId));
  }

  async vendor(id: string) {
    await this.init();
    const found = this.state!.vendors.find(vendor => vendor.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async saveVendor(vendor: Vendor) {
    return this.mutate('vendors', state => {
      const index = state.vendors.findIndex(item => item.id === vendor.id);
      if (index >= 0) state.vendors[index] = structuredClone(vendor);
      else state.vendors.push(structuredClone(vendor));
      return structuredClone(vendor);
    });
  }

  async saveVendors(vendors: Vendor[]) {
    return this.mutate('vendors', state => {
      state.vendors = structuredClone(vendors);
      return structuredClone(state.vendors);
    });
  }

  async configuration() {
    await this.init();
    return structuredClone(this.state!.configuration);
  }

  async saveConfiguration(configuration: VendorConfiguration) {
    return this.mutate('configuration', state => {
      state.configuration = structuredClone(configuration);
      return structuredClone(configuration);
    });
  }

  async jobs() {
    await this.init();
    return structuredClone(this.state!.jobs);
  }

  async job(id: string) {
    await this.init();
    const found = this.state!.jobs.find(job => job.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async saveJob(job: VerificationJob) {
    return this.mutate('jobs', state => {
      const index = state.jobs.findIndex(item => item.id === job.id);
      if (index >= 0) state.jobs[index] = structuredClone(job);
      else state.jobs.unshift(structuredClone(job));
      return structuredClone(job);
    });
  }

  async notifications() {
    await this.init();
    return structuredClone(this.state!.notifications);
  }

  async saveNotifications(notifications: VendorNotification[]) {
    return this.mutate('notifications', state => {
      state.notifications = structuredClone(notifications);
      return structuredClone(notifications);
    });
  }

  async outbox() {
    await this.init();
    return structuredClone(this.state!.outbox);
  }

  async saveOutbox(outbox: EmailOutboxItem[]) {
    return this.mutate('outbox', state => {
      state.outbox = structuredClone(outbox);
      return structuredClone(outbox);
    });
  }

  async saveUpload(vendorId: string, documentId: string, fileName: string, data: Buffer) {
    const targetDirectory = path.join(uploadRoot, vendorId, documentId);
    await fs.mkdir(targetDirectory, { recursive: true });
    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._ -]/g, '_');
    const target = path.join(targetDirectory, safeName);
    await fs.writeFile(target, data);
    return path.relative(storageRoot, target).replace(/\\/g, '/');
  }

  absoluteUploadPath(relativePath: string) {
    const absolute = path.resolve(storageRoot, relativePath);
    const withinUploads = path.relative(path.resolve(uploadRoot), absolute);
    if (!withinUploads || withinUploads === '..' || withinUploads.startsWith(`..${path.sep}`) || path.isAbsolute(withinUploads)) throw new Error('Invalid upload path');
    return absolute;
  }
}

export const vendorStore = new VendorStore();
