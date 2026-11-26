import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { Role, UserStatus } from '@prisma/client';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { emailService } from '../src/modules/auth/email.service.js';
import { hashPassword } from '../src/modules/auth/password.util.js';
import { generateOpaqueToken, hashToken } from '../src/modules/auth/token.util.js';
import { prisma, resetDatabase } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
  emailService.clearSentEmails();
});
afterAll(() => prisma.$disconnect());

describe('Authentication API Endpoints', () => {
  describe('POST /api/v1/auth/register', () => {
    it('successfully registers a customer account and creates atomic database records', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'jane.customer@example.com',
          password: 'SecurePassword123!',
          fullName: 'Jane Customer',
          phone: '+94771234567',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data).toHaveProperty('expiresIn');
      expect(res.body.data.user).toMatchObject({
        email: 'jane.customer@example.com',
        fullName: 'Jane Customer',
        phone: '+94771234567',
        status: 'ACTIVE',
        roles: ['CUSTOMER'],
      });

      // Verify atomic DB creation
      const user = await prisma.user.findUnique({
        where: { email: 'jane.customer@example.com' },
        include: { roles: true, customerProfile: true, authSessions: true },
      });
      expect(user).not.toBeNull();
      expect(user!.roles.map((r) => r.role)).toEqual(['CUSTOMER']);
      expect(user!.customerProfile).not.toBeNull();
      expect(user!.authSessions).toHaveLength(1);
    });

    it('rejects invalid email with 422 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email-format',
          password: 'SecurePassword123!',
          fullName: 'Jane Doe',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects passwords shorter than 10 characters with 422 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'shortpass@example.com',
          password: 'Pass1',
          fullName: 'Short Pass',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate email with 409 CONFLICT', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'SecurePassword123!',
          fullName: 'First Register',
        });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'AnotherPassword123!',
          fullName: 'Second Register',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('handles concurrent duplicate registrations safely (exactly one succeeds)', async () => {
      const attempts = Array.from({ length: 4 }, (_, i) =>
        request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'concurrent@example.com',
            password: 'SecurePassword123!',
            fullName: `User ${i}`,
          }),
      );

      const results = await Promise.all(attempts);
      const created = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      expect(created).toHaveLength(1);
      expect(conflicts).toHaveLength(3);
    });

    it('prevents privilege escalation / role injection via registration', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'escalate@example.com',
          password: 'SecurePassword123!',
          fullName: 'Escalation Attempt',
          roles: ['ADMIN'], // Attempt to inject role
        });

      // Strict schema rejects unknown fields or public registration only assigns CUSTOMER
      if (res.status === 201) {
        expect(res.body.data.user.roles).toEqual(['CUSTOMER']);
        const dbUser = await prisma.user.findUnique({
          where: { email: 'escalate@example.com' },
          include: { roles: true },
        });
        expect(dbUser!.roles.map((r) => r.role)).toEqual(['CUSTOMER']);
      } else {
        expect(res.status).toBe(422);
      }
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('successfully logs in with valid credentials and returns session', async () => {
      const password = 'StrongPassword123!';
      const hash = await hashPassword(password);
      await prisma.user.create({
        data: {
          email: 'valid.login@example.com',
          fullName: 'Valid Login',
          passwordHash: hash,
          roles: { create: [{ role: Role.CUSTOMER }] },
        },
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'valid.login@example.com',
        password,
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe('valid.login@example.com');
    });

    it('rejects invalid password with generic 401 UNAUTHENTICATED', async () => {
      const password = 'StrongPassword123!';
      const hash = await hashPassword(password);
      await prisma.user.create({
        data: {
          email: 'wrongpass@example.com',
          fullName: 'Wrong Pass',
          passwordHash: hash,
          roles: { create: [{ role: Role.CUSTOMER }] },
        },
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'wrongpass@example.com',
        password: 'IncorrectPassword!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('rejects non-existent user with generic 401 UNAUTHENTICATED (prevent enumeration)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'nobody@example.com',
        password: 'SomePassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('rejects suspended accounts with 401 UNAUTHENTICATED', async () => {
      const password = 'StrongPassword123!';
      const hash = await hashPassword(password);
      await prisma.user.create({
        data: {
          email: 'suspended.login@example.com',
          fullName: 'Suspended User',
          passwordHash: hash,
          status: UserStatus.SUSPENDED,
          roles: { create: [{ role: Role.CUSTOMER }] },
        },
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'suspended.login@example.com',
        password,
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects deactivated accounts with 401 UNAUTHENTICATED', async () => {
      const password = 'StrongPassword123!';
      const hash = await hashPassword(password);
      await prisma.user.create({
        data: {
          email: 'deactivated.login@example.com',
          fullName: 'Deactivated User',
          passwordHash: hash,
          status: UserStatus.DEACTIVATED,
          roles: { create: [{ role: Role.CUSTOMER }] },
        },
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'deactivated.login@example.com',
        password,
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('enforces rate limiting when thresholds are exceeded', async () => {
      // Fire requests exceeding login limiter limit (10)
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .set('x-test-rate-limit', 'true')
          .send({ email: 'ratelimit@example.com', password: 'wrongpassword' });
      }

      const blockedRes = await request(app)
        .post('/api/v1/auth/login')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'ratelimit@example.com', password: 'wrongpassword' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('POST /api/v1/auth/refresh and Session Lifecycle', () => {
    it('successfully rotates refresh token on valid request', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'rotate@example.com',
        password: 'StrongPassword123!',
        fullName: 'Rotate User',
      });

      const oldRefreshToken = reg.body.data.refreshToken;
      const res = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: oldRefreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.refreshToken).not.toBe(oldRefreshToken);

      // Verify that old refresh token is now revoked
      const oldSession = await prisma.authSession.findUnique({
        where: { tokenHash: hashToken(oldRefreshToken) },
      });
      expect(oldSession!.isRevoked).toBe(true);
    });

    it('detects refresh token reuse and revokes entire session family', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'reuse@example.com',
        password: 'StrongPassword123!',
        fullName: 'Reuse User',
      });

      const initialToken = reg.body.data.refreshToken;

      // Legitimate client rotates token
      const rotate1 = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: initialToken,
      });
      expect(rotate1.status).toBe(200);
      const secondToken = rotate1.body.data.refreshToken;

      // Attacker attempts to reuse the already-rotated initialToken
      const attackerAttempt = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: initialToken,
      });
      expect(attackerAttempt.status).toBe(401);

      // Now legitimate client's secondToken should ALSO be revoked due to family invalidation
      const subsequentLegitAttempt = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: secondToken,
      });
      expect(subsequentLegitAttempt.status).toBe(401);
    });

    it('rejects expired refresh tokens', async () => {
      const password = 'StrongPassword123!';
      const hash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email: 'expired.token@example.com',
          fullName: 'Expired Token User',
          passwordHash: hash,
          roles: { create: [{ role: Role.CUSTOMER }] },
        },
      });

      const rawToken = generateOpaqueToken();
      await prisma.authSession.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() - 1000 * 60), // Expired 1 minute ago
        },
      });

      const res = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: rawToken,
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('concurrent refresh requests are handled safely', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'concurrent.refresh@example.com',
        password: 'StrongPassword123!',
        fullName: 'Concurrent Refresh User',
      });

      const token = reg.body.data.refreshToken;

      const attempts = await Promise.all([
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: token }),
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: token }),
      ]);

      const successful = attempts.filter((r) => r.status === 200);
      // At most one can succeed when racing to consume the same single-use token
      expect(successful.length).toBeLessThanOrEqual(1);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the session and prevents further refreshes', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'logout@example.com',
        password: 'StrongPassword123!',
        fullName: 'Logout User',
      });

      const { accessToken, refreshToken } = reg.body.data;

      // Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      expect(logoutRes.status).toBe(204);

      // Attempting to refresh with the logged-out token must fail
      const refreshRes = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken,
      });
      expect(refreshRes.status).toBe(401);
    });

    it('rejects cross-user logout attempt (403 FORBIDDEN)', async () => {
      const userA = await request(app).post('/api/v1/auth/register').send({
        email: 'usera.logout@example.com',
        password: 'StrongPassword123!',
        fullName: 'User A',
      });

      const userB = await request(app).post('/api/v1/auth/register').send({
        email: 'userb.logout@example.com',
        password: 'StrongPassword123!',
        fullName: 'User B',
      });

      // User A attempts to revoke User B's refresh token
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${userA.body.data.accessToken}`)
        .send({ refreshToken: userB.body.data.refreshToken });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Password Reset Lifecycle', () => {
    it('request returns 202 whether email exists or not (prevent enumeration)', async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'reset.exist@example.com',
        password: 'StrongPassword123!',
        fullName: 'Reset Exist',
      });

      // Existing email
      const resExist = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'reset.exist@example.com' });
      expect(resExist.status).toBe(202);

      // Unknown email
      const resUnknown = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'nonexistent@example.com' });
      expect(resUnknown.status).toBe(202);

      // Verify that email was dispatched for the existing account
      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]!.to).toBe('reset.exist@example.com');
      expect(sentEmails[0]!.resetToken).toBeDefined();
    });

    it('completes full password reset, revokes all sessions, rejects old password, and allows new password login', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'fullreset@example.com',
        password: 'OldPassword123!',
        fullName: 'Full Reset User',
      });

      const activeRefreshToken = reg.body.data.refreshToken;

      // Request reset
      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'fullreset@example.com' });

      const resetToken = emailService.getSentEmails()[0]!.resetToken;

      // Confirm reset with new password
      const confirmRes = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: resetToken,
          newPassword: 'BrandNewPassword123!',
        });
      expect(confirmRes.status).toBe(204);

      // Active session should now be revoked
      const refreshAfterReset = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: activeRefreshToken });
      expect(refreshAfterReset.status).toBe(401);

      // Login with OLD password must fail
      const oldLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'fullreset@example.com',
        password: 'OldPassword123!',
      });
      expect(oldLogin.status).toBe(401);

      // Login with NEW password must succeed
      const newLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'fullreset@example.com',
        password: 'BrandNewPassword123!',
      });
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.data.user.email).toBe('fullreset@example.com');

      // Reset token cannot be reused (single-use)
      const reuseTokenRes = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: resetToken,
          newPassword: 'AnotherPassword123!',
        });
      expect(reuseTokenRes.status).toBe(400);
    });
  });

  describe('Current User (/api/v1/users/me)', () => {
    it('GET /api/v1/users/me returns authenticated user details according to contract', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'getme@example.com',
        password: 'StrongPassword123!',
        fullName: 'Get Me User',
        phone: '+94711111111',
      });

      const token = reg.body.data.accessToken;

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        email: 'getme@example.com',
        fullName: 'Get Me User',
        phone: '+94711111111',
        status: 'ACTIVE',
        roles: ['CUSTOMER'],
        ownerProfileId: null,
        driverProfileId: null,
      });

      // Must never expose password or security metadata
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).not.toHaveProperty('tokenHash');
    });

    it('PATCH /api/v1/users/me updates fullName and phone successfully', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'patchme@example.com',
        password: 'StrongPassword123!',
        fullName: 'Original Name',
        phone: '+94711111111',
      });

      const token = reg.body.data.accessToken;

      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Updated Name',
          phone: '+94799999999',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Updated Name');
      expect(res.body.data.phone).toBe('+94799999999');
    });

    it('PATCH /api/v1/users/me rejects unauthorized fields (roles, status, email)', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'patchunauth@example.com',
        password: 'StrongPassword123!',
        fullName: 'Patch Unauth',
      });

      const token = reg.body.data.accessToken;

      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Updated Name',
          role: 'ADMIN', // Unauthorized field
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Access Token Revocation & Multi-Session Isolation', () => {
    it('access token works before logout and is rejected after logout', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'token.revocation@example.com',
        password: 'SecurePassword123!',
        fullName: 'Token Revocation User',
      });
      const { accessToken, refreshToken } = reg.body.data;

      // 1. Access token works before logout
      const beforeLogout = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(beforeLogout.status).toBe(200);

      // 2. Perform logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });
      expect(logoutRes.status).toBe(204);

      // 3. The same access token is rejected after logout
      const afterLogout = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(afterLogout.status).toBe(401);
      expect(afterLogout.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('refresh-token reuse revokes the affected session family, including associated access tokens', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'reuse.family@example.com',
        password: 'SecurePassword123!',
        fullName: 'Reuse Family User',
      });
      const initialToken = reg.body.data.refreshToken;

      // Legitimate rotation
      const rotateRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initialToken });
      expect(rotateRes.status).toBe(200);
      const activeAccessToken = rotateRes.body.data.accessToken;

      // Access token works before reuse
      const beforeReuse = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${activeAccessToken}`);
      expect(beforeReuse.status).toBe(200);

      // Malicious client reuses the old refresh token
      const reuseAttempt = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initialToken });
      expect(reuseAttempt.status).toBe(401);

      // The active access token from that session family is now revoked
      const afterReuse = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${activeAccessToken}`);
      expect(afterReuse.status).toBe(401);
      expect(afterReuse.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('password reset invalidates all previous access tokens across multiple sessions', async () => {
      const email = 'multisession.reset@example.com';
      const initialPassword = 'InitialPassword123!';
      const newPassword = 'BrandNewPassword123!';

      await request(app).post('/api/v1/auth/register').send({
        email,
        password: initialPassword,
        fullName: 'MultiSession User',
      });

      // Session 1 (Device A)
      const session1 = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: initialPassword });
      const tokenSession1 = session1.body.data.accessToken;

      // Session 2 (Device B)
      const session2 = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: initialPassword });
      const tokenSession2 = session2.body.data.accessToken;

      // Both access tokens work
      expect(
        (await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${tokenSession1}`)).status,
      ).toBe(200);
      expect(
        (await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${tokenSession2}`)).status,
      ).toBe(200);

      // Trigger password reset
      await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email });
      const resetToken = emailService.getSentEmails()[0]!.resetToken;

      const confirmRes = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: resetToken, newPassword });
      expect(confirmRes.status).toBe(204);

      // Both previous access tokens are now rejected
      const test1 = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenSession1}`);
      const test2 = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenSession2}`);

      expect(test1.status).toBe(401);
      expect(test2.status).toBe(401);
    });

    it('logging out one independent session does not revoke unrelated sessions of the same user', async () => {
      const email = 'indep.sessions@example.com';
      const password = 'IndependentPassword123!';

      await request(app).post('/api/v1/auth/register').send({
        email,
        password,
        fullName: 'Independent User',
      });

      // Session A
      const loginA = await request(app).post('/api/v1/auth/login').send({ email, password });
      const tokenA = loginA.body.data.accessToken;
      const refreshA = loginA.body.data.refreshToken;

      // Session B
      const loginB = await request(app).post('/api/v1/auth/login').send({ email, password });
      const tokenB = loginB.body.data.accessToken;

      // Logout Session A
      const logoutA = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ refreshToken: refreshA });
      expect(logoutA.status).toBe(204);

      // Token A is rejected
      const resA = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(resA.status).toBe(401);

      // Token B STILL works normally
      const resB = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(resB.status).toBe(200);
      expect(resB.body.data.email).toBe(email);
    });
  });

  describe('Strict JWT Validation', () => {
    it('rejects token with invalid signature', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'jwt.sig@example.com',
        password: 'SecurePassword123!',
        fullName: 'JWT Sig User',
      });
      const validToken = reg.body.data.accessToken;
      // Tamper with signature
      const tamperedToken = validToken.slice(0, -6) + 'abcdef';

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tamperedToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects expired JWT token', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'jwt.exp@example.com',
        password: 'SecurePassword123!',
        fullName: 'JWT Exp User',
      });
      const user = reg.body.data.user;

      const expiredToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          roles: user.roles,
          sid: reg.body.data.refreshToken, // arbitrary sid
        },
        env.JWT_SECRET,
        {
          algorithm: 'HS256',
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          expiresIn: -10, // expired 10s ago
        },
      );

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects token with incorrect issuer', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'jwt.iss@example.com',
        password: 'SecurePassword123!',
        fullName: 'JWT Iss User',
      });
      const user = reg.body.data.user;

      const badIssToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          roles: user.roles,
          sid: '00000000-0000-0000-0000-000000000000',
        },
        env.JWT_SECRET,
        {
          algorithm: 'HS256',
          issuer: 'wrong-issuer-service',
          audience: env.JWT_AUDIENCE,
          expiresIn: '15m',
        },
      );

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${badIssToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects token with incorrect audience', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'jwt.aud@example.com',
        password: 'SecurePassword123!',
        fullName: 'JWT Aud User',
      });
      const user = reg.body.data.user;

      const badAudToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          roles: user.roles,
          sid: '00000000-0000-0000-0000-000000000000',
        },
        env.JWT_SECRET,
        {
          algorithm: 'HS256',
          issuer: env.JWT_ISSUER,
          audience: 'wrong-audience-target',
          expiresIn: '15m',
        },
      );

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${badAudToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects token missing session identifier (sid)', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: 'jwt.nosid@example.com',
        password: 'SecurePassword123!',
        fullName: 'JWT No Sid User',
      });
      const user = reg.body.data.user;

      const noSidToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          roles: user.roles,
        },
        env.JWT_SECRET,
        {
          algorithm: 'HS256',
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          expiresIn: '15m',
        },
      );

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${noSidToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects malformed token strings', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer not.a.real.jwt.token');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('Password Reset Concurrency & Invalidation', () => {
    it('rejects invalid password reset tokens with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: 'totally-invalid-token',
          newPassword: 'BrandNewPassword123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects expired password reset tokens with 400', async () => {
      const password = 'StrongPassword123!';
      const user = await prisma.user.create({
        data: {
          email: 'expired.reset@example.com',
          fullName: 'Expired Reset User',
          passwordHash: await hashPassword(password),
          roles: { create: [{ role: Role.CUSTOMER }] },
        },
      });

      const token = generateOpaqueToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() - 1000 * 60), // Expired 1 minute ago
        },
      });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token,
          newPassword: 'NewPassword12345!',
        });
      expect(res.status).toBe(400);
    });

    it('new password reset request invalidates previous outstanding reset tokens for the user', async () => {
      const email = 'multiple.resets@example.com';
      await request(app).post('/api/v1/auth/register').send({
        email,
        password: 'SecurePassword123!',
        fullName: 'Multiple Resets User',
      });

      // Request 1
      await request(app).post('/api/v1/auth/password-reset/request').send({ email });
      const token1 = emailService.getSentEmails()[0]!.resetToken;

      // Request 2
      await request(app).post('/api/v1/auth/password-reset/request').send({ email });
      const token2 = emailService.getSentEmails()[1]!.resetToken;

      // Token 1 should be marked used / invalidated
      const confirm1 = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: token1, newPassword: 'FirstNewPassword123!' });
      expect(confirm1.status).toBe(400);

      // Token 2 should work
      const confirm2 = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: token2, newPassword: 'SecondNewPassword123!' });
      expect(confirm2.status).toBe(204);
    });

    it('handles concurrent reset confirmation attempts (exactly one succeeds)', async () => {
      const email = 'concurrent.confirm@example.com';
      await request(app).post('/api/v1/auth/register').send({
        email,
        password: 'SecurePassword123!',
        fullName: 'Concurrent Confirm User',
      });

      await request(app).post('/api/v1/auth/password-reset/request').send({ email });
      const token = emailService.getSentEmails()[0]!.resetToken;

      const attempts = await Promise.all([
        request(app).post('/api/v1/auth/password-reset/confirm').send({ token, newPassword: 'NewPassword123!' }),
        request(app).post('/api/v1/auth/password-reset/confirm').send({ token, newPassword: 'NewPassword123!' }),
      ]);

      const success = attempts.filter((r) => r.status === 204);
      const failed = attempts.filter((r) => r.status === 400);

      expect(success).toHaveLength(1);
      expect(failed).toHaveLength(1);
    });
  });

  describe('Rate Limiter Behavior & Headers', () => {
    it('sets Retry-After header when rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .set('x-test-rate-limit', 'true')
          .send({ email: 'headerlimit@example.com', password: 'wrongpassword' });
      }

      const blockedRes = await request(app)
        .post('/api/v1/auth/login')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'headerlimit@example.com', password: 'wrongpassword' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers).toHaveProperty('retry-after');
      const retryAfter = parseInt(blockedRes.headers['retry-after'], 10);
      expect(retryAfter).toBeGreaterThan(0);
    });
  });
});
