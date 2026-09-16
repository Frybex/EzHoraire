# Logos EzHoraire — jeu aligné sur la DA du site

Quatre propositions, même construction. Tout est vectoriel ; les PNG sont rendus
depuis les SVG par `build.py` (`python3 build.py`).

| Dossier | Le signe |
|---|---|
| `a-mat/` | Z crème sur tuile mate, seule la diagonale est en accent |
| `b-accent/` | Z entièrement en bleu de marque, arête haute allumée |
| `c-degrade/` | Z en dégradé bleu → violet (version la plus expressive) |
| `d-barres/` | sans lettre : trois barres = lignes d'agenda, la médiane en accent |

## Ce qu'il y a dans chaque dossier

| Fichier | Usage |
|---|---|
| `logo.svg` / `logo-clair.svg` | tuile complète, version sombre / claire |
| `marque.svg` | le signe seul, en `currentColor` — à **inliner** dans la page |
| `marque-claire.svg` / `marque-sombre.svg` | le signe seul, couleurs fixées, pour un `<img>` |
| `favicon.svg` | version simplifiée pour l'onglet (pas de filigrane, signe épaissi) |
| `favicon.ico` | 16 / 32 / 48 px, pour les navigateurs anciens |
| `apple-touch-icon.png` | 180 px, opaque, carré : iOS arrondit lui-même |
| `icon-192.png`, `icon-512.png` | icônes web classiques |
| `icon-maskable-512.png` | Android adaptatif, signe dans la zone sûre |
| `site.webmanifest` | à copier à la racine du site |

## Détails cachés

Le langage du site : surfaces mates en léger relief, filet d'1 px allumé en haut,
halo d'accent qui suit le pointeur. Transposé au logo, cela donne trois détails
qui n'apparaissent qu'en grand et disparaissent d'eux-mêmes en favicon :

- les **lignes d'heures** en filigrane dans la tuile (le calendrier, en sous-texte) ;
- le **halo d'accent** en haut à gauche, comme une lumière posée sur la tuile ;
- l'**arête supérieure d'1 px** allumée, exactement comme les boutons du site.

## Intégration

Copier les fichiers choisis à la racine du site, puis dans `<head>` :

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

Dans l'en-tête, `marque.svg` hérite de la couleur du texte (`currentColor`) et suit
donc le thème clair ou sombre — mais uniquement si le SVG est écrit directement dans
le HTML. Chargé via `<img src="marque.svg">`, il n'hérite de rien : utiliser alors
`marque-claire.svg` ou `marque-sombre.svg`.
