# SplitVerse Website

Open the live website: **[https://split-verse.vercel.app/](https://split-verse.vercel.app/)**

## Run the Website on Your PC

### Requirements

Install these first:

- Git
- Node.js 20 or newer
- npm
- A PostgreSQL/Neon database
- Your own Firebase, Razorpay, Cloudinary and Brevo accounts

### 1. Clone the Project

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

### 2. Install the Frontend

From the project root:

```bash
npm install
```

Create a `.env` file in the project root:

```env
VITE_API_URL=http://localhost:5000
VITE_RAZORPAY_KEY_ID=rzp_test_your_key_id
VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

### 3. Install the Backend

```bash
cd server
npm install
```

Create `server/.env`:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173,http://localhost:4173
SERVER_URL=http://localhost:5000

DATABASE_URL=your_neon_database_url

FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_admin_client_email
FIREBASE_PRIVATE_KEY=your_firebase_admin_private_key

RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CLOUDINARY_PROFILE_FOLDER=splitverse/profile-photos

BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_login_email_or_user
BREVO_SMTP_KEY=your_brevo_smtp_key
EMAIL_FROM=SplitVerse <your_verified_sender@example.com>

WALLET_PIN_OTP_PEPPER=create_a_long_random_secret

ENABLE_SETUP_ROUTES=false
ENABLE_DEV_WALLET_TOP_UP=false
ENABLE_DEV_PAYMENT_APPROVAL=false

EXCHANGE_RATE_PROVIDER=open-er-api
EXCHANGE_RATE_API_URL=https://open.er-api.com/v6/latest
EXCHANGE_RATE_API_KEY=
EXCHANGE_RATE_CACHE_TTL_MINUTES=360
EXCHANGE_RATE_STALE_FALLBACK_HOURS=168
```

Keep any additional environment variables already included in the project and replace their placeholder values with your own credentials.

### 4. Set Up the Database

From the `server` folder:

```bash
npm run db:migrate
```

### 5. Start the Backend

```bash
npm run dev
```

The backend should run at:

```text
http://localhost:5000
```

### 6. Start the Frontend

Open another terminal in the project root:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Make the Website Yours

1. Fork the repository or copy the project into your own repository.
2. Replace the SplitVerse name, logo, favicon, text and images with your own branding.
3. Replace every Firebase, database, Razorpay, Cloudinary and Brevo value with credentials from your own accounts.
4. Add your own production frontend and backend domains to Firebase Authentication.
5. Never upload `.env`, `server/.env`, Firebase Admin keys or other secrets to GitHub.
6. Connect the project to your own GitHub repository:

```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git add .
git commit -m "Set up my version of the project"
git branch -M main
git push -u origin main
```

## Deploy Your Own Website

### Backend

Deploy the `server` folder to Render, Railway or another Node.js hosting service.

Use:

```text
Build command: npm install && npm run build
Start command: npm start
```

Add all values from `server/.env` to the hosting service. For production, change:

```env
NODE_ENV=production
CLIENT_URL=https://your-frontend-domain.com
CLIENT_URLS=https://your-frontend-domain.com
SERVER_URL=https://your-backend-domain.com
DATABASE_URL=your_production_database_url
```

Run the production database migration:

```bash
cd server
npm run db:migrate
```

### Frontend

Deploy the project root to Vercel or another Vite-compatible hosting service.

Use:

```text
Build command: npm run build
Output directory: dist
```

Set the frontend environment variables on the hosting service and use your deployed backend URL:

```env
VITE_API_URL=https://your-backend-domain.com
```

After deployment:

1. Add the frontend domain to Firebase Authentication authorized domains.
2. Add the frontend domain to the backend `CLIENT_URL` and `CLIENT_URLS` values.
3. Redeploy the backend after changing those values.

## Change the Currency

After signing in, open **Settings** and change the **App Currency**. The selected currency will be used across the website.
