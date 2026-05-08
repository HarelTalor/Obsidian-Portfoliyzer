import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role for API routes
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Dev-mode: fixed user ID until auth is wired up.
// Replace with auth.uid() once login is implemented.
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
export const DEV_USER_EMAIL = "dev@portfoliyzer.local";
