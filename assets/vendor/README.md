# Bibliothèques tierces servies par le site

Ces fichiers sont servis par EzHoraire depuis son propre domaine
(`/assets/vendor/...`), jamais depuis un CDN tiers : la connexion et
l'ouverture d'un PDF ne dépendent plus d'un domaine externe, et la CSP
n'autorise aucun script d'une autre origine (hors tesseract.js, limité à
l'import d'une capture). Le nom du fichier porte la version, le dossier est
mis en cache un an (`immutable`) — voir `vercel.json` et `tools/serve.py`.

| Fichier | Version | Source | Licence |
| --- | --- | --- | --- |
| `supabase-2.116.0.min.js` | 2.116.0 | `@supabase/supabase-js`, build UMD (`dist/umd/supabase.js`) | MIT |
| `pdfjs/pdf.min.js` | 3.11.174 | `pdfjs-dist`, build générique | Apache-2.0 |
| `pdfjs/pdf.worker.min.js` | 3.11.174 | `pdfjs-dist` (ouvrier du rendu) | Apache-2.0 |

`pdf.min.js` et `pdf.worker.min.js` conservent leur en-tête de licence
Apache-2.0. Le build UMD de supabase-js n'embarque pas de bandeau : sa
licence MIT est reproduite ci-dessous.

## Mettre à jour

1. Télécharger les nouveaux fichiers (mêmes chemins d'origine que le
   tableau) sous un **nouveau nom** (`supabase-<version>.min.js`,
   `pdfjs/` remplacé par une nouvelle version) ;
2. mettre à jour les trois références : `assets/js/app.js`
   (`SDK_SUPABASE.src`, `PDFJS_BASE`), `dashboard.html`,
   `mot-de-passe.html` ;
3. `python3 tools/build_assets.py`, puis vérifier en local (connexion,
   ouverture d'un PDF) et relire `tools/valider_csp.py` (les scripts
   changent, pas les empreintes des pages).

## Licence MIT — supabase-js

Copyright (c) 2020 Supabase

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
