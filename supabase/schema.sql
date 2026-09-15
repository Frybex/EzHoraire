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
