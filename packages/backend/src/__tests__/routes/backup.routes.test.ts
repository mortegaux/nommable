/**
 * Route tests for backup & restore (issue #16): auth gating, export shape,
 * preview rejection of bad uploads, and confirm requiring token + confirmation.
 * The real swap path is covered in backup-restore-roundtrip.test.ts.
 */
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ZipFile as YazlZipFile } from 'yazl';
import { createApp } from '../../app';
import { createTestToken } from '../helpers/auth';
import { AppDataSource } from '../../db/data-source';
import { User } from '../../db/entities';
import { UserRole } from '@nommable/shared';
import { clearStagedRestores } from '../../services/backup/backup.service';

const app = createApp();

const ADMIN_ID = 'eeeeeeee-7777-7777-7777-000000000077';
const USER_ID = 'ffffffff-8888-8888-8888-000000000077';

async function createTestUser(id: string, role: UserRole): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  await userRepo
    .createQueryBuilder()
    .insert()
    .into(User)
    .values({
      id,
      email: `backup-test-${id.slice(0, 8)}@test.com`,
      username: `backup-user-${id.slice(0, 8)}`,
      role,
    })
    .orIgnore()
    .execute();
}

async function buildZipBuffer(entries: Record<string, string | Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const { Writable } = await import('stream');
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  const zip = new YazlZipFile();
  zip.outputStream.pipe(sink);
  for (const [name, content] of Object.entries(entries)) {
    zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  }
  zip.end();
  await new Promise<void>((resolve) => sink.on('finish', () => resolve()));
  return Buffer.concat(chunks);
}

describe('backup & restore routes', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    await createTestUser(ADMIN_ID, UserRole.ADMIN);
    await createTestUser(USER_ID, UserRole.USER);
    adminToken = createTestToken(ADMIN_ID);
    userToken = createTestToken(USER_ID);
  });

  afterEach(() => {
    clearStagedRestores();
  });

  it('export returns 401 without a session', async () => {
    await request(app).get('/api/settings/backup/export').expect(401);
  });

  it('export returns 403 for a non-admin user', async () => {
    await request(app)
      .get('/api/settings/backup/export')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('export returns a zip download for an admin', async () => {
    const res = await request(app)
      .get('/api/settings/backup/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toMatch(/application\/zip/);
    expect(res.headers['content-disposition']).toMatch(/nommable-backup-.*\.zip/);
    const body = res.body as Buffer;
    expect(body.subarray(0, 2).toString()).toBe('PK');
  });

  it('preview returns 403 for a non-admin user', async () => {
    const zip = await buildZipBuffer({ 'x.txt': 'hi' });
    const tmp = path.join(os.tmpdir(), `backup-403-${Date.now()}.zip`);
    fs.writeFileSync(tmp, zip);
    await request(app)
      .post('/api/settings/backup/restore/preview')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('archive', tmp)
      .expect(403);
    fs.unlinkSync(tmp);
  });

  it('preview rejects a non-zip upload', async () => {
    const tmp = path.join(os.tmpdir(), `backup-notzip-${Date.now()}.zip`);
    fs.writeFileSync(tmp, 'this is not a zip file');
    const res = await request(app)
      .post('/api/settings/backup/restore/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('archive', tmp)
      .expect(400);
    expect(res.body.error).toMatch(/not a zip|validation failed/i);
    fs.unlinkSync(tmp);
  });

  it('preview rejects a zip without a valid manifest', async () => {
    const zip = await buildZipBuffer({ 'manifest.json': '{broken' });
    const tmp = path.join(os.tmpdir(), `backup-badmanifest-${Date.now()}.zip`);
    fs.writeFileSync(tmp, zip);
    const res = await request(app)
      .post('/api/settings/backup/restore/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('archive', tmp)
      .expect(400);
    expect(res.body.error).toMatch(/validation failed/i);
    fs.unlinkSync(tmp);
  });

  it('confirm rejects a missing token', async () => {
    await request(app)
      .post('/api/settings/backup/restore/confirm')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmed: true })
      .expect(400);
  });

  it('confirm rejects a token without explicit confirmation', async () => {
    await request(app)
      .post('/api/settings/backup/restore/confirm')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token: 'deadbeef' })
      .expect(400);
  });

  it('confirm rejects an unknown token even with confirmation', async () => {
    await request(app)
      .post('/api/settings/backup/restore/confirm')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token: 'deadbeef', confirmed: true })
      .expect(400);
  });
});
