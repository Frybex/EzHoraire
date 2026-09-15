# EzHoraire

Les horaires de cours, lisibles sur téléphone. On se connecte (Google,
GitHub ou email), on indique son nom et prénom une fois, on choisit son
école, sa formation et son groupe ; ensuite l'app s'ouvre directement
sur son horaire (session + choix gardés sur l'appareil : `localStorage`
clés `ezh_compte`, `ezh_profils`, `ezh_courant`).

Un seul horaire : affichage classique, sans nom ni sélecteur. Plusieurs
horaires : chacun a son surnom (ex. Info, Droit, demandé à partir du 2e)
et sa couleur, avec une barre de sélection en haut façon Horairelm
(Maxence / Lilian / Anthony). Un profil = un cours / une option complète
(école + formation + groupes), pas juste un groupe. Le bouton en haut à
droite ouvre les **Réglages** (identité, déconnexion, mes horaires).
L'horaire se met à jour tout seul à chaque ouverture : recharger la page
suffit, il n'y a aucun bouton d'actualisation.

Écoles prises en charge : **HEH** (HEH Planning, espace invités public).
Objectif : la plupart des universités et hautes écoles belges, puis les
applications iOS et Android, et les comptes (Google, GitHub, email).

## Comptes (Supabase Auth, branché)

L'entrée de l'app, c'est la connexion : 2 boutons OAuth (Google / GitHub)
+ email (mot de passe), à côté d'un aperçu d'une semaine type, puis
nom + prénom demandés une fois (pré-remplis depuis le fournisseur si
possible) et affichés dans les Réglages (l'avatar en haut à droite montre
les initiales). Session persistante : par défaut, on rouvre directement
sur son horaire.

Technique : `index.html` charge le SDK Supabase (CDN) et lit l'URL + la clé
publique *anon* via `GET /api/config`, qui les lit dans l'env Vercel
(`SUPABASE_URL` / `SUPABASE_ANON_KEY`). Sans clés (ou SDK injoignable),
l'app retombe en mode local : les boutons mémorisent juste le fournisseur
sur l'appareil, comme avant. Les horaires vivent dans `localStorage`
(cache hors ligne) ET dans la table `profils` (voir
`supabase/schema.sql`) : poussée différée à chaque changement
(`sauverProfils()` → `planifierPush()`), tirage à la connexion et au
démarrage, fusion par `id` (le dernier écrit gagne via `maj` /
`updated_at`), suppression propagée.

Reste côté consoles (une fois le projet Supabase créé) :

1. Supabase → SQL Editor : coller `supabase/schema.sql` (table `profils`
   + RLS « chacun ne voit que ses lignes »).
2. Vercel → Settings → Environment Variables : `SUPABASE_URL` +
   `SUPABASE_ANON_KEY` (Production + Preview), puis redéployer.
3. Supabase → Authentication → URL Configuration : Site URL = domaine
   Vercel + Redirect URLs += `http://localhost:8902` (essais locaux).
4. **Google** : Google Cloud Console → Client ID OAuth (origine autorisée =
   ton domaine + `https://<projet>.supabase.co`), à renseigner dans
   Supabase → Authentication → Providers → Google.
5. **GitHub** : GitHub → Settings → Developer settings → OAuth App
   (callback = `https://<projet>.supabase.co/auth/v1/callback`), puis
   Supabase → Providers → GitHub.
6. **Email** : natif Supabase (mot de passe déjà câblé ;
   régler « Confirm email » selon qu'on veut vérifier l'adresse ou non).

Il n'y a volontairement aucun bouton de connexion ni d'actualisation dans
les Réglages : on se connecte avant d'entrer, et tout se met à jour
à l'ouverture.

## Fonctionnement

- `GET /api/formations?ecole=heh` : formations de l'école.
- `GET /api/horaires?ecole=heh&formation=<nom>` : horaire complet de la
  formation, semaine par semaine ; chaque cours porte ses groupes (vide =
  toute la formation). L'app filtre selon les groupes de l'étudiant : une
  seule récupération par formation, partagée par tous ses étudiants.
- `GET /api/pdf?ecole=heh&formation=..&groupe=..&semaine=..` : PDF officiel.

Selon la formation, l'école a un groupe par classe (BA2P Informatique),
un groupe par cours (BA1 Droit : l'étudiant en choisit plusieurs) ou aucun
groupe (MA1 Ingénieur industriel) : l'écran de choix gère les trois cas.

## Fichiers

- `index.html` — l'app (choix école → formation → groupe(s), puis horaire).
- `api/_heh.py` — récupération chez HEH Planning.
- `api/_ecoles.py` — liste des écoles + aides HTTP. Ajouter une école : un
  module comme `_heh.py` (NOM, formations(), horaire(), pdf_semaine()),
  une ligne dans `ECOLES`, et une entrée dans `ECOLES` de `index.html`.
- `api/formations.py`, `api/horaires.py`, `api/pdf.py` — points d'entrée.
- `serve.py` — serveur local avec la même API (http://localhost:8902).

## Sur l'ordinateur

```bash
pip install -r requirements.txt   # une seule fois
python3 serve.py
```

## En ligne (Vercel)

Projet `ezhoraire` → https://ezhoraire.vercel.app (nom en minuscules
imposé par Vercel). Redéployer après des changements :

```bash
vercel --prod --yes
```

À la rentrée prochaine : adapter `BASE` (`hehplanning2026`) dans `api/_heh.py`.
