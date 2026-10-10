# tessdata — modèle français de Tesseract

`fra.traineddata` : modèle de reconnaissance du français, version
« best » (la plus lente à lire, la plus exacte), pris dans
`tesseract-ocr/tessdata_best` :

    https://github.com/tesseract-ocr/tessdata_best/raw/main/fra.traineddata

- empreinte SHA-256 : `907743d98915c91a3906dfbf6e48b97598346698fe53aaa797e1a064ffcac913`
- licence : Apache 2.0 (voir le dépôt tessdata_best, `LICENSE`)
- usage : lu par `_moteurs/publication.py` (OCR des grilles publiées en
  images), jamais servi en ligne — `api/` n'est pas un dossier public.

Le modèle « fast » (1,1 Mo) a été essayé : il abîme les titres des
grilles (« Crtave des sources », « Hisbire »), que la correction par
vocabulaire ne peut pas rattraper (elle ne connaît que les salles et les
profs). Le « best » (4 Mo) fait beaucoup moins d'erreurs pour un coût
négligeable ici : les grilles sont lues une fois puis gardées en cache.
