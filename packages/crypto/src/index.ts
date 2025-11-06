import crypto from 'node:crypto';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SERVICE = 'Stina';
const ACCOUNT = 'settings-key';

async function getKeytar(): Promise<null | typeof import('keytar')> {
  try {
    const mod = await import('keytar');
    return (mod as any).default ?? (mod as any);
  } catch {
    return null;
  }
}

async function getKeyFilePath() {
  const dir = path.join(os.homedir(), '.stina');
  const file = path.join(dir, '.k');
  await fsp.mkdir(dir, { recursive: true });
  return file;
}

async function readKeyFromFile(): Promise<Buffer | null> {
  try {
    const p = await getKeyFilePath();
    const raw = await fsp.readFile(p);
    return raw.length === 32 ? raw : null;
  } catch {
    return null;
  }
}

async function writeKeyToFile(key: Buffer) {
  const p = await getKeyFilePath();
  await fsp.writeFile(p, key);
  try {
    await fsp.chmod(p, 0o600);
  } catch {}
}

export async function getOrCreateKey(): Promise<Buffer> {
  const keytar = await getKeytar();
  if (keytar) {
    try {
      const existing = await keytar.getPassword(SERVICE, ACCOUNT);
      if (existing) return Buffer.from(existing, 'base64');
      const key = crypto.randomBytes(32);
      await keytar.setPassword(SERVICE, ACCOUNT, key.toString('base64'));
      return key;
    } catch {}
  }
  const fromFile = await readKeyFromFile();
  if (fromFile) return fromFile;
  const key = crypto.randomBytes(32);
  await writeKeyToFile(key);
  return key;
}

export type EncryptedPayload = { v: 1; alg: 'AES-256-GCM'; iv: string; data: string; tag: string };

export async function encryptString(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    v: 1,
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  };
  return JSON.stringify(payload);
}

export async function decryptString(payloadStr: string): Promise<string> {
  const key = await getOrCreateKey();
  const payload = JSON.parse(payloadStr) as EncryptedPayload;
  if (payload.v !== 1 || payload.alg !== 'AES-256-GCM') throw new Error('Unsupported payload');
  const iv = Buffer.from(payload.iv, 'base64');
  const data = Buffer.from(payload.data, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
