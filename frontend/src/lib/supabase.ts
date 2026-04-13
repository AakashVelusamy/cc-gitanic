// supabase integration client
// initializes public anon client for realtime persistence
// handles frontend-only subscription workflows
// provides gateway to live site event streams
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// anon client for frontend realtime subscriptions only
// not used for database read/write (all db goes through railway api)
export const supabase = createClient(supabaseUrl, supabaseKey);
