# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install       # Install dependencies
pnpm dev           # Start development server (localhost:3000)
pnpm build         # Production build
pnpm start         # Start production server
pnpm lint          # Run ESLint
```

No test suite is configured.

## Environment Setup

Copy `.env.local` with these variables:

```bash
# Scanner app's own Supabase (user auth & scan storage)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Supabase OAuth (for accessing users' Supabase projects)
SUPABASE_OAUTH_CLIENT_ID=
SUPABASE_OAUTH_CLIENT_SECRET=

# Token encryption — generate with: openssl rand -hex 32
ENCRYPTION_KEY=

# Optional: enables AI-powered analysis
ANTHROPIC_API_KEY=
```

## Architecture

This is a Next.js 16 App Router application that scans Supabase databases for Row Level Security (RLS) vulnerabilities. Users authenticate via Google OAuth (Supabase Auth), then connect their own Supabase account via a second OAuth flow to enable scanning.

### Two Supabase Contexts

A critical architectural detail: there are **two distinct Supabase contexts** throughout the codebase:

1. **Scanner's own Supabase** — the app's own database, used for user auth and storing scan results. Configured via `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
2. **User's Supabase projects** — the target databases being scanned, accessed via OAuth tokens stored in the scanner's database.

### Auth Flow

Google OAuth → user authenticated in scanner's Supabase → user connects their Supabase account via PKCE OAuth (`/api/auth/supabase/authorize` → `/api/auth/supabase/callback`) → access/refresh tokens encrypted (AES-256-GCM) and stored in `integrations` table.

### Scanning Pipeline (`lib/scanner.ts`)

1. **Discovery**: Uses Supabase Management API to query `pg_catalog.pg_tables` and list all public tables with their RLS status.
2. **Testing**: For each table, creates two clients — service role (bypasses RLS) and anon (respects RLS). If anon client can read data, the table is vulnerable.
3. **AI Analysis** (optional): Sends vulnerable table info to `claude-sonnet-4-20250514` for risk assessment, sensitive data detection, and SQL fix generation. Runs only when data is found AND `ANTHROPIC_API_KEY` is set.

Tables are scanned in parallel chunks of 5.

### Key Files

| File | Purpose |
|------|---------|
| `lib/scanner.ts` | Core vulnerability detection engine |
| `lib/supabase-oauth.ts` | OAuth token storage, retrieval, and auto-refresh |
| `lib/supabase-management-api.ts` | Client for Supabase Management API (list projects, execute SQL, get API keys) |
| `lib/encryption.ts` | AES-256-GCM encrypt/decrypt for token storage |
| `lib/auth-context.tsx` | React context for Google auth state |
| `app/api/integrations/supabase/scan/route.ts` | Single project scan endpoint |
| `app/api/auth/supabase/` | PKCE OAuth authorize/callback/disconnect endpoints |

### Database Schema

The scanner's own Supabase database has three tables (all with RLS enabled):
- `integrations` — encrypted OAuth tokens per user
- `projects` — user-selected Supabase projects to monitor
- `scan_results` — stored vulnerability reports with JSON details

### Server vs Client

All API routes and `lib/` files run server-side and have access to `SUPABASE_SERVICE_ROLE_KEY`. Components under `components/` are client components (`'use client'`). Service role keys and OAuth tokens never reach the client.
