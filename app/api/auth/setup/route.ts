import { adminSupabase, playerEmail } from "@/lib/supabase";

export async function POST(request: Request) {
  const { playerId, displayName, password, setupCode } = await request.json();
  if (!process.env.ADMIN_SETUP_CODE || setupCode !== process.env.ADMIN_SETUP_CODE) return Response.json({ error: "セットアップコードが違います" }, { status: 403 });
  if (!/^[a-z0-9_-]{3,24}$/i.test(playerId || "") || String(password || "").length < 8 || !String(displayName || "").trim()) return Response.json({ error: "入力内容を確認してください" }, { status: 400 });
  const db = adminSupabase();
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (count) return Response.json({ error: "管理者は設定済みです" }, { status: 409 });
  const created = await db.auth.admin.createUser({ email: playerEmail(playerId), password, email_confirm: true });
  if (created.error || !created.data.user) return Response.json({ error: created.error?.message || "作成できませんでした" }, { status: 400 });
  const saved = await db.from("profiles").insert({ id: created.data.user.id, player_id: playerId.toLowerCase(), display_name: displayName.trim(), role: "admin", balance: 10000 });
  if (saved.error) { await db.auth.admin.deleteUser(created.data.user.id); return Response.json({ error: saved.error.message }, { status: 400 }); }
  return Response.json({ ok: true });
}
