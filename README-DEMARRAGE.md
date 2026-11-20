# ==============================================================================
# RÈGLES PERMANENTES & ARCHITECTURE OFFICIELLE — PROJET NEXIROLE
# ==============================================================================
# Ce fichier fait autorité sur toutes les générations de code dans ce dépôt.
# Toute modification doit respecter strictement ces contraintes sans exception.

## 1. COMPORTEMENT STRICT DE L'AGENT IA (ANTI-RÉGRESSION)
1. **Modifications chirurgicales uniquement :** Ne réécris JAMAIS un fichier entier si seule une fonction, un style ou un bug doit être corrigé. Produis un diff minimal et ciblé.
2. **Préservation absolue de l'existant :** Interdiction de supprimer, renommer ou casser les routes API, les modèles Prisma, les webhooks Chariow, les templates PDF ou l'authentification déjà en place.
3. **Zéro placeholder :** Ne laisse jamais de `// TODO`, `// ... reste du code` ou de fonctions vides. Tout code écrit doit être 100 % fonctionnel et typé.
4. **Hygiène Git & Sécurité :** Ne place JAMAIS de vraies clés API dans `.env.example` ou dans le code source. Les fichiers `.env.local` et `*.bak` doivent rester strictement ignorés par Git.
5. **Validation obligatoire :** Avant de conclure une tâche, vérifie l'absence d'erreurs d'hydratation React (imbrications HTML invalides, composants PDF chargés en SSR) et assure-toi que le typage TypeScript compile proprement.

---

## 2. STACK TECHNIQUE & CONTRAINTES LOGICIELLES
- **Framework :** Next.js 16 (App Router, dossier `src/`, TypeScript strict).
- **Styles :** Tailwind CSS v4 (`src/app/globals.css`).
- **Icônes :** Utiliser **EXCLUSIVEMENT** `@tabler/icons-react`. **INTERDICTION ABSOLUE** d'importer `lucide-react` (même si les templates d'inspiration l'utilisent à l'origine, toujours convertir vers `@tabler/icons-react`).
- **Base de données & ORM :** Prisma (avec `prisma/schema.prisma` et `prisma.config.ts`).
- **Moteur IA Gratuit :** Vercel AI SDK (`ai` + `@ai-sdk/groq`) avec le modèle `llama-3.3-70b-versatile` via `process.env.GROQ_API_KEY`.
- **APIs Emploi Gratuites (sans clé) :**
  - `https://remotive.com`
  - `https://arbeitnow.com`
- **Génération & Lecture PDF :**
  - Parsing : `pdf-parse` (déclaré dans `serverExternalPackages` de `next.config.ts`).
  - Génération PDF A4 : `@react-pdf/renderer` (chargé strictement côté client via `"use client"` ou `dynamic(..., { ssr: false })`).
- **Monétisation :** Licences officielles **Chariow** (`https://chariow.com`, `CHARIOW_API_KEY`, `CHARIOW_WEBHOOK_SECRET`).

---

## 3. IDENTITÉ VISUELLE & DESIGN SYSTEM NEXIROLE
- **Couleur Primaire :** Bleu Marine Profond `#051937` (boutons principaux, titres majeurs, éléments actifs de navigation, bordures d'accent).
- **Couleur Secondaire / Accent :** Jaune Or Vif `#FFC107` (soulignements, badges IA, icônes clés, indicateurs de score élevé, flèches directionnelles).
- **Surfaces & Fonds :**
  - Arrière-plan global : Gris Glace `#F8FAFC`.
  - Cartes & Conteneurs : Blanc Pur `#FFFFFF` avec bordures fines `1px solid #E2E8F0` (`border-slate-200`) et ombres légères (`shadow-sm`).
  - Textes : `#051937` (principal), `#475569` / `#64748B` (secondaire).
- **Badges de Score ATS :**
  - Score élevé (`>= 80%`) : Vert Émeraude (`bg-emerald-50 text-emerald-700 border-emerald-200`).
  - Score moyen (`55% - 79%`) : Ambre (`bg-amber-50 text-amber-800 border-amber-300`).
  - Score faible (`< 55%`) : Corail (`bg-rose-50 text-rose-700 border-rose-200`).
- **Logo :** Fichiers situés dans `public/` (`Logo-NexiRole-Mobile.png` / `logo.png`), toujours affichés sur fond clair (`#FFFFFF` ou `#F8FAFC`).

---

## 4. ARCHITECTURE DE LA LANDING PAGE (`src/app/page.tsx`)
**Inspiration obligatoire :** Template *Taskly - Task Management SaaS* (`@getastrothemes/templates/taskly-task-management-saas-astro-theme` sur 21st.dev).

La page d'accueil doit conserver une structure SaaS moderne, ultra-aérée, modulaire et orientée conversion :
1. **Navbar Sticky :** Logo NexiRole à gauche, liens d'ancrage (*Fonctionnalités*, *Générateur par Lien*, *Agent de Recherche*, *Tarifs* `/pricing`, *FAQ*), et bouton CTA `#051937` *"Lancer l'Assistant"*.
2. **Hero Section (Style Taskly) :**
   - Badge supérieur pilule avec icône `IconSparkles` (`#FFC107`) : *"Assistant carrière IA — propulsé par Llama 3.3 (Groq)"*.
   - Titre H1 en `Plus Jakarta Sans` extrabold `#051937` avec mot-clé souligné par un trait épais Jaune Or `#FFC107`.
   - Double CTA (*Lancer l'Assistant* -> `/dashboard` et *Voir comment ça marche*).
   - **Aperçu interactif du produit intégré sous le Hero :** Maquette interactive d'interface SaaS montrant des offres scannées en direct (Remotive/Arbeitnow), un score de compatibilité (`87/100`), les points forts et les mots-clés ATS cliquables.
3. **Grille Bento des 4 Fonctionnalités Clés :**
   - Carte 1 : *Candidature Express par Lien d'Offre* (URL -> CV + Lettre + Kit Entretien).
   - Carte 2 : *Agent de Recherche en Direct* (Scan automatique Remotive & Arbeitnow par mots-clés extraits du CV).
   - Carte 3 : *Scoring ATS & Analyse des Lacunes* (Note sur 100 + mots-clés manquants).
   - Carte 4 : *Export PDF Haute Précision* (4 templates ATS avec/sans photo de profil).
4. **Section « Comment ça marche » :** 3 étapes numérotées (`01`, `02`, `03`) sur cartes blanches épurées.
5. **Section FAQ Accordéon :** Questions-réponses interactives sur la gratuité, la non-invention d'expérience, la compatibilité ATS et le mode texte de secours.
6. **Données structurées SEO (JSON-LD) & Footer complet :** Schéma `SoftwareApplication` pour Google + pied de page structuré en colonnes.

---

## 5. ARCHITECTURE DU DASHBOARD (`src/app/dashboard/page.tsx` & `src/components/ui/app-dashboard-shell.tsx`)
**Inspiration obligatoire :** Composant *App Dashboard Shell* (`@isaiahbjork/components/app-dashboard-shell` sur 21st.dev).

L'espace de travail doit reproduire l'ergonomie professionnelle d'**App Dashboard Shell** adaptée à NexiRole :
1. **Sidebar Rétractable (Collapsible Sidebar -> Drawer sur mobile) :**
   - En-tête avec Logo NexiRole et badge du plan actif (`Découverte`, `Pass Boost`, `Carrière Pro`).
   - Navigation principale (icônes `@tabler/icons-react`) :
     - *Vue d'ensemble & Scores* (KPIs + Graphique + Tableau triable des offres)
     - *CV & Lettre par Lien d'Offre* (Mode URL ou Texte libre)
     - *Agent Recherche en Direct* (Scan Remotive & Arbeitnow)
     - *Créateur de CV PDF* (Lien vers `/cv-builder`)
     - *Mon Historique & Suivi* (Dossiers sauvegardés + Job Tracker Prisma)
   - Pied de sidebar : Carte d'état du CV PDF de référence chargé + bouton *"Activer une licence Chariow"* ouvrant la modale d'activation.
2. **Header Supérieur du Dashboard :**
   - Bouton de repli de la sidebar (`IconLayoutSidebarLeftCollapse`), barre de recherche globale filtrant instantanément les offres et dossiers, indicateur de quota restant et bouton d'importation rapide de CV PDF.
3. **4 Cartes KPI avec Mini-Graphiques (Sparklines SVG) :**
   - *Offres analysées en direct*
   - *Score moyen de compatibilité (%)*
   - *Offres haute pertinence (`>= 80%`)*
   - *Dossiers (CV + Lettres) générés*
4. **Visualisation Analytique avec Bascule Vue Graphique / Vue Tableau :**
   - Graphique d'évolution et répartition des scores par source (Remotive vs Arbeitnow) avec bouton bascule (`Toggle`) entre le graphique et le tableau détaillé.
5. **Tableau Triable et Filtrable des Offres Classées (Adaptation de `DashboardOrder`) :**
   - Colonnes : Rang (`#1`), Intitulé du poste & Entreprise, Source (`Remotive` / `Arbeitnow`), Score de compatibilité (`0-100%`), Statut ATS, et Actions rapides (*Générer CV & Lettre*, *Voir l'offre*, *Ajouter au suivi*).

---

## 6. RÈGLES MÉTIER DES FONCTIONNALITÉS PRINCIPALES
1. **Recherche Automatique par Mots-Clés du CV (`/api/search-jobs`) :**
   - Si le champ de recherche est vide, extraire automatiquement via Groq le titre de poste principal et les 3 mots-clés techniques forts du CV avant d'interroger Remotive et Arbeitnow.
   - Afficher les mots-clés déduits sous forme de badges dans l'interface.
2. **Génération de Dossier Complet (`/api/generate-from-url`) :**
   - Extraire le texte de l'URL fournie (avec bascule automatique vers le champ texte manuel si le site cible bloque le scraping).
   - **Règle d'intégrité stricte :** L'IA ne doit JAMAIS inventer d'entreprise, de diplôme, de date ou de compétence absente du CV d'origine.
   - Produire un JSON structuré contenant : le CV optimisé, la lettre de motivation sur mesure, et le kit d'entretien (3 questions probables + réponses structurées + messages courts LinkedIn et Email).
3. **Sélecteur de 4 Templates ATS (Avec & Sans Photo) & Export PDF A4 :**
   - Proposer 4 styles compatibles ATS (inspirés de Teal HQ) :
     1. `modern-accent` (*Modern Color Accent* — Tech & Startups)
     2. `sleek-executive` (*Sleek Executive* — Finance, Droit & Direction)
     3. `bold-minimalism` (*Bold Minimalism* — Design, Produit & Consulting)
     4. `clean-balanced` (*Clean Balanced ATS* — Profils Seniors & Multi-secteurs)
   - Inclure un interrupteur **Avec Photo / Sans Photo** (avec upload JPG/PNG) et une prévisualisation en direct.
   - Exporter en vrais fichiers **PDF A4** (`CV_NexiRole.pdf`, `Lettre_NexiRole.pdf`, `Kit_Entretien_NexiRole.pdf`) via `@react-pdf/renderer`.
4. **Monétisation Chariow & Quotas Prisma :**
   - Plans gérés dans Prisma (`User` / `LicenseSubscription`) : `FREE` (3 recherches/mois, 2 dossiers/mois), `BOOST` (30 jours, recherches illimitées, 30 dossiers/mois), `PRO` (90 jours, tout illimité).
   - Synchronisation automatique via `/api/webhooks/chariow` (vérification `CHARIOW_WEBHOOK_SECRET`, idempotence via `ChariowEvent`) et activation manuelle via `/api/license/activate` (`CHARIOW_API_KEY`).
   - Redirection post-paiement gérée sur `/dashboard?payment=success`.
5. **Sécurité, Validation & Protection Anti-Abus :**
   - **Validation stricte des fichiers PDF (`src/lib/file-security.ts`) :** Vérifier côté serveur que tout fichier importé pèse au maximum **5 Mo**, possède le type MIME `application/pdf` et commence obligatoirement par les octets magiques `%PDF-` (*magic bytes*) avant d'appeler `pdf-parse`.
   - **Rate Limiting (`src/lib/rate-limit.ts`) :** Limiter les requêtes anonymes ou gratuites à **5 requêtes par heure et par IP** sur les routes coûteuses (`/api/search-jobs`, `/api/generate-from-url`, `/api/license/activate`) avec renvoi d'un code HTTP `429 Too Many Requests` et un message clair en français.
   - **Nettoyage des entrées (Anti-Prompt Injection) :** Tronquer et nettoyer le texte extrait des CV et des pages web avant de l'injecter dans les prompts Groq.
   - **En-têtes HTTP (`next.config.ts`) :** Maintenir `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` et `serverExternalPackages: ["pdf-parse"]`.

6. **Référencement (SEO) & Acquisition :**
   - **Métadonnées (`src/app/layout.tsx`) :** Définir `metadataBase: new URL("https://vercel.app")`, les titres dynamiques, la description optimisée, ainsi que les balises `openGraph` et `twitter` (`summary_large_image`).
   - **OpenGraph dynamique (`src/app/opengraph-image.tsx`) :** Générer une carte visuelle aux couleurs de NexiRole (`#051937` et `#FFC107`) pour les partages sur LinkedIn, WhatsApp et X.
   - **Indexation Google :** Maintenir `src/app/sitemap.ts` (incluant `/`, `/pricing`, `/cv-builder`, `/dashboard`) et `src/app/robots.ts` (bloquant `/api/` et les routes privées).
   - **Données structurées JSON-LD :** Conserver le script `application/ld+json` de type `SoftwareApplication` sur `src/app/page.tsx`.

---

## 7. CARTOGRAPHIE DES FICHIERS DU PROJET (NE PAS FRAGMENTER)
Respecte scrupuleusement l'arborescence suivante pour éviter de créer des fichiers doublons :
- `prisma/schema.prisma` & `prisma.config.ts` : Modèles `User`, `SavedResume`, `GeneratedApplication`, `JobApplicationTracker`, `ChariowEvent`.
- `src/types/nexirole.ts` : Types TypeScript partagés (CV structuré, templates ATS, rapports d'offres, licences).
- `src/lib/rate-limit.ts` & `src/lib/file-security.ts` : Sécurité des API et validation PDF.
- `src/components/ui/app-dashboard-shell.tsx` : Structure du tableau de bord inspirée d'Isaiah Bjork (convertie en `@tabler/icons-react`).
- `src/components/TemplateSelector.tsx` : Sélecteur interactif des 4 templates ATS + bascule Avec/Sans photo.
- `src/components/pdf/` :
  - `ResumePdfTemplates.tsx` (Rendu PDF A4 du CV)
  - `CoverLetterPdfTemplates.tsx` (Rendu PDF A4 de la lettre de motivation)
  - `InterviewKitPdf.tsx` (Rendu PDF A4 du kit d'entretien)
- `src/app/api/` :
  - `search-jobs/route.ts` (Extraction auto des mots-clés + Remotive + Arbeitnow + Scoring Groq)
  - `generate-from-url/route.ts` (Scraping URL / texte manuel + Génération JSON structuré)
  - `license/activate/route.ts` (Vérification/activation clé via API Chariow)
  - `webhooks/chariow/route.ts` (Écoute des événements Pulse Chariow + mise à jour Prisma)
  - `history/route.ts` & `tracker/route.ts` (Sauvegarde et suivi des candidatures)
- `src/app/` :
  - `page.tsx` (Landing page complète style Taskly)
  - `dashboard/page.tsx` (Espace de travail complet)
  - `cv-builder/page.tsx` (Créateur de CV guidé de zéro)
  - `pricing/page.tsx` (Grille tarifaire FCFA / USD avec redirection Chariow)

---

## 8. RÈGLES DE DÉPLOIEMENT VERCEL & PRISMA
1. **Build Script (`package.json`) :** Le script `build` doit toujours exécuter `prisma generate && next build` pour éviter les erreurs de client Prisma manquant sur Vercel.
2. **Protection SSR :** Tout composant appelant `@react-pdf/renderer` (`PDFDownloadLink`, `pdf()`, `BlobProvider`) doit impérativement être isolé côté client (`"use client"` + import dynamique `{ ssr: false }`) afin de ne jamais bloquer le pré-rendu statique de Next.js 16.
3. **Vérification des URLs API :** Utiliser les endpoints complets `https://remotive.com`, `https://arbeitnow.com` et `https://chariow.com` (ne jamais tronquer les chemins d'API).

