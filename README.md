# Pulumi Dashboard

A self-hosted web dashboard for browsing Pulumi stack state stored in S3 — resources, outputs, and update history — secured with Google OAuth.

## Prerequisites

- Node.js 20+
- An AWS account with an S3 bucket containing Pulumi state (the bucket your `pulumi login s3://...` points to)
- A Google OAuth app (for sign-in)

## 1. Clone and install

```bash
git clone <repo-url>
cd pulumi-dashboard
npm install
```

## 2. Configure environment variables

Create a `.env.local` file in the project root:

```bash
# Auth.js secret — generate one with: npx auth secret
AUTH_SECRET=

# Google OAuth credentials
# Create at: https://console.developers.google.com/apis/credentials
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Only users with this email domain can sign in
AUTH_ALLOWED_DOMAIN=yourcompany.com

# AWS region (defaults to us-east-1 if omitted)
AWS_REGION=us-east-1

# S3 bucket containing your Pulumi state
PULUMI_STATE_BUCKET=your-pulumi-state-bucket
```

### Google OAuth setup

1. Go to [Google Cloud Console → Credentials](https://console.developers.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add `http://localhost:3000/api/auth/callback/google` to **Authorized redirect URIs**
4. Copy the Client ID and Secret into `.env.local`

### AWS credentials

The app uses the default AWS credential chain. For local development the easiest options are:

- **AWS CLI profile** — run `aws configure` or set `AWS_PROFILE`
- **Environment variables** — set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- **IAM role** — automatically used when running on ECS or EC2

The IAM principal needs `s3:GetObject` and `s3:ListBucket` on the state bucket.

### Multiple buckets (optional)

To show stacks from multiple S3 buckets (e.g. per environment), use `PULUMI_STATE_BUCKET_<ENV>` instead of the single `PULUMI_STATE_BUCKET`:

```bash
PULUMI_STATE_BUCKET_PROD=my-pulumi-state-prod
PULUMI_STATE_BUCKET_STAGING=my-pulumi-state-staging
```

Each suffix becomes an environment label in the UI. `PULUMI_STATE_BUCKET` and `PULUMI_STATE_BUCKET_<ENV>` are mutually exclusive — use one form or the other.

## 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the login page and prompted to sign in with Google.

## S3 state structure

The app expects the standard Pulumi S3 backend layout:

```
<bucket>/
  .pulumi/
    stacks/<project>/<stack>.json          # current state
    history/<project>/<stack>/<stack>-<epoch>.history.json
    history/<project>/<stack>/<stack>-<epoch>.checkpoint.json
```

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run check` | Format, lint, and sort imports (Biome) |
| `npm run typecheck` | TypeScript type check |
| `npm run depcheck` | Check for unused/missing dependencies (knip) |
