// supabase integration layer
// initializes singleton storage client
// configures bucket and path resolution
// enforces service role authorization
// maps users and deployments to storage paths

import { createClient, SupabaseClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) {
  throw new Error('[supabase] SUPABASE_URL environment variable is not set');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[supabase] SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
}

// supabase client (bypasses rls)
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

// storage bucket name
export const DEPLOYMENTS_BUCKET = 'deployments';

// build canonical storage path for a deployment
export function deploymentStoragePath(username: string, deploymentId: string): string {
  return `${username}/${deploymentId}`;
}
