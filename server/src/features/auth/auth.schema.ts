import { z } from 'zod';

const emptyObject = z.object({}).strip();

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    password: z
      .string()
      .min(8)
      .max(100)
      .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
      .regex(/[a-z]/, 'Password must include at least one lowercase letter')
      .regex(/[0-9]/, 'Password must include at least one number'),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(100),
  }),
  params: emptyObject,
  query: emptyObject,
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().trim().min(20),
  }),
  params: emptyObject,
  query: emptyObject,
});
