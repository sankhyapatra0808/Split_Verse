import crypto from "node:crypto";
const razorpayApiBaseUrl = "https://api.razorpay.com/v1";
function getRazorpayCredentials() {
    const keyId = process.env.RAZORPAY_KEY_ID || "";
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    if (!keyId || !keySecret) {
        const error = new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
        error.statusCode = 503;
        throw error;
    }
    return { keyId, keySecret };
}
function getRazorpayAuthHeader() {
    const { keyId, keySecret } = getRazorpayCredentials();
    return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}
async function readRazorpayResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const message = data?.error?.description ||
            data?.error?.reason ||
            data?.message ||
            "Razorpay request failed";
        const error = new Error(message);
        error.statusCode = response.status;
        throw error;
    }
    return data;
}
export function getRazorpayKeyId() {
    return getRazorpayCredentials().keyId;
}
export async function createRazorpayOrder(payload) {
    const response = await fetch(`${razorpayApiBaseUrl}/orders`, {
        method: "POST",
        headers: {
            Authorization: getRazorpayAuthHeader(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    return readRazorpayResponse(response);
}
export async function fetchRazorpayPayment(paymentId) {
    const response = await fetch(`${razorpayApiBaseUrl}/payments/${paymentId}`, {
        headers: {
            Authorization: getRazorpayAuthHeader(),
        },
    });
    return readRazorpayResponse(response);
}
export function verifyRazorpayCheckoutSignature({ orderId, paymentId, signature, }) {
    const { keySecret } = getRazorpayCredentials();
    const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
    return timingSafeEqual(expectedSignature, signature);
}
export function verifyRazorpayWebhookSignature({ rawBody, signature, secret = process.env.RAZORPAY_WEBHOOK_SECRET || "", }) {
    if (!secret) {
        const error = new Error("Razorpay webhook secret is not configured. Add RAZORPAY_WEBHOOK_SECRET.");
        error.statusCode = 503;
        throw error;
    }
    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
    return timingSafeEqual(expectedSignature, signature);
}
function timingSafeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right || "");
    return (leftBuffer.length === rightBuffer.length &&
        crypto.timingSafeEqual(leftBuffer, rightBuffer));
}
