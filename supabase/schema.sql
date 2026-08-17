-- =========================================================
-- GOALX — Schéma initial Supabase/PostgreSQL
-- Les montants représentent uniquement des crédits fictifs.
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- PROFILS DES JOUEURS
-- =========================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  efootball_username text not null,
  team text not null,
  division integer not null
    check (division between 1 and 10),
  game_mode text not null
    check (
      game_mode in (
        'MOBILE',
        'PLAYSTATION',
        'XBOX',
        'PC'
      )
    ),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_game_mode_division_index
  on public.profiles(game_mode, division);

-- =========================================================
-- PORTEFEUILLES DE CRÉDITS FICTIFS
-- =========================================================

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references public.profiles(id) on delete cascade,
  available_balance bigint not null default 10000
    check (available_balance >= 0),
  reserved_balance bigint not null default 0
    check (reserved_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null
    references public.wallets(id) on delete cascade,
  match_id uuid,
  transaction_type text not null
    check (
      transaction_type in (
        'WELCOME_CREDIT',
        'STAKE_RESERVED',
        'MATCH_LOSS',
        'MATCH_WIN',
        'STAKE_RETURNED'
      )
    ),
  amount bigint not null,
  balance_after bigint not null,
  description text,
  created_at timestamptz not null default now()
);

create index wallet_transactions_wallet_date_index
  on public.wallet_transactions(wallet_id, created_at desc);

-- =========================================================
-- FILE D’ATTENTE DU MATCHMAKING
-- =========================================================

create table public.matchmaking_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references public.profiles(id) on delete cascade,
  stake bigint not null
    check (stake >= 500),
  division integer not null
    check (division between 1 and 10),
  game_mode text not null
    check (
      game_mode in (
        'MOBILE',
        'PLAYSTATION',
        'XBOX',
        'PC'
      )
    ),
  status text not null default 'SEARCHING'
    check (
      status in (
        'SEARCHING',
        'MATCHED',
        'CANCELLED'
      )
    ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
    default (now() + interval '10 minutes')
);

create index matchmaking_search_index
  on public.matchmaking_queue(
    status,
    game_mode,
    division,
    stake,
    created_at
  );

-- =========================================================
-- MATCHS
-- =========================================================

create table public.matches (
  id uuid primary key default gen_random_uuid(),

  player_one_id uuid not null
    references public.profiles(id),

  player_two_id uuid not null
    references public.profiles(id),

  winner_id uuid
    references public.profiles(id),

  game_mode text not null
    check (
      game_mode in (
        'MOBILE',
        'PLAYSTATION',
        'XBOX',
        'PC'
      )
    ),

  division integer not null
    check (division between 1 and 10),

  stake bigint not null
    check (stake >= 500),

  commission_rate integer not null default 10
    check (commission_rate between 0 and 100),

  status text not null default 'MATCHED'
    check (
      status in (
        'MATCHED',
        'ACCEPTED',
        'IN_PROGRESS',
        'WAITING_FOR_EVIDENCE',
        'AI_REVIEW',
        'COMPLETED',
        'UNFINISHED',
        'CANCELLED'
      )
    ),

  player_one_accepted boolean not null default false,
  player_two_accepted boolean not null default false,

  evidence_deadline timestamptz,

  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint different_players
    check (player_one_id <> player_two_id),

  constraint valid_winner
    check (
      winner_id is null
      or winner_id = player_one_id
      or winner_id = player_two_id
    )
);

create index matches_player_one_date_index
  on public.matches(player_one_id, created_at desc);

create index matches_player_two_date_index
  on public.matches(player_two_id, created_at desc);

create index matches_status_deadline_index
  on public.matches(status, evidence_deadline);

-- La référence du match est ajoutée après la création de matches.

alter table public.wallet_transactions
  add constraint wallet_transactions_match_id_fkey
  foreign key (match_id)
  references public.matches(id)
  on delete set null;

-- =========================================================
-- CAPTURES DE RÉSULTAT
-- =========================================================

create table public.match_evidence (
  id uuid primary key default gen_random_uuid(),

  match_id uuid not null
    references public.matches(id) on delete cascade,

  user_id uuid not null
    references public.profiles(id) on delete cascade,

  storage_path text not null,

  status text not null default 'PENDING'
    check (
      status in (
        'PENDING',
        'ACCEPTED',
        'REJECTED'
      )
    ),

  uploaded_at timestamptz not null default now(),

  unique(match_id, user_id)
);

create index match_evidence_match_index
  on public.match_evidence(match_id);

-- =========================================================
-- VERDICTS DE L’IA
-- =========================================================

create table public.ai_reviews (
  id uuid primary key default gen_random_uuid(),

  match_id uuid not null unique
    references public.matches(id) on delete cascade,

  verdict text not null
    check (
      verdict in (
        'PLAYER_ONE_WON',
        'PLAYER_TWO_WON',
        'UNFINISHED'
      )
    ),

  confidence numeric(5, 4) not null
    check (confidence between 0 and 1),

  detected_score text,
  explanation text not null,
  extracted_data jsonb not null default '{}'::jsonb,
  model_name text not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- MISE À JOUR AUTOMATIQUE DE updated_at
-- =========================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_update_timestamp
before update on public.profiles
for each row
execute function public.update_updated_at();

create trigger wallets_update_timestamp
before update on public.wallets
for each row
execute function public.update_updated_at();

create trigger matches_update_timestamp
before update on public.matches
for each row
execute function public.update_updated_at();

-- =========================================================
-- CRÉATION AUTOMATIQUE DU PROFIL ET DU PORTEFEUILLE
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_division integer;
  requested_mode text;
  requested_username text;
begin
  requested_division :=
    greatest(
      1,
      least(
        10,
        coalesce(
          (new.raw_user_meta_data ->> 'division')::integer,
          10
        )
      )
    );

  requested_mode :=
    upper(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'game_mode', ''),
        'MOBILE'
      )
    );

  if requested_mode not in (
    'MOBILE',
    'PLAYSTATION',
    'XBOX',
    'PC'
  ) then
    requested_mode := 'MOBILE';
  end if;

  requested_username :=
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      'player_' || substring(new.id::text from 1 for 8)
    );

  insert into public.profiles (
    id,
    username,
    efootball_username,
    team,
    division,
    game_mode
  )
  values (
    new.id,
    requested_username,
    coalesce(
      nullif(
        trim(new.raw_user_meta_data ->> 'efootball_username'),
        ''
      ),
      requested_username
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'team'), ''),
      'Équipe non définie'
    ),
    requested_division,
    requested_mode
  );

  insert into public.wallets (
    user_id,
    available_balance,
    reserved_balance
  )
  values (
    new.id,
    10000,
    0
  );

  insert into public.wallet_transactions (
    wallet_id,
    transaction_type,
    amount,
    balance_after,
    description
  )
  select
    id,
    'WELCOME_CREDIT',
    10000,
    10000,
    'Crédits fictifs offerts à l’inscription'
  from public.wallets
  where user_id = new.id;

  return new;
end;
$$;

create trigger create_profile_after_signup
after insert on auth.users
for each row
execute function public.handle_new_user();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.matches enable row level security;
alter table public.match_evidence enable row level security;
alter table public.ai_reviews enable row level security;

-- Les joueurs connectés peuvent voir les profils nécessaires au match.

create policy "Authenticated users can view profiles"
on public.profiles
for select
to authenticated
using (true);

-- Chaque joueur peut modifier uniquement son propre profil.

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Chaque joueur voit uniquement son portefeuille.

create policy "Users can view their own wallet"
on public.wallets
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Chaque joueur voit uniquement ses transactions.

create policy "Users can view their own wallet transactions"
on public.wallet_transactions
for select
to authenticated
using (
  wallet_id in (
    select id
    from public.wallets
    where user_id = (select auth.uid())
  )
);

-- Chaque joueur voit uniquement sa recherche.

create policy "Users can view their matchmaking entry"
on public.matchmaking_queue
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Chaque joueur voit uniquement les matchs auxquels il participe.

create policy "Players can view their matches"
on public.matches
for select
to authenticated
using (
  (select auth.uid()) = player_one_id
  or (select auth.uid()) = player_two_id
);

-- Les participants peuvent voir les preuves de leur match.

create policy "Players can view evidence from their matches"
on public.match_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.matches
    where public.matches.id = match_evidence.match_id
      and (
        public.matches.player_one_id = (select auth.uid())
        or public.matches.player_two_id = (select auth.uid())
      )
  )
);

-- Un joueur peut enregistrer sa propre preuve.

create policy "Players can submit their own evidence"
on public.match_evidence
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.matches
    where public.matches.id = match_evidence.match_id
      and (
        public.matches.player_one_id = (select auth.uid())
        or public.matches.player_two_id = (select auth.uid())
      )
      and public.matches.status = 'WAITING_FOR_EVIDENCE'
      and public.matches.evidence_deadline > now()
  )
);

-- Les participants peuvent consulter le verdict IA de leur match.

create policy "Players can view their AI verdicts"
on public.ai_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.matches
    where public.matches.id = ai_reviews.match_id
      and (
        public.matches.player_one_id = (select auth.uid())
        or public.matches.player_two_id = (select auth.uid())
      )
  )
);

-- =========================================================
-- TEMPS RÉEL SUPABASE
-- =========================================================

alter publication supabase_realtime
  add table public.matchmaking_queue;

alter publication supabase_realtime
  add table public.matches;

alter publication supabase_realtime
  add table public.match_evidence;
