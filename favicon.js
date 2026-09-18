/* Favicone : la bande du logo prend la couleur de l'horaire choisi
   (bleu, vert ou rose) dans l'onglet du navigateur. */
(function () {
  "use strict";
  var FORME = "M18 26.5A5 5 0 0 1 23 21.5L77 21.5A5 5 0 0 1 82 26.5L82 32.12A7 7 0 0 1 80.55 36.39L62.52 59.87A3.5 3.5 0 0 0 65.3 65.5L77 65.5A5 5 0 0 1 82 70.5L82 73.5A5 5 0 0 1 77 78.5L23 78.5A5 5 0 0 1 18 73.5L18 70.5A5 5 0 0 1 23 65.5L40.08 65.5A3.5 3.5 0 0 0 42.86 64.13L47.23 58.43A1.2 1.2 0 0 0 46.28 56.5L23 56.5A5 5 0 0 1 18 51.5L18 48.5A5 5 0 0 1 23 43.5L58.11 43.5A1.2 1.2 0 0 0 59.06 43.03L64.13 36.43A1.2 1.2 0 0 0 63.17 34.5L23 34.5A5 5 0 0 1 18 29.5Z";
  var DEFAUT = "/favicon.svg";
  var COULEURS = { "1": "#4cc38a", "3": "#ffa8d0" };
  var lien = document.querySelector('link[rel~="icon"][type="image/svg+xml"]');
  var pose = "";

  function couleur() {
    var racine = document.documentElement;
    var theme = (document.body && document.body.getAttribute("data-theme")) ||
                racine.getAttribute("data-couleur");
    return COULEURS[theme] || DEFAUT;
  }

  function svg(c) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>EzHoraire</title>' +
      '<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#232832"/><stop offset="1" stop-color="#101216"/>' +
      '</linearGradient></defs><rect width="100" height="100" rx="20" fill="url(#t)"/>' +
      '<clipPath id="ezm"><rect y="34.5" width="100" height="31"/></clipPath>' +
      '<path d="' + FORME + '" fill="#f4f5f7"/>' +
      '<path d="' + FORME + '" fill="' + c + '" clip-path="url(#ezm)"/></svg>';
  }

  function maj() {
    var c = couleur();
    var href = c === DEFAUT ? DEFAUT : "data:image/svg+xml," + encodeURIComponent(svg(c));
    if (href === pose) return;
    pose = href;
    if (!lien) {
      lien = document.createElement("link");
      lien.rel = "icon";
      lien.type = "image/svg+xml";
      (document.head || document.documentElement).appendChild(lien);
    }
    lien.setAttribute("href", href);
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
