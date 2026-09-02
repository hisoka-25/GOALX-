# Banc de test du règlement des matchs (PostgreSQL local)

Vérifie que toute la logique d'argent fonctionne avant de toucher la
production : concordance, litige, forfait, remboursement, commissions
plateforme, anti-double-paiement.

## Préparation (une fois)

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo -u postgres psql -c "create database goalx_test owner postgres;"
```

## Exécution

Depuis la racine du dépôt :

```bash
sudo -u postgres psql -q -c "drop database goalx_test;" \
  -c "create database goalx_test owner postgres;"

for f in supabase/tests/00-stub.sql supabase/schema.sql supabase/payments.sql \
  supabase/withdrawals.sql supabase/matchmaking.sql supabase/matchmaking-stake-only.sql \
  supabase/remove-welcome-bonus.sql supabase/matches.sql supabase/agreed-verdict.sql \
  supabase/auto-verdict.sql supabase/platform-wallet.sql supabase/prod-finalize-10pct.sql \
  supabase/outcome-declaration.sql; do
  sudo -u postgres psql -q -d goalx_test -v ON_ERROR_STOP=1 -f "$f" || exit 1
done

sudo -u postgres psql -d goalx_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/settlement-tests.sql
```

Chaque ligne `NOTICE: OK — …` est une assertion validée. La moindre
erreur (`ÉCHEC — …`) interrompt le script : corriger avant de déployer.

## Ce que couvre la suite (11 scénarios, 53 assertions)

1. Concordance (boutons gagné/perdu) → crédit instantané + commission
2. Anti-rejeu (redéclaration sur match terminé refusée)
3. Litige → AI_REVIEW → verdict IA/admin appliqué et crédité
4. Forfait (1 capture, adversaire absent)
5. Forfait avec aveu de défaite du capturiste
6. Aucune preuve → remboursement des deux mises, zéro commission
7. Deux captures sans déclarations → arbitrage, argent bloqué
8. Concordance tardive à l'expiration du délai
9. Déclaration sans capture / issue invalide refusées
10. Balayage global expire_evidence_deadlines() (pg_cron)
11. Protection double-paiement (règlements re-joués sans effet)
