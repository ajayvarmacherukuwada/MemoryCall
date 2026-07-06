# LetsCall

LetsCall is a Next.js application for private one-to-one memory calls with Google-connected archiving.

## Stack

- Next.js App Router
- React
- Supabase Auth + Database
- Google OAuth provider connection
- YouTube archive verification and upload pipeline

## Requirements

- Node.js 20.9+
- npm 10+
- Supabase project with the approved LetsCall schema applied
- Google OAuth client configured for the active app URL

## Environment Variables

Create `.env.local` with the values from `.env.example`.

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_STATE_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_BASE_URL`
- `NEXT_PUBLIC_DEBUG_AUTH` optional, defaults to `false`

### Local development

Use:

```env
NEXT_PUBLIC_APP_BASE_URL=http://localhost:4000
```

### Production on Vercel

Use your deployed HTTPS app origin, for example:

```env
NEXT_PUBLIC_APP_BASE_URL=https://your-app.vercel.app
```

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

The app runs on [http://localhost:4000](http://localhost:4000).

## Build for production

```bash
npm run build
npm run start
```

## Supabase configuration

Configure Supabase Auth with:

- Site URL set to your active app origin
- Redirect URLs including:
  - `http://localhost:4000`
  - `http://localhost:4000/profile`
  - your production origin
  - your production profile URL if needed

## Google OAuth configuration

Use the Google Cloud OAuth client that belongs to this project.

Authorized redirect URIs should include:

- `https://<your-project-ref>.supabase.co/auth/v1/callback` for Supabase Auth
- `https://your-app.vercel.app/api/auth/google/callback` for the server-side provider connection flow if you use it in production
- `http://localhost:4000/api/auth/google/callback` for local development if you use the direct provider connection route locally

Authorized JavaScript origins should include the active browser origins only, such as:

- `http://localhost:4000`
- `https://your-app.vercel.app`

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repository into Vercel.
3. Add the production environment variables from `.env.example`.
4. Set `NEXT_PUBLIC_APP_BASE_URL` to the deployed Vercel URL or your custom domain.
5. Redeploy after any auth URL changes.

## Notes

- Supabase is the app identity layer.
- Google is treated as a connected provider account.
- Refresh tokens must stay server-side only.
- The development-only `Clear Session` button is shown only when debug auth is enabled.
