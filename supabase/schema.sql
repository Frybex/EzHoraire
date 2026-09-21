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
  ical       text        not null default '', -- lien d'abonnement perso (ULB), vide sinon
  sources    jsonb       not null default '[]'::jsonb, -- horaire sur mesure (fusion.js), vide sinon
  theme      smallint    not null default 2, -- 2: Bleu, 1: Vert, 3: Rose
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Bases créées avant une colonne : l'ajouter sans rien casser. `create
-- table if not exists` ne touche pas une table déjà là, donc toute
-- colonne ajoutée après coup a besoin de sa ligne ici — sinon la
-- contrainte profils_bornes plus bas échoue sur une base existante et
-- tout le fichier s'arrête.
alter table public.profils add column if not exists ical  text     not null default '';
alter table public.profils add column if not exists theme smallint not null default 2;
alter table public.profils add column if not exists sources jsonb not null default '[]'::jsonb;

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
-- 200, lien d'abonnement 1200, id 120, theme 1/2/3, groupes < 8 ko,
-- sources : liste de 6 au plus, < 20 ko. Le `case` protège
-- jsonb_array_length (erreur, et non faux, sur un objet : PostgreSQL ne
-- garantit pas l'ordre d'évaluation d'un `and`).
-- Rejouable : la contrainte est recréée à chaque passage (les bases
-- d'avant la colonne `ical` reçoivent la borne au passage).
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profils_bornes') then
    alter table public.profils drop constraint profils_bornes;
  end if;
  alter table public.profils add constraint profils_bornes check (
    char_length(id) <= 120
    and char_length(surnom) <= 24
    and char_length(ecole) <= 24
    and char_length(formation) <= 200
    and char_length(ical) <= 1200
    and theme in (1, 2, 3)
    and octet_length(groupes::text) <= 8000
    and case when jsonb_typeof(sources) = 'array'
             then jsonb_array_length(sources) <= 6 else false end
    and octet_length(sources::text) <= 20000
  );
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
  -- Date posée par la base (même raison que limiter_evenements) : sans
  -- ça, antidater une ligne la ferait sortir du comptage des 24 h.
  new.created_at := now();
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

-- Entretien réservé au serveur : sans ça, n'importe qui peut appeler la
-- purge à distance et avancer la suppression des statistiques.
revoke all on function public.purger_visites(integer) from public, anon, authenticated;
grant execute on function public.purger_visites(integer) to service_role;

-- Si l'extension pg_cron est activée, planifier la purge (à décommenter) :
-- select cron.schedule('ezh-purge-visites', '17 4 * * *',
--                      'select public.purger_visites(180)');

-- ---------------------------------------------------------------
-- EzHoraire — reports de bug et demandes (rail Bug / Demande de la
-- fenêtre de signalement : `type` vaut 'bug' ou 'demande').
-- Une ligne = un signalement (connecté ou anonyme : user_id / email
-- peuvent être vides). Les images vont dans le bucket `bug-images`,
-- la ligne ne garde que leurs chemins (image_urls).
-- Écriture : via /api/bugs (clé service_role côté serveur) — aucune
-- politique INSERT publique, le serveur valide et limite le débit.
-- Lecture : interdite côté app, dashboard admin seul (via /api/bugs).
-- Rejouable : table + colonne + contrainte + bucket recréés à chaque passage.
-- ---------------------------------------------------------------
create table if not exists public.bug_reports (
  id         bigint      generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid        references auth.users (id) on delete set null,
  email      text        not null default '',
  message    text        not null default '',
  etape      text        not null default '',
  type       text        not null default 'bug',
  contexte   jsonb       not null default '{}'::jsonb,
  statut     text        not null default 'nouveau',
  image_urls text[]      not null default '{}'
);

-- Bases créées avant le rail Bug / Demande : la colonne manque, on
-- l'ajoute (les anciens reports restent des bugs).
alter table public.bug_reports
  add column if not exists type text not null default 'bug';

alter table public.bug_reports enable row level security;

-- Pas de politique SELECT / INSERT : personne n'écrit ni ne lit depuis
-- l'app avec la clé anon. Le backend (service_role) contourne la RLS.
-- Les anciennes politiques INSERT publiques, si elles existent (v1
-- directe), sont retirées pour refermer l'écriture directe.
drop policy if exists "bug_reports_insert_public" on public.bug_reports;
drop policy if exists "bug_reports_insert_propres" on public.bug_reports;
drop policy if exists "bug_reports_select_propres" on public.bug_reports;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'bug_reports_bornes') then
    alter table public.bug_reports drop constraint bug_reports_bornes;
  end if;
  alter table public.bug_reports add constraint bug_reports_bornes check (
    char_length(email) <= 320
    and char_length(message) >= 3
    and char_length(message) <= 5000
    and char_length(etape) <= 40
    and type in ('bug', 'demande')
    and statut in ('nouveau', 'en_cours', 'corrige')
    and coalesce(array_length(image_urls, 1), 0) <= 3
    and octet_length(contexte::text) <= 8000
  );
end
$$;

create index if not exists idx_bugs_date on public.bug_reports (created_at desc);
create index if not exists idx_bugs_statut on public.bug_reports (statut, created_at desc);
create index if not exists idx_bugs_type on public.bug_reports (type, created_at desc);

-- Bucket privé des captures jointes aux reports. Écriture directe depuis
-- l'app avec la clé anon (chemins imprévisibles uuid/…), lecture via URLs
-- signées fabriquées par /api/bugs (service_role).
insert into storage.buckets (id, name, public)
values ('bug-images', 'bug-images', false)
on conflict (id) do update set public = false;

-- Bornes du bucket : uniquement des images, 5 Mo max. Sans elles, un
-- anonyme peut y pousser n'importe quoi (taille et type libres) jusqu'à
-- remplir le stockage.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp',
                               'image/gif', 'image/heic', 'image/heif']
where id = 'bug-images';

drop policy if exists "bug-images_insert_anon" on storage.objects;
create policy "bug-images_insert_anon" on storage.objects
  for insert to anon, authenticated with check (
    bucket_id = 'bug-images'
    -- Seul le chemin que l'app fabrique (uuid.jpg, à la racine) passe :
    -- pas de dossiers ni de noms choisis par un client trafiqué.
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );

-- L'app dépose toujours un chemin neuf (uuid) et n'écrase jamais : la
-- politique UPDATE (qui permettait de remplacer une capture existante)
-- est retirée. Rejouable : on la supprime si une base l'a encore.
drop policy if exists "bug-images_update_anon" on storage.objects;

-- ---------------------------------------------------------------
-- EzHoraire — parcours anonyme : arrivée → clic → compte créé.
-- Une ligne = un événement d'une visite (arrivée sur la page
-- d'accueil, clic « Ouvrir l'app », clic de connexion, erreur, compte
-- créé, identité complétée, sortie). L'app (suivi.js) l'insère seule,
-- en arrière-plan.
--
-- Aucun identifiant de personne : session_id est un nombre aléatoire
-- gardé par l'onglet (sessionStorage) et jamais relié à un compte —
-- la table n'a volontairement pas de user_id. Lecture interdite côté
-- app : seul /api/stats (clé service_role) agrège, via la fonction
-- stats_evenements() ci-dessous. Rejouable.
-- ---------------------------------------------------------------
create table if not exists public.evenements (
  id           bigint      generated always as identity primary key,
  created_at   timestamptz not null default now(),
  session_id   text        not null,
  page         text        not null default '',  -- accueil | app
  ecran        text        not null default '',  -- compte | identite | ecole | formation | groupes | horaire
  evenement    text        not null,             -- arrivee | clic_app | clic_connexion | connexion_erreur | compte_cree | connexion_ok | identite_ok | etape | friction | horaire_ok | sortie | capture_choisie | capture_lue | analyse
  fournisseur  text        not null default '',  -- google | github | apple | email
  erreur       text        not null default '',  -- code stable (email_invalide, recherche_0, capture_vide…)
  duree_ms     integer     not null default 0,   -- sortie : temps actif cumulé de la page
  interactions smallint    not null default 0,   -- clics + touches depuis l'arrivée
  details      jsonb       not null default '{}'::jsonb
);

-- Bases créées avant une colonne : l'ajouter sans rien casser.
alter table public.evenements add column if not exists version text not null default '';

alter table public.evenements enable row level security;

-- Insertion seule, y compris anonyme (l'arrivée précède la connexion).
drop policy if exists "evenements_insert" on public.evenements;
create policy "evenements_insert" on public.evenements
  for insert to anon, authenticated with check (true);

-- Pas de politique SELECT / UPDATE / DELETE : la table ne se lit que
-- côté serveur (service_role), pour le dashboard admin.

create index if not exists idx_evenements_date on public.evenements (created_at desc);
create index if not exists idx_evenements_session on public.evenements (session_id, created_at);

-- Plafond et bornes (rejouable) : l'écriture est ouverte aux anonymes,
-- la table n'a pas à stocker des kilomètres de texte ni des milliers de
-- lignes pour une même visite. 150 événements / 24 h couvrent large :
-- une création de compte complète en produit une vingtaine.
create or replace function public.limiter_evenements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dans_session integer;
begin
  -- La date est posée par la base, jamais par le client : un client
  -- trafiqué ne peut ni antidater (ça contournerait le plafond 24 h)
  -- ni dater dans le futur (ça fausserait les courbes par jour).
  new.created_at   := now();
  new.session_id   := left(new.session_id, 64);
  new.page         := left(new.page, 20);
  new.ecran        := left(new.ecran, 24);
  new.evenement    := left(new.evenement, 24);
  new.fournisseur  := left(new.fournisseur, 16);
  new.erreur       := left(new.erreur, 40);
  new.version      := left(new.version, 16);
  new.duree_ms     := greatest(0, least(new.duree_ms, 86400000));
  new.interactions := greatest(0, least(new.interactions, 10000));
  if octet_length(new.details::text) > 2000 then
    new.details := '{}'::jsonb;
  end if;

  if char_length(new.session_id) < 8 then
    raise exception 'Événement invalide.';
  end if;
  -- Liste blanche : un client peut écrire, pas inventer des noms
  -- d'événements pour polluer le dashboard.
  if new.evenement not in (
      'arrivee', 'clic_app', 'clic_connexion', 'connexion_erreur',
      'compte_cree', 'connexion_ok', 'identite_ok', 'etape', 'friction',
      'horaire_ok', 'sortie', 'capture_choisie', 'capture_lue', 'analyse') then
    raise exception 'Événement inconnu : %', new.evenement;
  end if;

  select count(*) into dans_session
  from public.evenements
  where session_id = new.session_id
    and created_at > now() - interval '24 hours';

  if dans_session >= 150 then
    raise exception 'Trop d''événements pour cette visite.';
  end if;
  return new;
end $$;

drop trigger if exists trg_evenements_limite on public.evenements;
create trigger trg_evenements_limite
  before insert on public.evenements
  for each row execute function public.limiter_evenements();

-- Purge : 90 jours (les événements sont ~10 x plus nombreux que les
-- visites, qui restent à 180). À planifier comme celle des visites.
create or replace function public.purger_evenements(jours integer default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  supprimees bigint;
begin
  delete from public.evenements
  where created_at < now() - make_interval(days => greatest(jours, 30));
  get diagnostics supprimees = row_count;
  return supprimees;
end $$;

-- Entretien réservé au serveur (même raison que purger_visites).
revoke all on function public.purger_evenements(integer) from public, anon, authenticated;
grant execute on function public.purger_evenements(integer) to service_role;

-- Agrégation pour /api/stats : la base calcule, l'API transmet. Sans ça,
-- tirer les lignes brutes multiplierait les allers-retours et dépasserait
-- les plafonds de api/stats.py en quelques semaines.
-- SECURITY DEFINER : la fonction lit la table malgré la RLS, donc son
-- exécution est retirée à anon / authenticated (sinon n'importe qui
-- pourrait lire les statistiques agrégées de tout le monde).
create or replace function public.stats_evenements(jours integer default 30)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
with periode as (
  select *
  from public.evenements
  where created_at >= now() - make_interval(days => greatest(least(jours, 365), 1))
),
sess as (
  select
    session_id,
    count(*)                                            as evenements,
    bool_or(interactions > 0)                           as a_interagi,
    bool_or(evenement = 'sortie')                       as a_sortie,
    max(duree_ms)                                       as duree_max,
    sum(duree_ms)                                       as duree_totale,
    bool_or(evenement = 'arrivee')                      as arrivee,
    bool_or(evenement = 'arrivee' and page = 'accueil') as arrivee_accueil,
    bool_or(evenement = 'arrivee' and page = 'app')     as arrivee_app,
    bool_or(evenement = 'clic_app')                     as clic_app,
    bool_or(evenement = 'clic_connexion')               as clic_connexion,
    bool_or(evenement = 'compte_cree')                  as compte,
    bool_or(evenement = 'connexion_ok')                 as connexion,
    bool_or(evenement = 'identite_ok')                  as identite,
    bool_or(evenement = 'etape' and ecran = 'ecole')    as etape_ecole,
    bool_or(evenement = 'etape' and ecran = 'formation') as etape_formation,
    bool_or(evenement = 'etape' and ecran = 'groupes')  as etape_groupes,
    bool_or(evenement = 'horaire_ok')                   as horaire_ok
  from periode
  group by session_id
),
ok as (
  -- Bots / aperçus de liens : une sortie de moins de 2 s sans aucune
  -- interaction. Une visite sans sortie (onglet tué sans pagehide) est
  -- gardée : impossible de la distinguer d'un vrai départ.
  select * from sess
  where a_interagi or not a_sortie or duree_max >= 2000
),
jours_serie as (
  select generate_series(
    (now() - make_interval(days => greatest(least(jours, 365), 1) - 1))::date,
    now()::date, interval '1 day')::date as j
),
jour as (
  select
    p.created_at::date as j,
    count(distinct p.session_id) filter (where p.evenement = 'arrivee')        as arrivees,
    count(distinct p.session_id) filter (where p.evenement = 'clic_app')       as clics_app,
    count(distinct p.session_id) filter (where p.evenement = 'clic_connexion') as clics_connexion,
    count(distinct p.session_id) filter (where p.evenement = 'compte_cree')    as comptes
  from periode p
  join ok using (session_id)
  group by 1
),
fournisseur as (
  select
    p.fournisseur,
    count(distinct p.session_id) filter (where p.evenement = 'clic_connexion') as clics,
    count(distinct p.session_id) filter (where p.evenement = 'compte_cree')    as comptes
  from periode p
  join ok using (session_id)
  where p.fournisseur <> ''
  group by 1
  order by 2 desc, 3 desc
),
versions as (
  select
    p.version,
    count(distinct p.session_id) filter (where p.evenement = 'arrivee')    as arrivees,
    count(distinct p.session_id) filter (where p.evenement = 'compte_cree') as comptes,
    count(distinct p.session_id) filter (where p.evenement = 'horaire_ok')  as horaires
  from periode p
  join ok using (session_id)
  where p.version <> ''
  group by 1
  order by 2 desc, 3 desc
  limit 10
),
derniers as (
  select distinct on (p.session_id) p.session_id, p.evenement, p.ecran, p.page
  from periode p
  join ok using (session_id)
  order by p.session_id, p.created_at desc, p.id desc
),
arrets as (
  select
    case
      when evenement = 'sortie' then coalesce(nullif(ecran, ''), page)
      when evenement = 'etape' then coalesce(nullif(ecran, ''), 'etape')
      else evenement
    end as etape,
    count(*) as n
  from derniers
  group by 1
  order by 2 desc
  limit 20
),
erreurs as (
  -- Erreurs de connexion et frictions du parcours (recherche vide,
  -- capture illisible, API en échec…) : comptées par visite.
  select
    p.erreur,
    coalesce(nullif(p.ecran, ''), '') as ecran,
    count(distinct p.session_id) as n,
    max(p.created_at) as dernier
  from periode p
  join ok using (session_id)
  where p.evenement in ('connexion_erreur', 'friction') and p.erreur <> ''
  group by 1, 2
  order by 3 desc
  limit 15
)
select jsonb_build_object(
  'jours', greatest(least(jours, 365), 1),
  'totaux', (select jsonb_build_object(
      'sessions',         count(*),
      'arrivees',         count(*) filter (where arrivee),
      'arrivees_accueil', count(*) filter (where arrivee_accueil),
      'arrivees_app',     count(*) filter (where arrivee_app),
      'clics_app',        count(*) filter (where clic_app),
      'clics_connexion',  count(*) filter (where clic_connexion),
      'comptes',          count(*) filter (where compte),
      'connexions',       count(*) filter (where connexion),
      'identites',        count(*) filter (where identite),
      'ecole',            count(*) filter (where etape_ecole),
      'formation',        count(*) filter (where etape_formation),
      'groupes',          count(*) filter (where etape_groupes),
      'horaires',         count(*) filter (where horaire_ok),
      'duree_mediane_s',  coalesce(round((percentile_cont(0.5) within group (order by nullif(duree_totale, 0))
                             / 1000.0)::numeric, 1), 0)
    ) from ok),
  'aujourdhui', (select jsonb_build_object(
      'arrivees',        coalesce(j.arrivees, 0),
      'clics_connexion', coalesce(j.clics_connexion, 0),
      'comptes',         coalesce(j.comptes, 0))
    from jours_serie s left join jour j on j.j = s.j
    where s.j = now()::date),
  'par_jour', coalesce((select jsonb_agg(jsonb_build_object(
      'jour',            s.j,
      'arrivees',        coalesce(j.arrivees, 0),
      'clics_app',       coalesce(j.clics_app, 0),
      'clics_connexion', coalesce(j.clics_connexion, 0),
      'comptes',         coalesce(j.comptes, 0)) order by s.j)
    from jours_serie s left join jour j on j.j = s.j), '[]'::jsonb),
  'par_fournisseur', coalesce((select jsonb_agg(jsonb_build_object(
      'fournisseur', fournisseur, 'clics', clics, 'comptes', comptes)) from fournisseur), '[]'::jsonb),
  'par_version', coalesce((select jsonb_agg(jsonb_build_object(
      'version', version, 'arrivees', arrivees, 'comptes', comptes, 'horaires', horaires)) from versions), '[]'::jsonb),
  'pages_arret', coalesce((select jsonb_agg(jsonb_build_object(
      'etape', etape, 'n', n)) from arrets), '[]'::jsonb),
  'erreurs', coalesce((select jsonb_agg(jsonb_build_object(
      'erreur', erreur, 'ecran', ecran, 'n', n, 'dernier', dernier)) from erreurs), '[]'::jsonb),
  'plus_ancien', (select min(created_at) from public.evenements)
)
$$;

revoke all on function public.stats_evenements(integer) from public, anon, authenticated;
grant execute on function public.stats_evenements(integer) to service_role;

-- Si pg_cron est activée, planifier la purge des événements avec celle des
-- visites (à décommenter, une fois) :
-- select cron.schedule('ezh-purge-evenements', '23 4 * * *',
--                      'select public.purger_evenements(90)');

-- ---------------------------------------------------------------
-- EzHoraire — PDF officiels ouverts (pour décider de garder ou non
-- la fonctionnalité : volume réel d'usage).
-- Une ligne = un PDF officiel affiché avec succès (bouton « PDF
-- officiel » de l'app, après téléchargement réussi). L'app l'insère
-- seule, en arrière-plan, comme les consultations (`visites`).
-- Lecture interdite côté app : seul le dashboard (via /api/stats,
-- clé service_role côté serveur) les agrège. Rejouable.
-- ---------------------------------------------------------------
create table if not exists public.pdf_exports (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  ecole      text        not null default '',
  formation  text        not null default '',
  groupe     text        not null default '',
  semaine    smallint    not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pdf_exports enable row level security;

drop policy if exists "pdf_exports_insert_propres" on public.pdf_exports;
create policy "pdf_exports_insert_propres" on public.pdf_exports
  for insert with check (auth.uid() = user_id);

-- Pas de politique SELECT : personne ne lit ses exports depuis l'app.
-- (Le service_role du backend contourne la RLS pour le dashboard.)

create index if not exists idx_pdf_exports_date on public.pdf_exports (created_at desc);
create index if not exists idx_pdf_exports_ecole on public.pdf_exports (ecole, created_at desc);

-- Garde-fous (rejouable) : au plus 100 PDF / 24 h / compte (un usage
-- normal en ouvre une poignée par semaine), textes bornés, date posée
-- par la base. Purge à 180 jours comme les visites.
create or replace function public.limiter_pdf_exports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recents integer;
begin
  new.created_at := now();
  new.ecole     := left(new.ecole, 120);
  new.formation := left(new.formation, 160);
  new.groupe    := left(new.groupe, 120);
  new.semaine   := greatest(0, least(new.semaine, 99));

  select count(*) into recents
  from public.pdf_exports
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';

  if recents >= 100 then
    raise exception 'Trop de PDF enregistrés sur 24 h.';
  end if;
  return new;
end $$;

drop trigger if exists trg_pdf_exports_limite on public.pdf_exports;
create trigger trg_pdf_exports_limite
  before insert on public.pdf_exports
  for each row execute function public.limiter_pdf_exports();

create or replace function public.purger_pdf_exports(jours integer default 180)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  supprimees bigint;
begin
  delete from public.pdf_exports
  where created_at < now() - make_interval(days => greatest(jours, 30));
  get diagnostics supprimees = row_count;
  return supprimees;
end $$;

revoke all on function public.purger_pdf_exports(integer) from public, anon, authenticated;
grant execute on function public.purger_pdf_exports(integer) to service_role;

-- Si l'extension pg_cron est activée, planifier la purge avec les autres :
-- select cron.schedule('ezh-purge-pdf', '29 4 * * *',
--                      'select public.purger_pdf_exports(180)');
