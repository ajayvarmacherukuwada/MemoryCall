import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function ensureProfileRow(user: User, patch: { displayName?: string | null; photoUrl?: string | null } = {}) {
  const supabase = getSupabaseAdminClient();
  const profilePayload = {
    id: user.id,
    email: user.email ?? "",
    display_name: patch.displayName ?? (user.user_metadata?.full_name as string | undefined) ?? user.email ?? null,
    photo_url: patch.photoUrl ?? (user.user_metadata?.avatar_url as string | undefined) ?? null,
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
