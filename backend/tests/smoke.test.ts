import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { emailService } from '../src/modules/auth/email.service.js';
import { prisma, resetDatabase } from './helpers/fixtures.js';

afterAll(() => prisma.$disconnect());

describe('End-to-End HTTP Smoke Test Lifecycle', () => {
  it('executes complete auth lifecycle: Register -> GetMe -> Login -> Refresh -> Logout -> Rejected -> Reset -> Login with new password', async () => {
    await resetDatabase();
    emailService.clearSentEmails();

    const email = 'smoke.traveler@example.com';
    const initialPassword = 'InitialSecurePassword123!';
    const newPassword = 'NewSecurePassword456!';

    // 1. Register
    console.log('[Smoke] Step 1: Registering new customer account...');
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: initialPassword,
        fullName: 'Smoke Traveler',
        phone: '+94770001122',
      });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.user.email).toBe(email);
    const token1 = registerRes.body.data.accessToken;
    console.log('[Smoke] Step 1 OK: Account registered, access token obtained');

    // 2. Get current user
    console.log('[Smoke] Step 2: Fetching current user (/users/me)...');
    const meRes = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token1}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.fullName).toBe('Smoke Traveler');
    expect(meRes.body.data.roles).toEqual(['CUSTOMER']);
    console.log('[Smoke] Step 2 OK: Verified user profile and roles');

    // 3. Login
    console.log('[Smoke] Step 3: Logging in with valid credentials...');
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: initialPassword });
    expect(loginRes.status).toBe(200);
    const refreshToken2 = loginRes.body.data.refreshToken;
    console.log('[Smoke] Step 3 OK: Logged in successfully, refresh token obtained');

    // 4. Refresh token rotation
    console.log('[Smoke] Step 4: Refreshing session (rotating refresh token)...');
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshToken2 });
    expect(refreshRes.status).toBe(200);
    const token3 = refreshRes.body.data.accessToken;
    const refreshToken3 = refreshRes.body.data.refreshToken;
    expect(refreshToken3).not.toBe(refreshToken2);
    console.log('[Smoke] Step 4 OK: Refresh token rotated successfully');

    // 5. Logout
    console.log('[Smoke] Step 5: Logging out...');
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token3}`)
      .send({ refreshToken: refreshToken3 });
    expect(logoutRes.status).toBe(204);
    console.log('[Smoke] Step 5 OK: Logged out, session revoked');

    // 6. Rejected revoked session
    console.log('[Smoke] Step 6: Verifying revoked session cannot refresh or access protected endpoints...');
    const revokedRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshToken3 });
    expect(revokedRefreshRes.status).toBe(401);

    // Verify revoked access token is immediately rejected
    const revokedAccessRes = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token3}`);
    expect(revokedAccessRes.status).toBe(401);
    console.log('[Smoke] Step 6 OK: Revoked session and access token correctly rejected with 401');

    // 7. Password reset request
    console.log('[Smoke] Step 7: Requesting password reset email...');
    const resetReqRes = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email });
    expect(resetReqRes.status).toBe(202);
    const sent = emailService.getSentEmails();
    expect(sent.length).toBeGreaterThan(0);
    const resetToken = sent[sent.length - 1]!.resetToken;
    console.log('[Smoke] Step 7 OK: Password reset requested and token captured');

    // 8. Confirm password reset
    console.log('[Smoke] Step 8: Confirming password reset with token...');
    const confirmRes = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        token: resetToken,
        newPassword,
      });
    expect(confirmRes.status).toBe(204);
    console.log('[Smoke] Step 8 OK: Password reset confirmed');

    // 9. Login with new password
    console.log('[Smoke] Step 9: Logging in with new password...');
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.data.user.email).toBe(email);
    console.log('[Smoke] Step 9 OK: Successfully logged in with new password');
  });
});
