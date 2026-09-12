import { promises as fs } from 'fs';
import path from 'path';
import type {
  EmailOutboxItem,
  Vendor,
  VendorConfiguration,
  VendorNotification,
  VerificationJob,
} from '../src/vendorTypes.ts';
import { createSeedConfiguration } from './vendorEngine.ts';

const storageRoot = process.env.VENDOR_DATA_DIR
  ? path.resolve(process.env.VENDOR_DATA_DIR)
  : path.join(process.cwd(), '.runtime', 'vendor-management');

const uploadRoot = path.join(storageRoot, 'uploads');

interface StoreState {
  vendors: Vendor[];
  configuration: VendorConfiguration;
  jobs: VerificationJob[];
  notifications: VendorNotification[];
  outbox: EmailOutboxItem[];
}

const files = {
  vendors: path.join(storageRoot, 'vendors.json'),
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
      configuration: await readJson(files.configuration, createSeedConfiguration()),
      jobs: await readJson(files.jobs, []),
      notifications: await readJson(files.notifications, []),
      outbox: await readJson(files.outbox, []),
    };
    this.state.vendors = this.state.vendors.map(vendor => ({
      ...vendor,
      personnel: vendor.personnel || [], documents: vendor.documents || [], verifications: vendor.verifications || [],
      requirementResults: vendor.requirementResults || [], followUps: vendor.followUps || [], approvals: vendor.approvals || [],
      entityLinks: vendor.entityLinks || [], performanceAssessments: vendor.performanceAssessments || [], auditTrail: vendor.auditTrail || [],
    }));

    let jobsChanged = false;
    this.state.jobs = this.state.jobs.map(job => {
      if (!['QUEUED', 'EXTRACTING', 'APPLYING_RULES', 'CHECKING_EXTERNAL_SOURCES'].includes(job.stage)) return job;
      jobsChanged = true;
      return { ...job, stage: 'QUEUED', progress: 0, message: 'Recovered after server restart.', updatedAt: new Date().toISOString() };
    });
    await Promise.all([
      atomicWrite(files.configuration, this.state.configuration),
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
    if (!absolute.startsWith(path.resolve(uploadRoot))) throw new Error('Invalid upload path');
    return absolute;
  }
}

export const vendorStore = new VendorStore();
