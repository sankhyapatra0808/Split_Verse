CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS split_room_item_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES split_room_items(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('wallet', 'manual', 'offset')),
  counter_item_id UUID REFERENCES split_room_items(id) ON DELETE SET NULL,
  wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS split_room_item_settlements_item_idx
  ON split_room_item_settlements (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS split_room_item_settlements_counter_item_idx
  ON split_room_item_settlements (counter_item_id)
  WHERE counter_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS split_room_item_settlements_method_created_idx
  ON split_room_item_settlements (method, created_at DESC);

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

INSERT INTO public_pages (slug, title, eyebrow, summary, content, is_published, updated_at)
VALUES
  (
    'about',
    'About SplitVerse',
    'About the company',
    'SplitVerse helps friends, roommates, and groups split shared expenses fairly with item-wise accuracy and wallet-based settlement.',
    '{
      "highlights": [
        {"label": "Purpose", "value": "Fair item-wise splitting"},
        {"label": "Primary market", "value": "India-first shared expenses"},
        {"label": "Core flow", "value": "Track, split, adjust, settle"}
      ],
      "sections": [
        {"heading": "What we build", "body": "SplitVerse is built for real shared spending where equal split is not always fair. Each item can be assigned to the person who actually used it, and the final settlement can be adjusted across rooms."},
        {"heading": "Why SplitVerse exists", "body": "Groups often pay bills in turns. SplitVerse keeps every room transparent and then cancels opposite dues so friends only pay the final net amount.", "bullets": ["Item-wise bill ownership", "Friend-based settlements", "Wallet top-up and payment history", "Privacy-focused account controls"]}
      ],
      "actions": [{"label": "Open Split Rooms", "href": "/split-rooms"}]
    }'::jsonb,
    TRUE,
    NOW()
  ),
  (
    'contact',
    'Contact SplitVerse',
    'Contact',
    'Reach the SplitVerse team for product questions, partnerships, feedback, or account help.',
    '{
      "contactChannels": [
        {"label": "Product help", "value": "Use the live contact form below"},
        {"label": "Support", "value": "Create a ticket from the support page", "href": "/support"}
      ],
      "sections": [
        {"heading": "When to contact us", "body": "Use this page for general messages, product feedback, partnership discussions, and non-urgent account questions."}
      ]
    }'::jsonb,
    TRUE,
    NOW()
  ),
  (
    'support',
    'Live Support',
    'Support',
    'Create a support ticket for account, wallet, split-room, friend invite, or payment-related issues.',
    '{
      "highlights": [
        {"label": "Ticket status", "value": "Stored live in database"},
        {"label": "Best for", "value": "Wallet, payments, rooms"},
        {"label": "Priority", "value": "Security and payments first"}
      ],
      "sections": [
        {"heading": "How support works", "body": "Submit the form with the issue category and a clear explanation. The ticket is saved live so the support team can review and respond."},
        {"heading": "Before submitting", "body": "For payment issues, include the approximate payment time, amount, and whether Razorpay showed success or failure. Do not share your wallet PIN or password."}
      ]
    }'::jsonb,
    TRUE,
    NOW()
  ),
  (
    'privacy',
    'Privacy Policy',
    'Privacy',
    'This page explains the kinds of account, wallet, friend, and split-room data SplitVerse uses to provide the service.',
    '{
      "sections": [
        {"heading": "Data we use", "body": "SplitVerse uses account identity, profile preferences, friends, split rooms, wallet transactions, and payment verification data to provide the app experience."},
        {"heading": "How data is protected", "body": "Sensitive wallet actions are protected with wallet PIN verification. Payment verification is handled on the backend and secret keys are never placed in the frontend."},
        {"heading": "User controls", "body": "Users can update profile preferences, export their data, and delete their account from account settings."}
      ]
    }'::jsonb,
    TRUE,
    NOW()
  ),
  (
    'terms',
    'Terms of Service',
    'Terms',
    'These terms describe how users should use SplitVerse for fair expense tracking, split rooms, wallet top-ups, and settlements.',
    '{
      "sections": [
        {"heading": "Using SplitVerse", "body": "Users should add accurate expenses, room members, item assignments, and settlement information. SplitVerse helps calculate dues but users are responsible for checking shared expense details."},
        {"heading": "Payments and wallet", "body": "Wallet top-ups and payments must be completed through verified payment flows. Wallet credits are finalized only after backend verification."},
        {"heading": "Misuse", "body": "Users must not attempt fraud, payment abuse, spam friend invites, or unauthorized access to another account."}
      ]
    }'::jsonb,
    TRUE,
    NOW()
  ),
  (
    'security',
    'Security at SplitVerse',
    'Security',
    'Security controls are designed around Firebase authentication, backend verification, wallet PIN protection, and safe payment processing.',
    '{
      "highlights": [
        {"label": "Authentication", "value": "Firebase Auth"},
        {"label": "Payments", "value": "Backend signature verification"},
        {"label": "Wallet safety", "value": "PIN protected actions"}
      ],
      "sections": [
        {"heading": "Authentication", "body": "Protected APIs require a Firebase ID token. Backend routes verify the token before returning private account data."},
        {"heading": "Wallet protection", "body": "Wallet PINs are never stored as plain text. Sensitive wallet actions require PIN verification before money moves."},
        {"heading": "Payment safety", "body": "Razorpay payment success is not trusted by the client alone. The backend verifies payment signatures before wallet credit is applied."},
        {"heading": "What users should never share", "body": "Never share your password, OTP, wallet PIN, Firebase token, or payment signature with anyone."}
      ]
    }'::jsonb,
    TRUE,
    NOW()
  )
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  eyebrow = EXCLUDED.eyebrow,
  summary = EXCLUDED.summary,
  content = EXCLUDED.content,
  is_published = EXCLUDED.is_published,
  updated_at = NOW();
