create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  player_id text not null unique check (player_id ~ '^[a-z0-9_-]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 30),
  role text not null default 'player' check (role in ('admin','agent','player')),
  parent_agent_id uuid references public.profiles(id) on delete set null,
  balance bigint not null default 10000 check (balance >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid not null references public.profiles(id),
  amount bigint not null check (amount <> 0),
  balance_before bigint not null,
  balance_after bigint not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id text not null,
  sport_key text not null,
  commence_time timestamptz not null,
  home_team text not null,
  away_team text not null,
  market_key text not null,
  selection_name text not null,
  point numeric,
  odds numeric not null,
  stake bigint not null check (stake > 0),
  potential_payout bigint not null,
  status text not null default 'pending' check (status in ('pending','settled')),
  result text check (result in ('win','loss','push')),
  created_at timestamptz not null default now()
);

create index if not exists idx_bets_user_status on public.bets(user_id,status);
create index if not exists idx_transactions_user_created on public.point_transactions(user_id,created_at desc);
create index if not exists idx_profiles_parent_agent on public.profiles(parent_agent_id);
alter table public.profiles enable row level security;
alter table public.point_transactions enable row level security;
alter table public.bets enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own transactions read" on public.point_transactions for select using (auth.uid() = user_id);
create policy "own bets read" on public.bets for select using (auth.uid() = user_id);

-- Run this section on an existing project as a migration.
alter table public.profiles add column if not exists parent_agent_id uuid references public.profiles(id) on delete set null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','agent','player'));

create or replace function public.agent_transfer_points(p_target uuid, p_amount bigint, p_note text default '')
returns table(actor_balance bigint, target_balance bigint)
language plpgsql security definer set search_path = public as $$
declare v_actor public.profiles%rowtype; v_target public.profiles%rowtype;
begin
  if p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'ポイント数が正しくありません'; end if;
  select * into v_actor from public.profiles where id = auth.uid() for update;
  select * into v_target from public.profiles where id = p_target for update;
  if v_actor.id is null or v_actor.role not in ('admin','agent') or not v_actor.active then raise exception '操作権限がありません'; end if;
  if v_target.id is null or v_target.parent_agent_id is distinct from v_actor.id then raise exception '自分の配下だけ操作できます'; end if;
  if p_amount > 0 and v_actor.balance < p_amount then raise exception '保有ポイントが不足しています'; end if;
  if p_amount < 0 and v_target.balance < -p_amount then raise exception '配下の残高を超えて回収できません'; end if;
  update public.profiles set balance = balance - p_amount, updated_at = now() where id = v_actor.id;
  update public.profiles set balance = balance + p_amount, updated_at = now() where id = v_target.id;
  insert into public.point_transactions(user_id, admin_id, amount, balance_before, balance_after, note)
  values (v_target.id, v_actor.id, p_amount, v_target.balance, v_target.balance + p_amount, left(coalesce(p_note,''),100));
  return query select v_actor.balance - p_amount, v_target.balance + p_amount;
end; $$;
revoke all on function public.agent_transfer_points(uuid,bigint,text) from public;
grant execute on function public.agent_transfer_points(uuid,bigint,text) to authenticated;
