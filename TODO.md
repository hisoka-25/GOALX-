# GOALX — À faire après les tests

## 1. Verrou anti-triche « mi-temps » (priorité haute)

**Problème :** un joueur peut envoyer sa capture à la mi-temps (score en sa
faveur) depuis un second téléphone pendant que l'adversaire joue encore.
L'adversaire ne voit pas l'application → chrono de 5 min expiré → forfait →
le tricheur gagne le pot.

**Solution décidée :**
- Dès que les deux joueurs ont accepté (match `IN_PROGRESS`), démarrer un
  compte à rebours de **13 minutes** (durée minimale réaliste d'un match
  eFootball).
- Avant la fin de ces 13 minutes : la route `/api/matches/[id]/evidence`
  refuse toute capture (erreur claire), donc la déclaration est impossible
  aussi (elle exige une capture).
- Après 13 minutes : captures autorisées, puis comportement actuel
  (1ʳᵉ capture → chrono 5 min → concordance / litige / forfait).

**Détails d'implémentation :**
- Enregistrer `in_progress_at` (timestamp) quand le match passe en
  `IN_PROGRESS` (2ᵉ acceptation) — colonne + trigger ou mise à jour dans la
  fonction d'acceptation.
- Refus côté serveur (jamais seulement côté interface) :
  `evidence_deadline`/`in_progress_at + 13 min` > now → 423/409 avec message
  « Les captures ouvrent dans X minutes ».
- UI : compte à rebours visible dans la salle (« Captures possibles dans
  07:32 »), désactivation du bouton d'envoi avant.
- Durée paramétrable : constante / variable d'environnement
  (ex. `MATCH_MIN_DURATION_MINUTES = 13`).
- Réutiliser ce timestamp pour purger les matchs abandonnés : si aucune
  capture après ~45-60 min en `IN_PROGRESS`/`WAITING_FOR_EVIDENCE` →
  match inachevé, mises restituées (sinon les mises restent réservées
  à vie).

## 2. Divers (en attente)

- ✅ **FAIT (03/09/2026)** : clé `ANTHROPIC_API_KEY` achetée (5 $ ≈ 600 litiges), ajoutée sur Vercel avec `ANTHROPIC_WORKSPACE_ID` (nécessaire pour les clés « identity-linked » de la nouvelle console Anthropic — fix commité `00de48c`). Diagnostic prod : `working: true` — Claude Haiku tranche les litiges en autonomie.
  (l'IA tranche alors les litiges automatiquement, sans autre changement).
- Vérifier les taux réels Jeko (dépôt / retrait) pour affiner la marge.
