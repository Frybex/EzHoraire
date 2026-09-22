/* Favicone et icône d'écran d'accueil : la bande du logo prend la couleur
   de l'horaire choisi (bleu, vert ou rose).

   L'onglet est repeint en direct (favicon SVG en data URI). L'icône d'un
   raccourci, elle, est figée à l'ajout : apple-touch-icon et manifeste sont
   donc pointés vers la bonne variante dès l'analyse de la page — le système
   lit alors la couleur choisie au moment de l'ajout, pas une couleur
   générique. Rien ne change après coup sur un raccourci déjà créé. */
(function () {
  "use strict";
  var FORME = "M18 26.5A5 5 0 0 1 23 21.5L77 21.5A5 5 0 0 1 82 26.5L82 32.12A7 7 0 0 1 80.55 36.39L62.52 59.87A3.5 3.5 0 0 0 65.3 65.5L77 65.5A5 5 0 0 1 82 70.5L82 73.5A5 5 0 0 1 77 78.5L23 78.5A5 5 0 0 1 18 73.5L18 70.5A5 5 0 0 1 23 65.5L40.08 65.5A3.5 3.5 0 0 0 42.86 64.13L47.23 58.43A1.2 1.2 0 0 0 46.28 56.5L23 56.5A5 5 0 0 1 18 51.5L18 48.5A5 5 0 0 1 23 43.5L58.11 43.5A1.2 1.2 0 0 0 59.06 43.03L64.13 36.43A1.2 1.2 0 0 0 63.17 34.5L23 34.5A5 5 0 0 1 18 29.5Z";
  var THEMES = {
    "1": { bande: "#4cc38a", favicon: "", png16: "/favicon-16x16-vert.png?v=2", png32: "/favicon-32x32-vert.png?v=2", apple: "/apple-touch-icon-vert.png", manifest: "/site-vert.webmanifest" },
    "3": { bande: "#ffa8d0", favicon: "", png16: "/favicon-16x16-rose.png?v=2", png32: "/favicon-32x32-rose.png?v=2", apple: "/apple-touch-icon-rose.png", manifest: "/site-rose.webmanifest" }
  };
  var DEFAUT = { bande: null, favicon: "/favicon.svg?v=2", png16: "/favicon-16x16.png?v=2", png32: "/favicon-32x32.png?v=2", ico: "/favicon.ico?v=2", apple: "/apple-touch-icon.png", manifest: "/site.webmanifest" };
  var lien = document.querySelector('link[rel~="icon"][type="image/svg+xml"]');
  /* Safari ignore le SVG et prend un raster (.ico / .png) : ces liens sont
     donc repointés eux aussi vers la variante du thème, sinon l'onglet
     resterait bleu quand l'horaire est vert ou rose. */
  var lienIco = document.querySelector('link[rel="icon"]:not([type])');
  var lienPng32 = document.querySelector('link[rel="icon"][type="image/png"][sizes="32x32"]');
  var lienPng16 = document.querySelector('link[rel="icon"][type="image/png"][sizes="16x16"]');
  var pose = "";

  /* Au chargement, l'app n'a pas encore posé data-theme sur <body> : le
     thème du dernier horaire est dans localStorage. Ne sert qu'à fixer
     l'icône du raccourci avant que le système ne la lise — les autres pages
     (dashboard) n'ont pas de manifeste et gardent leur propre couleur. */
  function themeProvisoire() {
    try {
      if (!document.querySelector('link[rel="manifest"]')) return null;
      var profils = JSON.parse(localStorage.getItem("ezh_profils") || "[]");
      var courant = JSON.parse(localStorage.getItem("ezh_courant") || "null");
      if (!Array.isArray(profils)) profils = [];
      var p = null;
      for (var i = 0; i < profils.length; i++) {
        if (profils[i] && profils[i].id === courant) p = profils[i];
      }
      if (!p && profils.length) p = profils[0];
      if (p && p.theme != null) return String(p.theme);
    } catch (e) { /* navigation privée */ }
    return null;
  }

  function theme() {
    var t = (document.body && document.body.getAttribute("data-theme")) ||
            document.documentElement.getAttribute("data-couleur");
    if (t == null) t = themeProvisoire();
    return String(t);
  }

  function choix() { return THEMES[theme()] || DEFAUT; }

  function svg(c) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>EzHoraire</title>' +
      '<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#232832"/><stop offset="1" stop-color="#101216"/>' +
      '</linearGradient></defs><rect width="100" height="100" rx="20" fill="url(#t)"/>' +
      '<clipPath id="ezm"><rect y="34.5" width="100" height="31"/></clipPath>' +
      '<path d="' + FORME + '" fill="#f4f5f7"/>' +
      '<path d="' + FORME + '" fill="' + c + '" clip-path="url(#ezm)"/></svg>';
  }

  function majLien(sel, valeur) {
    var el = document.querySelector(sel);
    if (el && el.getAttribute("href") !== valeur) el.setAttribute("href", valeur);
  }

  function maj() {
    var t = choix();
    var href = t.favicon || "data:image/svg+xml," + encodeURIComponent(svg(t.bande));
    if (href !== pose) {
      pose = href;
      if (!lien) {
        lien = document.createElement("link");
        lien.rel = "icon";
        lien.type = "image/svg+xml";
        (document.head || document.documentElement).appendChild(lien);
      }
      lien.setAttribute("href", href);
    }
    majLien('link[rel="apple-touch-icon"]', t.apple);
    majLien('link[rel="manifest"]', t.manifest);
    /* Rasters (Safari) : pas de .ico par couleur, le lien .ico pointe alors
       le PNG 32 de la variante — les navigateurs reniflent le contenu.
       Via les références capturées (pas de requête) : le lien .ico change
       de type une fois thématisé, il matcherait sinon le sélecteur PNG. */
    if (lienPng32 && lienPng32.getAttribute("href") !== t.png32) lienPng32.setAttribute("href", t.png32);
    if (lienPng16 && lienPng16.getAttribute("href") !== t.png16) lienPng16.setAttribute("href", t.png16);
    if (lienIco) {
      var hrefIco = t.ico || t.png32;
      if (lienIco.getAttribute("href") !== hrefIco) lienIco.setAttribute("href", hrefIco);
      if (t.ico) lienIco.removeAttribute("type");
      else lienIco.setAttribute("type", "image/png");
    }
  }

  maj();
  document.addEventListener("DOMContentLoaded", maj);
  if (window.MutationObserver) {
    new MutationObserver(maj).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-theme", "data-couleur"]
    });
  }
})();
