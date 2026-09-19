# EzHoraire

Les horaires de cours, lisibles sur téléphone. On se connecte (Google,
GitHub ou email), on indique son nom et prénom une fois, on choisit son
école, sa formation et son groupe ; ensuite l'app s'ouvre directement
sur son horaire (session + choix gardés sur l'appareil : `localStorage`
clés `ezh_compte`, `ezh_profils`, `ezh_courant`). Une création d'horaire
en cours (école, formation, cours cochés, groupes) est gardée dans
`ezh_brouillon` et reprise au retour, même après un rechargement de la
page.

Un seul horaire : affichage classique, sans nom ni sélecteur. Plusieurs
horaires : chacun a son surnom (ex. Info, Droit, demandé à partir du 2e)
et sa couleur, avec une barre de sélection en haut façon Horairelm.
L'ordre des cartes se règle dans les Réglages : on attrape un horaire
pour le faire glisser (appui long sur téléphone, pour ne pas confondre
avec le défilement) ; la barre de sélection de la page principale suit.
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
espace invités public), **Condorcet** (Condorcet Planning, espace invités
public), **ULB** (TimeEdit, vue publique « je n'ai pas encore d'ULBID ») et
**UCLouvain** (Mon horaire, en test — voir plus bas). Objectif : la plupart
des universités et hautes écoles belges, puis les applications iOS et
Android, et les comptes (Google, GitHub, email).

L'UMONS, Condorcet et l'ULB, branchées récemment, portent une étiquette
**Bêta** sur l'écran des écoles (`beta: true` dans `ECOLES`, `index.html`) :
elles n'ont pas encore vu une année entière. À retirer quand elles auront
tenu une rentrée.

Une école peut être codée sans être publiée : elle est enregistrée dans
`api/_ecoles/__init__.py` derrière `EZH_UCL=1` et l'app ne la propose que si
`/api/config` la liste (`ECOLES_ACTIVES`). Sans la variable, un
déploiement Vercel n'expose ni l'école, ni sa recherche, ni ses
horaires. `serve.py` pose la variable pour le développement.

## Comptes (Supabase Auth, branché)

L'entrée de l'app, c'est la connexion : 2 boutons OAuth (Google / GitHub)
+ email (mot de passe), avec un rail « Se connecter / Créer un compte » :
en mode connexion, une adresse inconnue reste une erreur (elle ne crée
plus de compte fantôme sur une faute de frappe) ; en mode création, une
adresse déjà inscrite est refusée. Google / GitHub font les deux, c'est le
fournisseur qui décide. À côté, un aperçu d'une semaine type, puis
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

## Dashboard admin (comptes → cours → consultations → parcours)

`/dashboard.html`, en quatre onglets : **Aperçu** (consultations par jour,
comparées à la période d'avant, puis par école → formations), **Parcours**
(de la visite à l'horaire enregistré, problèmes rencontrés), **Comptes**
(rangés par école ; un compte qui a des horaires dans plusieurs écoles
apparaît dans chacune, signalé) et **Retours** (bugs et demandes, titre puis
détail au clic). Une consultation = une personne connectée qui ouvre un de
ses horaires (`visites`) ; rouvrir le même horaire dans les 30 min ne
recompte pas (filtre côté app ET dans `api/stats.py`, qui dédoublonne aussi
l'historique). Jours à l'heure de Bruxelles. Réservé aux
admins, via `GET /api/stats` (clé service_role côté serveur uniquement,
jamais dans le navigateur). Le bouton Apparence de l'en-tête règle le
clair / sombre / système et la couleur de l'accent (bleu, vert, rose),
gardée dans `ezh_admin_couleur`. Un compte est admin si son `user_id`
figure dans `ADMIN_USER_IDS`, ou si son `app_metadata` contient
`"admin": true`, ou (Repli) si son email figure dans `ADMIN_EMAILS`.
Préfère `ADMIN_USER_IDS` : un email n'est pas un identifiant, il ne vaut
que tant que le compte qui le porte existe déjà.

Mise en route (une fois) :

1. Supabase → SQL Editor : recoller `supabase/schema.sql` (tables
   `visites`, `bug_reports` et `evenements` + plafonds, purge et fonction
   d'agrégation, ajoutés depuis ; rejouable sans rien casser).
2. Supabase → Project Settings → API : copier la clé `service_role`.
3. Supabase → Authentication → Users : copier l'UUID du compte admin.
4. Vercel → Settings → Environment Variables (Production + Preview) :
   `SUPABASE_SERVICE_ROLE_KEY` = la clé service_role,
   `ADMIN_USER_IDS` = cet UUID (plusieurs = séparés par des virgules),
   puis redéployer. En local : mêmes clés dans `.env.local`.
5. Ouvrir `https://www.ezhoraire.be/dashboard.html` avec ton compte admin
   (connecté au préalable sur `/`). Les autres comptes voient « réservé ».

La purge de `visites` (180 jours) est fournie par `purger_visites()`,
celle des étapes anonymes (90 jours) par `purger_evenements()` : les
planifier si l'extension pg_cron est active (voir la fin de
`schema.sql`), sinon les appeler de temps en temps dans le SQL Editor.

**Parcours anonyme (`evenements`).** `suivi.js`, chargé par l'app
(`index.html`), note une visite sans jamais l'identifier : identifiant
aléatoire en `sessionStorage` (effacé à la fermeture de l'onglet), aucun
`user_id`, jamais relié à un compte. Écriture seule avec la clé anon (RLS
insert-only, plafond 150 événements / 24 h / session) ; la lecture est
réservée au dashboard : `api/stats.py` appelle la fonction
`stats_evenements()` (service_role), qui agrège côté base et renvoie
quelques kilo-octets — les lignes brutes ne transitent jamais.

Ce qui est mesuré : arrivée, clics de connexion, compte créé, identité,
étapes école / formation / groupes, horaire enregistré, sortie (durée
active, écran quitté) ; et les frictions, une fois par visite et par code
— recherche sans résultat, capture illisible ou vide, analyse sans cours
reconnu, horaire validé avec des cours sans groupe, école trop lente,
hors ligne, erreur de réponse. Chaque événement porte la version du
parcours (`window.EZH_VERSION` dans `index.html`, à incrémenter à chaque
correctif) pour comparer avant / après (lisible en SQL, plus affichée dans le dashboard). Fichiers :
`suivi.js` (collecte), fin de `supabase/schema.sql` (table, plafond,
purge, agrégation), section `Parcours` de `dashboard.html`. Si la table
manque, le dashboard l'indique au lieu d'échouer. Mesure sans cookie,
décrite dans `confidentialite.html` : la revoir si un jour un identifiant
persistant est ajouté (il rouvrirait la question du consentement).

Requêtes utiles (SQL Editor) sans le dashboard :

```sql
-- inscrits par formation
select formation, count(distinct user_id) from profils group by formation;
-- consultations par jour (7 derniers jours)
select date_trunc('day', created_at)::date as jour, count(*)
from visites where created_at > now() - interval '7 days' group by 1 order by 1;
-- entonnoir d'une période
select public.stats_evenements(30);
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
- `POST /api/importer` (corps `{"ecole": "ulb", "liste": "<texte collé>"}`) :
  une liste de cours copiée (ou lue sur une capture) → les codes du
  catalogue. En POST parce que c'est le programme de cours d'une personne :
  dans une adresse, il finirait dans les journaux de l'hébergeur, dans
  l'historique du navigateur et dans le `Referer`.
- `GET /api/pdf?ecole=heh&formation=..&groupe=..&semaine=..` : PDF officiel.

### Horaires sur mesure

Pour les étudiants entre deux années (cours carrés, option d'une autre
année, réorientation) : un horaire peut réunir **1 à 6 sources** d'une
même école (HEH, UMONS, Condorcet, ULB ; l'UCLouvain dès sa publication).
Une source = une formation, un parcours `PAR:` ou un lien iCal, avec ses
groupes et un rôle : **année principale** (tout est gardé, on retire des
cours : `sans`) ou **année d'ajout** (seuls les cours cochés : `avec`).
Entrée : la carte « Composer un horaire sur mesure » en tête de l'écran
des formations ; les écrans formation et groupes sont réutilisés, plus le
composeur (`v-perso`) et le choix des cours (`v-cours`).

La fusion est faite dans le navigateur par `fusion.js` (fonctions pures,
testées par `node --test test_fusion.mjs`) : cours puis groupes filtrés
**source par source** (les noms de groupes se répètent d'une formation à
l'autre), semaines alignées sur le lundi le plus tôt (l'UCLouvain et les
liens iCal ont un lundi par source ; une source à plus de 26 semaines de
la principale est écartée), séances identiques dédoublonnées entre
sources, chevauchements signalés **entre sources** seulement. À l'ULB, un
cours est un code UE (une séance mutualisée « A, B, C » reste tant qu'un
de ses codes est suivi). Rien ne change côté serveur : chaque source est
un `api/horaires` (ou `api/ical`) ordinaire, chargé par lots de 3 et gardé
en cache comme un horaire normal. Le PDF officiel se choisit par source.

Profil : `sources` (colonne jsonb de `profils`, voir `supabase/schema.sql`),
`formation` et `groupes` vides — un ancien client ignore donc l'horaire au
lieu d'en afficher une moitié. Tant que la base n'a pas la colonne, les
horaires sur mesure ne sont pas poussés : ils restent sur l'appareil (une
ligne sans ses sources reviendrait vide au pull suivant). Plan et audit
par école : `propositions/horaire-perso/PLAN.md`.

Selon la formation, l'école a un groupe par classe (BA2P Informatique),
un groupe par cours (BA1 Droit : l'étudiant en choisit plusieurs) ou aucun
groupe (MA1 Ingénieur industriel) : l'écran de choix gère les trois cas.
Les pastilles sont rangées par cours (une ligne par matière, déduite des
cours qui les utilisent) : l'étudiant voit à quoi sert chaque groupe. Une
formation à groupes de classe (Médecine : `Groupe A`..`X` partout) garde
une seule liste. Un rappel signale les cours pour lesquels aucun groupe
n'est coché (cours silencieusement absents de l'horaire autrement).
Au-delà de 8 groupes, l'app exige au moins une sélection (sans elle,
l'horaire mélangerait toutes les options). Les groupes se changent plus
tard sans refaire l'horaire : la fenêtre « Modifier » d'une carte (menu ⋮
des Réglages) rouvre le même écran de choix, sélection existante reprise,
et la semaine se réaffiche avec les nouveaux groupes. L'écran de création
le dit lui-même, sous les pastilles.

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
deux. Un code de programme suffit — l'onglet conseillé est donc « Par
programme » (et non « Par codes de cours » comme à l'ULB) : il donne
toutes les séances de l'année d'un coup. Les deux autres entrées restent
disponibles : par codes de cours (« PAR:LINFO1101,LEPL1101 ») et
l'horaire personnel via le lien d'abonnement iCal de Mon horaire
(monhoraire.uclouvain.be → « Exporter » → « Lien d'abonnement », ou le
lien de partage ; le sélecteur « Horaire #n » est conservé). L'import
(capture d'écran ou liste collée) marche aussi pour l'UCLouvain : il lit
les codes de cours, pas les intitulés — une liste copiée de Mon horaire
contient les codes, c'est le cas normal.

Le moteur lit la vue publique de Mon horaire (`/calendar/<recherche>`,
`/api/events`), sans session ni identifiant. La recherche renvoie des
entrées utilisables telles quelles, y compris les sous-sélections
(« DROI11BA - Cours obligatoires ») et les variantes (« SINF11BA -
anglais ») : elles sont gardées entières, sinon une sélection précise
retomberait sur le programme complet. Mon horaire ignore aujourd'hui le
paramètre `year` (vérifié : 2020-2021 répond la même chose que
2026-2027) ; l'année est quand même envoyée et le repli sur la précédente
reste en filet si l'API se remet à filtrer.

Côté groupes : seuls TP et LABO sont des choix (codes d'activité
`LINFO1101_Q1.A2`, `LEPL1201-Q1-Réser. labo B (créneau 2)`…). Les séances
CM, EXAM et OTHER (audience, examens, tests, consultations, monitorats)
n'ont pas de groupe : elles restent toujours visibles, même si
l'étudiant ne coche que son TP — sinon il verrait une semaine presque
vide. Les noms d'enseignants sont lus dans la description des séances.
Pas de PDF officiel : le bouton est masqué pour cette école.

Spécificités UMONS (382 formations) : chaque groupe est préfixé par sa
formation (`<.BAB1 - Droit>Dr. rom - Gr 1`), l'API renvoie les noms
décapés (`Dr. rom - Gr 1`) et accepte les deux formes pour le PDF ; si
deux groupes produisent le même nom court, ils gardent leur nom complet
(pas de PDF du mauvais groupe). Un cours tagué avec tous les groupes est
marqué commun à la formation. Les séances « événement » sans intitulé
(`_`) prennent le libellé du commentaire (`Test de positionnement en
langues`). Avec plusieurs groupes, la visionneuse PDF propose de choisir
le groupe (ou toute la formation).

Spécificités Condorcet (525 ressources, dont la ressource d'essai « TEST »
écartée de la liste, soit 524 proposées ; espace invités Pronote Campus) :
une configuration de plus sur le moteur Hyperplanning, comme la HEH et
l'UMONS. L'école publie une ressource d'essai « TEST » : elle est écartée
de la liste des formations (le reste de son planning reste servi tel
quel). Les intitulés sont préfixés par l'année et le diplôme (« B1-Bac »,
« B2-Mas », « B3-Cer ») : l'app les range par rubrique (bacheliers,
masters, certificats, puis les activités d'aide à la réussite — des
séances de soutien, pas des formations diplômantes) et la recherche
comprend leurs abréviations (« bac 1 », « option », « AESI »,
« St-Ghislain »…).

Protection de l'école, en quatre couches :

1. **Le cache partagé de l'hébergeur** (`s-maxage` : 15 min pour un
   horaire, 30 min pour un PDF, 1 h pour les listes de formations et les
   recherches) absorbe l'usage
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
   (HEH, UMONS, Condorcet), 400 appels / min chez TimeEdit (ULB), 300 chez
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
3.11.174) sont épinglées et protégées par `integrity` ; `pdf.js` n'est
téléchargé qu'à la première ouverture d'un PDF (`chargerPdfJs()`), pas au
démarrage ; la CSP de
`vercel.json` (dupliquée dans `serve.py`, à garder synchronisée) limite
les sources. `logos/ecoles/` est déployé, `logos/da/` et `logos/ez/`
(scripts) ne le sont pas (`.vercelignore`).

## Fichiers

- `index.html` — l'app (connexion, choix école → formation → groupe(s),
  puis horaire).
- `demo.html` — page de démonstration (ouvre l'app en mode essai, sans
  compte).
- `fusion.js` — fusion des horaires sur mesure (fonctions pures, chargée
  par `index.html`) ; tests : `node --test test_fusion.mjs`.
- `suivi.js` — mesure anonyme du parcours (arrivée → clic → compte →
  horaire) et des frictions, chargée par `index.html` ; voir le dashboard
  admin.
- `confidentialite.html`, `cgu.html` — politique de confidentialité et
  conditions d'utilisation (mentions légales incluses), stylées par
  `legal.css` + `legal.js` (sommaire). À relire à chaque nouveau
  prestataire, nouvelle donnée ou nouvelle école.
- `404.html` — page des adresses inconnues (servie seule par Vercel, et
  par `serve.py` en local).
- `og-image.png` — aperçu des liens partagés (1200 × 630). Source :
  `logos/og/og-image.html`, rendu par `python3 logos/og/build.py`.
- `robots.txt`, `sitemap.xml` — référencement (l'API, le dashboard et la
  page de mot de passe sont exclus).
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
  `heh.py`, `umons.py`, `condorcet.py`, `ulb.py`, `ucl.py`, plus
  `__init__.py` qui tient le registre et les aides HTTP), et les **moteurs**
  partagés dans `api/_moteurs/` (`hyperplanning.py`, `timeedit.py`,
  `ical.py`, `import_liste.py`, `typesafe.py`).
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
`api/_ecoles/heh.py`, `BASE` (`hplanning2026`) + `PREMIER_LUNDI_DEFAUT` dans
`api/_ecoles/umons.py`, et `BASE` (`horaires2026`) +
`PREMIER_LUNDI_DEFAUT` dans `api/_ecoles/condorcet.py`. Sans ça, l'école
concernée répond « L'école ne répond pas correctement » partout. Pour
l'ULB : `PREMIER_LUNDI_DEFAUT` et `ANNEE` (`202627`) dans
`api/_ecoles/ulb.py` (le reste — vues publiques `sid`, fin de fenêtre —
TimeEdit s'en occupe).
