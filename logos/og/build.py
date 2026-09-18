# -*- coding: utf-8 -*-
"""Rend og-image.html en /og-image.png (1200 × 630), l'aperçu des liens
partagés (WhatsApp, Messenger, Instagram, Discord, X…).

Usage : python3 logos/og/build.py   (nécessite Brave, comme logos/da/build.py)
"""
import os
import subprocess

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

sortie = os.path.join(RACINE, "og-image.png")
subprocess.run([BRAVE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", "--window-size=1200,630",
                f"--screenshot={sortie}", "file://" + os.path.join(ICI, "og-image.html")],
               check=True, capture_output=True)
print(sortie, os.path.getsize(sortie), "octets")
