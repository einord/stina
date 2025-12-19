declare module 'nodemailer' {
  type SendMailResult = { messageId: string };
  type Transporter = {
    sendMail: (options: {
      from: string;
      to: string;
      subject: string;
      text: string;
      headers?: Record<string, string>;
    }) => Promise<SendMailResult>;
  };

  export function createTransport(options: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  }): Transporter;
}

