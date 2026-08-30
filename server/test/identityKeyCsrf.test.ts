import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { buildOriginPolicy } from '../src/config/origins.js';
import { mockDb } from './mockDb.js';

/**
 * Finding C-1, asserted on the security outcome rather than on a status code.
 *
 * The attack: a victim is logged into Vade. They visit any unrelated website. That page
 * submits a cross-origin form POST to /api/crypto/identity. Because the session cookie is
 * SameSite=None it rides along, and because a form body is a CORS "simple request" no
 * preflight stands in the way. The victim's published ECDH identity key is replaced with
 * the attacker's. Every peer who subsequently fetches that key derives a conversation key
 * the attacker holds — an irreversible break of end-to-end confidentiality.
 *
 * These tests therefore do not merely check for a 403. After each forgery attempt they
 * read the key back out of the database and assert that the stored key material is still
 * the victim's own.
 */

const TRUSTED_ORIGIN = 'https://app.vade.example';
const MALICIOUS_ORIGIN = 'https://evil.attacker.example';

const VICTIM_KEY_ID = 'k_victim_genuine_identity';
const VICTIM_PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEVICTIMKEYMATERIAL';

const ATTACKER_KEY_ID = 'k_attacker_substituted';
const ATTACKER_PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEATTACKERKEYMATERIAL';

const productionApp = createApp({
  originPolicy: buildOriginPolicy({
    corsOrigin: TRUSTED_ORIGIN,
    nodeEnv: 'production',
  }),
});

describe('C-1: cross-site forgery of the E2EE identity key', () => {
  let victimCookie: string[];
  let victimUserId: string;

  beforeEach(async () => {
    mockDb.reset();

    const registration = await request(productionApp)
      .post('/api/auth/register')
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        username: 'victim',
        email: 'victim@example.com',
        password: 'Password123!',
        displayName: 'Victim',
      });

    victimUserId = registration.body.user.id;
    victimCookie = registration.headers['set-cookie'];

    // The victim publishes their genuine identity key from the real client.
    const publish = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', victimCookie)
      .send({
        keyId: VICTIM_KEY_ID,
        publicKey: VICTIM_PUBLIC_KEY,
        algorithm: 'ECDH-P256',
      });
    expect(publish.status).toBe(200);
  });

  /** Reads the key a peer would actually receive, straight from persistence. */
  async function readPublishedKey() {
    const res = await request(productionApp)
      .get(`/api/crypto/users/${victimUserId}/key`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', victimCookie);
    return res.body.key as { keyId: string; publicKey: string } | null;
  }

  it('the genuine key is what peers retrieve before any attack', async () => {
    const key = await readPublishedKey();
    expect(key?.keyId).toBe(VICTIM_KEY_ID);
    expect(key?.publicKey).toBe(VICTIM_PUBLIC_KEY);
  });

  it('CRITICAL: a cross-origin form POST cannot replace the victim key', async () => {
    // This is the exact original attack: form content type, no preflight, cookie attached.
    const attack = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('Cookie', victimCookie)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`keyId=${ATTACKER_KEY_ID}&publicKey=${ATTACKER_PUBLIC_KEY}`);

    expect(attack.status).toBe(403);

    const key = await readPublishedKey();
    expect(key?.keyId).toBe(VICTIM_KEY_ID);
    expect(key?.publicKey).toBe(VICTIM_PUBLIC_KEY);
    expect(key?.publicKey).not.toBe(ATTACKER_PUBLIC_KEY);
  });

  it('CRITICAL: a cross-origin JSON POST cannot replace the victim key', async () => {
    const attack = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('Cookie', victimCookie)
      .send({ keyId: ATTACKER_KEY_ID, publicKey: ATTACKER_PUBLIC_KEY });

    expect(attack.status).toBe(403);

    const key = await readPublishedKey();
    expect(key?.publicKey).toBe(VICTIM_PUBLIC_KEY);
  });

  it('CRITICAL: a form POST with the Origin suppressed cannot replace the victim key', async () => {
    // A browser cannot actually do this — Origin is a forbidden header name — but the
    // server must not depend on that assumption holding.
    const attack = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Cookie', victimCookie)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`keyId=${ATTACKER_KEY_ID}&publicKey=${ATTACKER_PUBLIC_KEY}`);

    expect(attack.status).toBe(403);

    const key = await readPublishedKey();
    expect(key?.publicKey).toBe(VICTIM_PUBLIC_KEY);
  });

  it('CRITICAL: an opaque (sandboxed iframe) origin cannot replace the victim key', async () => {
    const attack = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', 'null')
      .set('Cookie', victimCookie)
      .send({ keyId: ATTACKER_KEY_ID, publicKey: ATTACKER_PUBLIC_KEY });

    expect(attack.status).toBe(403);

    const key = await readPublishedKey();
    expect(key?.publicKey).toBe(VICTIM_PUBLIC_KEY);
  });

  it('CRITICAL: a lookalike origin cannot replace the victim key', async () => {
    for (const origin of [
      `${TRUSTED_ORIGIN}.evil.example`,
      'http://app.vade.example',
      'https://app.vade.example:8443',
    ]) {
      const attack = await request(productionApp)
        .post('/api/crypto/identity')
        .set('Origin', origin)
        .set('Cookie', victimCookie)
        .send({ keyId: ATTACKER_KEY_ID, publicKey: ATTACKER_PUBLIC_KEY });

      expect(attack.status, `origin ${origin} must be refused`).toBe(403);
    }

    const key = await readPublishedKey();
    expect(key?.publicKey).toBe(VICTIM_PUBLIC_KEY);
  });

  it('CRITICAL: forging the native-client header from a malicious page does not work', async () => {
    const attack = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('Cookie', victimCookie)
      .set('X-Vade-Client', 'android')
      .send({ keyId: ATTACKER_KEY_ID, publicKey: ATTACKER_PUBLIC_KEY });

    expect(attack.status).toBe(403);

    const key = await readPublishedKey();
    expect(key?.publicKey).toBe(VICTIM_PUBLIC_KEY);
  });

  it('legitimate key rotation from the real client still works', async () => {
    const ROTATED_KEY_ID = 'k_victim_rotated';
    const ROTATED_PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEROTATEDKEYMATERIAL';

    const rotate = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', victimCookie)
      .send({ keyId: ROTATED_KEY_ID, publicKey: ROTATED_PUBLIC_KEY, algorithm: 'ECDH-P256' });

    expect(rotate.status).toBe(200);

    const key = await readPublishedKey();
    expect(key?.keyId).toBe(ROTATED_KEY_ID);
    expect(key?.publicKey).toBe(ROTATED_PUBLIC_KEY);
  });

  it('legitimate publication from the Android client still works', async () => {
    const publish = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Cookie', victimCookie)
      .set('X-Vade-Client', 'android')
      .send({ keyId: 'k_victim_android', publicKey: 'ANDROID_KEY', algorithm: 'ECDH-P256' });

    expect(publish.status).toBe(200);
    const key = await readPublishedKey();
    expect(key?.keyId).toBe('k_victim_android');
  });

  it('the guard did not weaken authentication: an unauthenticated publish is still refused', async () => {
    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ keyId: ATTACKER_KEY_ID, publicKey: ATTACKER_PUBLIC_KEY });

    expect(res.status).toBe(401);

    const key = await readPublishedKey();
    expect(key?.publicKey).toBe(VICTIM_PUBLIC_KEY);
  });
});
