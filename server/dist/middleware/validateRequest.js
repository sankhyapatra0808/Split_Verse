import { z } from "zod";
export class RequestValidationError extends Error {
    statusCode = 400;
    details;
    constructor(message, details) {
        super(message);
        this.name = "RequestValidationError";
        this.details = details;
    }
}
export function parseRequestBody(schema, body) {
    const result = schema.safeParse(body);
    if (!result.success) {
        const firstIssue = result.error.issues[0];
        throw new RequestValidationError(firstIssue?.message || "Invalid request body", result.error.issues);
    }
    return result.data;
}
export function parseRequestQuery(schema, query) {
    const result = schema.safeParse(query);
    if (!result.success) {
        const firstIssue = result.error.issues[0];
        throw new RequestValidationError(firstIssue?.message || "Invalid request query", result.error.issues);
    }
    return result.data;
}
export function sendValidationError(res, error) {
    if (!(error instanceof RequestValidationError)) {
        return false;
    }
    res.status(error.statusCode).json({
        message: error.message,
        details: error.details,
    });
    return true;
}
function hasAtMostTwoDecimalPlaces(value) {
    // Currency conversions can produce values like 2174.9500000000003 even
    // after frontend rounding. Treat tiny floating-point noise as valid.
    const cents = value * 100;
    return Math.abs(cents - Math.round(cents)) < 1e-6;
}
export function moneyAmountSchema(max = 1_000_000) {
    return z.coerce
        .number({ message: "Amount is required" })
        .finite("Amount must be a valid number")
        .positive("Amount must be greater than 0")
        .max(max, `Amount cannot exceed ${max}`)
        .refine(hasAtMostTwoDecimalPlaces, {
        message: "Amount can have at most 2 decimal places",
    })
        .transform((value) => Math.round((value + Number.EPSILON) * 100) / 100);
}
function hasControlCharacter(value) {
    return Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
    });
}
export const uuidParamSchema = z.string().trim().uuid("Invalid id format");
export const safeTextSchema = (label, max = 120) => z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`)
    .refine((value) => !hasControlCharacter(value), {
    message: `${label} contains invalid characters`,
});
