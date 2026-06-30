import express from "express";
import { z } from "zod";
import { db } from "../config/db.js";
import { parseRequestBody, safeTextSchema, sendValidationError, } from "../middleware/validateRequest.js";
import { sendTransactionalEmail } from "../utils/email.js";
const router = express.Router();
const pageSlugSchema = z.enum([
    "about",
    "contact",
    "support",
    "privacy",
    "terms",
    "security",
]);
const contactMessageSchema = z
    .object({
    name: safeTextSchema("Name", 80),
    email: z.string().trim().email("Enter a valid email").max(254),
    subject: safeTextSchema("Subject", 140).optional().default("SplitVerse contact message"),
    message: safeTextSchema("Message", 3000),
})
    .strict();
const supportTicketSchema = z
    .object({
    name: safeTextSchema("Name", 80),
    email: z.string().trim().email("Enter a valid email").max(254),
    subject: safeTextSchema("Subject", 140),
    category: z.string().trim().max(80, "Category is too long").optional().default("general"),
    message: safeTextSchema("Message", 4000),
})
    .strict();
let publicPagesReady = null;
const supportEmailTo = process.env.SUPPORT_EMAIL?.trim() ||
    process.env.CONTACT_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim();
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
async function ensurePublicPagesTables() {
    await db.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS public_pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      eyebrow TEXT,
      summary TEXT,
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'closed')),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS contact_messages_created_idx
      ON contact_messages (created_at DESC);

    CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
      ON support_tickets (status, created_at DESC);
  `);
}
async function ensurePublicPagesTablesOnce() {
    publicPagesReady ??= ensurePublicPagesTables().catch((error) => {
        publicPagesReady = null;
        throw error;
    });
    return publicPagesReady;
}
router.get("/:slug", async (req, res) => {
    try {
        await ensurePublicPagesTablesOnce();
        const parsedSlug = pageSlugSchema.safeParse(req.params.slug);
        if (!parsedSlug.success) {
            return res.status(404).json({ message: "Page not found" });
        }
        const pageResult = await db.query(`
      SELECT
        slug,
        title,
        eyebrow,
        summary,
        content,
        updated_at
      FROM public_pages
      WHERE slug = $1
      AND is_published = TRUE;
      `, [parsedSlug.data]);
        const page = pageResult.rows[0];
        if (!page) {
            return res.status(404).json({ message: "Page content is not published yet" });
        }
        return res.json({
            page: {
                slug: page.slug,
                title: page.title,
                eyebrow: page.eyebrow,
                summary: page.summary,
                content: page.content,
                updatedAt: page.updated_at instanceof Date
                    ? page.updated_at.toISOString()
                    : page.updated_at,
            },
        });
    }
    catch (error) {
        console.error("Load public page failed:", error);
        return res.status(500).json({ message: "Failed to load page content" });
    }
});
router.post("/contact/messages", async (req, res) => {
    try {
        await ensurePublicPagesTablesOnce();
        const payload = parseRequestBody(contactMessageSchema, req.body);
        const result = await db.query(`
      INSERT INTO contact_messages (name, email, subject, message)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at;
      `, [payload.name, payload.email, payload.subject, payload.message]);
        return res.status(201).json({
            message: "Your message has been sent.",
            request: {
                id: result.rows[0].id,
                createdAt: result.rows[0].created_at instanceof Date
                    ? result.rows[0].created_at.toISOString()
                    : result.rows[0].created_at,
            },
        });
    }
    catch (error) {
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Create contact message failed:", error);
        return res.status(500).json({ message: "Failed to send contact message" });
    }
});
router.post("/support/tickets", async (req, res) => {
    try {
        await ensurePublicPagesTablesOnce();
        const payload = parseRequestBody(supportTicketSchema, req.body);
        const result = await db.query(`
      INSERT INTO support_tickets (name, email, subject, category, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at;
      `, [
            payload.name,
            payload.email,
            payload.subject,
            payload.category,
            payload.message,
        ]);
        const ticket = result.rows[0];
        const emailSubject = `[SplitVerse Support] ${payload.subject}`;
        const emailText = [
            `Ticket ID: ${ticket.id}`,
            `Category: ${payload.category}`,
            `Name: ${payload.name}`,
            `Email: ${payload.email}`,
            "",
            payload.message,
        ].join("\n");
        let emailStatus = "not_configured";
        if (supportEmailTo) {
            const emailResult = await sendTransactionalEmail({
                to: supportEmailTo,
                subject: emailSubject,
                text: emailText,
                html: `
          <div style="font-family:Inter,Arial,sans-serif;color:#0a0b0d;line-height:1.5;">
            <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">New SplitVerse support ticket</h1>
            <p style="margin:0 0 16px;color:#5b616e;">A user submitted a support query from the public support form.</p>
            <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
              <tr><td style="padding:8px;border:1px solid #eef0f3;">Ticket ID</td><td style="padding:8px;border:1px solid #eef0f3;">${escapeHtml(ticket.id)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #eef0f3;">Category</td><td style="padding:8px;border:1px solid #eef0f3;">${escapeHtml(payload.category)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #eef0f3;">Name</td><td style="padding:8px;border:1px solid #eef0f3;">${escapeHtml(payload.name)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #eef0f3;">Email</td><td style="padding:8px;border:1px solid #eef0f3;">${escapeHtml(payload.email)}</td></tr>
            </table>
            <h2 style="font-size:16px;font-weight:600;margin:0 0 8px;">Message</h2>
            <p style="white-space:pre-wrap;margin:0;color:#5b616e;">${escapeHtml(payload.message)}</p>
          </div>
        `,
            });
            emailStatus = emailResult.ok ? "sent" : (emailResult.reason ?? "failed");
        }
        return res.status(201).json({
            message: emailStatus === "sent"
                ? "Support ticket created and emailed to the support team."
                : "Support ticket created. Email notification could not be sent.",
            ticket: {
                id: ticket.id,
                createdAt: ticket.created_at instanceof Date
                    ? ticket.created_at.toISOString()
                    : ticket.created_at,
                emailStatus,
            },
        });
    }
    catch (error) {
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Create support ticket failed:", error);
        return res.status(500).json({ message: "Failed to create support ticket" });
    }
});
export default router;
