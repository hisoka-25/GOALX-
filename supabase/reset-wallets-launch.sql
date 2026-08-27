-- =========================================================
-- GOALX — Remise à zéro des portefeuilles avant lancement
-- ⚠️ Outil de nettoyage : à n'exécuter QU'avec des comptes de
-- test et aucun match actif. Met tous les soldes joueurs à 0.
-- Idempotent (relançable sans erreur).
-- =========================================================

-- 1. Annuler les recherches de matchmaking en attente.
update public.matchmaking_queue
set status = 'CANCELLED'
where status in ('SEARCHING', 'MATCHED');

-- 2. Remettre tous les portefeuilles joueurs à zéro.
update public.wallets
set
  available_balance = 0,
  reserved_balance = 0,
  updated_at = now();

-- 3. Journaliser la remise à zéro (montant 0, aucun impact).
insert into public.wallet_transactions (
  wallet_id,
  transaction_type,
  amount,
  balance_after,
  description
)
select
  w.id,
  'STAKE_RETURNED',
  0,
  0,
  'Solde remis à zéro avant le lancement officiel'
from public.wallets w;
