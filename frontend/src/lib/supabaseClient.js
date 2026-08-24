import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Auth will not work until these are set in .env.");
}

// createClient() throws synchronously if either argument is falsy, which
// would crash the whole module graph at import time (every page pulls in
// api/client.js -> this file) rather than degrading gracefully like every
// other "missing config" case in this app (AI, email, price providers).
// Falling back to placeholder values keeps the module loadable — real
// auth calls still fail cleanly (a caught network/auth error) instead of
// the entire app refusing to render.
export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder-anon-key");
