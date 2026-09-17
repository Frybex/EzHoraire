# EzHoraire

Les horaires de cours, lisibles sur téléphone. On se connecte (Google,
GitHub ou email), on indique son nom et prénom une fois, on choisit son
école, sa formation et son groupe ; ensuite l'app s'ouvre directement
sur son horaire (session + choix gardés sur l'appareil : `localStorage`
clés `ezh_compte`, `ezh_profils`, `ezh_courant`).

Un seul horaire : affichage classique, sans nom ni sélecteur. Plusieurs
horaires : chacun a son surnom (ex. Info, Droit, demandé à partir du 2e)
et sa couleur, avec une barre de sélection en haut façon Horairelm.
Un profil = un cours / une option complète
(école + formation + groupes), pas juste un groupe. Le bouton en haut à
droite ouvre les **Réglages** (identité, déconnexion, mes horaires).
L'horaire se met à jour tout seul à chaque ouverture : recharger la page
suffit, il n'y a aucun bouton d'actualisation.

Couleurs des cours : un intitulé = une couleur. Les matières de la
formation sont triées par ordre alphabétique puis réparties sur une
palette sobre (`preparerCouleurs()`), donc deux intitulés différents
n'ont jamais la même couleur, et la couleur d'un cours ne change pas
d'une semaine à l'autre. Rendu volontairement mat : fond très peu
saturé, rail de couleur à gauche, texte neutre.

Écoles prises en charge : **HEH** (HEH Planning), **UMONS** (UMONS Planning,
espace invités public), **ULB** (TimeEdit, vue publique « je n'ai pas
encore d'ULBID ») et **UCLouvain** (Mon horaire, en test — voir plus bas).
Objectif : la plupart des universités et hautes écoles belges, puis les
applications iOS et Android, et les comptes (Google, GitHub, email).

L'UMONS et l'ULB, branchées récemment, portent une étiquette **Bêta** sur
l'écran des écoles (`beta: true` dans `ECOLES`, `index.html`) : elles
n'ont pas encore vu une année entière. À retirer quand elles auront tenu
une rentrée.

Une école peut être codée sans être publiée : elle est enregistrée dans
`api/_ecoles/__init__.py` derrière `EZH_UCL=1` et l'app ne la propose que si
`/api/config` la liste (`ECOLES_ACTIVES`). Sans la variable, un
déploiement Vercel n'expose ni l'école, ni sa recherche, ni ses
horaires. `serve.py` pose la variable pour le développement.

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
   + RLS « chacun ne voit que ses lignes »). Rejouable : recoller le
   fichier après une mise à jour (il ajoute au passage la colonne `ical`,
   le lien d'abonnement personnel des horaires ULB).
2. Vercel → Settings → Environment Variables : `SUPABASE_URL` +
   `SUPABASE_ANON_KEY` (Production + Preview), puis redéployer.
3. Supabase → Authentication → URL Configuration : Site URL =
   `https://www.ezhoraire.be` + Redirect URLs += `https://www.ezhoraire.be/**`,
   `https://ezhoraire.be/**` et `http://localhost:8902/**` (essais locaux).
   Les deux domaines comptent : `ezhoraire.be` renvoie vers `www`.
4. **Google** : Google Cloud Console → Client ID OAuth (origine autorisée =
   ton domaine + `https://<projet>.supabase.co`), à renseigner dans
   Supabase → Authentication → Providers → Google.
5. **GitHub** : GitHub → Settings → Developer settings → OAuth App
   (callback = `https://<projet>.supabase.co/auth/v1/callback`), puis
   Supabase → Providers → GitHub.
6. **Email** : natif Supabase (mot de passe déjà câblé). Si « Confirm
   email » est activé, il faut un SMTP perso (Resend, Brevo…) : l'envoi
   par défaut de Supabase ne part que vers les membres de l'équipe du
   projet, les autres ne reçoivent jamais le lien. Sans SMTP, désactiver
   « Confirm email » : le compte est créé et connecté tout de suite.
   Mot de passe oublié : natif aussi. Coller `emails/reset-password.html`
   dans Authentication → Emails → Reset Password (Message body) ; le lien
   ouvre `/mot-de-passe.html`, qui vérifie le jeton, affiche l'adresse
   concernée et enregistre le nouveau mot de passe, puis renvoie sur
   l'app déjà connectée. Le modèle passe par `{{ .TokenHash }}` plutôt que
   par `{{ .ConfirmationURL }}` : la vérification se fait alors dans le
   navigateur, donc les antivirus et aperçus de lien des messageries qui
   pré-chargent les URL ne consomment plus le lien à usage unique.

En local : `vercel env pull .env.local` une fois (fichier ignoré par git
et par Vercel), `serve.py` le charge au démarrage. Sans ce fichier, l'app
tourne en connexion factice (uniquement sur localhost ; en ligne, la
connexion est refusée avec un message si le cloud est injoignable).

## Dashboard admin (comptes → cours → consultations)

`/dashboard.html` : comptes créés, cours suivis (`profils`), consultations
par jour (`visites`, 1 ligne = 1 ouverture d'horaire). Réservé aux admins,
via `GET /api/stats` (clé service_role côté serveur uniquement, jamais
dans le navigateur). Un compte est admin si son `user_id` figure dans
`ADMIN_USER_IDS`, ou si son `app_metadata` contient `"admin": true`, ou
(Repli) si son email figure dans `ADMIN_EMAILS`. Préfère
`ADMIN_USER_IDS` : un email n'est pas un identifiant, il ne vaut que
tant que le compte qui le porte existe déjà.

Mise en route (une fois) :

1. Supabase → SQL Editor : recoller `supabase/schema.sql` (table `visites`
   + plafond et purge, ajoutés depuis ; rejouable sans rien casser).
2. Supabase → Project Settings → API : copier la clé `service_role`.
3. Supabase → Authentication → Users : copier l'UUID du compte admin.
4. Vercel → Settings → Environment Variables (Production + Preview) :
   `SUPABASE_SERVICE_ROLE_KEY` = la clé service_role,
   `ADMIN_USER_IDS` = cet UUID (plusieurs = séparés par des virgules),
   puis redéployer. En local : mêmes clés dans `.env.local`.
5. Ouvrir `https://www.ezhoraire.be/dashboard.html` avec ton compte admin
   (connecté au préalable sur `/`). Les autres comptes voient « réservé ».

La purge de `visites` (180 jours) est fournie par `purger_visites()` :
la planifier si l'extension pg_cron est active (voir la fin de
`schema.sql`), sinon l'appeler de temps en temps dans le SQL Editor.

Requêtes utiles (SQL Editor) sans le dashboard :

```sql
-- inscrits par formation
select formation, count(distinct user_id) from profils group by formation;
-- consultations par jour (7 derniers jours)
select date_trunc('day', created_at)::date as jour, count(*)
from visites where created_at > now() - interval '7 days' group by 1 order by 1;
```

Il n'y a volontairement aucun bouton de connexion ni d'actualisation dans
les Réglages : on se connecte avant d'entrer, et tout se met à jour
à l'ouverture (le cache partagé peut servir une version vieille de 15 min
au maximum : un changement de salle apparaît au plus tard après ça).

## Fonctionnement

- `GET /api/formations?ecole=heh` : formations de l'école. L'ULB en a plus
  de 2 000 (niveaux d'études) : l'app ne télécharge pas cette liste, elle
  utilise `api/recherche`.
- `GET /api/horaires?ecole=heh&formation=<nom>` : horaire complet de la
  formation, semaine par semaine ; chaque cours porte ses groupes (vide =
  toute la formation). L'app filtre selon les groupes de l'étudiant : une
  seule récupération par formation, partagée par tous ses étudiants.
- `GET /api/recherche?ecole=ulb&genre=niveau|ue&q=..` : recherche en direct
  des niveaux d'études ou des unités d'enseignement (ULB).
- `GET /api/ical?lien=<url>` : horaire d'un lien d'abonnement TimeEdit
  (« S'abonner » dans Mon horaire), au même format que api/horaires.
- `GET /api/pdf?ecole=heh&formation=..&groupe=..&semaine=..` : PDF officiel.

Selon la formation, l'école a un groupe par classe (BA2P Informatique),
un groupe par cours (BA1 Droit : l'étudiant en choisit plusieurs) ou aucun
groupe (MA1 Ingénieur industriel) : l'écran de choix gère les trois cas.
Les pastilles sont rangées par cours (une ligne par matière, déduite des
cours qui les utilisent) : l'étudiant voit à quoi sert chaque groupe. Une
formation à groupes de classe (Médecine : `Groupe A`..`X` partout) garde
une seule liste. Un rappel signale les cours pour lesquels aucun groupe
n'est coché (cours silencieusement absents de l'horaire autrement).
Au-delà de 8 groupes, l'app exige au moins une sélection (sans elle,
l'horaire mélangerait toutes les options).

Spécificités ULB (TimeEdit) : deux façons de composer un horaire — par
niveau d'études (« B-DROIB:2 · Bachelier en droit… », puis le groupe :
groupe 01, PAD6, option…) et par cours (« PAR:DROIC2001,DROIC2007 », pour
les cours isolés et les programmes à la carte). Le moteur lit la vue
publique de TimeEdit (`objects.json`, `ri.json`, `ri.pdf`), sans session ni
identifiant ; les groupes d'un cours viennent de la colonne « Ensemble
d'étudiants » des réservations. L'étudiant qui a un ULBID peut aussi coller
le lien d'abonnement iCal de son Mon horaire : l'app lit alors son horaire
personnel (`api/ical`), sans que le moindre mot de passe passe par nous, et
sans PDF (il n'y en a pas pour un lien). La liste des niveaux n'est pas
téléchargée : le champ de recherche appelle `api/recherche`.

Spécificités UCLouvain (**en test, publiée seulement si `EZH_UCL=1`**) :
un même « code » désigne un cours (`LINFO1101`) ou un programme
(`SINF11BA`), et la recherche publique (`api/recherche`) répond les
deux. Trois entrées, comme pour l'ULB : par programme, par codes de cours
(« PAR:LINFO1101,LEPL1101 »), ou l'horaire personnel via le lien
d'abonnement iCal de Mon horaire
(monhoraire.uclouvain.be → « Exporter » → « Lien d'abonnement », ou le
lien de partage). Le moteur lit la vue publique de Mon horaire
(`/calendar/<recherche>`, `/api/events`), sans session ni identifiant ;
l'année académique est déduite de la date, avec repli sur la précédente
tant que la nouvelle n'est pas publiée. Les groupes affichés sont les
codes d'activité de l'UCLouvain (`LINFO1101_Q1.A2`…) : l'étudiant coche
ses TP, les séances sans choix (accueil, CM d'audience unique) restent
visibles. Pas de PDF officiel : le bouton est masqué pour cette école.

Spécificités UMONS (382 formations) : chaque groupe est préfixé par sa
formation (`<.BAB1 - Droit>Dr. rom - Gr 1`), l'API renvoie les noms
décapés (`Dr. rom - Gr 1`) et accepte les deux formes pour le PDF ; si
deux groupes produisent le même nom court, ils gardent leur nom complet
(pas de PDF du mauvais groupe). Un cours tagué avec tous les groupes est
marqué commun à la formation. Les séances « événement » sans intitulé
(`_`) prennent le libellé du commentaire (`Test de positionnement en
langues`). Avec plusieurs groupes, la visionneuse PDF propose de choisir
le groupe (ou toute la formation).

Protection de l'école, en quatre couches :

1. **Le cache partagé de l'hébergeur** (`s-maxage` : 15 min pour un
   horaire, 30 min pour un PDF, 1 h pour une recherche) absorbe l'usage
   normal — tous les étudiants d'une même formation ne comptent que pour
   une visite chez l'école.
2. **Le cache d'instance** (`_memo`) rattrape ce qui passe à côté :
   horaire 15 min, listes / recherches / résolution d'une formation 1 h.
   Une recherche refaite à chaque frappe corrigée ne coûte qu'une fois, et
   ouvrir six semaines de PDF ne relance pas six fois la même résolution.
3. **La limite par IP et par point d'entrée** (`_ecoles.debit`, par
   minute) : 60 formations, 40 recherches, 12 horaires, 12 PDF, 12 iCal,
   6 imports. Un import cherche jusqu'à 25 fois chez l'école, d'où sa
   limite plus basse.
4. **Le fusible par instance** : 120 sessions / min chez Hyperplanning
   (HEH, UMONS), 400 appels / min chez TimeEdit (ULB), 300 chez
   l'UCLouvain. Au-delà, l'app répond « réessaie dans une minute » au lieu
   d'insister.

Les couches 2 à 4 sont propres à chaque instance serverless : c'est la
couche 1 qui fait le gros du travail. À la rentrée, si l'école se plaint
ou si le dashboard montre des rafales, activer aussi une limite de débit
sur `/api/*` dans Vercel → Firewall → Rate Limiting.

Toute demande est vérifiée **avant** d'appeler l'école quand c'est
possible : nom de formation inconnu, groupe qui n'existe pas, semaine
au-delà de ce que l'école publie, paramètre d'URL en trop ou en double
(qui contournerait le cache partagé) — tout ça se refuse sur ce qui est
déjà en mémoire.

Les libs chargées depuis les CDN (`supabase-js` 2.116.0, `pdf.js`
3.11.174) sont épinglées et protégées par `integrity` ; la CSP de
`vercel.json` (dupliquée dans `serve.py`, à garder synchronisée) limite
les sources. `logos/ecoles/` est déployé, `logos/da/` et `logos/ez/`
(scripts) ne le sont pas (`.vercelignore`).

## Fichiers

- `index.html` — l'app (choix école → formation → groupe(s), puis horaire).
- `mot-de-passe.html` — page d'atterrissage du lien « mot de passe oublié »
  (vérification du jeton, adresse du compte, choix et enregistrement du
  nouveau mot de passe, renvoi d'un lien si celui-ci a expiré).
- `emails/reset-password.html` — modèle de l'email « mot de passe oublié »
  (à coller dans Supabase → Authentication → Emails → Reset Password ;
  dossier non déployé, c'est un modèle, pas une page du site).
- `api/` — le serveur, rangé en trois étages (détail : `api/README.md`) :
  les **points d'entrée** à la racine (`formations.py`, `horaires.py`,
  `recherche.py`, `ical.py`, `importer.py`, `pdf.py`, `config.py`,
  `stats.py`), les **écoles** dans `api/_ecoles/` (un fichier par école :
  `heh.py`, `umons.py`, `ulb.py`, `ucl.py`, plus `__init__.py` qui tient
  le registre et les aides HTTP), et les **moteurs** partagés dans
  `api/_moteurs/` (`hyperplanning.py`, `timeedit.py`, `ical.py`,
  `import_liste.py`, `typesafe.py`).
- `serve.py` — serveur local avec la même API (http://localhost:8902).

Chercher quelque chose qui touche une école précise ? Tout ce qui lui est
propre tient dans `api/_ecoles/<école>.py` côté serveur, et dans les
tableaux `ECOLES` / `RECHERCHE` en haut du script de `index.html` côté
app. Le reste est commun à toutes.

## Sur l'ordinateur

```bash
pip install -r requirements.txt   # une seule fois
python3 serve.py
```

Pour ouvrir l'app depuis un autre appareil du réseau local (téléphone,
second ordinateur), `--lan` affiche l'adresse à utiliser et accepte ces
connexions ; sans lui, seul `localhost` répond. `--port` change le port
quand deux dossiers de travail tournent en même temps :

```bash
python3 serve.py --lan --port 8912
```

La connexion Google/GitHub depuis cette adresse demande d'ajouter
`http://<ip>:8902/**` aux Redirect URLs de Supabase (email + mot de passe
marche sans rien changer).

## En ligne (Vercel)

Projet `ezhoraire` → https://www.ezhoraire.be (nom en minuscules
imposé par Vercel). Redéployer après des changements :

```bash
vercel --prod --yes
```

À la rentrée prochaine : adapter `BASE` (`hehplanning2026`) dans
`api/_ecoles/heh.py` ET `BASE` (`hplanning2026`) + `PREMIER_LUNDI_DEFAUT` dans
`api/_ecoles/umons.py`. Sans ça, l'école concernée répond « L'école ne répond
pas correctement » partout. Pour l'ULB : `PREMIER_LUNDI_DEFAUT` et `ANNEE`
(`202627`) dans `api/_ecoles/ulb.py` (le reste — vues publiques `sid`, fin de
fenêtre — TimeEdit s'en occupe).
