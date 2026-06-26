# SplitVerse

**SplitVerse** is a modern full-stack expense sharing platform built for friends, roommates, trips, food bills, group spending, wallet settlements, and item-wise split payments.

It is designed as a smarter and cleaner alternative to traditional expense split apps. Instead of forcing everyone to split everything equally, SplitVerse lets users split bills based on what each person actually consumed or owes.

> Split bills fairly. Track expenses clearly. Settle payments securely.

---

## Table of Contents

* [About SplitVerse](#about-splitverse)
* [Key Features](#key-features)
* [How to Use SplitVerse](#how-to-use-splitverse)
* [Tech Stack](#tech-stack)
* [System Architecture](#system-architecture)
* [Security Features](#security-features)
* [Payment and Wallet System](#payment-and-wallet-system)
* [Currency and Language Support](#currency-and-language-support)
* [Project Structure](#project-structure)
* [Environment Variables](#environment-variables)
* [Local Setup Guide](#local-setup-guide)
* [Production Build](#production-build)
* [Upcoming Android App](#upcoming-android-app)
* [Developer Notes](#developer-notes)
* [Author](#author)

---

## About SplitVerse

SplitVerse is a full-stack expense tracker and split-payment web app where users can:

* Create shared split rooms
* Add friends
* Assign expenses item-by-item
* Track who has paid and who still owes
* Add money to wallet using Razorpay
* Pay split-room dues securely using wallet PIN
* View transaction history
* Change app currency and language
* Upload profile photos
* Manage privacy and app settings

The goal of SplitVerse is simple:

> Make shared expenses fair, transparent, and easy to settle.

Example:

If four friends go to a restaurant and the total bill is ₹1000, SplitVerse does not force everyone to pay ₹250.
If one person ate biryani worth ₹300 and another person ate food worth ₹450, each person can be assigned only their own item amount.

This makes SplitVerse useful for:

* Friends
* Roommates
* College students
* Trips
* Food bills
* Group shopping
* Shared rent/utilities
* Daily expense tracking

---

## Key Features

### Authentication

* Firebase Authentication
* Google login
* Email-based authentication support
* Secure backend user syncing
* Protected dashboard routes
* Mandatory wallet PIN setup after account creation

---

### Dashboard

* Clean dashboard overview
* Daily spending summary
* Wallet health
* Monthly spending graph
* Pending dues
* Recent activity
* Responsive dashboard layout
* Skeleton loading and smooth loading states

---

### Friends System

* Send friend requests using email
* Accept friend requests
* View friend list
* Remove friends
* Friend avatars and initials fallback
* Profile photo visibility support

---

### Split Rooms

* Create shared split rooms
* Add members to rooms
* Assign expenses to specific members
* Add item-wise expenses
* Track paid and unpaid items
* Pay individual dues from wallet
* Owner/member support
* Split history and room balance tracking

---

### Wallet System

* Wallet balance tracking
* Wallet top-up support
* Wallet transaction history
* Wallet PIN security
* Change wallet PIN
* Forgot wallet PIN via email OTP
* Wallet PIN required before paying dues
* Safer wallet debit/credit handling on backend

---

### Razorpay Payment Integration

* Razorpay Checkout integration
* Backend order creation
* Payment signature verification
* Razorpay webhook support
* Captured payment confirmation before wallet credit
* Idempotency handling to prevent duplicate wallet credits

---

### Cloudinary Profile Uploads

* Upload profile photos from computer
* Images stored securely on Cloudinary
* Backend validates image type and size
* Database stores secure Cloudinary URL
* Old local upload fallback supported

---

### Realtime Currency Conversion

* INR remains the base currency for all stored money
* Live exchange rates are fetched through backend
* Rates are cached in Neon/Postgres
* Fallback rates used if exchange-rate provider is unavailable
* Frontend never exposes exchange-rate API secrets
* Currency converter available in App Settings

---

### App Settings

* Change app currency
* Change app language
* Currency converter
* Profile photo settings
* Privacy mode
* Compact mode
* Notification preferences
* Wallet PIN management
* Download user data
* Delete account flow

---

## How to Use SplitVerse

### 1. Create an Account

Open SplitVerse and sign in using your available authentication method.

After signing in for the first time, SplitVerse will create your user profile in the database.

---

### 2. Set Your Wallet PIN

After account creation, you must set a wallet PIN.

This PIN is required for wallet-based payments inside the app.

Use a strong 4 to 6 digit PIN. Avoid common PINs like:

```txt
1234
0000
1111
123456
```

---

### 3. Add Friends

Go to the **Friends** page.

Enter your friend’s email and send a friend request.

Once your friend accepts the request, they will appear in your friends list.

---

### 4. Create a Split Room

Go to **Shared Split Rooms**.

Create a new room for a shared expense, for example:

```txt
Goa Trip
Hostel Dinner
Flat Rent
Birthday Party
Restaurant Bill
```

Add friends or members to the room.

---

### 5. Add Items to the Room

Inside a split room, add expenses item by item.

Example:

```txt
Biryani - ₹300 - Assigned to Arpan
Pizza - ₹450 - Assigned to Harshit
Drinks - ₹250 - Assigned to Rahul
```

Each person is responsible only for the item assigned to them.

---

### 6. Track Pending Payments

SplitVerse automatically tracks:

* Total room amount
* Paid amount
* Outstanding amount
* Member-wise dues
* Collected items
* Pending items

---

### 7. Add Money to Wallet

Go to **Wallet Top-Up**.

Enter the amount and pay using Razorpay Checkout.

Once the payment is verified by the backend, the amount is added to your wallet.

---

### 8. Pay Your Dues

When you owe money in a split room, click the due/payment option.

Enter your wallet PIN.

If your wallet balance is enough, SplitVerse deducts the amount and marks the item as paid.

---

### 9. View Transaction History

Go to **Transaction History** to see:

* Wallet credits
* Wallet debits
* Payments made
* Payments received
* Pending or completed transactions

---

### 10. Customize App Settings

Go to **App Settings** to manage:

* Currency
* Language
* Profile photo
* Wallet PIN
* Notification preferences
* Data export
* Account deletion

---

## Tech Stack

### Frontend

* React
* TypeScript
* Vite
* React Router
* Firebase Client SDK
* Lucide React Icons
* Custom CSS
* Responsive dashboard UI
* Skeleton loaders
* Local app preference caching

---

### Backend

* Node.js
* Express.js
* TypeScript
* PostgreSQL
* Neon Database
* Firebase Admin SDK
* Razorpay SDK
* Cloudinary SDK
* Nodemailer
* Brevo SMTP
* Zod validation
* Helmet
* Express Rate Limit
* Multer
* Argon2

---

### Database

* Neon PostgreSQL
* SQL migrations
* UUID primary keys
* Transaction-safe wallet updates
* Cached exchange-rate table
* Payment idempotency tables
* Wallet PIN security fields
* Friend request and split-room relational models

---

### Authentication

* Firebase Authentication
* Firebase Admin token verification on backend
* Protected API routes
* Synced backend user records

---

### Payments

* Razorpay Checkout
* Razorpay Orders API
* Razorpay payment signature verification
* Razorpay webhook verification
* Wallet credit after verified captured payment

---

### Media Storage

* Cloudinary
* Secure profile photo uploads
* Cloudinary secure URLs stored in database

---

### Email

* Brevo SMTP
* Nodemailer
* Wallet PIN reset OTP emails
* Email-based notification support

---

### Currency Conversion

* Backend exchange-rate route
* External exchange-rate provider support
* PostgreSQL exchange-rate cache
* Stale-cache fallback
* Frontend display conversion only
* INR remains the canonical storage currency

---

## System Architecture

```txt
Frontend React App
        |
        | Firebase Auth Token
        v
Express TypeScript Backend
        |
        | verifies Firebase token
        v
Neon PostgreSQL Database
        |
        | payments
        v
Razorpay
        |
        | images
        v
Cloudinary
        |
        | emails
        v
Brevo SMTP
        |
        | exchange rates
        v
Exchange Rate Provider
```

---

## Security Features

SplitVerse includes multiple production-focused security layers:

* Firebase token verification on protected backend routes
* Wallet PIN hashing using Argon2
* Wallet PIN reset using email OTP
* OTP expiry and attempt limits
* Razorpay payment signature verification
* Razorpay webhook HMAC verification
* Payment idempotency protection
* Helmet security headers
* API rate limiting
* Auth-specific rate limiting
* Zod request validation
* CORS origin control
* Server-side environment secrets
* Cloudinary upload validation
* Backend-only database access

Important:

Frontend environment variables are public after build if they start with `VITE_`.

Never place these in frontend:

```txt
DATABASE_URL
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
FIREBASE_PRIVATE_KEY
FIREBASE_CLIENT_EMAIL
BREVO_SMTP_KEY
CLOUDINARY_API_SECRET
```

Allowed frontend values:

```txt
VITE_API_URL
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_RAZORPAY_KEY_ID
```

---

## Payment and Wallet System

SplitVerse uses a wallet-first payment model.

### Wallet Top-Up Flow

```txt
User enters amount
        |
Frontend asks backend to create Razorpay order
        |
Razorpay Checkout opens
        |
User completes payment
        |
Backend verifies payment signature
        |
Backend confirms payment status
        |
Wallet is credited
```

### Wallet Due Payment Flow

```txt
User selects pending due
        |
User enters wallet PIN
        |
Backend verifies PIN
        |
Backend checks wallet balance
        |
Wallet debit happens in database transaction
        |
Due item is marked paid
```

All wallet-sensitive operations are handled on the backend.

---

## Currency and Language Support

SplitVerse supports multiple display currencies and languages.

Supported currencies include:

* INR
* USD
* CAD
* EUR
* GBP
* AED
* AUD
* SGD
* CHF
* JPY
* CNY

Important:

All actual stored money values remain in INR.

Currency conversion is used only for display and quick conversion. This keeps wallet, Razorpay, expenses, and settlements consistent and safe.

---

## Project Structure

```txt
SplitVerse/
│
├── src/
│   ├── assets/
│   ├── components/
│   ├── context/
│   ├── i18n/
│   ├── lib/
│   ├── pageloaders/
│   ├── pages/
│   ├── styles/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   │   └── migrations/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── utils/
│   │   ├── liveEvents.ts
│   │   └── index.ts
│   │
│   ├── package.json
│   └── tsconfig.json
│
├── package.json
├── vite.config.ts
└── README.md
```

---

## Environment Variables

### Frontend `.env`

```env
VITE_API_URL=http://localhost:5000

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id

VITE_RAZORPAY_KEY_ID=rzp_test_or_live_key_id
```

---

### Server `.env`

```env
NODE_ENV=development
PORT=5000

CLIENT_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173,http://localhost:4173
SERVER_URL=http://localhost:5000

DATABASE_URL=your_neon_postgres_connection_url

FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_admin_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key

RAZORPAY_KEY_ID=rzp_test_or_live_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CLOUDINARY_PROFILE_FOLDER=splitverse/profile-photos

BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_login
BREVO_SMTP_KEY=your_brevo_smtp_key
EMAIL_FROM=SplitVerse <your_verified_email@example.com>

EXCHANGE_RATE_PROVIDER=open-er-api
EXCHANGE_RATE_API_URL=https://open.er-api.com/v6/latest
EXCHANGE_RATE_API_KEY=
EXCHANGE_RATE_CACHE_TTL_MINUTES=360
EXCHANGE_RATE_STALE_FALLBACK_HOURS=168

ENABLE_SETUP_ROUTES=false
ENABLE_DEV_WALLET_TOP_UP=false
ENABLE_DEV_PAYMENT_APPROVAL=false

DB_POOL_MAX=10
DB_CONNECTION_TIMEOUT_MS=30000
DB_IDLE_TIMEOUT_MS=60000
DB_QUERY_TIMEOUT_MS=30000
DB_STATEMENT_TIMEOUT_MS=30000
DB_POOL_MAX_USES=7500

API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=700
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=80
JSON_BODY_LIMIT=100kb
```

---

## Local Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Split_Verse.git
cd Split_Verse
```

---

### 2. Install Frontend Dependencies

```bash
npm install
```

---

### 3. Install Backend Dependencies

```bash
cd server
npm install
```

---

### 4. Configure Environment Variables

Create:

```txt
.env
server/.env
```

Fill the frontend and backend environment variables shown above.

---

### 5. Run Database Migrations

From the `server` folder:

```bash
npm run db:migrate
```

---

### 6. Start Backend Server

```bash
npm run dev
```

Backend will run on:

```txt
http://localhost:5000
```

Health check:

```txt
http://localhost:5000/api/health
```

---

### 7. Start Frontend

In another terminal from the project root:

```bash
npm run dev
```

Frontend will run on:

```txt
http://localhost:5173
```

---

## Production Build

### Frontend

```bash
npm run build
npm run preview
```

Preview runs on:

```txt
http://localhost:4173
```

Deploy only the generated:

```txt
dist/
```

folder to your frontend hosting platform.

Recommended frontend hosting:

* Vercel
* Netlify
* Cloudflare Pages

---

### Backend

From the `server` folder:

```bash
npm run build
npm start
```

Recommended backend hosting:

* Render
* Railway
* Fly.io

---

### Production Deployment Notes

Before production launch:

* Use production frontend URL in `CLIENT_URL`
* Use production backend URL in `VITE_API_URL`
* Use live Razorpay keys
* Add production Razorpay webhook
* Disable setup routes
* Disable dev wallet top-up
* Restrict Firebase authorized domains
* Restrict Firebase API key
* Enable Firebase App Check
* Use production Neon database
* Use secure environment variables on hosting platform

---

## Upcoming Android App

A mobile version of SplitVerse is coming soon for Android.

The Android version will focus on:

* Faster bill splitting
* Mobile-first split-room experience
* Wallet and payment tracking
* Friend requests
* Push notifications
* Better on-the-go expense management

Stay tuned for the official SplitVerse Android release.

---

## Developer Notes

### Money Storage Rule

All money must be stored in INR.

Do not store converted currency values in the database unless a future multi-currency accounting system is intentionally designed.

Current conversion is display-only.

---

### Payment Rule

Never trust frontend payment status.

Always verify Razorpay payments on the backend before crediting wallet balance.

---

### Wallet Rule

Wallet debit and split-room due payment should always happen inside backend-controlled database transactions.

---

### Secret Rule

Never expose backend secrets in frontend.

Any value beginning with `VITE_` can be visible in the browser after build.

---

### Upload Rule

New profile photo uploads should go through backend and Cloudinary.

Do not depend on local `/uploads` for production image storage.

---

## Roadmap

* Android mobile app
* Push notifications
* Better analytics dashboard
* Group budget planning
* Recurring shared expenses
* Expense categories and insights
* Friend activity timeline
* Advanced settlement suggestions
* Export reports as PDF
* Dark mode
* AI-powered spending insights

---

## Author

Built by **Sankhya Patra**

SplitVerse is built with the goal of making shared expenses more transparent, fair, and effortless.

---

## License

This project is currently private/proprietary unless a license is added.

If you want to open-source it later, add a license such as MIT, Apache-2.0, or GPL depending on your preference.
