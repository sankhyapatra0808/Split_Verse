import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { db } from "../config/db.js";
import { sendLiveUpdate } from "../liveEvents.js";
import { moneyAmountSchema, parseRequestBody, sendValidationError, } from "../middleware/validateRequest.js";
import { verifyFirebaseToken, } from "../middleware/verifyFirebaseToken.js";
import { createRazorpayOrder, fetchRazorpayPayment, getRazorpayKeyId, verifyRazorpayCheckoutSignature, verifyRazorpayWebhookSignature, } from "../utils/razorpay.js";
const router = express.Router();
const walletOrderMaxAmount = Number(process.env.RAZORPAY_WALLET_TOP_UP_MAX || 100000);
const supportedCurrencies = new Set(["INR"]);
const createWalletOrderSchema = z
    .object({
    amount: moneyAmountSchema(walletOrderMaxAmount),
    currency: z.string().trim().toUpperCase().optional().default("INR"),
    method: z.string().trim().max(40).optional(),
})
    .strict();
const verifyWalletPaymentSchema = z
    .object({
    razorpayOrderId: z.string().trim().min(1, "Razorpay order id is required"),
    razorpayPaymentId: z.string().trim().min(1, "Razorpay payment id is required"),
    razorpaySignature: z.string().trim().min(1, "Razorpay signature is required"),
})
    .strict();
const devApproveSchema = z
    .object({
    razorpayOrderId: z.string().trim().min(1, "Razorpay order id is required"),
})
    .strict();
async function getCurrentDbUser(firebaseUid) {
    const result = await db.query(`
    SELECT id, name, email
    FROM users
    WHERE firebase_uid = $1;
    `, [firebaseUid]);
    return result.rows[0] ?? null;
}
function toPaise(amount) {
    return Math.round(amount * 100);
}
function toRupeesFromPaise(amount) {
    return Math.round(amount) / 100;
}
function makeReceipt() {
    return `sv_${crypto.randomBytes(12).toString("hex")}`;
}
function hashPayload(rawBody) {
    return crypto.createHash("sha256").update(rawBody).digest("hex");
}
async function getWalletBalance(client, userId) {
    const balanceResult = await client.query(`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN type = 'credit' THEN amount
            WHEN type = 'debit' THEN -amount
            ELSE 0
          END
        )::float,
        0
      ) AS wallet_balance
    FROM wallet_transactions
    WHERE user_id = $1;
    `, [userId]);
    return Number(balanceResult.rows[0].wallet_balance);
}
async function creditWalletForPaidOrder({ client, order, payment, idempotencyKey, source, }) {
    const expectedPaise = toPaise(Number(order.amount));
    const paidPaise = Number(payment.amount);
    if (payment.currency !== order.currency) {
        throw Object.assign(new Error("Payment currency does not match the order"), {
            statusCode: 400,
        });
    }
    if (paidPaise !== expectedPaise) {
        throw Object.assign(new Error("Payment amount does not match the order"), {
            statusCode: 400,
        });
    }
    if (order.status === "paid") {
        return {
            inserted: false,
            walletBalance: await getWalletBalance(client, order.user_id),
        };
    }
    const description = `Wallet top-up via Razorpay${payment.method ? ` (${payment.method})` : ""}`;
    const transactionResult = await client.query(`
    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      description,
      idempotency_key,
      provider,
      provider_order_id,
      provider_payment_id,
      metadata
    )
    VALUES ($1, 'credit', $2, $3, $4, 'razorpay', $5, $6, $7::jsonb)
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id;
    `, [
        order.user_id,
        toRupeesFromPaise(paidPaise),
        description,
        idempotencyKey,
        order.provider_order_id,
        payment.id,
        JSON.stringify({ source, razorpayStatus: payment.status, method: payment.method || null }),
    ]);
    await client.query(`
    UPDATE payment_orders
    SET
      status = 'paid',
      provider_payment_id = $2,
      metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
      updated_at = NOW()
    WHERE id = $1;
    `, [
        order.id,
        payment.id,
        JSON.stringify({ creditedBy: source, razorpayStatus: payment.status }),
    ]);
    return {
        inserted: transactionResult.rows.length > 0,
        walletBalance: await getWalletBalance(client, order.user_id),
    };
}
router.post("/razorpay/wallet-order", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const body = parseRequestBody(createWalletOrderSchema, req.body);
        if (!supportedCurrencies.has(body.currency)) {
            return res.status(400).json({ message: "Unsupported payment currency" });
        }
        const dbUser = await getCurrentDbUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const amountInPaise = toPaise(body.amount);
        const receipt = makeReceipt();
        const order = await createRazorpayOrder({
            amount: amountInPaise,
            currency: body.currency,
            receipt,
            notes: {
                splitverseUserId: dbUser.id,
                purpose: "wallet_top_up",
            },
        });
        await db.query(`
        INSERT INTO payment_orders (
          user_id,
          provider,
          provider_order_id,
          amount,
          currency,
          status,
          metadata
        )
        VALUES ($1, 'razorpay', $2, $3, $4, 'created', $5::jsonb)
        ON CONFLICT (provider_order_id) DO NOTHING;
        `, [
            dbUser.id,
            order.id,
            body.amount,
            body.currency,
            JSON.stringify({ receipt, method: body.method || null, razorpayOrderStatus: order.status }),
        ]);
        return res.status(201).json({
            keyId: getRazorpayKeyId(),
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            name: "SplitVerse",
            description: "SplitVerse wallet top-up",
            prefill: {
                name: dbUser.name || "",
                email: dbUser.email,
            },
        });
    }
    catch (error) {
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Create Razorpay wallet order failed:", error);
        return res.status(error.statusCode || 500).json({
            message: error instanceof Error
                ? error.message
                : "Failed to create Razorpay order",
        });
    }
});
router.post("/razorpay/verify-wallet-payment", verifyFirebaseToken, async (req, res) => {
    const client = await db.connect();
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const body = parseRequestBody(verifyWalletPaymentSchema, req.body);
        const validSignature = verifyRazorpayCheckoutSignature({
            orderId: body.razorpayOrderId,
            paymentId: body.razorpayPaymentId,
            signature: body.razorpaySignature,
        });
        if (!validSignature) {
            return res.status(400).json({ message: "Invalid Razorpay payment signature" });
        }
        const dbUser = await getCurrentDbUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const payment = await fetchRazorpayPayment(body.razorpayPaymentId);
        if (payment.order_id !== body.razorpayOrderId) {
            return res.status(400).json({ message: "Payment does not belong to this order" });
        }
        if (payment.status !== "captured") {
            return res.status(409).json({
                message: "Payment is not captured yet. Wallet will update after Razorpay confirms it.",
            });
        }
        await client.query("BEGIN");
        const orderResult = await client.query(`
        SELECT
          id,
          user_id,
          provider,
          provider_order_id,
          provider_payment_id,
          amount::float,
          currency,
          status,
          metadata
        FROM payment_orders
        WHERE provider = 'razorpay'
        AND provider_order_id = $1
        FOR UPDATE;
        `, [body.razorpayOrderId]);
        const order = orderResult.rows[0];
        if (!order) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Payment order not found" });
        }
        if (order.user_id !== dbUser.id) {
            await client.query("ROLLBACK");
            return res.status(403).json({ message: "This payment order is not yours" });
        }
        const creditResult = await creditWalletForPaidOrder({
            client,
            order,
            payment,
            idempotencyKey: `razorpay:${payment.id}`,
            source: "checkout",
        });
        await client.query("COMMIT");
        sendLiveUpdate([dbUser.id], {
            type: "money",
            reason: "wallet-top-up",
        });
        return res.json({
            message: creditResult.inserted
                ? "Wallet credited successfully"
                : "Wallet was already credited for this payment",
            walletBalance: creditResult.walletBalance,
        });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Verify Razorpay payment failed:", error);
        return res.status(error.statusCode || 500).json({
            message: error instanceof Error
                ? error.message
                : "Failed to verify Razorpay payment",
        });
    }
    finally {
        client.release();
    }
});
router.post("/dev/approve-wallet-order", verifyFirebaseToken, async (req, res) => {
    const client = await db.connect();
    try {
        if (process.env.ENABLE_DEV_PAYMENT_APPROVAL !== "true") {
            return res.status(404).json({ message: "Not found" });
        }
        const secret = process.env.DEV_PAYMENT_APPROVAL_SECRET || "";
        if (!secret || req.header("x-dev-payment-secret") !== secret) {
            return res.status(403).json({ message: "Developer payment approval is protected" });
        }
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const body = parseRequestBody(devApproveSchema, req.body);
        const dbUser = await getCurrentDbUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        await client.query("BEGIN");
        const orderResult = await client.query(`
        SELECT
          id,
          user_id,
          provider,
          provider_order_id,
          provider_payment_id,
          amount::float,
          currency,
          status,
          metadata
        FROM payment_orders
        WHERE provider = 'razorpay'
        AND provider_order_id = $1
        FOR UPDATE;
        `, [body.razorpayOrderId]);
        const order = orderResult.rows[0];
        if (!order) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Payment order not found" });
        }
        if (order.user_id !== dbUser.id) {
            await client.query("ROLLBACK");
            return res.status(403).json({ message: "This payment order is not yours" });
        }
        const fakePaymentId = `dev_${body.razorpayOrderId}`;
        const creditResult = await creditWalletForPaidOrder({
            client,
            order,
            payment: {
                id: fakePaymentId,
                amount: toPaise(Number(order.amount)),
                currency: order.currency,
                status: "captured",
                method: "dev-approval",
            },
            idempotencyKey: `razorpay-dev:${body.razorpayOrderId}`,
            source: "dev",
        });
        await client.query("COMMIT");
        sendLiveUpdate([dbUser.id], { type: "money", reason: "wallet-top-up" });
        return res.json({
            message: creditResult.inserted
                ? "Developer approval credited the wallet"
                : "Wallet was already credited for this order",
            walletBalance: creditResult.walletBalance,
        });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Developer payment approval failed:", error);
        return res.status(500).json({
            message: error instanceof Error
                ? error.message
                : "Failed to approve developer payment",
        });
    }
    finally {
        client.release();
    }
});
export async function razorpayWebhookHandler(req, res) {
    const client = await db.connect();
    try {
        const rawBody = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(String(req.body || ""));
        const signature = String(req.header("x-razorpay-signature") || "");
        const eventId = String(req.header("x-razorpay-event-id") || "");
        if (!eventId) {
            return res.status(400).json({ message: "Missing Razorpay event id" });
        }
        const validSignature = verifyRazorpayWebhookSignature({
            rawBody,
            signature,
        });
        if (!validSignature) {
            return res.status(400).json({ message: "Invalid Razorpay webhook signature" });
        }
        const eventPayload = JSON.parse(rawBody.toString("utf8"));
        const eventType = String(eventPayload.event || "");
        const payment = eventPayload.payload?.payment?.entity;
        await client.query("BEGIN");
        const idempotencyResult = await client.query(`
      INSERT INTO payment_idempotency_keys (
        provider,
        event_id,
        event_type,
        payload_hash
      )
      VALUES ('razorpay', $1, $2, $3)
      ON CONFLICT (provider, event_id) DO NOTHING
      RETURNING id;
      `, [eventId, eventType, hashPayload(rawBody)]);
        if (idempotencyResult.rows.length === 0) {
            await client.query("COMMIT");
            return res.json({ received: true, duplicate: true });
        }
        if (eventType !== "payment.captured" || !payment?.order_id || !payment?.id) {
            await client.query(`
        UPDATE payment_idempotency_keys
        SET processed_at = NOW()
        WHERE provider = 'razorpay'
        AND event_id = $1;
        `, [eventId]);
            await client.query("COMMIT");
            return res.json({ received: true, ignored: true });
        }
        const orderResult = await client.query(`
      SELECT
        id,
        user_id,
        provider,
        provider_order_id,
        provider_payment_id,
        amount::float,
        currency,
        status,
        metadata
      FROM payment_orders
      WHERE provider = 'razorpay'
      AND provider_order_id = $1
      FOR UPDATE;
      `, [payment.order_id]);
        const order = orderResult.rows[0];
        if (!order) {
            await client.query(`
        UPDATE payment_idempotency_keys
        SET processed_at = NOW()
        WHERE provider = 'razorpay'
        AND event_id = $1;
        `, [eventId]);
            await client.query("COMMIT");
            return res.json({ received: true, unknownOrder: true });
        }
        const creditResult = await creditWalletForPaidOrder({
            client,
            order,
            payment,
            idempotencyKey: `razorpay:${payment.id}`,
            source: "webhook",
        });
        await client.query(`
      UPDATE payment_idempotency_keys
      SET processed_at = NOW()
      WHERE provider = 'razorpay'
      AND event_id = $1;
      `, [eventId]);
        await client.query("COMMIT");
        sendLiveUpdate([order.user_id], { type: "money", reason: "wallet-top-up" });
        return res.json({
            received: true,
            credited: creditResult.inserted,
        });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("Razorpay webhook failed:", error);
        return res.status(error.statusCode || 500).json({
            message: error instanceof Error ? error.message : "Razorpay webhook failed",
        });
    }
    finally {
        client.release();
    }
}
export default router;
