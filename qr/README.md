# QR Codes EzHoraire — Identité Néo-Suisse & Ultra-Moderne

Générateur et collection de QR Codes vectoriels sur-mesure pour [EzHoraire](https://www.ezhoraire.be), conçus pour allier **élégance visuelle contemporaine** et **performance de scan maximale**.

---

## 💎 Caractéristiques de Conception

1. **Modules Squircle (Arrondis Néo-Suisses)** :
   - Fini les blocs carrés pixélisés des années 90 : chaque module possède des courbures douces (`rx=5.5px`) parfaitement alignées sur les tokens de design de l'application (tuiles en relief, angles arrondis).
2. **Repères de visée personnalisés (Finders)** :
   - Anneaux extérieurs aux coins arrondis et pupilles internes bleu cobalt (`#5b86ff` / `#2456e0`), garantissant une détection optique instantanée.
3. **Badge Central Officiel intégré** :
   - Incrustation du **logo EzHoraire** (le Monolithe E + Z, icône officielle de l'application) au cœur du QR Code.
   - Entouré d'une bordure de protection subtile avec micro-relief.
4. **Scannabilité Certifiée 100% (Correction d'erreur Niveau H)** :
   - Tolérance de 30% aux erreurs et occultations : scannable sous tous les angles, même avec reflets ou faible luminosité.
   - Validé par des tests automatisés de vision par ordinateur (`jsQR` / smartphone vision).

---

## 📁 Fichiers Disponibles (`qr/`)

| Fichier | Format | Rôle & Usage |
|---|---|---|
| `qr-dark.svg` / `.png` | Vectoriel / 800px | **Édition Néo-Dark** : Titane noir & bleu électrique (écrans, web, apps) |
| `qr-dark-hd.png` | 1600px HD | Version ultra haute résolution pour affichage grand format |
| `qr-light.svg` / `.png` | Vectoriel / 800px | **Édition Épure Suisse** : Fond blanc pur & encre noire (stickers, papeterie) |
| `qr-light-hd.png` | 1600px HD | Version haute résolution pour impression offset / pro |
| `qr-cyber.svg` / `.png` | Vectoriel / 800px | **Édition Cyber Aurora** : Dégradé cyan ➔ violet pour événements tech |
| `qr-card-dark.svg` / `.png` | 1200 × 1600 px | **Présentoir Néo-Dark** : Affiche / Stand complet avec titre, logo & URL |
| `qr-card-light.svg` / `.png`| 1200 × 1600 px | **Présentoir Épure Blanche** : Flyer / Poster économique prêt à imprimer |
| `mockup.jpg` | 1024 × 1024 px | Rendu 3D photoréaliste sur présentoir acrylique & aluminium |
| `apercu.html` | Web | Galerie interactive avec téléchargements directs |
| `generate_qr.py` | Python CLI | Script autonome pour régénérer ou changer d'URL |

---

## 🚀 Génération & Personnalisation

Pour régénérer les fichiers ou créer un QR code vers une sous-page ou une autre URL :

```bash
# Génération par défaut vers https://www.ezhoraire.be
python3 qr/generate_qr.py

# Génération vers une formation spécifique
python3 qr/generate_qr.py --url "https://www.ezhoraire.be?ecole=heh&formation=ba2p-info"
```

---

## 📱 Aperçu Visuel Direct

Ouvrez simplement `qr/apercu.html` dans un navigateur ou lancez :

```bash
python3 serve.py
# Puis visitez http://localhost:8902/qr/apercu.html
```
