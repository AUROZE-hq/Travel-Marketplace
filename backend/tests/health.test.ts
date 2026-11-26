import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from './helpers/fixtures.js';

afterAll(() => prisma.$disconnect());

describe('Health and Readiness Endpoints', () => {
  it('GET /api/v1/health returns status 200 and healthy status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.message).toContain('running');
  });

  it('GET /api/v1/ready returns status 200 and database connection status', async () => {
    const res = await request(app).get('/api/v1/ready');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.message).toContain('ready');
  });
});
