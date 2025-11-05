import { randomBytes } from "node:crypto";
import { getSecret, saveSecret } from "../utils/keychain.js";

const MASTER_KEY_ENV = "PRO_ASSIST_CRYPTO_KEY";
const MASTER_KEY_ID = "master-key";

const generateKey = (): string => randomBytes(32).toString("base64");

export const getEncryptionKey = async (): Promise<string> => {
  if (process.env[MASTER_KEY_ENV]) {
    return process.env[MASTER_KEY_ENV] as string;
  }

  const existing = await getSecret(MASTER_KEY_ID);
  if (existing) {
    process.env[MASTER_KEY_ENV] = existing;
    return existing;
  }

  const created = generateKey();
  await saveSecret(MASTER_KEY_ID, created);
  process.env[MASTER_KEY_ENV] = created;
  return created;
};
