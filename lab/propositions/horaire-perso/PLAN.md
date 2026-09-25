# Horaire sur mesure — plan détaillé

> Branche `horaireperso`. Ce dossier contient le plan, une maquette cliquable
> (`maquette.html`, `maquette-bureau.html`) et les captures ci-dessous.
> **Implémenté** (HEH, UMONS, Condorcet, ULB ; UCLouvain prête pour sa
> publication) : `fusion.js` + `test_fusion.mjs`, `index.html` (vues
> `v-perso` et `v-cours`), `supabase/schema.sql` (colonne `sources`),
> `api/stats.py`. Choix retenus pour les questions du §9 : une école à la
> fois ; base non migrée = horaire gardé sur l'appareil ; nom « sur
> mesure » ; rail de rôle au-dessus de la liste des cours ; fonctions pures
> dans `fusion.js` testées avec Node ; lien iCal accepté comme source.
> Événements de suivi : `horaire_ok` réutilisé (détails `perso`,
> `sources`) plutôt que trois nouveaux noms à ajouter à la liste blanche
> de `schema.sql`.

## 1. Le besoin

Aujourd'hui, un profil = **une** école + **une** formation + des groupes
(`{id, surnom, ecole, formation, groupes, theme}`). C'est le bon modèle
pour 95 % des étudiants, mais pas pour ceux qui sont **entre deux années** :

- **cours carrés / année en réserve** : un étudiant de BA2 repasse un ou
  deux cours de BA1 ;
- **cours isolés ou passerelle** : quelques cours d'une autre année que la
  sienne ;
- **options annuelles** : une option de BA3 suivie en même temps que sa
  propre année ;
- **réorientation** : un cours de l'ancienne formation gardé en même temps
  que la nouvelle.

Aujourd'hui, la seule solution est de créer **plusieurs horaires** dans
l'app : ils s'affichent l'un après l'autre, mais jamais ensemble. L'étudiant
doit faire la fusion de tête, et il ne voit pas les chevauchements (Analyse
TP de BA1 qui tombe en même temps qu'Anglais de BA2, par exemple).

**Objectif** : composer **un** horaire à partir de **plusieurs sources**,
affiché exactement comme un horaire normal, mis à jour par l'école, avec
les chevauchements signalés. Le cas type qui guide toute la maquette :
**3 cours de BA1, le reste de BA2** (cours carrés), plus, si besoin, une
option d'une autre année.

## 2. Périmètre (v1)

Une **source** = une formation d'une école + ses groupes, avec un
**rôle** : *année principale* (on garde tout et on décoche les cours qu'on
ne suit pas) ou *année d'ajout* (on ne coche que les cours qu'on ajoute).
C'est l'unité que l'app sait déjà charger : `api/horaires`, ou `api/ical`
pour un lien personnel.

- 1 à 6 sources (une seule si elle a des cours retirés, voir §5.1), **d'une même école** en v1 (HEH, UMONS, Condorcet, ULB ;
  UCLouvain quand elle sera publiée, voir §2.1). À la HEH, l'UMONS,
  Condorcet et l'ULB, toutes les formations d'une école partent du même
  lundi et partagent les mêmes fériés. **Ce n'est pas vrai** pour
  l'UCLouvain ni pour un lien iCal : leur `premier_lundi` est le lundi de
  la première séance de *cette* source (`api/_ecoles/ucl.py:243`,
  `api/_moteurs/ical.py:312`), il diffère donc d'une source à l'autre et
  l'alignement des semaines (§4.2, règle 3) est obligatoire. Le mélange
  **inter-écoles** (HEH + UMONS) est repoussé en v2 : calendriers de congés
  différents, APIs différentes, PDF différents.
- Chaque source garde ses propres groupes (le même nom de groupe dans deux
  formations ne se mélange plus).
- L'horaire fusionné se met à jour **tout seul** à l'ouverture, comme un
  horaire normal (cache par source, inchangé).
- Les **chevauchements** sont détectés et affichés (bandeau + repère dans
  la semaine), mais ne bloquent pas la validation : un cours carré peut
  légitimement tomber en même temps qu'un cours dont on est dispensé.
- Éditable, synchronisé au compte, disponible hors ligne (si chaque source
  a déjà été ouverte une fois), s'affiche sur téléphone **et** sur
  ordinateur (grille côte à côte).

Hors périmètre v1, à garder en tête comme pistes :

- fusion inter-écoles ;
- cours ajoutés à la main (un cours qui n'existe pas au catalogue) ;
- partage public d'un horaire sur mesure / export image ;
- détection automatique (« on a vu que tu repasses Analyse ») ;
- un PDF unique combiné : les écoles publient un PDF **par formation**,
  impossible d'en fabriquer un officiel commun.

### 2.1 Faisabilité par école (audit du 19/09/2026)

Vérifié sur le code de l'API et sur les vraies réponses des écoles
(`BA1P Informatique` + `BA2P Infographie` à la HEH, `.BAB1 - Droit` +
`.BAB2 - Droit` à l'UMONS, deux blocs Condorcet, `B1-COMM` + `B-COMM:2`
à l'ULB).

| École | Verdict | `premier_lundi` | Groupes | Intitulés (`matiere`) | PDF | Points à respecter |
|---|---|---|---|---|---|---|
| **HEH** | ✅ le cas idéal | 2026-09-14, commun | uniques par formation (« Groupe 1 BA1P Informatique ») | lisibles, mais TP / théorie séparés (« Electricité - TP », « Electricité - théorie ») | oui | liste de cours triée pour que TP et théorie soient voisins |
| **UMONS** | ✅ | 2026-09-07, commun | noms courts qui **se répètent** d'une formation à l'autre (« Dr. rom - Gr 1 ») | code + intitulé (« D-SCJU-200 - Obligations - partie 2 ») ; beaucoup d'**événements communs** aux deux années (« 4h cuistax », « Conférence/débat », « D-CPFA-133 - Stratégie de la réussite ») | oui | filtre des groupes **par source** obligatoire ; dédoublonnage obligatoire ; stocker l'intitulé brut (avec code) |
| **Condorcet** | ✅ | 2026-09-14, commun | courts (« BRA », « ViniViti ») : collisions probables | lisibles | oui | 524 ressources, dont des **formations sans aucun cours** (« B1-Activités d'aide à la réussite… ») : une telle source doit être refusée |
| **ULB** | ✅ avec adaptation | 2026-09-14, fixé par l'app (`ulb.py`) | génériques (« Groupe 1 », « Groupe 2 ») : **collisions certaines** entre niveaux | **codes UE**, pas des titres (« COMMB120 ») ; une séance mutualisée porte plusieurs codes (« COMMB115, COMMB230, COMMB320… ») | oui (TimeEdit) | filtrer par **code UE**, pas par intitulé (§4.2) ; une source `PAR:` est déjà une sélection de cours |
| **UCLouvain** | ⏳ techniquement faisable, mais pas publiée (`EZH_UCL`) | **variable par source** (lundi de la 1re séance) | codes d'activité | titres | **non** | alignement des semaines obligatoire ; repli sur l'année précédente (`ucl.py:226`) ⇒ une source peut arriver avec 52 semaines d'écart : à écarter |
| **Lien iCal** (ULB / UCL) | ✅ | **variable par source** | ceux du lien | ceux du lien | non | même `formation` pour tous les liens (`"Mon horaire (lien d'abonnement)"`) : l'identité d'une source est `(formation, ical)` |
| **Inter-écoles** (v2) | ⚠️ | HEH 14/09 ≠ UMONS 07/09 : écart d'une semaine entière, alignable | — | — | — | les **fériés** ne se fusionnent pas (un congé HEH n'est pas un congé UMONS) : il faudrait des fériés par source. Reste en v2. |

Conclusion : **HEH, UMONS, Condorcet et ULB sont faisables en v1**, à
condition d'appliquer les corrections de ce plan (filtre par source,
dédoublonnage, codes UE à l'ULB, référence de semaines = le lundi le plus
tôt). L'UCLouvain suit dès sa publication, sans code en plus grâce à
l'alignement.

## 3. Parcours et écrans

Le parcours s'ajoute à la création existante sans la changer : mêmes
écrans école → formation → groupes, détournés en « mode source ».

### 3.1 Entrée — Réglages

![Réglages, la carte « Sur mesure » dans Mes horaires](./01-reglages.png)

- La carte de l'horaire sur mesure porte un **tag « Sur mesure »** et, en
  dessous, « 3 sources · BA1, BA2 et option » au lieu du nom de groupe
  (`texteGroupe()`, `index.html:6069`).
- L'entrée reste l'unique bouton **« Ajouter un horaire »**
  (`#btn-ajouter`), qui ouvre l'écran des écoles puis des formations.

### 3.2 Formation — la porte d'entrée

![Écran formation, carte « Composer un horaire sur mesure » en tête](./02-formation.png)

- Une **carte en tête de liste**, teintée à la couleur de l'accent, avec
  l'icône baguette, le titre « Composer un horaire sur mesure », le
  sous-titre « Des cours de plusieurs années ou options, réunis » et un
  badge **Nouveau**.
- Pourquoi ici : l'étudiant qui a un cas « entre deux années » est déjà en
  train de chercher sa formation ; c'est le moment où il faut le lui
  proposer. Les autres ne la touchent jamais et gardent le parcours actuel.
- Elle fonctionne aussi pour les écoles à recherche (ULB/UCLouvain), en
  tête de la liste de résultats.
- Aucun autre écran du parcours normal n'est modifié.

### 3.3 Composeur vide

![Composeur vide, avec le rappel des 3 étapes](./03-composeur-vide.png)

Nouvelle vue `v-perso` (même langage que `v-groupes`) :

- titre **« Ton horaire sur mesure »**, aide d'une phrase ;
- cadre gravé **`vide-src`** : « Aucune source pour l'instant » + icône
  calques ;
- bouton principal **« Ajouter une année, une option, des cours »**
  (`+`) ;
- bloc **« Comment ça marche »** en 3 étapes numérotées (rassure : les
  sources restent à jour, c'est nous qui fusionnons).

### 3.4 Ajouter une source

![Ajout d'une source : liste des formations de la même école](./04-ajouter-annee.png)

- Réemploi **exact** de l'écran de formation (`ouvrirFormations()`,
  `index.html:4612`) : même recherche, mêmes rubriques, mêmes listes
  serveur (`api/formations`, `api/recherche`).
- En haut, un rappel **`src-rappel`** : pastille numérotée, nom de la
  source déjà présente, badge « 1 source ». La formation déjà ajoutée est
  marquée **« Déjà ajouté »** et désactivée. L'identité d'une source est
  le couple `(formation, ical)`, pas `formation` seul : tous les liens
  iCal portent la même `formation` (`LIEN_FORMATION`, `index.html:4656`),
  et deux liens différents sont deux sources légitimes.
- Une formation **sans aucun cours publié** (fréquent chez Condorcet,
  qui liste des ressources vides) est refusée à l'ouverture : « Cette
  formation n'a encore aucun cours publié » et retour à la liste, au lieu
  d'un écran de cours vide dont on ne peut pas sortir.
- L'école est fixée par la 1re source ; l'écran ne propose que cette
  école en v1 (l'en-tête le rappelle).

### 3.5 Année principale (on décoche) ou année d'ajout (on coche)

C'est le cœur du cas « 3 cours de BA1, le reste de BA2 ». Chaque source a
un **rôle**, choisi avec le rail `.seg` de l'app, qui décide de ce qui est
coché au départ :

![Année principale : tout est coché, on décoche](./05-source-principal.png)

- **Année principale** (défaut de la 1re source) : tous les cours de
  l'année sont cochés, on **décoche** ceux qu'on ne suit pas (« Projet »,
  ici). Le compteur dit « 5 cours gardés sur 6 · 1 retiré » et le bouton
  « Garder ces 5 cours ». Zéro coché ⇒ bouton désactivé
  (« Garde au moins un cours »).
- Une année principale avec tout coché = l'année entière, exactement comme
  un horaire normal ; aucune case à toucher si on suit tout.
- Le rôle « principale » est mémorisé comme une **liste de retraits**
  (`source.sans`), pas comme une liste de cours gardés : si l'école ajoute
  un cours en cours d'année, il apparaît tout seul.

![Année d'ajout : rien n'est coché, on coche](./06-source-ajout.png)

- **Cours à ajouter** (défaut des sources suivantes : la 2e année, une
  option) : rien n'est coché, on **coche** seulement les cours ajoutés
  (« Analyse », « Mathématiques discrètes », « Systèmes »). Compteur
  « 3 cours cochés sur 6 », bouton « Ajouter ces 3 cours ». Zéro coché ⇒
  désactivé.
- Le rôle « ajout » est une **liste de cours choisis** (`source.avec`) :
  plus courte à stocker, et sans surprise si l'école ajoute un cours qu'on
  n'a pas demandé.
- « Tout cocher / Tout décocher » au-dessus de la liste pour basculer d'un
  coup (et changer de rôle remet les cases au défaut du rôle).
- Si la formation n'a pas de groupes, on va directement au composeur.
- Une matière cochée qui disparaît (intitulé changé par l'école) est
  signalée dans le composeur, avec « Rechoisir les cours ».
- **Ce qu'on coche = un cours, pas une ligne d'horaire.** La liste est
  construite à partir des *clés de cours* de la source (voir §4.2,
  règle 2) : l'intitulé exact de l'école à la HEH, l'UMONS, Condorcet et
  l'UCLouvain ; le **code UE** à l'ULB, où `matiere` est une liste de
  codes et où une séance mutualisée en porte plusieurs (« COMMB115,
  COMMB230, COMMB320… » ne doit pas apparaître comme un cours à part).
  Affichage : `nettoyerMatiere()`, code en petit quand il existe
  (`codeMatiere()`), tri alphabétique pour que « Electricité - TP » et
  « Electricité - théorie » (HEH) soient voisins.
- Pour l'ULB et l'UCLouvain, l'équivalent existe déjà : le sélecteur par
  codes (`rech.cours`, `rechVoirCours()` `index.html:4819`) construit un
  `PAR:CODE1,CODE2`. Une source `PAR:` **saute l'écran des cours** : les
  codes choisis *sont* la sélection. Elle est stockée en rôle `"ajout"`
  **sans** `avec` (toutes les séances de la sélection sont gardées). Un
  programme entier (`SINF11BA`, `B-COMM:2`) est une source normale
  (principale ou ajout).

### 3.6 Groupes de la source

![Groupes, un par cours coché](./07-groupes-source.png)

- Réemploi de l'écran de groupes (`ouvrirGroupes()` `index.html:5197`,
  `listerGroupes()` `index.html:5245`) : sections par cours, options,
  filtre au-delà de 20 groupes, même règle « au moins une sélection
  au-delà de 8 groupes » (`groupeObligatoire()`, `index.html:5464`).
- **Seuls les cours cochés** apparaissent : ici Analyse, Mathématiques
  discrètes et Systèmes, chacun avec son groupe. C'est exactement la
  réalité des écoles Hyperplanning (HEH, UMONS, Condorcet), où les
  groupes sont par cours.
- Concrètement, `sectionsGroupes()`, `majAvisGroupes()` et
  `groupeObligatoire()` lisent tous `choix.data` : en mode source, on
  leur passe une **copie filtrée** (`cours` réduits aux cours gardés,
  `groupes` = les groupes qui apparaissent encore dans ces cours). Sans
  ça, l'écran propose les groupes des cours décochés, et la règle « plus
  de 8 groupes ⇒ au moins un choix » bloque une année d'ajout à 1 cours
  sous prétexte que l'année entière a 50 groupes (cas `.BAB1 - Droit` à
  l'UMONS).
- Si les cours gardés n'ont **aucun groupe**, l'écran est sauté (retour
  direct au composeur).
- Le rappel de source est répété en haut (pastille 2, nom, badge
  « Source 2 ») pour ne jamais perdre de vue quelle année on règle.
- Bouton final : **« Ajouter cette année à mon horaire »** (au lieu de
  « Voir mon horaire ») → retour au composeur.

### 3.7 Composeur — sources et chevauchements

![Composeur : BA2 entière + BA1 en 3 cours, et l'alerte de chevauchement](./09-composeur-3-cours.png)

- Une **carte par source** (`srccard`) : pastille numérotée colorée, nom
  de la source, badge **Principale** sur l'année principale, détail
  (`Groupe B · 5 cours sur 6`, `Groupe A · 3 cours ajoutés`,
  `option annuelle`…), les cours retirés en pastilles barrées
  (`− Projet`) et les cours ajoutés en pastilles (`+ Analyse`), crayon
  (cours et groupes) et corbeille (retirer).
- Sous les sources, le bouton **« Ajouter une année, une option, des
  cours »**.
- **Alerte de chevauchement** (`choc`, ambre) : titre « Mardi 10h45 :
  deux cours se chevauchent », phrase qui nomme les deux cours et leur
  source, et rappelle qu'on peut garder les deux ou changer de groupe.
- Bloc **Nom de cet horaire** (`#bloc-surnom`, caché si c'est le premier
  horaire, comme aujourd'hui) et **thème** (`htmlChoixThemes`,
  `index.html:6166`).
- Bouton principal **« Voir mon horaire »**.

![Composeur avec une source de plus (option), aucun conflit](./10-composeur-3-sources.png)

- Quand tout est clair : bandeau vert « Aucun cours en double ».
- Le compteur « 3 sources ajoutées » suit le nombre réel.
- Le composeur d'une source seule (première année posée) :

![Composeur à une source](./08-composeur-1-source.png)

### 3.8 L'horaire fusionné

![La semaine fusionnée, bandeau de chevauchement et pastilles de source](./11-horaire-fusionne.png)

- **Exactement la même semaine** qu'un horaire normal : `rendre()`,
  `jours`, `cal`, couleurs par intitulé (`preparerCouleurs()`,
  `index.html:5883`).
- Sous la navigation de semaine, la **ligne des sources** : une pastille
  de couleur par source, son nom (« BA1 Informatique · 3 cours »), et le
  lien **Modifier**.
- Bandeau de chevauchement en haut, avec **« Voir mardi »** qui ouvre le
  jour concerné.
- En multi-horaires, la barre `seg` du haut reprend le surnom (« Info
  2026 ») comme aujourd'hui.

![Mardi ouvert : les cours des deux sources, repère « Chevauche »](./12-horaire-mardi.png)

- Dans le déroulé d'un jour, chaque cours d'un horaire sur mesure gagne
  une ligne **« Source : BA1 Informatique · 3 cours choisis »** dans son
  détail (là où un horaire normal affiche le groupe) : on sait toujours
  d'où vient la séance.
- Les deux cours en conflit portent un repère **Chevauche** ambre (sur
  ordinateur, ils sont côte à côte dans la grille, comme deux cours d'un
  même groupe le font déjà via `couloirs()` `index.html:5906`).

![Vue ordinateur : le composeur à gauche, la semaine fusionnée à droite](./15-bureau.png)

- Sur ordinateur (≥ 1024 px), le composeur peut vivre **à côté** de
  l'aperçu : on voit la semaine se remplir à chaque source ajoutée. Les
  cours en conflit sont cernés d'ambre dans la grille.

### 3.9 PDF officiel

![PDF officiel : le sélecteur de source](./13-pdf-par-source.png)

- Un horaire sur mesure n'a pas de PDF unique : le bouton devient
  **« PDF officiel »** avec un **sélecteur de source** (comme le
  sélecteur de groupe actuel, `majChoixPdf()` `index.html:5689`).
- Une école sans PDF (UCLouvain) ou une source « lien iCal » :
  l'entrée correspondante est absente du sélecteur ; si aucune source n'a
  de PDF, le bouton est masqué (`majBoutonPdf()` `index.html:3772`).
- `api/pdf` reçoit `(ecole, formation, groupe, semaine)` **de la
  source** : la semaine demandée est `sem − delta` de la source (§4.2,
  règle 3 ; `delta` = 0 à la HEH, l'UMONS, Condorcet et l'ULB, mais pas
  pour une source alignée). Une semaine hors de la période de la source
  n'est pas proposée pour cette source.
- Le groupe envoyé est celui **de la source** : une source à un seul
  groupe l'envoie d'office ; à plusieurs groupes, le sélecteur de groupe
  actuel apparaît sous le sélecteur de source (`groupePdf()`
  `index.html:5684` lit `profil.groupes`, vide pour un perso : à
  adapter, sinon le PDF part toujours en « toute la formation »).
- Une année d'**ajout** a un PDF de l'année **entière** (l'école ne sait
  pas faire « 3 cours ») : l'entrée le dit (« BA1 Informatique — année
  entière »).

### 3.10 Modifier

![Fenêtre Modifier d'un horaire sur mesure](./14-modifier.png)

- `⋮ → Modifier` (`modifierProfil()` `index.html:6254`) : un horaire sur
  mesure ouvre le **composeur en édition** plutôt que la fenêtre simple,
  avec les mêmes cartes de source (crayon = groupes, corbeille = retirer,
  bouton = ajouter), plus le nom et le thème.
- Supprimer une source retire ses cours de la semaine ; le nom et la
  couleur restent. Supprimer l'horaire entier reste inchangé
  (`supprimerProfil()` `index.html:6316`).
- Le crayon d'une source rouvre l'écran de groupes **de cette source**
  (`changerGroupe()` `index.html:6976` adapté).

## 4. Le moteur de fusion (le cœur technique)

### 4.1 Chargement

Chaque source est déjà récupérable et **mise en cache par formation** :

```
cleHoraire(ecole, formation, ical)   // index.html:2833
chargerHoraire(ecole, formation, ical) // index.html:4145
```

Nouveau : `chargerPerso(p)` fait un `chargerHoraire` par source, puis
`fusionner()`. Rien ne change côté serveur : aucune nouvelle route, aucun
paramètre. Le cache partagé (15 min, `api/horaires.py:28`) absorbe
l'usage ; le cache local (une clé par source, partagée avec les horaires
normaux de la même formation) permet d'afficher tout de suite, puis
`actualiser()` redemande chaque source à l'ouverture, comme aujourd'hui.

Précisions issues de l'audit :

- **Concurrence bornée à 3** : une formation Hyperplanning froide coûte
  ~30 appels et jusqu'à 3 sessions école (`SESSIONS_PARALLELES`), et
  `api/horaires` est limité à 12 appels / min / IP (`_DEBIT_MAX`,
  `api/_ecoles/__init__.py`) — une IP partagée de campus y arrive vite.
  6 sources lancées d'un coup, plus un rechargement, suffisent à recevoir
  un 429. On lance donc les sources par lots de 3.
- **Échec partiel** : `Promise.allSettled`-like (pas `Promise.all`) — une
  source en échec prend sa dernière version en cache ; sans cache, elle
  est absente et signalée (§7). Jamais d'écran d'erreur si au moins une
  source est là.
- **`actualiser()` / `empreinte()`** : la garde « réponse plus ancienne
  ignorée » (`data.meta.ts < DATA.meta.ts`) compare `DATA.formation`,
  qui vaut `""` pour tous les persos : elle doit comparer l'**id du
  profil** et le `ts` le plus récent, sinon deux persos qui se croisent
  pendant un changement d'horaire se marchent dessus.
- **Place** : chaque source est une entrée `localStorage` (une grosse
  formation UMONS pèse plusieurs centaines de ko). `ecrire()` avale
  l'erreur de quota en silence : à 6 sources, vérifier après écriture et,
  si ça échoue, le dire (« hors ligne indisponible pour cet horaire »)
  plutôt que promettre un hors ligne qui n'existe pas.

### 4.2 Règles, dans l'ordre

Chaque source est d'abord filtrée **chez elle** (règles 1 et 2), puis
alignée (3), et seulement ensuite mélangée aux autres (4 à 6).

1. **Cours de la source** : selon le rôle, appliqué **avant** le filtre
   des groupes, y compris aux séances sans groupe (« toute la
   formation ») qui seraient gardées sinon.
   - *Clé de cours* d'une séance, `clesCours(c)` :
     - ULB (et toute `matiere` dont chaque morceau séparé par des
       virgules est un code UE, `/^[A-Z]{2,6}[0-9]{3,4}[A-Z]?$/` comme
       `RX_UE` de `api/_moteurs/timeedit.py`) : la **liste des codes** ;
     - sinon : `[c.matiere]`, l'**intitulé exact** de l'école, code
       compris (« D-SCJU-200 - Obligations - partie 2 »). Pas
       `nettoyerMatiere()` : deux cours distincts peuvent avoir le même
       intitulé nettoyé (« Anglais » de deux sections UMONS), et c'est
       l'intitulé exact qui est stocké (§5.1).
   - année principale : garder la séance si **au moins une** de ses clés
     n'est pas dans `source.sans` (une séance mutualisée reste tant qu'un
     de ses cours est suivi) ;
   - année d'ajout : garder la séance si **au moins une** de ses clés est
     dans `source.avec` ;
   - source `PAR:` sans `avec` : tout est gardé.
2. **Groupes de la source** : le filtre actuel, appliqué source par
   source (`sel = source.groupes` ; `!sel.length || !c.groupes.length ||
   c.groupes.some(g => groupeDans(sel, g))`, `index.html:5675`). C'est ce
   qui règle la collision des noms de groupes entre formations (« Groupe
   1 » à l'ULB, « Dr. rom - Gr 1 » à l'UMONS, « BRA » chez Condorcet) :
   chaque source filtre chez elle, et la réparation des groupes
   (préfixés / courts) faite par `installer()` (`index.html:5665`) est
   faite **par source**, contre les groupes de cette source.
3. **Alignement des semaines** :
   - **référence = le `premier_lundi` le plus tôt** de toutes les
     sources (pas celui de la première source) : ainsi `delta` est
     toujours ≥ 0 et aucune séance ne tombe en semaine 0 ou négative (sinon
     une source UCLouvain qui commence une semaine avant la principale
     perdrait sa première semaine) ;
   - `delta = (lundi_source − lundi_ref) / 7` ; les numéros de semaine de
     la source sont augmentés de `delta` ;
   - fériés : les numéros de jour (`FERIES`, indexés depuis le premier
     lundi, `numJour()` `index.html:3584`) sont augmentés de `7 × delta`,
     **et les clés de `feries_noms` aussi** (ULB, iCal : ce sont des
     chaînes, `"56"` → `"63"`) ;
   - une source dont l'écart dépasse **26 semaines** est écartée avec un
     avis (« L'horaire de X n'est pas celui de cette année ») : c'est le
     repli UCLouvain sur l'année précédente (`ucl.py:226`), 52 semaines
     d'écart, qui sinon ajouterait une deuxième année vide à naviguer ;
   - un lundi qui n'est pas un lundi (écart non entier) ne peut pas
     arriver avec les moteurs actuels (tous calculent un lundi) ; garde-fou :
     source écartée avec le même avis.
4. **Dédoublonnage** : une séance identique donnée par deux sources
   (cours mutualisé, et surtout les **événements communs** de l'UMONS :
   « 4h cuistax », « Conférence/débat », « Stratégie de la réussite »
   sont dans BAB1 et BAB2) devient une seule séance, semaines fusionnées.
   Clé : `(matiere, jour, debut, fin, salles, profs, type)` après
   alignement — le `type` en plus, comme dans le regroupement
   d'Hyperplanning (`api/_moteurs/hyperplanning.py:574`), pour ne pas
   fusionner un TP et une théorie donnés au même endroit. Seulement
   **entre sources** : à l'intérieur d'une source, rien ne change par
   rapport à un horaire normal. La source affichée est la première (la
   principale). Les groupes des deux séances sont réunis.
5. **Métadonnées** : `premier_lundi` = la référence (règle 3) ;
   `periode` = union des semaines alignées ; `feries` = union alignée ;
   `feries_noms` = union alignée ; `ts` = le plus récent ;
   `fetched_at` = celui du plus récent ; `source` = « N sources ».
   `formation` = `""`, `groupes` = `[]` (le champ doit exister :
   `valide()` `index.html:2837` le demande).
6. **Couleurs** : `preparerCouleurs()` sur tous les intitulés fusionnés,
   triés — deux intitulés différents n'ont jamais la même couleur, et un
   même cours garde la même couleur d'une source à l'autre. (Effet de
   bord assumé : ajouter une source peut redistribuer des couleurs, comme
   quand on change de formation.)

### 4.3 Chevauchements

```
pour chaque semaine publiée, pour chaque jour :
  séances actives, triées par début
  A et B se chevauchent si  debutA < finB  et  debutB < finA
  (fin == début suivant → simple enchaînement, pas un chevauchement)
  et seulement si A et B viennent de SOURCES DIFFÉRENTES
```

- **Entre sources uniquement.** À l'intérieur d'une même source, les
  superpositions sont normales et existent déjà dans les horaires
  normaux (deux groupes choisis, séances « toute la formation »,
  événements UMONS de 8h à 22h) : les signaler noierait le vrai conflit
  (un cours carré de BA1 contre un cours de BA2) dans des dizaines de
  fausses alertes.
- Une séance dédoublonnée (règle 4) n'est pas un chevauchement.
- Au **composeur** : dès qu'une source est ajoutée (son horaire est déjà
  téléchargé par l'écran des groupes), on calcule sur **toute l'année**
  et on affiche le premier conflit + « et N autres ». Pas de blocage.
- Dans l'**horaire** : bandeau « N chevauchement(s) cette semaine » +
  bouton vers le jour + repère « Chevauche » dans le jour.
- Sur **ordinateur** : côte à côte (le mécanisme `couloirs()` existe déjà
  pour les cours d'un même groupe) + contour ambre.

### 4.4 Affichage

`DATA` garde **le même format** qu'aujourd'hui
(`{meta, formation, groupes, cours}`), avec deux champs en plus :
`sourcesData` (les réponses brutes, pour l'édition et le PDF) et
`perso: true`. Chaque séance de `DATA.cours` porte en plus `src` (index
de la source) et `delta` n'est pas nécessaire côté séance (les semaines
sont déjà alignées). Conséquence : `rendre()`, `coursDe()`,
`detailJour()`, `rendreCal()`, `rendreInfos()` ne changent qu'à la
marge. `COURS` est la liste fusionnée filtrée.

Pour un perso, `profil.groupes` vaut `[]` : tout le code existant qui le
lit (`installer()`, `detailJour()`, `groupePdf()`, `majChoixPdf()`,
`afficherHoraire()`, l'avis « groupes perdus » de `rendre()`) se comporte
alors comme « pas de groupe choisi ». Chacun de ces endroits a une
branche `estPerso(profil)` qui lit les groupes **de la source** à la
place ; `installer()` ne refiltre pas (`DATA.cours` est déjà filtré).

## 5. Modèle de données

### 5.1 Profil

Aujourd'hui (`ezh_profils`, table `public.profils`) :

```json
{ "id": "p…", "surnom": "Droit", "ecole": "heh",
  "formation": "BAB1 - Droit", "groupes": ["Groupe A"], "theme": 2 }
```

Proposition — un champ `sources` optionnel, **rien d'autre ne bouge** :

```json
{ "id": "p…", "surnom": "Info 2026", "theme": 2, "ecole": "heh",
  "formation": "", "groupes": [],
  "sources": [
    { "ecole": "heh", "formation": "BA2 Informatique", "role": "principale",
      "groupes": ["Groupe B"], "ical": "", "surnom": "", "sans": ["Projet"] },
    { "ecole": "heh", "formation": "BA1 Informatique", "role": "ajout",
      "groupes": ["Groupe A"], "ical": "", "surnom": "Cours carrés",
      "avec": ["Analyse", "Mathématiques discrètes", "Systèmes"] }
  ] }
```

- `sources` absent ou vide ⇒ horaire normal, tout le code actuel
  fonctionne tel quel (c'est la garantie de non-régression).
- `surnom` par source : optionnel, défaut = `joliFormation(formation)`.
- `role` : `"principale"` (défaut de la 1re source) ou `"ajout"` (défaut
  des suivantes), modifiable sur l'écran des cours. Au plus une source
  principale : passer une autre source en principale rétrograde
  l'ancienne en `"ajout"` (ses cours gardés deviennent son `avec`).
- `sans` : cours **retirés** de l'année principale (liste vide = toute
  l'année, donc les nouveaux cours de l'école arrivent seuls).
- `avec` : cours **ajoutés** d'une année d'ajout (au moins un), sauf
  pour une source `PAR:` (ULB / UCLouvain), où `avec` est absent : la
  sélection de codes fait déjà ce travail (§3.5).
- `sans` et `avec` contiennent des **clés de cours** (§4.2, règle 1) :
  l'intitulé exact de l'école, code compris, ou le code UE à l'ULB.
  Pas un index, pas l'intitulé nettoyé : le jour où l'école renomme un
  cours, on peut le dire et le réparer, et deux cours au même intitulé
  nettoyé restent distincts.
- Rétrograder une principale en ajout : `avec` = ses clés de cours
  **moins** `sans`, calculées sur les données en cache de la source
  (sinon, sur les données téléchargées à l'ouverture de l'écran des
  cours). Promouvoir un ajout en principale : `sans` = toutes les clés
  **moins** `avec`.
- `sources.length` entre **1** et 6. Une source seule reste un horaire
  sur mesure si elle a des retraits (« toute ma BA2 sauf Projet » est un
  vrai besoin) ; une source seule, principale, sans retrait, est
  enregistrée comme un **horaire normal** (`sources` vidé, `formation` et
  `groupes` remplis) : aucune raison de payer la fusion pour rien.
- `ecole` reste rempli (école unique en v1) : tris, PDF, stats et tri de
  la liste des horaires continuent de fonctionner.

### 5.2 Compatibilité

- **Nouveau client / nouvelle base** : `pullProfils()`
  (`index.html:3306`) lit une liste de colonnes explicite et reconstruit
  chaque profil champ par champ (`distant = { id, surnom, ecole, … }`,
  `index.html:3325`) : il faut ajouter `sources` **aux deux endroits**
  (colonnes lues et objet `distant`, passé par `sourcesValides()`), et
  à `pushProfils()` (`index.html:3360`). Oublier l'objet `distant` efface
  le perso au premier pull, car l'`upsert` a rafraîchi `updated_at` et la
  ligne distante gagne toujours contre la locale.
- **Nouveau client / ancienne base (colonne `sources` absente)** :
  - `pullProfils()` : repli sans `sources` (même motif que `ical`,
    `index.html:3313`, mais les deux replis doivent se cumuler : une
    base peut n'avoir ni `ical` ni `sources`) ;
  - `pushProfils()` : les persos sont **retirés** des lignes envoyées,
    pas envoyés sans `sources`. Sinon la ligne arrive en base avec
    `formation = ""` et sans sources, son `updated_at` récent la fait
    gagner au pull suivant, `profilValide` la rejette… et le perso
    **disparaît aussi de l'appareil** qui l'a créé ;
  - garde-fou au pull : une ligne distante sans `sources` ni
    `formation` ne remplace jamais un perso local ;
  - le perso reste local à l'appareil ; on l'annonce une fois dans les
    Réglages (« cet horaire reste sur cet appareil : relance le
    `schema.sql` »). Décision à confirmer, voir §9.
- **Ancien client / profil perso en base** : la ligne n'est ni supprimée
  (la suppression distante est explicite, `supprimerProfilDistant()`,
  `index.html:3393`) ni écrasée (l'`upsert` d'un ancien client n'envoie
  pas `sources`, la colonne garde sa valeur). Au pire, l'ancien client ne
  voit pas l'horaire (il le filtre via `profilValide`). `formation` reste
  **vide** pour un perso, exprès : mieux vaut qu'un ancien client ne
  l'affiche pas du tout que d'afficher une année sur deux sans prévenir.

### 5.3 Supabase

```sql
alter table public.profils
  add column if not exists sources jsonb not null default '[]'::jsonb;

-- dans la contrainte profils_bornes :
and jsonb_typeof(sources) = 'array'
and case when jsonb_typeof(sources) = 'array'
         then jsonb_array_length(sources) <= 6 else false end
and octet_length(sources::text) <= 20000
```

- Le `case` n'est pas décoratif : PostgreSQL ne garantit pas l'ordre
  d'évaluation d'un `and`, et `jsonb_array_length()` sur un objet lève
  une erreur au lieu de renvoyer faux.
- L'`alter table … add column` va **avec les autres** (`schema.sql:32`),
  avant le bloc de contrainte : sur une base existante, la contrainte qui
  cite `sources` échouerait sinon et arrêterait tout le fichier (le
  commentaire de `schema.sql:27` le dit déjà pour `ical`).
- Le fichier `supabase/schema.sql` est rejouable, la contrainte est déjà
  recréée à chaque passage (`schema.sql:75`) : l'ajout suit le mouvement.

### 5.4 Effets ailleurs

| Endroit | Changement |
|---|---|
| `tracerVisite()` `index.html:3405` | pour un perso, insérer `formation = "sur mesure"` (lisible dans le dashboard) ; `profil_id` inchangé. |
| `api/stats.py:366` | les profils sans formation tombent dans un seau **« Horaire sur mesure »** au lieu d'une ligne vide. La requête (`api/stats.py:260`) liste ses colonnes : y ajouter `sources` **avec repli** si la colonne manque, sinon le dashboard tombe tant que la base n'est pas migrée. |
| `dashboard.html` | colonne Comptes : afficher « sur mesure (N sources) » quand `sources` est là. |
| `suivi.js` | événements `perso_source_ajoutee`, `perso_chevauchement`, `horaire_perso_cree` ; incrémenter `EZH_VERSION` (`index.html:2609`). |
| `README.md` | une sous-section « Horaires sur mesure » dans *Fonctionnement*. |
| `aide/index.html` | une entrée : « Je repasse une année / j'ai des cours de plusieurs options ». |
| `confidentialite.html` | rien à changer : aucune donnée nouvelle. |

## 6. Implémentation (fichiers et fonctions)

Tout tient dans `index.html` ; l'API ne bouge pas.

1. **Modèle** : `profilValide()` (`2840`) accepte `sources` ;
   `sourcesValides(p)` + `estPerso(p)` ; normalisation au chargement
   (`2893-2926`) ; `surnomDefaut()` pour un perso = « Horaire sur mesure ».
2. **Composeur** : nouvelle vue `v-perso` ; `ouvrirPerso()` /
   `listerSources()` / `ajouterSource()` / `retirerSource()` ;
   l'écran formation et l'écran groupes reçoivent un « contexte source »
   (variable `choix.source` : null = parcours normal, objet = ajout à un
   perso), ce qui évite de dupliquer les écrans existants.
   **Sélection de cours** : `choisirCoursSource()` (rail Année principale /
   Cours à ajouter + liste cochable alimentée par `data.cours` groupés par
   `clesCours()` (§4.2, règle 1), affichés avec `nettoyerMatiere()`,
   compteur et bouton qui disent le nombre), résultat dans
   `choix.source.sans` ou `choix.source.avec` selon le rôle. Sautée pour
   une source `PAR:`. Les écrans de groupes reçoivent une copie filtrée
   de `choix.data` (§3.6).
3. **Fusion** : `chargerPerso(p)`, `fusionner(p, liste)`,
   `alignerSemaines(data, delta)`, `dedoublonner(cours)`,
   `chevauchements(cours)`, et le filtre des cours selon le rôle
   (`sans` / `avec`), appliqué avant le filtre des groupes.
4. **Affichage** : `installer()` (`5654`) accepte le résultat fusionné ;
   `afficherHoraire()` (`5716`) affiche « n sources » ; `detailJour()`
   (`5760`) ajoute la ligne Source ; `rendre()` (`5793`) gère les groupes
   perdus **par source** et le bandeau de chevauchement.
5. **Cycle de vie** : `demarrerHoraire()` (`7418`), `actualiser()`
   (`7327`), `empreinte()` (`7323`) **et `choisirProfil()` (`5579`)**
   traitent les persos : tous les quatre lisent aujourd'hui
   `cleHoraire(profil.ecole, profil.formation, profil.ical)` ou appellent
   `chargerHoraire()` sur le profil, ce qui pour un perso vise une
   formation vide. Une seule fonction `memoProfil(p)` (cache fusionné à
   partir des caches des sources) et `chargerProfil(p)` (`chargerHoraire`
   ou `chargerPerso`) remplacent ces appels. Cache partiel hors ligne :
   on affiche ce qui est là, la source manquante est signalée.
   Le bouton « Valider » de l'écran des groupes (`index.html:5512`)
   écrit directement un profil normal : en mode source, il doit rendre
   la main au composeur et ne rien enregistrer.
6. **Édition** : `modifierProfil()` (`6254`) ouvre le composeur ;
   `changerGroupe()` (`6976`) adapté ; `rendreListeProfils()` (`6086`)
   avec tag ; `texteGroupe()` (`6069`) = « n sources ».
7. **PDF** : `majBoutonPdf()` (`3772`) + `majChoixPdf()` (`5689`) avec
   sources ; `cleHauteurPdf()` (`6529`) par source pour mémoriser la
   hauteur du lecteur.
8. **Brouillon** : `sauverBrouillon()` (`4198`) /
   `reprendreBrouillon()` (`4228`) gardent `sources` et la source en
   cours, pour survivre à un rechargement au milieu d'un ajout.
9. **Option de testabilité** : sortir les fonctions pures de fusion dans
   `fusion.js` (chargé avant le script principal), testable avec un petit
   `node --test test_fusion.mjs`. À trancher (voir §9) : ça ajoute un
   fichier et un test Node dans un dépôt où les tests sont Python
   (`test_render_v2.py`, `test_geometry_math.py`).

## 7. Cas limites et messages

| Cas | Comportement prévu |
|---|---|
| Deux sources décrivent la même séance | Dédoublonnée ; semaines fusionnées ; source = la 1re. |
| Semaines non alignées (lundi différent non entier) | Source écartée de la fusion + avis explicite. |
| Une source ne répond plus chez l'école | Les autres s'affichent ; bandeau « L'horaire de BA1 n'a pas pu être mis à jour » + bouton Réessayer. Le cache local sert de filet. |
| Hors ligne, aucune source en cache | Message actuel d'échec de chargement (`horaire-status`). |
| Groupe disparu chez une source | Avis « Certains groupes de BA1 n'apparaissent plus » + « Rechoisir » qui ouvre cette source. |
| Matière cochée disparue (cours renommé) | Avis « Le cours “Analyse” n'apparaît plus dans BA1 » + « Rechoisir les cours » ; la matière est gardée pour ne pas perdre le choix si c'est un hoquet de l'école. |
| Nouveau cours chez l'école | Une année **principale** le prend automatiquement (elle ne stocke que les retraits) ; une année d'**ajout** l'ignore, c'est voulu. |
| Source déjà ajoutée | Impossible à re-choisir (« Déjà ajouté »). |
| Plus de 6 sources | Le bouton Ajouter est désactivé avec « Maximum atteint ». |
| Chevauchements | Signalés, jamais bloquants ; uniquement entre sources différentes. |
| Formation sans aucun cours (Condorcet) | Refusée comme source : « Cette formation n'a encore aucun cours publié ». |
| Source d'une autre année (repli UCLouvain, lien iCal ancien) | Écart > 26 semaines : écartée + « L'horaire de X n'est pas celui de cette année ». |
| Source qui commence avant la principale (UCL, iCal) | Aucune perte : la référence est le lundi le plus tôt. |
| Séance mutualisée ULB (« A, B, C ») | Gardée si un de ses codes est suivi, retirée seulement si tous sont retirés. |
| Même nom de groupe dans deux sources (« Groupe 1 » ULB, « Dr. rom - Gr 1 » UMONS) | Sans effet : chaque source filtre ses propres groupes. |
| Base Supabase non migrée | Le perso n'est pas poussé (jamais une ligne sans `sources`) et reste sur l'appareil ; avis unique dans les Réglages. |
| Quota `localStorage` plein | Le perso s'affiche en ligne ; avis « hors ligne indisponible pour cet horaire ». |
| Trop d'appels (429) | Sources chargées par lots de 3 ; une source en 429 garde son cache et réessaie à la prochaine ouverture. |
| Source iCal (ULB/UCL) | Acceptée ; PDF masqué pour elle ; alignement des semaines possible. |
| Suppression de l'horaire | Inchangée (confirmation + suppression locale et cloud). |
| Ancien client qui reçoit un perso | Il ne l'affiche pas (voir §5.2) ; aucune perte de données. |

## 8. Découpage proposé

| Lot | Contenu | Estimation |
|---|---|---|
| 0 | Maquettes + plan (ce dossier) | fait |
| 1 | Modèle `sources`, `profilValide`, brouillon, schéma Supabase, repli base non migrée | 0,5–1 j |
| 2 | Composeur (vue, cartes, ajout/retrait, sélection de cours, réemploi formation + groupes en contexte source) | 1,5–2 j |
| 3 | Fusion (matières, alignement, dédoublonnage, `DATA`, affichage semaine, lignes de source) | 1–1,5 j |
| 4 | Chevauchements (calcul, bandeau, repères, grille bureau) | 0,5 j |
| 5 | Édition, PDF par source, carte Réglages | 0,5–1 j |
| 6 | Finitions : stats, suivi, aide, README, messages d'erreur, recette multi-écoles | 0,5–1 j |

Recette minimale avant de publier (chaque école HEH / UMONS / Condorcet /
ULB ; UCLouvain avec `EZH_UCL=1` en local, puisqu'elle n'est pas publiée) :
2 sources sans conflit, 2 sources avec conflit, une source en année
entière, une source en 3 cours, un groupe perdu, une matière renommée,
une source en panne, hors ligne, PDF, édition, suppression, et un horaire
normal **inchangé**. En plus, issus de l'audit : `.BAB1 - Droit` +
`.BAB2 - Droit` (UMONS : groupes homonymes + événements communs),
`B1-COMM` + `B-COMM:2` (ULB : « Groupe 1 » des deux côtés + séances
mutualisées), une formation Condorcet vide, une source `PAR:`, deux
liens iCal, et un perso synchronisé sur une base **non migrée** (il ne
doit ni disparaître ni apparaître vide sur un autre appareil).

## 9. Questions ouvertes

1. **Une école à la fois en v1** — d'accord, ou il faut tout de suite
   HEH + UMONS ? (L'audit montre que les semaines s'alignent — HEH et
   UMONS ont une semaine d'écart pile — mais les fériés, eux, doivent
   devenir **par source** : un congé HEH n'est pas un congé UMONS. Le
   lot 3 double.)
2. **Base non migrée** : profil sur mesure **local seulement** en
   attendant `schema.sql` (proposé), ou blocage de la création avec un
   message ?
3. **Nom affiché** : « sur mesure » (proposé, court), « personnalisé »,
   « assemblage » ? Il apparaît dans la carte, le tag et l'aide.
4. **Sélection de cours** : rail « Année principale / Cours à ajouter »
   au-dessus de la liste (proposé) — le rôle par défaut suit l'ordre des
   sources (1re = principale, suivantes = ajout). D'accord, ou il faut un
   écran dédié « Comment veux-tu suivre cette année ? », plus visible mais
   un clic de plus ?
   Et : cocher des **matières** (proposé, lisible) ou des **codes de
   cours** quand l'école en publie (HEH/UMONS en ont dans `matiere`) ?
5. **Fonctions pures dans `fusion.js` + test Node** (proposé), ou tout
   dans `index.html` et recette manuelle ?
6. **Couleur de la pastille de source** : trois teintes fixes (bleu,
   vert, rose — proposé, cohérentes avec les thèmes), ou dérivées de
   `premier_lundi`/de l'ordre ?
7. **Le bandeau de chevauchement** doit-il rester visible en permanence
   dans la semaine, ou seulement dans le déroulé du jour concerné ?
8. **Cours libres** (ajouter un cours qui n'est pas au catalogue) : v2,
   ou il faut déjà prévoir le modèle ?
9. **Un lien iCal perso comme source** : on l'autorise dès la v1 ou on
   le cache pour ne pas compliquer le composeur ? Coût réel (audit) :
   l'alignement des semaines est de toute façon nécessaire pour
   l'UCLouvain, et l'identité `(formation, ical)` est une ligne ; le coût
   reste faible.
10. **Le sélecteur de matière doit-il proposer « Tout cocher »** pour une
    année entière « presque » complète (ex. tout sauf un cours) ?

---

### Fichiers de ce dossier

- `maquette.html` — prototype **cliquable** (téléphone) : Réglages →
  Ajouter un horaire → formation → carte sur mesure → ajout d'une année →
  année principale ou cours à ajouter → groupes → composeur →
  semaine.
  Navigation aussi par ancre : `#reglages`, `#formation`, `#composer0`,
  `#composer`, `#ajout`, `#source-principal`, `#source-ajout`,
  `#ajoutgroupes`, `#composer2`, `#composer3`, `#horaire`, `#detail`,
  `#pdf`, `#modifier`.
- `maquette-bureau.html` — variante ordinateur (composeur + semaine
  côte à côte).
- `app.css` — copie fidèle du `<style>` de `index.html` (fichier extrait,
  pas retapé) : les maquettes utilisent les vrais composants.
- `maquette.css` — uniquement les styles nouveaux (cartes de source,
  sélecteur de cours, bandeau de chevauchement, badges).
- `maquette.js` — routeur d'écrans et rendu de la semaine de démo.
- `01…15-*.png` — captures de ce document.

Pour ouvrir la maquette : `python3 serve.py` (ou
`python3 -m http.server 8917`) puis
`http://localhost:8917/propositions/horaire-perso/maquette.html`.
