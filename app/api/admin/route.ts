import { adminSupabase, playerEmail, requireUser } from "@/lib/supabase";
async function admin(request: Request) { const user = await requireUser(request); if (!user) return null; const { data } = await adminSupabase().from("profiles").select("role").eq("id", user.id).single(); return data?.role === "admin" ? user : null; }
export async function GET(request: Request) {
  if (!await admin(request)) return Response.json({ error: "管理者専用です" }, { status: 403 });
  const db = adminSupabase();
  const url = new URL(request.url);
  if (url.searchParams.get("view") === "bets") {
    const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
    const pageSize = 100;
    const { data, error } = await db.from("bets")
      .select("*,player:profiles!bets_user_id_fkey(player_id,display_name)")
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ bets: data || [], hasMore: (data || []).length === pageSize });
  }
  const users = await db.from("profiles").select("*").order("created_at"); const logs = await db.from("point_transactions").select("*,profiles!point_transactions_user_id_fkey(player_id,display_name)").order("created_at", { ascending: false }).limit(100);
  return Response.json({ users: users.data || [], logs: logs.data || [] });
}
export async function POST(request: Request) {
  const me = await admin(request); if (!me) return Response.json({ error: "管理者専用です" }, { status: 403 });
  const body = await request.json(); const db = adminSupabase();
  if (body.action === "create") {
    if (!/^[a-z0-9_-]{3,24}$/i.test(body.playerId || "") || String(body.password || "").length < 8 || !String(body.displayName || "").trim()) return Response.json({ error: "ID・名前・パスワードを確認してください" }, { status: 400 });
    const made = await db.auth.admin.createUser({ email: playerEmail(body.playerId), password: body.password, email_confirm: true });
    if (made.error || !made.data.user) return Response.json({ error: made.error?.message || "作成できません" }, { status: 400 });
    const role = body.role === "agent" ? "agent" : "player";
    const saved = await db.from("profiles").insert({ id: made.data.user.id, player_id: body.playerId.toLowerCase(), display_name: body.displayName.trim(), role, balance: role === "agent" ? 0 : 10000, parent_agent_id: body.parentAgentId || (role === "agent" ? me.id : null) });
    if (saved.error) { await db.auth.admin.deleteUser(made.data.user.id); return Response.json({ error: saved.error.message }, { status: 400 }); }
    return Response.json({ ok: true });
  }
  if (body.action === "adjust") {
    const amount = Number(body.amount); if (!body.userId || !Number.isInteger(amount) || !amount || Math.abs(amount) > 1000000) return Response.json({ error: "ポイント数が正しくありません" }, { status: 400 });
    const { data: p } = await db.from("profiles").select("balance").eq("id", body.userId).single(); if (!p) return Response.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    const after = Number(p.balance) + amount; if (after < 0) return Response.json({ error: "残高を超えて回収できません" }, { status: 400 });
    const changed = await db.from("profiles").update({ balance: after, updated_at: new Date().toISOString() }).eq("id", body.userId).eq("balance", p.balance).select("id").single(); if (changed.error) return Response.json({ error: "残高が変わったため、もう一度操作してください" }, { status: 409 });
    const logged = await db.from("point_transactions").insert({ user_id: body.userId, admin_id: me.id, amount, balance_before: p.balance, balance_after: after, note: String(body.note || "").slice(0,100) });
    if (logged.error) return Response.json({ error: logged.error.message }, { status: 500 }); return Response.json({ balance: after });
  }
  if (body.action === "toggle") { await db.from("profiles").update({ active: Boolean(body.active), updated_at: new Date().toISOString() }).eq("id", body.userId).neq("role", "admin"); return Response.json({ ok: true }); }
  return Response.json({ error: "操作が正しくありません" }, { status: 400 });
}
