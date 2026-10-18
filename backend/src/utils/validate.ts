import { ZodSchema } from 'zod';
import { Errors } from './errors';

export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw Errors.validation(result.error.flatten());
  }
  return result.data;
}
