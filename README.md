# NexiRole — Générateur de CV & Agent de Recherche d'Emploi IA

**NexiRole** est une application web propulsée par Next.js et l'intelligence artificielle qui aide les candidats à optimiser leur CV et à identifier automatiquement les offres d'emploi les plus pertinentes en direct.

## Fonctionnalités principales
* **Lecture & Analyse de CV PDF :** Extraction intelligente des compétences et du parcours.
* **Recherche d'offres en direct :** Interrogation en temps réel des API publiques **Remotive** et **Arbeitnow** (sans clé payante).
* **Classement par pertinence (Match Score) :** Évaluation sémantique via **Llama 3.3 (Groq)** avec calcul d'un score sur 100, points forts, lacunes et conseils d'adaptation.
* **Générateur de CV PDF :** Création et exportation de CV structurés compatibles ATS.

## Stack Technique (100 % Gratuite)
* **Framework :** Next.js 16 (App Router, TypeScript)
* **Design & Icônes :** Tailwind CSS v4, Tabler Icons
* **Intelligence Artificielle :** Vercel AI SDK + Groq (`llama-3.3-70b-versatile`)
* **Sources d'offres :** Remotive API & Arbeitnow API
* **Traitement PDF :** `pdf-parse` & `@react-pdf/renderer`

## Installation locale

1. Cloner le dépôt :
   ```bash
   git clone https://github.com
   cd nexirole
   ```

2. Installer les dépendances :
   ```bash
   npm install
   ```

3. Configurer les variables d'environnement :
   Copiez `.env.example` vers `.env.local` et ajoutez votre clé gratuite Groq :
   ```env
   GROQ_API_KEY="votre_cle_groq"
   ```

4. Lancer le serveur de développement :
   ```bash
   npm run dev
   ```
