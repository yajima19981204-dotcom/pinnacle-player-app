import { adminSupabase, requireUser } from "@/lib/supabase";
export async function GET(request: Request) {
  const user = await requireUser(request); if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const db = adminSupabase();
  const { data: profile } = await db.from("profiles").select("id,player_id,display_name,role,balance,active").eq("id", user.id).single();
  if (!profile?.active) return Response.json({ error: "このアカウントは停止されています" }, { status: 403 });
  const { data: bets } = await db.from("bets").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
  return Response.json({ profile, bets: bets || [] });
}
