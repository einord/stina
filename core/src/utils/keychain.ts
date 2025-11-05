let keytar: typeof import("keytar") | undefined;

try {
  keytar = require("keytar");
} catch (error) {
  if (process.env.NODE_ENV !== "test") {
    console.warn("[pro-assist] Keytar not available, falling back to local encryption only.");
  }
}

const SERVICE_NAME = "ProAssist";

export const saveSecret = async (key: string, value: string): Promise<void> => {
  if (keytar) {
    await keytar.setPassword(SERVICE_NAME, key, value);
  } else {
    process.env[`PRO_ASSIST_SECRET_${key}`] = value;
  }
};

export const getSecret = async (key: string): Promise<string | null> => {
  if (keytar) {
    return keytar.getPassword(SERVICE_NAME, key);
  }
  return process.env[`PRO_ASSIST_SECRET_${key}`] ?? null;
};
