-- =========================================================
-- GOALX — Stockage privé des captures de match
-- À exécuter après :
-- 1. supabase/schema.sql
-- 2. supabase/matchmaking.sql
-- 3. supabase/matches.sql
-- =========================================================

-- Création du compartiment privé.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'match-evidence',
  'match-evidence',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id)
do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

-- =========================================================
-- SÉCURITÉ DU STOCKAGE
-- =========================================================

/*
 * Aucun accès public n’est créé.
 *
 * Les captures sont envoyées et téléchargées
 * uniquement par les routes serveur GOALX avec
 * la clé privée service_role.
 *
 * Un utilisateur connecté ne peut donc pas :
 * - parcourir toutes les captures ;
 * - télécharger la capture d’un autre match ;
 * - supprimer une preuve ;
 * - remplacer directement une image.
 */

-- Suppression d’éventuelles anciennes politiques GOALX.

drop policy if exists
  "Players can upload match evidence"
on storage.objects;

drop policy if exists
  "Players can view match evidence"
on storage.objects;

drop policy if exists
  "Players can update match evidence"
on storage.objects;

drop policy if exists
  "Players can delete match evidence"
on storage.objects;

-- =========================================================
-- NETTOYAGE DES CAPTURES ANCIENNES
-- =========================================================

/*
 * Cette fonction retourne les chemins des captures
 * appartenant à des matchs terminés depuis plus de
 * 30 jours.
 *
 * La suppression physique sera effectuée plus tard
 * par une tâche serveur utilisant service_role.
 */

create or replace function public.get_expired_evidence_paths()
returns table (
  evidence_id uuid,
  storage_path text
)
language sql
security definer
set search_path = ''
as $$
  select
    evidence.id as evidence_id,
    evidence.storage_path
  from public.match_evidence as evidence
  inner join public.matches as match
    on match.id = evidence.match_id
  where match.status in (
    'COMPLETED',
    'UNFINISHED',
    'CANCELLED'
  )
  and match.completed_at <
    now() - interval '30 days';
$$;

revoke all
on function public.get_expired_evidence_paths()
from public;

revoke all
on function public.get_expired_evidence_paths()
from authenticated;

grant execute
on function public.get_expired_evidence_paths()
to service_role;
