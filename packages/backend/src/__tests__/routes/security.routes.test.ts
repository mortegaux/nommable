/**
 * Route-level negative tests for upload + link hardening (issue #18).
 * Crafted buffers only — nothing is uploaded to a live service.
 */
import request from 'supertest';
import { createApp } from '../../app';
import { createTestToken } from '../helpers/auth';
import { buildRecipeDto } from '../helpers/fixtures';
import { AppDataSource } from '../../db/data-source';
import { User } from '../../db/entities';
import { UserRole } from '@nommable/shared';

const app = createApp();
const TEST_USER_ID = 'aaaaaaaa-2222-2222-2222-000000000099';

async function createTestUser(id: string): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  await userRepo
    .createQueryBuilder()
    .insert()
    .into(User)
    .values({
      id,
      email: `route-test-${id.slice(0, 8)}@test.com`,
      username: `route-user-${id.slice(0, 8)}`,
      role: UserRole.USER,
    })
    .orIgnore()
    .execute();
}

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(200, 0),
]);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'utf8'
);

describe('POST /api/recipes/upload-image', () => {
  let token: string;

  beforeEach(async () => {
    await createTestUser(TEST_USER_ID);
    token = createTestToken(TEST_USER_ID);
  });

  it('accepts a real JPEG', async () => {
    const res = await request(app)
      .post('/api/recipes/upload-image')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', jpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/\.jpg$/);
  });

  it('rejects an SVG by MIME type', async () => {
    const res = await request(app)
      .post('/api/recipes/upload-image')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', svg, { filename: 'evil.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(400);
    expect(res.body.imageUrl).toBeUndefined();
  });

  it('rejects SVG content disguised as a JPEG', async () => {
    const res = await request(app)
      .post('/api/recipes/upload-image')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', svg, { filename: 'fake.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.imageUrl).toBeUndefined();
  });

  it('rejects an oversized file (5MB cap)', async () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(6 * 1024 * 1024, 0)]);
    const res = await request(app)
      .post('/api/recipes/upload-image')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', big, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.imageUrl).toBeUndefined();
  });
});

describe('POST /api/recipes/extract-from-images (oversized)', () => {
  let token: string;

  beforeEach(async () => {
    await createTestUser(TEST_USER_ID);
    token = createTestToken(TEST_USER_ID);
  });

  it('rejects a file over the 50MB extraction cap', async () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(51 * 1024 * 1024, 0)]);
    const res = await request(app)
      .post('/api/recipes/extract-from-images')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', big, { filename: 'huge.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('recipe sourceUrl validation', () => {
  let token: string;

  beforeEach(async () => {
    await createTestUser(TEST_USER_ID);
    token = createTestToken(TEST_USER_ID);
  });

  it('rejects a javascript: sourceUrl on create (clickable-XSS defense)', async () => {
    const dto = buildRecipeDto({ sourceUrl: 'javascript:alert(1)' });
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${token}`)
      .send(dto);
    expect(res.status).toBe(400);
  });

  it('accepts an https sourceUrl', async () => {
    const dto = buildRecipeDto({ sourceUrl: 'https://example.com/recipes/soup' });
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${token}`)
      .send(dto);
    expect(res.status).toBe(201);
    expect(res.body.sourceUrl).toBe('https://example.com/recipes/soup');
  });
});

describe('POST /api/recipes/import rate limit', () => {
  let token: string;

  beforeEach(async () => {
    await createTestUser(TEST_USER_ID);
    token = createTestToken(TEST_USER_ID);
  });

  it('rate-limits import attempts (20/min per user)', async () => {
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const res = await request(app)
        .post('/api/recipes/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'not-a-url' });
      lastStatus = res.status;
    }
    // The 21st request trips the import limiter; earlier ones fail fast on
    // URL validation without touching the network.
    expect(lastStatus).toBe(429);
  });
});
