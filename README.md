# SplitVerse

SplitVerse is a production-oriented expense sharing and wallet application built with a React + TypeScript + Vite frontend, an Express + TypeScript backend, Firebase Authentication, Neon Postgres, Razorpay payments, Cloudinary profile uploads, Brevo email, and realtime cached currency conversion.

The app is designed around one important accounting rule:

> **All money is stored and processed internally in INR. Selected currencies are used only for input convenience and display conversion.**

This keeps wallet balances, expenses, split-room dues, Razorpay payments, and database records consistent while still allowing users to view and enter values in currencies like USD, EUR, GBP, AED, CAD, AUD, SGD, CHF, JPY, and CNY.

---

## Current Working Status

The following features are implemented and working:

- Firebase Authentication with protected app routes.
- Mandatory wallet PIN setup after account creation/login.
- Wallet PIN change using current PIN.
- Forgot wallet PIN flow using email OTP.
- Razorpay wallet top-up with backend order creation and backend payment verification.
- Razorpay webhook support with raw-body signature verification.
- Wallet payments for split-room dues using wallet PIN.
- Cloudinary profile photo uploads instead of local production uploads.
- Friends system with request, accept, delete, and cached summary loading.
- Shared Split Rooms with itemized dues.
- Only the room owner can add split-room items.
- Members can click their member row to open the payment popup.
- Payment popup shows member details, assigned items, due amount, and wallet PIN field.
- Room owner can manually collect dues from a compact collect button beside the member name.
- Dashboard expense input uses the selected app currency.
- Shared Split Room item input and edit input use the selected app currency.
- Wallet top-up custom amount uses selected currency and converts to INR before Razorpay.
- Realtime/cached exchange-rate backend route.
- Exchange-rate cache in Neon Postgres.
- Fallback currency rates if provider/cache fails.
- Backend stores expenses, wallet balances, split-room items, and Razorpay values in INR.
- Daily expense limit is now **25 expenses per day**.
- Vite production build works and does not expose the `/src` folder like dev mode.
- Backend security hardening with Helmet, CORS origin control, rate limits, validation, and protected setup routes.

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- Firebase client SDK
- Lucide React icons
- Custom CSS modules/stylesheets

### Backend

- Node.js
- Express
- TypeScript
- PostgreSQL via `pg`
- Firebase Admin token verification
- Zod request validation
- Helmet
- Express Rate Limit
- Razorpay SDK
- Cloudinary SDK
- Nodemailer / Brevo SMTP

### Infrastructure

- Neon Postgres
- Firebase Authentication
- Razorpay
- Cloudinary
- Brevo SMTP
- Frontend deployment target: Vercel / Netlify / similar
- Backend deployment target: Render / Railway / Fly.io / similar

---

## Main Project Rules

### Money Rule

All backend/database money values remain INR.

This includes:

- expenses
- wallet balances
- wallet transactions
- Razorpay wallet top-ups
- split-room items
- split-room pending dues
- settlement/payment records

Selected currency is only used for:

- frontend input convenience
- frontend display formatting
- currency converter in settings

Example:

```txt
Selected app currency: USD
User enters expense: 23
Frontend converts 23 USD to INR
Backend stores INR amount
App displays the value back in USD
```

### Secrets Rule

Never put backend secrets in frontend `.env`.

Safe frontend values:

```env
VITE_API_URL=
VITE_RAZORPAY_KEY_ID=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

Never expose these in frontend:

```env
DATABASE_URL=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
BREVO_SMTP_KEY=
CLOUDINARY_API_SECRET=
SETUP_ROUTE_SECRET=
WALLET_PIN_OTP_PEPPER=
```

---

## Local Setup

### 1. Clone and install frontend

From the project root:

```powershell
npm install
```

Create frontend `.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_RAZORPAY_KEY_ID=rzp_test_your_key_id

VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

Run frontend dev server:

```powershell
npm run dev
```

Default Vite dev URL:

```txt
http://localhost:5173
```

---

### 2. Install backend

From the server folder:

```powershell
cd server
npm install
```

Create `server/.env` using the template below.

---

## Server Environment Variables

```env
NODE_ENV=development
PORT=5000

CLIENT_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173,http://localhost:4173
SERVER_URL=http://localhost:5000

DATABASE_URL=your_neon_database_url

DB_POOL_MAX=10
DB_CONNECTION_TIMEOUT_MS=30000
DB_IDLE_TIMEOUT_MS=60000
DB_QUERY_TIMEOUT_MS=30000
DB_STATEMENT_TIMEOUT_MS=30000
DB_POOL_MAX_USES=7500

JSON_BODY_LIMIT=100kb

ENABLE_SETUP_ROUTES=false
SETUP_ROUTE_SECRET=make-this-long-random-secret

API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=700
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=80

MAX_EXPENSE_AMOUNT=1000000

RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_WEBHOOK_BODY_LIMIT=1mb

ENABLE_DEV_WALLET_TOP_UP=false
ENABLE_DEV_PAYMENT_APPROVAL=false
DEV_PAYMENT_APPROVAL_SECRET=make-this-long-random-secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CLOUDINARY_PROFILE_FOLDER=splitverse/profile-photos

BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_login_email_or_user
BREVO_SMTP_KEY=your_brevo_smtp_key
EMAIL_FROM=SplitVerse <your_verified_sender@example.com>

WALLET_PIN_RESET_OTP_EXPIRY_MS=600000
WALLET_PIN_RESET_OTP_MAX_ATTEMPTS=5
WALLET_PIN_RESET_OTP_MAX_REQUESTS=3
WALLET_PIN_RESET_OTP_WINDOW_MINUTES=15
WALLET_PIN_OTP_PEPPER=make-this-long-random-secret

EXCHANGE_RATE_PROVIDER=open-er-api
EXCHANGE_RATE_API_URL=https://open.er-api.com/v6/latest
EXCHANGE_RATE_API_KEY=
EXCHANGE_RATE_CACHE_TTL_MINUTES=360
EXCHANGE_RATE_STALE_FALLBACK_HOURS=168
```

For the current exchange-rate provider, `EXCHANGE_RATE_API_KEY` can stay blank.

---

## Database Migration

Run migrations before starting the backend:

```powershell
cd server
npm run db:migrate
```

Run backend:

```powershell
npm run dev
```

Backend health check:

```txt
http://localhost:5000/api/health
```

Database check:

```txt
http://localhost:5000/api/db-test
```

Exchange-rate check:

```txt
http://localhost:5000/api/exchange-rates?base=INR&symbols=USD,AED,EUR,GBP
```

Expected exchange-rate response shape:

```json
{
  "base": "INR",
  "rates": {
    "INR": 1,
    "USD": 0.0105,
    "AED": 0.0388,
    "EUR": 0.0091
  },
  "source": "live",
  "provider": "open-er-api",
  "fetchedAt": "ISO_DATE",
  "expiresAt": "ISO_DATE"
}
```

---

## Development Commands

### Frontend

```powershell
npm run dev
npm run build
npm run preview
```

### Backend

```powershell
cd server
npm run dev
npm run build
npm start
npm run db:migrate
```

---

## Production Build Test

Before deployment, test production locally.

Backend:

```powershell
cd server
npm run db:migrate
npm run dev
```

Frontend:

```powershell
npm run build
npm run preview
```

Open:

```txt
http://localhost:4173
```

Make sure `server/.env` allows preview origin:

```env
CLIENT_URLS=http://localhost:5173,http://localhost:4173
```

---

## Current Feature Checklist

### Authentication

- Firebase auth is used for login/session.
- Backend verifies Firebase ID tokens.
- Protected routes require logged-in users.
- Mandatory wallet PIN appears before accessing app pages if user has no wallet PIN.

### Wallet PIN

- New users must set wallet PIN.
- Existing users can change PIN from App Settings.
- Forgot PIN sends email OTP.
- OTP is stored hashed in backend.
- OTP expiry uses timezone-safe `TIMESTAMPTZ` behavior.
- Wallet PIN is required for split-room wallet payments.

### Wallet and Razorpay

- Wallet top-up uses Razorpay Checkout.
- Backend creates Razorpay order.
- Backend verifies Razorpay payment signature.
- Backend confirms captured payment before wallet credit.
- Razorpay webhook endpoint exists.
- Dev wallet top-up and dev payment approval should stay disabled in production.

### Cloudinary Profile Photos

- New profile photo uploads go to Cloudinary.
- Backend stores secure Cloudinary URL.
- Old local `/uploads` URLs can still work as fallback.
- Cloudinary secret stays only in backend.

### Currency

- Backend has `/api/exchange-rates` endpoint.
- Exchange rates are cached in Neon.
- If live provider fails, app uses valid cache/stale cache/fallback.
- Currency input is selected-currency aware.
- Dashboard expense form accepts selected currency.
- Shared Split Room item add/edit accepts selected currency.
- Wallet Top-Up custom amount accepts selected currency and converts to INR for Razorpay.
- Database still stores INR only.

### Shared Split Rooms

- Room owner creates room.
- Only room owner can add items.
- Backend also blocks non-owner item creation.
- Members can view assigned items and dues.
- Members click their member row to open payment popup.
- Payment popup contains member details, assigned items, due amount, and wallet PIN input.
- Room owner can manually mark dues collected.
- Manual collect button is compact and beside member name.
- Member names are vertically aligned.

### Dashboard Expenses

- Dashboard Add Expense uses selected currency input.
- Frontend converts selected currency amount to INR before backend save.
- Backend validates money safely, including floating-point conversion noise.
- Daily expense limit is now 25 expenses per day.

---

## Production Readiness Steps

### Step 1: Final local smoke test

Run backend and frontend production preview.

Test:

- login
- signup
- mandatory wallet PIN setup
- change wallet PIN
- forgot wallet PIN OTP
- dashboard expense add in INR
- dashboard expense add in USD
- shared split room creation
- owner-only item add
- member payment popup
- manual collect
- wallet top-up with Razorpay test mode
- profile photo upload to Cloudinary
- app currency switch
- exchange-rate status line
- transaction history
- data export

---

### Step 2: Prepare production Neon database

Recommended:

- Create a separate production Neon project/database.
- Keep development and production databases separate.
- Use production `DATABASE_URL` only in backend hosting environment.
- Run migrations once after backend deploy or from a trusted local machine.
- Check whether Neon scale-to-zero causes slow first request. If yes, consider a paid configuration or disable scale-to-zero where available.

Production migration command:

```powershell
cd server
npm run build
npm run db:migrate:prod
```

If your host runs TypeScript directly during deployment, use:

```powershell
npm run db:migrate
```

---

### Step 3: Deploy backend first

Deploy backend to Render, Railway, Fly.io, or similar.

Backend build command:

```powershell
npm install
npm run build
```

Backend start command:

```powershell
npm start
```

Set production backend environment variables on the hosting platform.

Production backend important values:

```env
NODE_ENV=production
CLIENT_URL=https://your-frontend-domain.com
CLIENT_URLS=https://your-frontend-domain.com
SERVER_URL=https://your-backend-domain.com
DATABASE_URL=your_production_neon_url
ENABLE_SETUP_ROUTES=false
ENABLE_DEV_WALLET_TOP_UP=false
ENABLE_DEV_PAYMENT_APPROVAL=false
```

After deploy, test:

```txt
https://your-backend-domain.com/api/health
https://your-backend-domain.com/api/db-test
https://your-backend-domain.com/api/exchange-rates?base=INR&symbols=USD,AED,EUR
```

---

### Step 4: Configure Razorpay production

For live payments:

- Switch Razorpay dashboard to Live Mode.
- Generate live key ID and key secret.
- Put live key ID in frontend production env.
- Put live key ID and live key secret in backend production env.
- Create production webhook URL:

```txt
https://your-backend-domain.com/api/payments/razorpay/webhook
```

Recommended webhook event:

```txt
payment.captured
```

Make sure `RAZORPAY_WEBHOOK_SECRET` in backend exactly matches the Razorpay dashboard webhook secret.

---

### Step 5: Configure Firebase production security

In Firebase Console:

- Add production frontend domain to Authentication authorized domains.
- Keep localhost for development only if needed.
- Confirm only required sign-in providers are enabled.
- Enable App Check before public launch if possible.
- Restrict Firebase API key to Firebase-related APIs in Google Cloud Console.
- Keep Firebase Admin credentials only in backend hosting env.

Firebase web API key can exist in frontend. It is not the same as a backend secret. Security should come from authorized domains, Firebase rules, App Check, and backend token verification.

---

### Step 6: Deploy frontend

Create production frontend `.env`:

```env
VITE_API_URL=https://your-backend-domain.com
VITE_RAZORPAY_KEY_ID=rzp_live_your_key_id

VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

Build frontend:

```powershell
npm install
npm run build
```

Deploy only:

```txt
dist/
```

Do not deploy the Vite dev server for production.

---

### Step 7: Update CORS after frontend deploy

After frontend has a real production domain, update backend env:

```env
CLIENT_URL=https://your-frontend-domain.com
CLIENT_URLS=https://your-frontend-domain.com
```

Restart/redeploy backend.

---

### Step 8: Final production smoke test

After both frontend and backend are deployed:

- Sign up with a new user.
- Confirm mandatory wallet PIN popup appears.
- Set wallet PIN.
- Add expense with INR.
- Switch app currency to USD.
- Add expense with USD.
- Confirm values display correctly.
- Create friend request.
- Accept friend request.
- Create split room.
- Add item as owner.
- Confirm member cannot add item.
- Click member row and open payment popup.
- Pay due with wallet PIN.
- Top up wallet through Razorpay.
- Confirm wallet balance updates only after payment verification.
- Upload profile photo and confirm Cloudinary URL is used.
- Use forgot wallet PIN OTP.
- Check transaction history.
- Check browser Sources does not show clean `/src` tree in production.

---

### Step 9: Monitoring and backup

Before public launch:

- Enable backend logs on hosting provider.
- Enable Neon backups or branching strategy.
- Monitor Razorpay webhook failures.
- Monitor failed OTP/email delivery.
- Monitor database timeouts.
- Keep `.env` secrets out of GitHub.
- Add `.env` and `server/.env` to `.gitignore`.
- Keep setup routes disabled.

---

## Deployment Order

Use this exact order:

1. Confirm local production preview works.
2. Create production Neon database.
3. Deploy backend with production env.
4. Run production migrations.
5. Test backend health/db/exchange-rates.
6. Configure Razorpay live webhook.
7. Configure Firebase production domain/security.
8. Deploy frontend with production backend URL.
9. Update backend CORS with frontend domain.
10. Run final smoke tests.
11. Launch.

---

## Git Safety Before Deployment

Before pushing:

```powershell
git status
```

Make sure these are not committed:

```txt
.env
server/.env
serviceAccountKey.json
firebase-admin-key.json
```

Recommended `.gitignore` entries:

```gitignore
.env
.env.local
.env.*.local
server/.env
server/.env.local
server/.env.*.local
serviceAccountKey.json
firebase-admin-key.json
node_modules/
dist/
server/dist/
uploads/
```

---

## Notes

- Firebase web config values can be visible in frontend.
- Razorpay key ID can be visible in frontend.
- Razorpay key secret must never be visible in frontend.
- Cloudinary API secret must never be visible in frontend.
- Database URL must never be visible in frontend.
- Exchange-rate provider API key, if used later, must stay only in backend.
- All accounting remains INR-first for correctness.

