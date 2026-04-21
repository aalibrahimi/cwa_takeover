/**
 * Supabase browser client for the cwa_takeover website.
 *
 * Uses the public anon key — safe to ship in the JS bundle per
 * Supabase's security model. RLS policies on the server are the
 * actual gate; the anon key just lets us talk to the API.
 *
 * For offer-letter accept flow specifically, the `offer_letters`
 * table has an RLS policy that allows SELECT + UPDATE on rows
 * WHERE acceptance_token matches (unguessable UUID acts as the
 * security boundary). No auth needed — the link itself is the key.
 *
 * Env required (add to Vercel + .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL       — Takeover's Supabase URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  — Takeover's anon key
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are required. " +
      "Add them to Vercel env vars and .env.local.",
    );
  }

  client = createClient(url, anonKey, {
    auth: {
      // Public page — no sessions, no persistence.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}
