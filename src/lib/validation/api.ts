import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { getFirstZodErrorMessage, getZodFieldErrors } from "./errors";

export function createValidationErrorResponse(error: ZodError) {
  return NextResponse.json(
    {
      error: getFirstZodErrorMessage(error, "Invalid request."),
      fieldErrors: getZodFieldErrors(error),
    },
    { status: 400 }
  );
}

export async function parseRequestJson<T>(
  request: Request,
  schema: ZodType<T>
): Promise<
  | { success: true; data: T }
  | { success: false; response: NextResponse }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      response: createValidationErrorResponse(parsed.error),
    };
  }

  return { success: true, data: parsed.data };
}
