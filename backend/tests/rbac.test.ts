import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Role, UserStatus } from '@prisma/client';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import {
  authenticate,
  requireAnyRole,
  requireOwnershipOrRoles,
  requireRole,
} from '../src/middlewares/auth.middleware.js';
import { generateOpaqueToken, hashToken, signAccessToken } from '../src/modules/auth/token.util.js';
import { hashPassword } from '../src/modules/auth/password.util.js';
import { prisma, resetDatabase } from './helpers/fixtures.js';

// Setup test router with RBAC endpoints
const testApp = express();
testApp.use(express.json());

testApp.get('/test/protected', authenticate, (_req, res) => {
  res.json({ ok: true, user: _req.user });
});

testApp.get('/test/admin-only', authenticate, requireRole(Role.ADMIN), (_req, res) => {
  res.json({ ok: true, role: 'ADMIN' });
});

testApp.get('/test/customer-only', authenticate, requireRole(Role.CUSTOMER), (_req, res) => {
  res.json({ ok: true, role: 'CUSTOMER' });
});

testApp.get(
  '/test/multi-role',
  authenticate,
  requireAnyRole([Role.OWNER, Role.DRIVER]),
  (_req, res) => {
    res.json({ ok: true, access: 'GRANTED' });
  },
);

testApp.get(
  '/test/owner-resource/:id',
  authenticate,
  requireOwnershipOrRoles((req) => (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), [Role.ADMIN]),
  (_req, res) => {
    res.json({ ok: true, resourceOwner: _req.params.id });
  },
);

testApp.use(errorHandler);

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function createAuthenticatedUser(roles: Role[], status: UserStatus = UserStatus.ACTIVE) {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@test.com`,
      fullName: 'Test User',
      passwordHash: await hashPassword('TestPassword123!'),
      status,
      roles: { create: roles.map((role) => ({ role })) },
    },
  });

  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(generateOpaqueToken()),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const { token } = signAccessToken({
    sub: user.id,
    email: user.email,
    roles,
    sid: session.id,
  });

  return { user, session, token };
}

describe('Authentication & RBAC Middleware', () => {
  it('rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
    const res = await request(testApp).get('/test/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid Bearer tokens with 401 UNAUTHENTICATED', async () => {
    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', 'Bearer invalid.token.value');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('allows authenticated active user to access protected endpoint', async () => {
    const { user, token } = await createAuthenticatedUser([Role.CUSTOMER]);

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.id).toBe(user.id);
  });

  it('enforces single-role requirement: CUSTOMER cannot access admin-only endpoint (403)', async () => {
    const { token } = await createAuthenticatedUser([Role.CUSTOMER]);

    const res = await request(testApp)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('enforces multi-role permission: OWNER or DRIVER allowed, CUSTOMER forbidden', async () => {
    const { token: ownerToken } = await createAuthenticatedUser([Role.OWNER]);
    const { token: driverToken } = await createAuthenticatedUser([Role.DRIVER]);
    const { token: customerToken } = await createAuthenticatedUser([Role.CUSTOMER]);

    // Owner succeeds
    const resOwner = await request(testApp)
      .get('/test/multi-role')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(resOwner.status).toBe(200);

    // Driver succeeds
    const resDriver = await request(testApp)
      .get('/test/multi-role')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(resDriver.status).toBe(200);

    // Customer fails with 403
    const resCustomer = await request(testApp)
      .get('/test/multi-role')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(resCustomer.status).toBe(403);
    expect(resCustomer.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects suspended or deactivated users with 401 even if they hold a valid JWT', async () => {
    const { token } = await createAuthenticatedUser([Role.CUSTOMER], UserStatus.SUSPENDED);

    const res = await request(testApp)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('enforces resource ownership check: owner access allowed, non-owner forbidden, admin override allowed', async () => {
    const { user: userA, token: tokenA } = await createAuthenticatedUser([Role.CUSTOMER]);
    const { token: tokenB } = await createAuthenticatedUser([Role.CUSTOMER]);
    const { token: tokenAdmin } = await createAuthenticatedUser([Role.ADMIN]);

    // User A accessing resource of User A -> 200
    const resA = await request(testApp)
      .get(`/test/owner-resource/${userA.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.status).toBe(200);

    // User B accessing resource of User A -> 403
    const resB = await request(testApp)
      .get(`/test/owner-resource/${userA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(403);

    // Admin accessing resource of User A -> 200
    const resAdmin = await request(testApp)
      .get(`/test/owner-resource/${userA.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(resAdmin.status).toBe(200);
  });
});
