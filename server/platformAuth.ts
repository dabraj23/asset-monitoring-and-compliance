import crypto from 'node:crypto';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { platformStore, publicUser, type PlatformRole, type PlatformUser } from './platformStore.ts';

const cookieName = 'asset_monitor_session';
const setupToken = process.env.INITIAL_ADMIN_TOKEN || crypto.randomBytes(24).toString('base64url');
const attempts = new Map<string, { count: number; until: number }>();

const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const verifyPassword = (password: string, stored: string) => {
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
const readCookie = (request: Request) => request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
const setCookie = (response: Response, token: string, secure: boolean) => response.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure ? '; Secure' : ''}`);
const clearCookie = (response: Response, secure: boolean) => response.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
const requireText = (value: unknown) => String(value || '').trim();

export const currentUser = (request: Request) => (request as Request & { platformUser?: PlatformUser }).platformUser;
export const canReadEntity = (user: PlatformUser, entityId: string) => user.role === 'GROUP_ADMIN' || user.role === 'EXECUTIVE' || (!!entityId && user.entityIds.includes(entityId));
export const canWriteEntity = (user: PlatformUser, entityId: string) => user.role === 'GROUP_ADMIN' || (user.role === 'ENTITY_ADMIN' && !!entityId && user.entityIds.includes(entityId));
export const requireGroupAdmin = (request: Request, response: Response, next: NextFunction) => {
  if (currentUser(request)?.role !== 'GROUP_ADMIN') return response.status(403).json({ error: 'Group administrator access required.' });
  next();
};

export const registerAuthRoutes = async (app: Express) => {
  await platformStore.init();
  if (!(await platformStore.users()).length) console.log(`First-run setup token: ${setupToken}`);

  app.get('/api/auth/status', async (_request, response) => response.json({ setupRequired: !(await platformStore.users()).length }));
  app.post('/api/auth/bootstrap', async (request, response) => {
    if ((await platformStore.users()).length) return response.status(409).json({ error: 'Initial administrator already exists.' });
    if (requireText(request.body.token) !== setupToken) return response.status(403).json({ error: 'Invalid setup token.' });
    const email = requireText(request.body.email).toLowerCase();
    const password = requireText(request.body.password);
    if (!email.includes('@') || password.length < 12) return response.status(400).json({ error: 'Enter an email and a password of at least 12 characters.' });
    const user: PlatformUser = { id: crypto.randomUUID(), email, name: requireText(request.body.name) || 'Group Admin', role: 'GROUP_ADMIN', entityIds: [], passwordHash: hashPassword(password), active: true, createdAt: new Date().toISOString() };
    await platformStore.saveUser(user);
    const token = await platformStore.createSession(user.id);
    setCookie(response, token, request.secure);
    response.status(201).json(publicUser(user));
  });
  app.post('/api/auth/login', async (request, response) => {
    const email = requireText(request.body.email).toLowerCase();
    const key = `${request.ip}:${email}`;
    const prior = attempts.get(key);
    if (prior && prior.count >= 5 && prior.until > Date.now()) return response.status(429).json({ error: 'Too many attempts. Try again later.' });
    const user = await platformStore.findByEmail(email);
    if (!user?.active || !verifyPassword(String(request.body.password || ''), user.passwordHash)) {
      attempts.set(key, { count: (prior?.until && prior.until > Date.now() ? prior.count : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
      return response.status(401).json({ error: 'Invalid email or password.' });
    }
    attempts.delete(key);
    const token = await platformStore.createSession(user.id);
    setCookie(response, token, request.secure);
    response.json(publicUser(user));
  });
  app.post('/api/auth/logout', async (request, response) => {
    const token = readCookie(request);
    if (token) await platformStore.revokeSession(token);
    clearCookie(response, request.secure);
    response.json({ success: true });
  });
  app.get('/api/auth/me', async (request, response) => {
    const token = readCookie(request);
    const user = token ? await platformStore.sessionUser(token) : undefined;
    if (!user?.active) return response.status(401).json({ error: 'Sign in required.' });
    response.json(publicUser(user));
  });
};

export const requireAuth = async (request: Request, response: Response, next: NextFunction) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.origin;
    const expected = `${request.protocol}://${request.get('host')}`;
    if ((origin && origin !== expected) || request.headers['sec-fetch-site'] === 'cross-site') return response.status(403).json({ error: 'Cross-origin writes are not permitted.' });
  }
  const token = readCookie(request);
  const user = token ? await platformStore.sessionUser(token) : undefined;
  if (!user?.active) return response.status(401).json({ error: 'Sign in required.' });
  (request as Request & { platformUser?: PlatformUser }).platformUser = user;
  next();
};

export const registerUserRoutes = (app: Express) => {
  app.get('/api/users', requireGroupAdmin, async (_request, response) => response.json((await platformStore.users()).map(publicUser)));
  app.post('/api/users', requireGroupAdmin, async (request, response) => {
    const email = requireText(request.body.email).toLowerCase();
    const password = requireText(request.body.password);
    const role = requireText(request.body.role) as PlatformRole;
    if (!email.includes('@') || password.length < 12 || !['GROUP_ADMIN', 'EXECUTIVE', 'ENTITY_ADMIN', 'OWNER'].includes(role)) return response.status(400).json({ error: 'Valid email, role and 12-character password required.' });
    if (await platformStore.findByEmail(email)) return response.status(409).json({ error: 'Email already registered.' });
    const user: PlatformUser = { id: crypto.randomUUID(), email, name: requireText(request.body.name), role, entityIds: Array.isArray(request.body.entityIds) ? request.body.entityIds.map(String) : [], passwordHash: hashPassword(password), active: true, createdAt: new Date().toISOString() };
    await platformStore.saveUser(user);
    response.status(201).json(publicUser(user));
  });
  app.patch('/api/users/:id', requireGroupAdmin, async (request, response) => {
    const user = await platformStore.user(request.params.id);
    if (!user) return response.status(404).json({ error: 'User not found.' });
    if (request.body.name !== undefined) user.name = requireText(request.body.name);
    if (request.body.entityIds !== undefined && Array.isArray(request.body.entityIds)) user.entityIds = request.body.entityIds.map(String);
    if (request.body.active !== undefined) user.active = !!request.body.active;
    if (request.body.role !== undefined && ['GROUP_ADMIN', 'EXECUTIVE', 'ENTITY_ADMIN', 'OWNER'].includes(request.body.role)) user.role = request.body.role;
    if (request.body.password !== undefined) {
      if (String(request.body.password).length < 12) return response.status(400).json({ error: 'Password must have at least 12 characters.' });
      user.passwordHash = hashPassword(String(request.body.password));
    }
    response.json(publicUser(await platformStore.saveUser(user)));
  });
};
