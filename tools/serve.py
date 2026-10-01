"""Sert l'app en local, avec la même API qu'en ligne.

Usage :  python3 tools/serve.py [--lan] [--tunnel] [--port 8902] [--log|--no-log]
App :    http://localhost:8902 (8901 est pris par Horairelm)

--lan : accepte aussi les autres appareils du réseau local (téléphone,
        second ordinateur) et affiche l'adresse à ouvrir (avec un QR
        code à scanner) — c'est ce qui remplace l'ancien « localhost sur
        l'IP du réseau ». Sans lui, seules les connexions de la machine
        répondent : en production c'est Vercel qui protège, ici c'est ce
        garde-fou qui tient le rôle.
--port : change le port (utile quand deux dossiers de travail tournent
        en même temps).
--log / --no-log : journal des accès activé (une ligne par requête, IP
        et agent) ou désactivé. Par défaut : activé avec --lan (c'est
        là qu'on veut voir un appareil arriver), sinon silencieux.
--tunnel : ouvre aussi un tunnel cloudflared vers ce serveur et affiche
        l'URL https à ouvrir de l'extérieur (4G, autre réseau). La
        connexion part de la machine, donc rien à percer dans le
        firewall ; l'URL est aléatoire à chaque lancement. Attention à
        ne jamais y brancher un simple « python -m http.server » : ce
        serveur filtre les fichiers cachés (.env, .git), l'autre les
        sert tous.

L'adresse affichée porte `?essai=1` : l'app ouvre directement l'horaire,
sans page de connexion, pourvu que l'hôte soit une origine locale
(index.html, MODE_ESSAI) — localhost, 10., 192.168., 172.16-31. — ou un
tunnel de preview (*.trycloudflare.com).

GET /api/formations?ecole=heh                      formations de l'école
GET /api/horaires?ecole=heh&formation=..           horaire complet d'une formation
GET /api/recherche?ecole=ulb&genre=niveau&q=..     recherche en direct (ULB, UCLouvain)
GET /api/ical?lien=..                              horaire d'un lien d'abonnement
POST /api/importer  {"ecole":"ulb","liste":"…"}     liste de cours collée -> cours
GET /api/pdf?ecole=heh&formation=..&groupe=..&semaine=..   PDF officiel
"""
import glob
import gzip
import io
import os
import queue
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RACINE, "api"))

# Le serveur local montre toutes les écoles, y compris celles en test
# (UCLouvain) : sur Vercel, sans EZH_UCL, elles restent invisibles.
# `EZH_UCL=0 python3 serve.py` simule la production.
os.environ.setdefault("EZH_UCL", "1")

# Idem pour l'école de simulation (horaires fictifs, lab/simulation.html) :
# `EZH_SIM=0` permet de vérifier que la production ne la propose pas.
os.environ.setdefault("EZH_SIM", "1")

import formations  # noqa: E402
import horaires  # noqa: E402
import export  # noqa: E402
import abonnement  # noqa: E402
import ical  # noqa: E402
import importer  # noqa: E402
import pdf  # noqa: E402
import recherche  # noqa: E402
import config  # noqa: E402
import stats  # noqa: E402
import bugs  # noqa: E402

PORT_DEFAUT = 8902
ROUTES = {"/api/formations": formations.handler,
          "/api/horaires": horaires.handler,
          "/api/export": export.handler,
          "/api/abonnement": abonnement.handler,
          "/api/recherche": recherche.handler,
          "/api/ical": ical.handler,
          "/api/importer": importer.handler,
          "/api/pdf": pdf.handler,
          "/api/config": config.handler,
          "/api/stats": stats.handler,
          "/api/bugs": bugs.handler}

# En-têtes identiques à vercel.json (garder les deux synchronisés) : le site
# local doit se comporter comme la production, surtout pour la CSP. Les
# scripts embarqués des pages sont autorisés par leur empreinte sha256
# (tools/valider_csp.py) ; 'unsafe-inline' reste nécessaire pour les styles
# (attributs style="…" et blocs <style> des pages à compte).
# cdn.jsdelivr.net n'apparaît que pour l'OCR (tesseract.js, import d'une
# capture, script déjà figé par SRI) ; Supabase et pdf.js sont servis par le
# site (assets/vendor/).
CSP = ("default-src 'self'; "
       "script-src 'self' 'sha256-2zMgjnrBc0scdjiqprtr/+amfpkHFvD3dOdvZeFaFmo=' 'sha256-HoK1HtBuOiJpGiGV9OX86k9+COVS5ELODIcYuH1A/vM=' 'sha256-UyU3nDo9cQQ5FWuH1wDSjiThXV0kMZiieIKzDINA01M=' 'sha256-hIpGQKPkWlsFL1mRFtpwGxiAL18oC8+fXHre7DdZac4=' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; "
       "style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://avatars.githubusercontent.com; "
       "font-src 'self'; "
       "connect-src 'self' https://*.supabase.co https://cdn.jsdelivr.net; "
       "frame-src blob:; "
       "worker-src 'self' blob: https://cdn.jsdelivr.net; "
       "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
ENTETES_SECURITE = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Content-Security-Policy": CSP,
}
# Version large pour le labo local : les empreintes sont retirées (leur
# seule présence ferait ignorer 'unsafe-inline', règle CSP).
CSP_LAB = re.sub(r"script-src [^;]*;",
                 "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;",
                 CSP)


def entetes_securite(chemin):
    """En-têtes de la réponse ; CSP assouplie pour les pages du labo.

    Les pages de `lab/` (menu de simulation, propositions) ne sont jamais
    déployées et portent leurs propres scripts embarqués : leurs empreintes
    n'ont pas à figurer dans la CSP de production, et `'unsafe-inline'` y
    serait de toute façon ignoré tant qu'une empreinte est présente (c'est
    la règle CSP). En local, leur directive script-src est donc remplacée
    par la version large d'avant ; les pages du site, elles, restent
    verrouillées par empreinte."""
    if chemin.startswith("/lab/"):
        return dict(ENTETES_SECURITE, **{"Content-Security-Policy": CSP_LAB})
    return ENTETES_SECURITE

# Mêmes valeurs que vercel.json (garder les deux synchronisés) : « servir
# la copie en mémoire, vérifier en arrière-plan ». Le HTML ne bloque plus
# l'ouverture, les scripts et les icônes se rafraîchissent tout seuls.
CACHE_HTML = "public, max-age=0, stale-while-revalidate=86400"
CACHE_SCRIPT = "public, max-age=300, stale-while-revalidate=86400"
CACHE_IMAGE = "public, max-age=86400, stale-while-revalidate=604800"
# Logos d'écoles : illustratifs, quasi figés (un logo change une fois par
# an au plus) et référencés par toutes les pages. Un mois de cache puis
# rafraîchissement en arrière-plan : Lighthouse comptait 9 Ko renvoyés à
# chaque visite pour rien. Même valeur dans vercel.json (garder les deux
# synchronisés).
CACHE_LONG = "public, max-age=2592000, stale-while-revalidate=31536000"
# Assets versionnés par empreinte (assets/dist/) : le nom change à chaque
# modification, la copie locale peut donc être gardée un an sans risque.
CACHE_IMMUABLE = "public, max-age=31536000, immutable"
EXTENSIONS_IMAGE = ("png", "svg", "ico", "webmanifest")
# Types de texte compressés à la volée (comme Vercel en ligne, en gzip ici).
EXTENSIONS_COMPRESSIBLES = ("html", "css", "js", "mjs", "json", "svg", "txt",
                            "xml", "webmanifest", "map", "ics")
TAILLE_MIN_COMPRESSION = 1024


def cache_fichier(chemin):
    """En-tête de cache d'un fichier servi, d'après son extension."""
    chemin = chemin.split("?")[0]
    extension = chemin.rsplit(".", 1)[-1].lower() if "." in chemin.split("/")[-1] else ""
    if chemin.startswith("/assets/dist/"):
        return CACHE_IMMUABLE
    if chemin.startswith("/assets/vendor/"):
        return CACHE_IMMUABLE
    if chemin.startswith("/logos/ecoles/"):
        return CACHE_LONG
    if extension in ("js", "css"):
        return CACHE_SCRIPT
    if extension in EXTENSIONS_IMAGE:
        return CACHE_IMAGE
    if extension in ("", "html"):
        return CACHE_HTML
    return "public, max-age=0, must-revalidate"


class Serveur(ThreadingHTTPServer):
    """Écoute en IPv4 ET IPv6 : « localhost » marche quel que soit le navigateur."""
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    LAN = False     # réglé par --lan : accepte les autres appareils du réseau
    JOURNAL = False  # réglé par --log / --no-log (voir main)

    def _chemin_autorise(self):
        """Chemin décodé si l'accès est permis et qu'il ne vise pas un
        fichier caché, sinon None (une erreur a déjà été envoyée)."""
        # Sécurité : sans --lan, n'accepter que la machine locale.
        ip = self.client_address[0]
        if not Handler.LAN and ip not in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
            self.send_error(403, "Accès interdit : serveur de développement local uniquement")
            return None

        # Sécurité : décoder AVANT de filtrer, sinon « %2Eenv » passe le test
        # puis est décodé par SimpleHTTPRequestHandler, qui sert le fichier.
        chemin = unquote(self.path.split("?")[0])

        # Sécurité : bloquer l'accès aux fichiers et dossiers cachés (.env, .git, etc.)
        parties = [p for p in chemin.strip("/").split("/") if p]
        if any(p.startswith(".") for p in parties):
            self.send_error(404, "Fichier non trouvé")
            return None
        return chemin

    def _redirection_app(self):
        """L'app vit à la racine : /app.html n'existe plus, mais des
        favoris et des liens d'avant pointent encore dessus. On renvoie
        vers « / » en gardant les paramètres (?essai=1, par exemple).
        Même redirection que vercel.json en ligne."""
        if self.path.split("?")[0] not in ("/app.html", "/app"):
            return False
        requete = self.path.split("?", 1)
        cible = "/" + ("?" + requete[1] if len(requete) > 1 else "")
        self.send_response(301)
        self.send_header("Location", cible)
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True

    def send_head(self):
        """Statique : sert une version gzip quand le client l'accepte,
        comme Vercel le fait en ligne (en brotli). Sans ça, la mesure
        Lighthouse locale compterait 110 Ko de CSS là où la production en
        envoie 17 : on ne saurait pas ce qu'on optimise."""
        if not getattr(self, "statique", False):
            return super().send_head()
        chemin = self.translate_path(self.path)
        if os.path.isdir(chemin):
            if not self.path.split("?")[0].endswith("/"):
                return super().send_head()  # la base redirige vers « / »
            for nom in ("index.html", "index.htm"):
                candidat = os.path.join(chemin, nom)
                if os.path.isfile(candidat):
                    chemin = candidat
                    break
            else:
                return super().send_head()
        if not os.path.isfile(chemin):
            return super().send_head()
        base = os.path.basename(chemin)
        extension = base.rsplit(".", 1)[-1].lower() if "." in base else ""
        encode = self.headers.get("Accept-Encoding", "")
        if extension not in EXTENSIONS_COMPRESSIBLES or "gzip" not in encode:
            return super().send_head()
        with open(chemin, "rb") as f:
            brut = f.read()
        if len(brut) < TAILLE_MIN_COMPRESSION:
            return super().send_head()
        corps = gzip.compress(brut, 5)
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(chemin))
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("Last-Modified", self.date_time_string(os.stat(chemin).st_mtime))
        self.end_headers()
        return io.BytesIO(b"" if self.command == "HEAD" else corps)

    def do_GET(self):
        self.statique = False
        chemin = self._chemin_autorise()
        if chemin is None:
            return
        if self._redirection_app():
            return
        route = ROUTES.get(chemin)
        if route:
            route.do_GET(self)
        else:
            self.statique = True
            super().do_GET()

    def do_POST(self):
        # Seuls les points d'entrée de l'API acceptent POST ; le reste du
        # serveur local ne sert que des fichiers.
        self.statique = False
        chemin = self._chemin_autorise()
        if chemin is None:
            return
        route = ROUTES.get(chemin)
        if route and hasattr(route, "do_POST"):
            route.do_POST(self)
        else:
            self.send_error(405, "Méthode non autorisée")

    def do_PATCH(self):
        # /api/bugs (changement de statut admin) est le seul PATCH.
        self.statique = False
        chemin = self._chemin_autorise()
        if chemin is None:
            return
        route = ROUTES.get(chemin.split("?")[0])
        if route and hasattr(route, "do_PATCH"):
            route.do_PATCH(self)
        else:
            self.send_error(405, "Méthode non autorisée")

    def do_HEAD(self):
        # Même garde que GET : do_HEAD hérité la contournerait entièrement.
        self.statique = False
        if self._chemin_autorise() is None:
            return
        if self._redirection_app():
            return
        self.statique = True
        super().do_HEAD()

    def log_message(self, format, *args):
        """Journal des accès : la preuve qu'un appareil a ouvert la page,
        sans aller demander une capture d'écran. Une ligne par requête :
        heure, IP, requête, code, agent. Tout y passe (send_response et
        send_error appellent log_request / log_error), API comprise.
        Silencieux sans JOURNAL (voir --log / --no-log)."""
        if not Handler.JOURNAL:
            return
        # Serveur dual-stack : une connexion IPv4 arrive en ::ffff:a.b.c.d.
        locale = self.client_address[0].replace("::ffff:", "")
        ip = locale
        if getattr(self, "headers", None):
            agent = self.headers.get("User-Agent") or "-"
            # Derrière le tunnel, tout arrive en 127.0.0.1 (cloudflared) :
            # l'IP réelle de l'appareil voyage dans CF-Connecting-IP. On ne
            # la croit que si la connexion vient bien de la machine (sinon
            # un client du LAN pourrait la falsifier).
            distante = self.headers.get("CF-Connecting-IP")
            if distante and locale in ("127.0.0.1", "::1"):
                ip = f"{distante} (tunnel)"
        else:
            agent = "-"
        # Agent tronqué : la ligne reste lisible dans un terminal étroit
        # (on y cherche l'IP et le code, pas la string complète).
        if len(agent) > 60:
            agent = agent[:59] + "…"
        print(f"{time.strftime('%H:%M:%S')}  {ip:<15}  {format % args}  ·  {agent}",
              flush=True)

    def send_error(self, code, message=None, explain=None):
        # Comme Vercel : une adresse inconnue reçoit la page 404 du site.
        page = os.path.join(RACINE, "404.html")
        if code != 404 or not os.path.isfile(page):
            return super().send_error(code, message, explain)
        with open(page, "rb") as f:
            corps = f.read()
        self.send_response(404, message)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corps)

    def end_headers(self):
        # Fichiers : mêmes valeurs que vercel.json (garder les deux
        # synchronisés) — le navigateur peut servir sa copie tout de suite
        # et vérifier en arrière-plan, au lieu d'attendre un aller-retour de
        # revalidation. Les points d'entrée de l'API posent le leur (voir
        # repondre_json).
        if getattr(self, "statique", False):
            self.send_header("Cache-Control", cache_fichier(self.path))
        for cle, valeur in entetes_securite(self.path.split("?")[0]).items():
            self.send_header(cle, valeur)
        super().end_headers()


def charger_env_local(chemin=".env.local"):
    """Clés Supabase en local : `vercel env pull .env.local` les récupère,
    on les charge ici (sans écraser une variable déjà définie)."""
    if not os.path.exists(chemin):
        return
    with open(chemin, encoding="utf-8") as f:
        for ligne in f:
            ligne = ligne.strip()
            if not ligne or ligne.startswith("#") or "=" not in ligne:
                continue
            cle, val = ligne.split("=", 1)
            os.environ.setdefault(cle.strip(), val.strip().strip('"').strip("'"))


def adresse_reseau():
    """Adresse IPv4 de la machine sur le réseau local, vide si introuvable.

    Un socket UDP « connecté » n'envoie rien : il laisse le système
    choisir la route, donc la bonne carte (Wi-Fi, Ethernet)."""
    for cible in (("8.8.8.8", 53), ("1.1.1.1", 53)):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(cible)
            return s.getsockname()[0]
        except OSError:
            continue
        finally:
            s.close()
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return ""


def afficher_qr(url):
    """QR code de l'URL, dessiné en ANSI dans le terminal (qrencode) :
    on le scanne depuis le téléphone au lieu de taper une adresse.
    Repli silencieux sans qrencode : l'URL reste affichée au-dessus."""
    if not shutil.which("qrencode"):
        return
    try:
        sortie = subprocess.run(["qrencode", "-t", "ANSIUTF8", url],
                                capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return
    if sortie.returncode == 0 and sortie.stdout.strip():
        print(sortie.stdout.rstrip("\n"), flush=True)


def chemin_cloudflared():
    """Binaire cloudflared : celui du PATH, sinon la copie du harness T3.
    Sans aucun des deux, le tunnel est simplement impossible."""
    exe = shutil.which("cloudflared")
    if exe:
        return exe
    candidats = sorted(glob.glob(
        os.path.expanduser("~/.t3/tools/cloudflared/*/linux-x64/cloudflared")))
    return candidats[-1] if candidats else ""


def demarrer_tunnel(port, delai=45):
    """« cloudflared tunnel --url http://127.0.0.1:<port> » (tunnel rapide,
    aucune configuration) : renvoie (procès, url_https).

    L'URL est imprimée par cloudflared au démarrage, sur sa sortie
    standard mêlée à ses logs — on la cherche pendant `delai` secondes.
    url vide si le tunnel n'a pas démarré : les dernières lignes de
    cloudflared sont alors affichées pour qu'on comprenne pourquoi.
    L'appelant tue le procès (voir main)."""
    exe = chemin_cloudflared()
    if not exe:
        print("Tunnel : cloudflared introuvable (ni dans le PATH, ni dans "
              "~/.t3/tools) — accès extérieur désactivé.", flush=True)
        return None, ""
    proc = subprocess.Popen([exe, "tunnel", "--url", f"http://127.0.0.1:{port}"],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, bufsize=1)
    lignes = queue.Queue()

    def lire():
        for ligne in proc.stdout:
            lignes.put(ligne)

    threading.Thread(target=lire, daemon=True).start()
    url, trace, motif = "", [], re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
    fin = time.time() + delai
    while time.time() < fin:
        try:
            ligne = lignes.get(timeout=0.5)
        except queue.Empty:
            if proc.poll() is not None:
                break
            continue
        trace.append(ligne.rstrip())
        trace = trace[-8:]
        trouve = motif.search(ligne)
        if trouve:
            url = trouve.group(0)
            break
        if proc.poll() is not None and lignes.empty():
            break
    if not url:
        print("Tunnel : démarrage échoué (sortie de cloudflared) :",
              flush=True)
        for ligne in trace:
            print(f"    cloudflared | {ligne}", flush=True)
    return proc, url


FICHIER_LIENS = "/tmp/ezhoraire-preview.txt"


def ecrire_liens(liens, argv):
    """Recopie les liens de preview dans un fichier : le journal du tmux
    enfouit l'URL en quelques minutes de test, un agent (ou vous) la
    relit ici d'un `cat`. Effacé à l'arrêt du serveur (voir main)."""
    lignes = [f"# EzHoraire preview — démarré {time.strftime('%Y-%m-%d %H:%M:%S')}",
              f"# {' '.join(argv) or '(sans argument)'}"]
    lignes += [f"{cle}={url}" for cle, url in liens.items()]
    try:
        with open(FICHIER_LIENS, "w", encoding="utf-8") as f:
            f.write("\n".join(lignes) + "\n")
    except OSError:
        return
    print(f"Liens relisibles dans {FICHIER_LIENS} (le journal du tmux les "
          f"enfouit vite).", flush=True)


def retirer_liens(liens):
    """Efface la liasse à l'arrêt — mais seulement si elle est encore la
    nôtre : un autre serve.py du dépôt peut avoir tourné entre-temps et
    l'avoir remplacée."""
    try:
        with open(FICHIER_LIENS, encoding="utf-8") as f:
            contenu = f.read()
    except OSError:
        return
    if not all(url in contenu for url in liens.values()):
        return
    try:
        os.remove(FICHIER_LIENS)
    except OSError:
        pass


def maj_assets():
    """Reconstruit assets/dist/ si une source a changé depuis le dernier
    build : la preview sert toujours l'arbre de travail, jamais un bundle
    périmé. Silencieux quand tout est à jour (le cas courant)."""
    try:
        import build_assets
    except ImportError:
        return
    if build_assets.verifier(parler=False) == 0:
        return
    print("Assets périmés : reconstruction (tools/build_assets.py)…", flush=True)
    try:
        build_assets.construire()
    except SystemExit as e:
        print(f"Reconstruction impossible : {e}", flush=True)


def main(argv):
    lan = "--lan" in argv or os.environ.get("EZH_LAN") == "1"
    tunnel = "--tunnel" in argv or os.environ.get("EZH_TUNNEL") == "1"
    port = PORT_DEFAUT
    if "--port" in argv:
        try:
            port = int(argv[argv.index("--port") + 1])
        except (IndexError, ValueError):
            sys.exit("--port attend un numéro, ex. --port 8912.")
    Handler.LAN = lan
    # Journal : par défaut dès qu'un appareil extérieur peut arriver (LAN
    # ou tunnel), silencieux sinon. --log / --no-log forcent.
    Handler.JOURNAL = "--no-log" not in argv and ("--log" in argv or lan or tunnel)
    # Arrêt propre : Ctrl+C (KeyboardInterrupt), mais aussi SIGHUP/SIGTERM
    # (fin de session tmux). SystemExit fait tourner les `finally` qui
    # tuent le tunnel et effacent la liasse de liens, sinon un lien mort
    # reste écrit dans /tmp après `tmux kill-session`.
    for num in (signal.SIGHUP, signal.SIGTERM):
        signal.signal(num, lambda *_: sys.exit(0))
    os.chdir(RACINE)
    charger_env_local()
    maj_assets()
    try:
        srv = Serveur(("::", port), Handler)
    except OSError:
        sys.exit(f"Le port {port} est déjà utilisé : un autre serve.py tourne sans doute "
                 f"encore (voir `lsof -i :{port}`) — `--port 8912` en prend un autre.")
    with srv:
        essai = "/?essai=1"
        proc_tunnel, liens = None, {}
        print(f"EzHoraire : http://localhost:{port}", flush=True)
        print(f"Sans connexion : http://localhost:{port}{essai}", flush=True)
        if lan:
            ip = adresse_reseau()
            if ip:
                url = f"http://{ip}:{port}{essai}"
                print(f"Réseau local : {url}", flush=True)
                print("Mode réseau local : tout appareil du réseau peut lire l'app "
                      "(pas d'authentification côté serveur).", flush=True)
                afficher_qr(url)
                liens["local"] = url
        if tunnel:
            proc_tunnel, url = demarrer_tunnel(port)
            if url:
                # URL seule sur sa ligne : elle fait ~70 caractères, elle
                # ne doit pas être coupée par le terminal pour être copiée.
                print("Tunnel (depuis l'extérieur, tout réseau) :", flush=True)
                print(f"{url}{essai}", flush=True)
                print("Nouvelle URL à chaque lancement : à recopier quand on "
                      "change de réseau.", flush=True)
                liens["tunnel"] = url + essai
            elif proc_tunnel is not None:
                proc_tunnel.terminate()
        if liens:
            # Un serveur lancé en localhost seul n'écrit pas (et surtout ne
            # supprime pas : un autre serve.py du dépôt peut tourner en
            # parallèle et sa liasse lui appartient).
            ecrire_liens(liens, argv)
        if Handler.JOURNAL:
            print("Journal des accès : une ligne par requête (heure, IP, code, "
                  "agent) — c'est ici qu'on voit qu'un appareil a ouvert l'app.",
                  flush=True)
        print("Ctrl+C pour arrêter.", flush=True)
        try:
            srv.serve_forever()
        finally:
            if proc_tunnel is not None and proc_tunnel.poll() is None:
                proc_tunnel.terminate()
            if liens:
                retirer_liens(liens)


if __name__ == "__main__":
    main(sys.argv[1:])
