# NexiRole — Guide de démarrage (VS Code)

Application : assistant carrière IA (recherche d'offres en direct + CV / Lettre / Kit entretien sur mesure).

## Prérequis

- **Node.js 20.9+** (vérifiez avec `node -v`) — https://nodejs.org (version LTS)
- VS Code + un terminal intégré (menu *Terminal > New Terminal*)

## Démarrage en 4 étapes

```bash
# 1. Installer les dépendances (à la racine du projet)
npm install

# 2. Créer le fichier d'environnement
#    - Copiez .env.example en .env.local
#    - Ajoutez votre clé Groq GRATUITE : https://console.groq.com/keys
cp .env.example .env.local

# 3. Lancer le serveur de développement
npm run dev

# 4. Ouvrir http://localhost:3000 dans le navigateur
```

> **Important** : testez d'abord http://localhost:3000 directement.
> Le tunnel VS Code (devtunnels.ms) n'affiche la page que si le serveur local tourne déjà.

## Si `npm run dev` affiche une erreur

| Erreur dans le terminal | Solution |
| --- | --- |
| `next: command not found` / `sh: next: not found` | Lancez `npm install` d'abord |
| `Module not found: Can't resolve 'ai'` (ou autre paquet) | `npm install` puis relancez |
| `EADDRINUSE :::3000` | Un autre programme occupe le port 3000 : fermez-le ou lancez `npm run dev -- -p 3000` |
| Le terminal ne dit pas « ✓ Ready in … » | Lisez le message d'erreur complet et corrigez le fichier indiqué |

Le serveur est démarré **uniquement** quand vous voyez :

```
▲ Next.js 16.x (Turbopack)
- Local:  http://localhost:3000
✓ Ready in 1.2s
```

## Fonctionnalités

1. **`/`** — Landing page (présentation, fonctionnalités, FAQ)
2. **`/dashboard`** — Onglet « Générateur » : collez l'URL d'une offre (ou son texte) + CV PDF (ou profil texte) → CV réécrit + lettre de motivation + kit d'entretien, avec export PDF
3. **`/dashboard`** — Onglet « Recherche live » : offres réelles (Remotive + Arbeitnow) notées de 0 à 100 selon votre profil
4. **`/cv-builder`** — Éditeur de CV guidé, amélioration IA, aperçu PDF en temps réel

## Moteur IA

- Principal : **Groq** `llama-3.3-70b-versatile` — clé **gratuite** sur https://console.groq.com/keys
- Sans clé, l'app reste utilisable : le classement des offres se fait par correspondance de mots-clés locale (moins fin que l'IA).

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · Vercel AI SDK · Groq · Remotive API · Arbeitnow API · pdf-parse · @react-pdf/renderer · Tabler Icons
