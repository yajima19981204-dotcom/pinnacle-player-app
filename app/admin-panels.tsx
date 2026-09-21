"use client";
import { useCallback, useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase";
export type Profile = {
  id: string;
  player_id: string;
  display_name: string;
  role: string;
  balance: number;
  active: boolean;
  parent_agent_id?: string | null;
};
type AdminBet = {
  id: string;
  created_at: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  market_key: string;
  selection_name: string;
  point: number | null;
  odds: number;
  stake: number;
  potential_payout: number;
  status: string;
  result: string | null;
  player: { player_id: string; display_name: string } | null;
};
export async function authFetch(path: string, init: RequestInit = {}) {
  const { data } = await browserSupabase().auth.getSession();
  return fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${data.session?.access_token || ""}`,
    },
  });
}
const betMarket = (x: string) =>
  (
    ({
      h2h: "勝敗",
      spreads: "ハンデ",
      alternate_spreads: "その他のハンデ",
      totals: "合計点",
    }) as Record<string, string>
  )[x] || x;
const betSelection = (name: string, point?: number | null) =>
  `${({ Draw: "引き分け", Over: "オーバー", Under: "アンダー" } as Record<string, string>)[name] || name}${point == null ? "" : ` ${point > 0 ? "+" : ""}${point}`}`;
const betStatus = (b: AdminBet) =>
  b.status === "cancelled"
    ? "取消済み"
    : b.status === "pending"
      ? "結果待ち"
      : b.result === "win"
        ? "的中"
        : b.result === "push"
          ? "返還"
          : b.result === "half_win"
            ? "半勝"
            : b.result === "half_loss"
              ? "半負"
              : "不的中";

export function AgentPanel({
  currentRole,
  onChanged,
}: {
  currentRole: string;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<Profile[]>([]),
    [id, setId] = useState(""),
    [name, setName] = useState(""),
    [pass, setPass] = useState(""),
    [amount, setAmount] = useState(1000),
    [target, setTarget] = useState(""),
    [msg, setMsg] = useState(""),
    [bets, setBets] = useState<AdminBet[]>([]),
    [betsOpen, setBetsOpen] = useState(false),
    [betsPage, setBetsPage] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [betsBusy, setBetsBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await authFetch("/api/agent"),
      d = await r.json();
    if (r.ok) {
      setMembers(d.members);
      setTarget((x) =>
        d.members.some((m: Profile) => m.id === x) ? x : d.members[0]?.id || "",
      );
    } else setMsg(d.error);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function post(body: unknown) {
    setMsg("");
    const r = await authFetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      d = await r.json();
    setMsg(r.ok ? "完了しました" : d.error);
    if (r.ok) {
      load();
      onChanged();
    }
  }
  async function rename(u: Profile) {
    const displayName = prompt(
      "新しい表示名を入力してください",
      u.display_name,
    )?.trim();
    if (!displayName || displayName === u.display_name) return;
    await post({ action: "rename", userId: u.id, displayName });
  }
  async function loadBets(page = 0) {
    setBetsBusy(true);
    const r = await authFetch(`/api/agent?view=bets&page=${page}`),
      d = await r.json();
    if (r.ok) {
      setBets((current) => (page === 0 ? d.bets : [...current, ...d.bets]));
      setBetsPage(page);
      setHasMore(d.hasMore);
    } else setMsg(d.error);
    setBetsBusy(false);
  }
  async function toggleBets() {
    const next = !betsOpen;
    setBetsOpen(next);
    if (next && !bets.length) await loadBets(0);
  }
  return (
    <section className="admin agent">
      <div className="admin-heading">
        <h2>エージェント管理</h2>
        <button onClick={toggleBets}>
          {betsOpen ? "履歴を閉じる" : "配下のベット履歴"}
        </button>
      </div>
      <p className="hint">あなたの配下プレイヤーだけを管理できます。</p>
      {betsOpen && (
        <section className="admin-bets">
          <h3>配下プレイヤー ベット履歴</h3>
          {bets.length === 0 && !betsBusy ? (
            <p className="empty">ベット履歴はありません</p>
          ) : (
            <div className="admin-bet-list">
              {bets.map((b) => (
                <article className={`admin-bet ${b.status}`} key={b.id}>
                  <div className="admin-bet-head">
                    <b>{b.player?.display_name || "不明"}</b>
                    <span>{betStatus(b)}</span>
                  </div>
                  <small>
                    {b.player?.player_id || "-"} ・ {new Date(b.created_at).toLocaleString("ja-JP")}
                  </small>
                  <strong>{betSelection(b.selection_name, b.point)}</strong>
                  <small>
                    {b.away_team} vs {b.home_team} ・ {betMarket(b.market_key)}
                  </small>
                  <div className="admin-bet-numbers">
                    <span>{Number(b.stake).toLocaleString()}pt × {Number(b.odds).toFixed(2)}</span>
                    <span>受取予定 {Number(b.potential_payout).toLocaleString()}pt</span>
                  </div>
                </article>
              ))}
            </div>
          )}
          {hasMore && (
            <button className="load-more" disabled={betsBusy} onClick={() => loadBets(betsPage + 1)}>
              {betsBusy ? "読込中…" : "さらに表示"}
            </button>
          )}
        </section>
      )}
      <div className="create">
        <input
          placeholder="プレイヤーID"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <input
          placeholder="表示名"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="初期パスワード（8文字以上）"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <button
          onClick={() =>
            post({
              action: "create",
              playerId: id,
              displayName: name,
              password: pass,
            })
          }
        >
          配下を作成
        </button>
      </div>
      {members.length > 0 && (
        <div className="adjust">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {members.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}（{u.balance.toLocaleString()}pt）
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(Math.abs(Number(e.target.value)))}
          />
          <button
            onClick={() => post({ action: "transfer", userId: target, amount })}
          >
            送る
          </button>
          <button
            className="danger"
            onClick={() =>
              post({ action: "transfer", userId: target, amount: -amount })
            }
          >
            回収
          </button>
        </div>
      )}
      {msg && <p className="panel-message">{msg}</p>}
      <div className="users">
        {members.length === 0 ? (
          <p className="empty">配下プレイヤーはまだいません</p>
        ) : (
          members.map((u) => (
            <div key={u.id}>
              <span>
                <b>{u.display_name}</b>
                <small>{u.player_id}</small>
              </span>
              <strong>{u.balance.toLocaleString()}pt</strong>
              <select
                className="role-select"
                aria-label={`${u.display_name}の権限`}
                value={u.role}
                onChange={(e) =>
                  post({ action: "role", userId: u.id, role: e.target.value })
                }
              >
                <option value="player">プレイヤー</option>
                <option value="agent">エージェント</option>
                {currentRole === "admin" && <option value="admin">運営</option>}
              </select>
              <div className="user-actions">
                <button onClick={() => rename(u)}>名前編集</button>
                <button
                  onClick={() =>
                    post({ action: "toggle", userId: u.id, active: !u.active })
                  }
                >
                  {u.active ? "停止" : "再開"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function AdminPanel() {
  const [users, setUsers] = useState<Profile[]>([]),
    [id, setId] = useState(""),
    [name, setName] = useState(""),
    [pass, setPass] = useState(""),
    [role, setRole] = useState("agent"),
    [amount, setAmount] = useState(1000),
    [target, setTarget] = useState(""),
    [msg, setMsg] = useState(""),
    [bets, setBets] = useState<AdminBet[]>([]),
    [betsOpen, setBetsOpen] = useState(false),
    [betsPage, setBetsPage] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [betsBusy, setBetsBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await authFetch("/api/admin"),
      d = await r.json();
    if (r.ok) {
      setUsers(d.users);
      setTarget((x) => x || d.users?.[0]?.id || "");
    } else setMsg(d.error);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function post(body: unknown) {
    setMsg("");
    const r = await authFetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      d = await r.json();
    setMsg(r.ok ? "完了しました" : d.error);
    if (r.ok) load();
  }
  async function loadBets(page = 0) {
    setBetsBusy(true);
    const r = await authFetch(`/api/admin?view=bets&page=${page}`),
      d = await r.json();
    if (r.ok) {
      setBets((x) => (page === 0 ? d.bets : [...x, ...d.bets]));
      setBetsPage(page);
      setHasMore(d.hasMore);
    } else setMsg(d.error);
    setBetsBusy(false);
  }
  async function toggleBets() {
    const next = !betsOpen;
    setBetsOpen(next);
    if (next && !bets.length) await loadBets(0);
  }
  return (
    <section className="admin">
      <div className="admin-heading">
        <h2>全体管理</h2>
        <button onClick={toggleBets}>
          {betsOpen ? "履歴を閉じる" : "全ベット履歴"}
        </button>
      </div>
      {betsOpen && (
        <section className="admin-bets">
          <h3>全プレイヤー ベット履歴</h3>
          {bets.length === 0 && !betsBusy ? (
            <p className="empty">ベット履歴はありません</p>
          ) : (
            <div className="admin-bet-list">
              {bets.map((b) => (
                <article className={`admin-bet ${b.status}`} key={b.id}>
                  <div className="admin-bet-head">
                    <b>{b.player?.display_name || "不明"}</b>
                    <span>{betStatus(b)}</span>
                  </div>
                  <small>
                    {b.player?.player_id || "-"} ・{" "}
                    {new Date(b.created_at).toLocaleString("ja-JP")}
                  </small>
                  <strong>{betSelection(b.selection_name, b.point)}</strong>
                  <small>
                    {b.away_team} vs {b.home_team} ・ {betMarket(b.market_key)}
                  </small>
                  <div className="admin-bet-numbers">
                    <span>
                      {Number(b.stake).toLocaleString()}pt ×{" "}
                      {Number(b.odds).toFixed(2)}
                    </span>
                    <span>
                      受取予定 {Number(b.potential_payout).toLocaleString()}pt
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
          {hasMore && (
            <button
              className="load-more"
              disabled={betsBusy}
              onClick={() => loadBets(betsPage + 1)}
            >
              {betsBusy ? "読込中…" : "さらに表示"}
            </button>
          )}
        </section>
      )}
      <div className="create admin-create">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="agent">エージェント</option>
          <option value="player">プレイヤー</option>
        </select>
        <input
          placeholder="ログインID"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <input
          placeholder="表示名"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="初期パスワード（8文字以上）"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <button
          onClick={() =>
            post({
              action: "create",
              playerId: id,
              displayName: name,
              password: pass,
              role,
            })
          }
        >
          作成
        </button>
      </div>
      <div className="adjust">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name}（{u.role}・{u.balance.toLocaleString()}pt）
            </option>
          ))}
        </select>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button
          onClick={() => post({ action: "adjust", userId: target, amount })}
        >
          付与
        </button>
        <button
          className="danger"
          onClick={() =>
            post({ action: "adjust", userId: target, amount: -amount })
          }
        >
          回収
        </button>
      </div>
      {msg && <p>{msg}</p>}
      <div className="users">
        {users.map((u) => (
          <div key={u.id}>
            <span>
              <b>{u.display_name}</b>
              <small>
                {u.player_id} ・ {u.role}
              </small>
            </span>
            <strong>{u.balance.toLocaleString()}pt</strong>
            {u.role !== "admin" && (
              <button
                onClick={() =>
                  post({ action: "toggle", userId: u.id, active: !u.active })
                }
              >
                {u.active ? "停止" : "再開"}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
