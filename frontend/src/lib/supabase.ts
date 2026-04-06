import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Anon client for frontend realtime subscriptions ONLY.
// Not used for database read/write (all DB goes through Railway API).
export const supabase = createClient(supabaseUrl, supabaseKey);
