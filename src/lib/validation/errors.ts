import type { ZodError } from "zod";

export function getFirstZodErrorMessage(error: ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

export function getZodFieldErrors(error: ZodError): Record<string, string[]> {
  const flattened = error.flatten();
  return Object.fromEntries(
    Object.entries(flattened.fieldErrors).filter((entry): entry is [string, string[]] => {
      const [, messages] = entry;
      return Array.isArray(messages) && messages.length > 0;
    })
  );
}
