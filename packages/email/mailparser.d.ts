declare module 'mailparser' {
  export function simpleParser(
    input: Buffer | string | NodeJS.ReadableStream,
  ): Promise<{
    subject?: string | null;
    date?: Date | null;
    text?: string | null;
    html?: string | null | unknown;
  }>;
}

