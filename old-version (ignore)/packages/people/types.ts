export type Person = {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
};

export type PersonInput = {
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PersonUpdate = {
  name?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};
