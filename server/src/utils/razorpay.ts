import crypto from "node:crypto";

const razorpayApiBaseUrl = "https://api.razorpay.com/v1";

export type RazorpayOrder = {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: string;
  notes?: Record<string, string>;
  created_at: number;
};

export type RazorpayPayment = {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string | null;
  method?: string;
  captured?: boolean;
  email?: string;
  contact?: string;
};

function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

  if (!keyId || !keySecret) {
    const error = new Error(
      "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
    (error as Error & { statusCode?: number }).statusCode = 503;
    throw error;
  }

  return { keyId, keySecret };
}

function getRazorpayAuthHeader() {
  const { keyId, keySecret } = getRazorpayCredentials();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function readRazorpayResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      data?.error?.description ||
      data?.error?.reason ||
      data?.message ||
      "Razorpay request failed";
    const error = new Error(message);
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  return data as T;
}

export function getRazorpayKeyId() {
  return getRazorpayCredentials().keyId;
}

export async function createRazorpayOrder(payload: {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const response = await fetch(`${razorpayApiBaseUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: getRazorpayAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readRazorpayResponse<RazorpayOrder>(response);
}

export async function fetchRazorpayPayment(paymentId: string) {
  const response = await fetch(`${razorpayApiBaseUrl}/payments/${paymentId}`, {
    headers: {
      Authorization: getRazorpayAuthHeader(),
    },
  });

  return readRazorpayResponse<RazorpayPayment>(response);
}

export function verifyRazorpayCheckoutSignature({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const { keySecret } = getRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return timingSafeEqual(expectedSignature, signature);
}

export function verifyRazorpayWebhookSignature({
  rawBody,
  signature,
  secret = process.env.RAZORPAY_WEBHOOK_SECRET || "",
}: {
  rawBody: Buffer;
  signature: string;
  secret?: string;
}) {
  if (!secret) {
    const error = new Error(
      "Razorpay webhook secret is not configured. Add RAZORPAY_WEBHOOK_SECRET.",
    );
    (error as Error & { statusCode?: number }).statusCode = 503;
    throw error;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return timingSafeEqual(expectedSignature, signature);
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right || "");

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}
