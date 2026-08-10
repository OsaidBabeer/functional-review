// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// These come from Vercel env vars (Project Settings → Environment Variables):
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Server-side only file (used inside /pages/api routes) — never import this
// into a client component, since the service role key bypasses row-level security.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
