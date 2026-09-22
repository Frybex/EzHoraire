import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'rapports-seo');
const archivesDir = path.join(reportsDir, 'archives');

for (const dir of [reportsDir, archivesDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const bravePath = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

async function verifier() {
  const dateObj = new Date();
  const dateStr = dateObj.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const fileTimestamp = dateObj.toISOString().slice(0, 16).replace(/[:T]/g, '_');

  console.log(`[${dateStr}] Démarrage de la vérification Google...`);

  const browser = await puppeteer.launch({
    executablePath: bravePath,
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-size=1300,1000'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 2 });

  await page.evaluateOnNewDocument(() => {
    delete Object.getPrototypeOf(navigator).webdriver;
  });

  // Bypass Google cookie consent popup
  await page.setCookie(
    { name: 'SOCS', value: 'CAESEwgDEgk2ODEzMjQ5MjIaAmZyIAEaBgiA_L20Bg', domain: '.google.com', path: '/' },
    { name: 'SOCS', value: 'CAESEwgDEgk2ODEzMjQ5MjIaAmZyIAEaBgiA_L20Bg', domain: '.google.be', path: '/' }
  );

  await page.goto('https://www.google.com/search?hl=fr&gl=be&q=ezhoraire&nfpr=1', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));

  // Inspect EzHoraire result and favicon
  const audit = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let ezNode = null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.includes('ezhoraire.be')) {
        ezNode = node.parentElement;
        break;
      }
    }

    if (!ezNode) {
      return { indexed: false, hasCustomFavicon: false, details: 'Non trouvé dans les résultats' };
    }

    const container = ezNode.closest('div.MjjYud, div.g') || ezNode.closest('div[data-hveid]') || ezNode.parentElement;
    const titleEl = container.querySelector('h3');
    const title = titleEl ? titleEl.innerText : 'EzHoraire';

    // Find favicon near ezNode
    const rect = ezNode.getBoundingClientRect();
    const all = Array.from(document.querySelectorAll('*'));
    let faviconType = 'inconnu';
    let hasCustomFavicon = false;
    let faviconSrc = null;

    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.x >= rect.x - 60 && r.x < rect.x && Math.abs(r.y - rect.y) < 30 && r.width > 0 && r.height > 0) {
        if (el.tagName.toLowerCase() === 'svg' || el.querySelector('svg')) {
          faviconType = 'globe_svg_generique';
          hasCustomFavicon = false;
          break;
        } else if (el.tagName.toLowerCase() === 'img') {
          faviconType = 'image_favicon';
          hasCustomFavicon = true;
          faviconSrc = el.src;
          break;
        }
      }
    }

    return {
      indexed: true,
      title,
      rect: { x: rect.x, y: rect.y },
      containerRect: container ? {
        x: container.getBoundingClientRect().x,
        y: container.getBoundingClientRect().y,
        width: container.getBoundingClientRect().width,
        height: container.getBoundingClientRect().height
      } : null,
      faviconType,
      hasCustomFavicon,
      faviconSrc
    };
  });

  console.log('Résultat de l\'audit :', audit);

  // Paths
  const latestFullScreenshot = path.join(reportsDir, 'derniere_verification.png');
  const archiveFullScreenshot = path.join(archivesDir, `verification_${fileTimestamp}.png`);
  const latestSnippetScreenshot = path.join(reportsDir, 'dernier_snippet_ezhoraire.png');
  const archiveSnippetScreenshot = path.join(archivesDir, `snippet_${fileTimestamp}.png`);

  await page.screenshot({ path: latestFullScreenshot, fullPage: false });
  fs.copyFileSync(latestFullScreenshot, archiveFullScreenshot);

  // If container found, crop snippet
  if (audit.indexed && audit.containerRect) {
    const scale = 2; // deviceScaleFactor
    const pad = 20;
    const clip = {
      x: Math.max(0, audit.containerRect.x - pad),
      y: Math.max(0, audit.containerRect.y - pad),
      width: Math.min(1280, audit.containerRect.width + pad * 2),
      height: Math.min(1000, audit.containerRect.height + pad * 2)
    };
    await page.screenshot({ path: latestSnippetScreenshot, clip });
    fs.copyFileSync(latestSnippetScreenshot, archiveSnippetScreenshot);
  }

  await browser.close();

  // Update markdown log
  const logFile = path.join(reportsDir, 'journal-verifications.md');
  const faviconStatus = audit.hasCustomFavicon
    ? `✅ **Logo EzHoraire actif** (\`${audit.faviconSrc}\`)`
    : `⏳ **Globe générique Google** (en attente du cache Googlebot-Image)`;

  const entry = `
### Rapport du ${dateStr}
- **Indexé sur Google** : ${audit.indexed ? '✅ Oui (Position #1)' : '❌ Non'}
- **Favicon détecté** : ${faviconStatus}
- **Titre affiché** : *${audit.title || 'N/A'}*
- **Capture du résultat** : [dernier_snippet_ezhoraire.png](file://${latestSnippetScreenshot})
- **Capture complète** : [derniere_verification.png](file://${latestFullScreenshot})

---
`;

  if (!fs.existsSync(logFile)) {
    const header = `# Journal de vérification horaire SEO — EzHoraire sur Google

Ce fichier consigne automatiquement l'état d'indexation et l'affichage du logo EzHoraire sur Google toutes les heures.

---
`;
    fs.writeFileSync(logFile, header + entry, 'utf-8');
  } else {
    const current = fs.readFileSync(logFile, 'utf-8');
    const headerEnd = current.indexOf('---\n') + 4;
    const newContent = current.slice(0, headerEnd) + entry + current.slice(headerEnd);
    fs.writeFileSync(logFile, newContent, 'utf-8');
  }

  console.log(`[${dateStr}] Rapport mis à jour avec succès dans ${logFile}`);

  // Send macOS notification if favicon changed to active!
  if (audit.hasCustomFavicon) {
    try {
      execSync(`osascript -e 'display notification "Le logo EzHoraire est désormais visible sur Google !" with title "EzHoraire SEO"'`);
    } catch (e) {}
  }
}

verifier().catch(err => {
  console.error('Erreur lors de la vérification :', err);
  process.exit(1);
});
