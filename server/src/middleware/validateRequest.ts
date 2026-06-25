import type { Response } from "express";
import { z, type ZodType } from "zod";

export class RequestValidationError extends Error {
  statusCode = 400;
  details: z.ZodIssue[];

  constructor(message: string, details: z.ZodIssue[]) {
    super(message);
    this.name = "RequestValidationError";
    this.details = details;
  }
}

export function parseRequestBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new RequestValidationError(
      firstIssue?.message || "Invalid request body",
      result.error.issues,
    );
  }

  return result.data;
}

export function parseRequestQuery<T>(schema: ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new RequestValidationError(
      firstIssue?.message || "Invalid request query",
      result.error.issues,
    );
  }

  return result.data;
}

export function sendValidationError(res: Response, error: unknown) {
  if (!(error instanceof RequestValidationError)) {
    return false;
  }

  res.status(error.statusCode).json({
    message: error.message,
    details: error.details,
  });

  return true;
}

export function moneyAmountSchema(max = 1_000_000) {
  return z.coerce
    .number({ message: "Amount is required" })
    .finite("Amount must be a valid number")
    .positive("Amount must be greater than 0")
    .max(max, `Amount cannot exceed ${max}`)
    .refine((value) => Math.round(value * 100) === value * 100, {
      message: "Amount can have at most 2 decimal places",
    });
}

export const uuidParamSchema = z
  .string()
  .trim()
  .uuid("Invalid id format");

export const safeTextSchema = (label: string, max = 120) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`)
    .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), {
      message: `${label} contains invalid characters`,
    });
