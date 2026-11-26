import http from 'node:http';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { emailService } from '../src/modules/auth/email.service.js';

const PORT = 5055;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

async function runLiveSmokeTest() {
  console.log('====================================================');
  console.log('AUROZE Stage 3A Live HTTP Smoke Test (Real Network)');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  console.log(`Live HTTP server listening on http://127.0.0.1:${PORT}\n`);

  const results: { test: string; status: 'PASS' | 'FAIL'; detail: string }[] = [];

  function record(test: string, passed: boolean, detail: string) {
    results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
    console.log(`[${passed ? '✓ PASS' : '✗ FAIL'}] ${test}: ${detail}`);
  }

  const timestamp = Date.now();
  const testEmail = `live.smoke.${timestamp}@auroze.lk`;
  const initialPassword = 'LiveInitialPassword123!';
  const newPassword = 'LiveNewPassword456!';
  let accessToken = '';
  let refreshToken = '';
  let revokedAccessToken = '';

  try {
    // 1. Health endpoint
    {
      const res = await fetch(`${BASE_URL}/health`);
      const body = await res.json();
      record(
        '1. Health Endpoint',
        res.status === 200 && body.success === true,
        `HTTP ${res.status} message="${body.message}"`,
      );
    }

    // 2. Database readiness endpoint
    {
      const res = await fetch(`${BASE_URL}/ready`);
      const body = await res.json();
      record(
        '2. Readiness Endpoint',
        res.status === 200 && body.success === true && body.message?.includes('ready'),
        `HTTP ${res.status} message="${body.message}"`,
      );
    }

    // 3. Customer registration
    {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: initialPassword,
          fullName: 'Live Smoke User',
          phone: '+94770000001',
        }),
      });
      const body = await res.json();
      accessToken = body.data?.accessToken;
      refreshToken = body.data?.refreshToken;
      record(
        '3. Customer Registration',
        res.status === 201 && !!accessToken && !!refreshToken && body.data?.user?.email === testEmail,
        `HTTP ${res.status} role=${body.data?.user?.roles?.[0]} userId=${body.data?.user?.id?.slice(0, 8)}...`,
      );
    }

    // 4. Current user retrieval
    {
      const res = await fetch(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json();
      record(
        '4. Current User Retrieval',
        res.status === 200 && body.data?.email === testEmail && body.data?.fullName === 'Live Smoke User',
        `HTTP ${res.status} email=${body.data?.email} status=${body.data?.status}`,
      );
    }

    // 5. Login
    {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: initialPassword,
        }),
      });
      const body = await res.json();
      accessToken = body.data?.accessToken;
      refreshToken = body.data?.refreshToken;
      record(
        '5. User Login',
        res.status === 200 && !!accessToken && !!refreshToken,
        `HTTP ${res.status} session refreshed`,
      );
    }

    // 6. Profile update
    {
      const res = await fetch(`${BASE_URL}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          fullName: 'Live Smoke User Updated',
          phone: '+94770000002',
        }),
      });
      const body = await res.json();
      record(
        '6. Profile Update',
        res.status === 200 && body.data?.fullName === 'Live Smoke User Updated',
        `HTTP ${res.status} updatedName=${body.data?.fullName}`,
      );
    }

    // 7. Refresh-token rotation
    const oldRefreshToken = refreshToken;
    {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: oldRefreshToken }),
      });
      const body = await res.json();
      accessToken = body.data?.accessToken;
      refreshToken = body.data?.refreshToken;
      record(
        '7. Refresh Token Rotation',
        res.status === 200 && !!accessToken && !!refreshToken && refreshToken !== oldRefreshToken,
        `HTTP ${res.status} rotated token issued`,
      );
    }

    // 8. Refresh-token replay rejection
    {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: oldRefreshToken }),
      });
      record(
        '8. Refresh Token Replay Rejection',
        res.status === 401,
        `HTTP ${res.status} replay revoked family`,
      );
    }

    // Re-login to get a fresh valid session for logout test
    {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: initialPassword,
        }),
      });
      const body = await res.json();
      accessToken = body.data?.accessToken;
      refreshToken = body.data?.refreshToken;
    }

    // 9. Logout
    revokedAccessToken = accessToken;
    {
      const res = await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
      record(
        '9. Session Logout',
        res.status === 204,
        `HTTP ${res.status} session revoked successfully`,
      );
    }

    // 10. Previously issued access-token rejection after revocation
    {
      const res = await fetch(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${revokedAccessToken}` },
      });
      record(
        '10. Revoked Access Token Rejection',
        res.status === 401,
        `HTTP ${res.status} revoked token denied`,
      );
    }

    // 11. Password-reset request
    emailService.clearSentEmails();
    {
      const res = await fetch(`${BASE_URL}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      });
      const emails = emailService.getSentEmails();
      record(
        '11. Password Reset Request',
        res.status === 202 && emails.length > 0,
        `HTTP ${res.status} reset email dispatched`,
      );
    }

    // Extract reset token safely from dispatched email
    const sentEmail = emailService.getSentEmails()[0];
    const match = sentEmail?.text?.match(/token=([a-zA-Z0-9_-]+)/);
    const resetToken = match ? match[1] : '';

    // 12. Password-reset confirmation
    {
      const res = await fetch(`${BASE_URL}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          newPassword: newPassword,
        }),
      });
      record(
        '12. Password Reset Confirmation',
        res.status === 204,
        `HTTP ${res.status} password updated atomically`,
      );
    }

    // 13. Old password rejection
    {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: initialPassword,
        }),
      });
      record(
        '13. Old Password Rejection',
        res.status === 401,
        `HTTP ${res.status} invalid credentials`,
      );
    }

    // 14. Successful login with new password
    {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: newPassword,
        }),
      });
      const body = await res.json();
      accessToken = body.data?.accessToken;
      record(
        '14. Login with New Password',
        res.status === 200 && !!accessToken,
        `HTTP ${res.status} authenticated with new credentials`,
      );
    }

    // 15. Unauthorized protected endpoint rejection
    {
      const res = await fetch(`${BASE_URL}/users/me`);
      record(
        '15. Unauthorized Endpoint Rejection',
        res.status === 401,
        `HTTP ${res.status} unauthenticated request rejected`,
      );
    }

    console.log('\n====================================================');
    const allPassed = results.every((r) => r.status === 'PASS');
    console.log(`Live Smoke Test Summary: ${results.filter((r) => r.status === 'PASS').length}/${results.length} PASSED`);
    console.log('====================================================\n');

    if (!allPassed) {
      process.exit(1);
    }
  } finally {
    // Cleanup test user
    try {
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      if (user) {
        await prisma.authSession.deleteMany({ where: { userId: user.id } });
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.authAuditLog.deleteMany({ where: { userId: user.id } });
        await prisma.customerProfile.deleteMany({ where: { userId: user.id } });
        await prisma.userRole.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }

    await prisma.$disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runLiveSmokeTest().catch((err) => {
  console.error('Fatal live smoke test error:', err);
  process.exit(1);
});
