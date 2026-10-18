import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../app';
import { createTestToken } from '../helpers/auth';
import { AppDataSource } from '../../db/data-source';
import { User } from '../../db/entities';
import { UserRole } from '@nommable/shared';

const app = createApp();

async function createTestUser(id: string, role: UserRole): Promise<string> {
  const userRepo = AppDataSource.getRepository(User);
  await userRepo
    .createQueryBuilder()
    .insert()
    .into(User)
    .values({
      id,
      email: `auth-ratelimit-test-${id.slice(0, 8)}@test.com`,
      username: `auth-ratelimit-user-${id.slice(0, 8)}`,
      role,
    })
    .orIgnore()
    .execute();
  return createTestToken(id);
}

async function adminToken(): Promise<string> {
  return createTestUser(crypto.randomUUID(), UserRole.ADMIN);
}

describe('Auth rate limiting (issue #70)', () => {
  it('does NOT rate-limit GET /api/auth/me (called on every page load)', async () => {
    const token = await adminToken();
    // 15 requests exceeds the 10/min authLimiter budget — if /me were
    // still limited, requests 11+ would 429 and the SPA would log out.
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });

  it('does NOT rate-limit POST /api/auth/logout', async () => {
    const token = await adminToken();
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).not.toBe(429);
    }
  });

  it('still rate-limits POST /api/auth/login (brute-force protection intact)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nobody-here', password: 'wrong-password' });
      statuses.push(res.status);
    }
    // First 10 attempts reach the handler (401 invalid credentials);
    // the 11th is blocked by the limiter.
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
