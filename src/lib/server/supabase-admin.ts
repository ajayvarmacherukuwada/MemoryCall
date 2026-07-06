import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabaseServerEnv } from "@/lib/env";

export function getSupabaseAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseServerEnv();

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim() || null;
}

export async function authenticateSupabaseRequest(request: Request): Promise<{ user: User; supabase: SupabaseClient }> {
  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    const error = new Error("Missing Supabase access token.");
    (error as Error & { code?: string; status?: number }).code = "missing_supabase_access_token";
    (error as Error & { code?: string; status?: number }).status = 401;
    throw error;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    const wrapped = new Error(error?.message ?? "Unable to verify the Supabase session.");
    (wrapped as Error & { code?: string; status?: number }).code = (error as { code?: string } | null)?.code ?? "invalid_supabase_session";
    (wrapped as Error & { code?: string; status?: number }).status = 401;
    throw wrapped;
  }

  return { user: data.user, supabase };
}
