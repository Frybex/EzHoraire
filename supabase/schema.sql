-- EzHoraire — schéma Supabase (à coller dans SQL Editor, UNE fois).
--
-- Ce que ça crée :
--   table public.profils : un profil = un horaire complet
--     (école + formation + groupes), relié au compte via user_id.
--   RLS : chacun ne voit / ne touche que SES lignes.
--   updated_at : mis à jour seul à chaque écriture (conflits = dernier
--     écrit gagne, l'app fusionne par id).
--
-- Après : Authentication → Providers → activer Google / Apple / GitHub /
-- Email, puis Site URL = https://ezhoraire-....vercel.app (+ redirect
-- http://localhost:8902 pour les essais locaux).

create table if not exists public.profils (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  id         text        not null,
  surnom     text        not null default 'Mon horaire',
  ecole      text        not null default 'heh',
  formation  text        not null default '',
  groupes    jsonb       not null default '[]'::jsonb,
  theme      smallint    not null default 2, -- 2: Bleu, 1: Vert, 3: Rose
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Horodatage auto (l'app s'en sert pour fusionner local <-> cloud).
create or replace function public.toucher_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profils_updated_at on public.profils;
create trigger trg_profils_updated_at
  before update on public.profils
  for each row execute function public.toucher_updated_at();

-- Sécurité : tout est fermé par défaut, sauf ses propres lignes.
alter table public.profils enable row level security;

drop policy if exists "profils_select_propres" on public.profils;
create policy "profils_select_propres" on public.profils
  for select using (auth.uid() = user_id);

drop policy if exists "profils_insert_propres" on public.profils;
create policy "profils_insert_propres" on public.profils
  for insert with check (auth.uid() = user_id);

drop policy if exists "profils_update_propres" on public.profils;
create policy "profils_update_propres" on public.profils
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profils_delete_propres" on public.profils;
create policy "profils_delete_propres" on public.profils
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Bornes sur profils : l'app écrit via la clé anon (RLS), un client
-- trafiqué pourrait y stocker n'importe quoi (volume, dashboard
-- pollué). Mêmes bornes que l'app : surnom 24, ecole 24, formation
-- 200, id 120, theme 1/2/3, groupes < 8 ko de JSON.
-- Rejouable : chaque contrainte n'est ajoutée que si elle manque.
-- ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profils_bornes') then
    alter table public.profils add constraint profils_bornes check (
      char_length(id) <= 120
      and char_length(surnom) <= 24
      and char_length(ecole) <= 24
      and char_length(formation) <= 200
      and theme in (1, 2, 3)
      and octet_length(groupes::text) <= 8000
    );
  end if;
end
$$;

-- ---------------------------------------------------------------
-- EzHoraire — suivi d'usage pour le dashboard admin.
-- Une ligne = une consultation d'horaire (ouverture de l'app ou
-- changement d'horaire). L'app l'insère seule, en arrière-plan.
-- Lecture interdite côté app : seul le dashboard (via /api/stats,
-- clé service_role côté serveur) peut les agréger.
-- À coller dans SQL Editor avec le reste du fichier (rejouable).
-- ---------------------------------------------------------------
create table if not exists public.visites (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  profil_id  text,
  ecole      text        not null default '',
  formation  text        not null default '',
  created_at timestamptz not null default now()
);

alter table public.visites enable row level security;

drop policy if exists "visites_insert_propres" on public.visites;
create policy "visites_insert_propres" on public.visites
  for insert with check (auth.uid() = user_id);

-- Pas de politique SELECT : personne ne lit ses visites depuis l'app.
-- (Le service_role du backend contourne la RLS pour le dashboard.)

create index if not exists idx_visites_user_date on public.visites (user_id, created_at desc);
create index if not exists idx_visites_date on public.visites (created_at desc);
create index if not exists idx_visites_formation on public.visites (ecole, formation);

-- ---------------------------------------------------------------
-- Garde-fous d'usage sur visites (rejouable).
-- 1) Plafond : au plus 300 consultations / 24 h / compte. Sans lui, un
--    compte connecté peut gonfler la table et fausser le dashboard.
--    La fonction est SECURITY DEFINER : le compte qui insère n'a pas le
--    droit de lire la table (pas de politique SELECT), le comptage doit
--    donc se faire avec les droits du propriétaire.
-- 2) Bornes de taille : l'app envoie ce qu'elle veut, la table n'a pas à
--    stocker des kilomètres de texte.
-- 3) Purge : garde 180 jours, à appeler périodiquement. Le dashboard
--    admin prévient quand la table n'est jamais purgée (données de plus
--    de 200 jours). Pour automatiser : Supabase → Database → Extensions →
--    activer pg_cron, puis décommenter la ligne ci-dessous (une fois).
-- ---------------------------------------------------------------
create or replace function public.limiter_visites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recentes integer;
begin
  new.ecole     := left(new.ecole, 120);
  new.formation := left(new.formation, 160);
  new.profil_id := left(new.profil_id, 120);

  select count(*) into recentes
  from public.visites
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';

  if recentes >= 300 then
    raise exception 'Trop de consultations enregistrées sur 24 h.';
  end if;
  return new;
end $$;

drop trigger if exists trg_visites_limite on public.visites;
create trigger trg_visites_limite
  before insert on public.visites
  for each row execute function public.limiter_visites();

create or replace function public.purger_visites(jours integer default 180)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  supprimees bigint;
begin
  delete from public.visites
  where created_at < now() - make_interval(days => greatest(jours, 30));
  get diagnostics supprimees = row_count;
  return supprimees;
end $$;

-- Si l'extension pg_cron est activée, planifier la purge (à décommenter) :
-- select cron.schedule('ezh-purge-visites', '17 4 * * *',
--                      'select public.purger_visites(180)');
