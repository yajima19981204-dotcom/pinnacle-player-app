import { createClient } from "@supabase/supabase-js";
import { adminSupabase, playerEmail, requireUser } from "@/lib/supabase";

async function actor(request: Request) {
  const user = await requireUser(request);
  if (!user) return null;
  const { data } = await adminSupabase().from("profiles").select("id,role,active").eq("id", user.id).single();
  return data?.active && ["admin", "agent"].includes(data.role) ? data : null;
}

export async function GET(request: Request) {
  const me = await actor(request);
  if (!me) return Response.json({ error: "エージェント権限が必要です" }, { status: 403 });
  const { data, error } = await adminSupabase().from("profiles")
    .select("id,player_id,display_name,role,balance,active,parent_agent_id,created_at")
    .eq("parent_agent_id", me.id).order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ members: data || [] });
}

export async function POST(request: Request) {
  const me = await actor(request);
  if (!me) return Response.json({ error: "エージェント権限が必要です" }, { status: 403 });
  const body = await request.json();
  const db = adminSupabase();
  if (body.action === "create") {
    const playerId = String(body.playerId || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();
    const password = String(body.password || "");
    if (!/^[a-z0-9_-]{3,24}$/i.test(playerId) || password.length < 8 || !displayName) return Response.json({ error: "ID・名前・パスワードを確認してください" }, { status: 400 });
    const made = await db.auth.admin.createUser({ email: playerEmail(playerId), password, email_confirm: true });
    if (made.error || !made.data.user) return Response.json({ error: made.error?.message || "作成できません" }, { status: 400 });
    const saved = await db.from("profiles").insert({ id: made.data.user.id, player_id: playerId, display_name: displayName, role: "player", balance: 0, parent_agent_id: me.id });
    if (saved.error) { await db.auth.admin.deleteUser(made.data.user.id); return Response.json({ error: saved.error.message }, { status: 400 }); }
    return Response.json({ ok: true });
  }
  if (body.action === "transfer") {
    const amount = Number(body.amount);
    if (!body.userId || !Number.isInteger(amount) || !amount) return Response.json({ error: "ポイント数が正しくありません" }, { status: 400 });
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const userDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data, error } = await userDb.rpc("agent_transfer_points", { p_target: body.userId, p_amount: amount, p_note: String(body.note || "") });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ balances: data?.[0] });
  }
  if (body.action === "toggle") {
    const { data: member } = await db.from("profiles").select("id").eq("id", body.userId).eq("parent_agent_id", me.id).single();
    if (!member) return Response.json({ error: "自分の配下だけ操作できます" }, { status: 403 });
    await db.from("profiles").update({ active: Boolean(body.active), updated_at: new Date().toISOString() }).eq("id", member.id);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "操作が正しくありません" }, { status: 400 });
}
