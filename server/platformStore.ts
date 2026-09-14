import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type PlatformRole = 'GROUP_ADMIN' | 'EXECUTIVE' | 'ENTITY_ADMIN' | 'OWNER';

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  entityIds: string[];
  passwordHash: string;
  active: boolean;
  createdAt: string;
}

interface Session { tokenHash: string; userId: string; expiresAt: string }

interface PlatformState { users: PlatformUser[]; sessions: Session[] }

const root = process.env.PLATFORM_DATA_DIR
  ? path.resolve(process.env.PLATFORM_DATA_DIR)
  : path.join(process.cwd(), '.runtime', 'platform');
const file = path.join(root, 'security.json');

class PlatformStore {
  private state: PlatformState | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  async init() {
    if (this.state) return;
    await fs.mkdir(root, { recursive: true });
    try { this.state = JSON.parse(await fs.readFile(file, 'utf8')) as PlatformState; }
    catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      this.state = { users: [], sessions: [] };
    }
    this.state.users ||= [];
    this.state.sessions ||= [];
  }

  private async mutate<T>(operation: (state: PlatformState) => T): Promise<T> {
    await this.init();
    const run = this.queue.then(async () => {
      const result = operation(this.state!);
      const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, file);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async users() { await this.init(); return structuredClone(this.state!.users); }
  async user(id: string) { return (await this.users()).find(item => item.id === id); }
  async findByEmail(email: string) { return (await this.users()).find(item => item.email === email.toLowerCase()); }
  async saveUser(user: PlatformUser) {
    return this.mutate(state => {
      const index = state.users.findIndex(item => item.id === user.id);
      if (index < 0) state.users.push(user);
      else state.users[index] = user;
      return structuredClone(user);
    });
  }
  async createSession(userId: string) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.mutate(state => {
      state.sessions = state.sessions.filter(item => Date.parse(item.expiresAt) > Date.now());
      state.sessions.push({ tokenHash, userId, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() });
    });
    return token;
  }
  async sessionUser(token: string) {
    await this.init();
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const session = this.state!.sessions.find(item => item.tokenHash === hash && Date.parse(item.expiresAt) > Date.now());
    return session ? this.user(session.userId) : undefined;
  }
  async revokeSession(token: string) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await this.mutate(state => { state.sessions = state.sessions.filter(item => item.tokenHash !== hash); });
  }
}

export const platformStore = new PlatformStore();
export const publicUser = (user: PlatformUser) => ({ id: user.id, email: user.email, name: user.name, role: user.role, entityIds: user.entityIds, active: user.active });
