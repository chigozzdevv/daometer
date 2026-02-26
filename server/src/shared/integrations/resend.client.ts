import { env } from '@/config/env.config';
import { AppError } from '@/shared/errors/app-error';

type SendResendEmailInput = {
  to: string[];
  subject: string;
  html: string;
};

type ResendSendEmailResponse = {
  id?: string;
  error?: {
    message?: string;
    name?: string;
  };
};

export const sendEmailWithResend = async (input: SendResendEmailInput): Promise<{ id: string }> => {
  if (!env.RESEND_API_KEY) {
    throw new AppError('RESEND_API_KEY is not set', 500, 'RESEND_NOT_CONFIGURED');
  }

  if (!env.RESEND_FROM_EMAIL) {
    throw new AppError('RESEND_FROM_EMAIL is not set', 500, 'RESEND_FROM_NOT_CONFIGURED');
  }

  if (input.to.length === 0) {
    throw new AppError('Email recipients are required', 400, 'RESEND_RECIPIENTS_MISSING');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });

  const payload = (await response.json()) as ResendSendEmailResponse;

  if (!response.ok || !payload.id) {
    throw new AppError(
      payload.error?.message ?? 'Failed to send email via Resend',
      502,
      'RESEND_SEND_FAILED',
      { status: response.status, payload },
    );
  }

  return { id: payload.id };
};
