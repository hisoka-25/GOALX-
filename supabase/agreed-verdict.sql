-- ============================================================
-- CONCORDANCE DIRECTE et FIABLE : quand les deux joueurs
-- déclarent le même vainqueur, crédite immédiatement SANS
-- passer par le bloc IA/finalize_match qui peut échouer.
-- Idempotente.
-- ============================================================
create or replace function public.apply_agreed_verdict(
  requested_match_id uuid,
  requested_winner_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches%rowtype;
  winner_wallet public.wallets%rowtype;
  loser_wallet public.wallets%rowtype;
  payout bigint;
  winner_balance bigint;
  loser_balance bigint;
begin
  select * into m from public.matches where id = requested_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.status = 'COMPLETED' then return 'COMPLETED'; end if;
  if m.status = 'UNFINISHED' then return 'UNFINISHED'; end if;

  select * into winner_wallet from public.wallets
    where user_id = requested_winner_id for update;
  if not found then raise exception 'WINNER_WALLET_NOT_FOUND'; end if;

  select * into loser_wallet from public.wallets
    where user_id in (m.player_one_id, m.player_two_id)
      and user_id <> requested_winner_id
    for update;
  if not found then raise exception 'LOSER_WALLET_NOT_FOUND'; end if;

  -- Gagnant : reçoit le pot moins la commission.
  payout := (m.stake * 2 * (100 - coalesce(m.commission_rate,10))) / 100;

  update public.wallets
    set available_balance = available_balance + payout,
        reserved_balance = greatest(reserved_balance - m.stake, 0),
        updated_at = now()
    where id = winner_wallet.id
    returning available_balance into winner_balance;

  -- Perdant : libère sa mise réservée (pas de rendu).
  update public.wallets
    set reserved_balance = greatest(reserved_balance - m.stake, 0),
        updated_at = now()
    where id = loser_wallet.id
    returning available_balance into loser_balance;

  insert into public.wallet_transactions
    (wallet_id, match_id, transaction_type, amount, balance_after, description)
  values
    (winner_wallet.id, requested_match_id, 'MATCH_WIN', payout, winner_balance,
     'Gain du match après commission GOALX'),
    (loser_wallet.id, requested_match_id, 'MATCH_LOSS', 0, loser_balance,
     'Mise définitivement perdue');

  update public.matches
    set status = 'COMPLETED',
        winner_id = requested_winner_id,
        completed_at = now()
    where id = requested_match_id;

  update public.match_evidence
    set status = 'ACCEPTED' where match_id = requested_match_id;

  delete from public.matchmaking_queue where match_id = requested_match_id;

  return 'COMPLETED';
end;
$$;

revoke all on function public.apply_agreed_verdict(uuid, uuid) from public;
grant execute on function public.apply_agreed_verdict(uuid, uuid) to service_role;
grant execute on function public.apply_agreed_verdict(uuid, uuid) to authenticated;
