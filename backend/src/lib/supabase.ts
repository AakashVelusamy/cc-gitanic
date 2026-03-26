/**
 * supabase.ts — Supabase client singleton
 *
 * Uses the SERVICE ROLE key (backend only — never expose to clients).
 * The service role bypasses Row-Level Security, which is required for
 * all deployment pipeline operations (upload, DB writes).
 *
 * Architecture: Singleton Pattern
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) {
  throw new Error('[supabase] SUPABASE_URL environment variable is not set');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[supabase] SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
}

/** Singleton Supabase client (service role — bypasses RLS). */
export const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/** Supabase Storage bucket used for all deployments. */
export const DEPLOYMENTS_BUCKET = 'deployments';

/**
 * Build the canonical Supabase Storage path for a deployment's files.
 * Pattern: deployments/{username}/{deploymentId}/
 */
export function deploymentStoragePath(username: string, deploymentId: string): string {
  return `${username}/${deploymentId}`;
}
