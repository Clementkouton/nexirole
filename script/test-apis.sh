#!/bin/bash
# Test complet NexiRole : démarre le serveur si nécessaire puis teste les API.
cd /home/z/my-project

if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/ 2>/dev/null; then
  echo "[*] Démarrage du serveur..."
  setsid bash -c 'cd /home/z/my-project && bun run dev > /dev/null 2>&1 < /dev/null' &
  disown
  for i in $(seq 1 30); do
    sleep 2
    if curl -s -o /dev/null --max-time 3 http://localhost:3000/ 2>/dev/null; then
      echo "[✓] Serveur prêt (attempt $i)"
      break
    fi
  done
else
  echo "[✓] Serveur déjà actif"
fi

echo ""
echo "=== 1. API /api/improve-text ==="
curl -s -X POST http://localhost:3000/api/improve-text \
  -H "Content-Type: application/json" \
  -d '{"label":"Résumé professionnel","text":"je suis dev web je fais du react et du node depuis 4 ans chez acme"}' \
  --max-time 150 | head -c 450
echo ""

echo ""
echo "=== 2. API /api/search-jobs ==="
curl -s -X POST http://localhost:3000/api/search-jobs \
  -H "Content-Type: application/json" \
  -d '{"cvText":"Développeur fullstack avec 5 ans d expérience. React, TypeScript, Node.js, Docker. Chez Acme Corp 2020-2025 : refonte d un SaaS, +30% performance. Master Informatique 2019. Anglais courant.","remoteOnly":true}' \
  --max-time 240 > /tmp/search-result.json
node -e "
const r = require('/tmp/search-result.json');
if (r.error) { console.log('ERREUR:', r.error); process.exit(0); }
console.log('jobs:', r.jobs?.length, '| sources:', JSON.stringify(r.sources), '| engine:', r.engine);
if (r.jobs?.[0]) {
  const j = r.jobs[0];
  console.log('TOP1 ->', j.score + '%', '|', j.title, '@', j.company, '|', j.source);
  console.log('forces:', JSON.stringify((j.strengths||[]).slice(0,2)));
  console.log('lacunes:', JSON.stringify((j.missingSkills||[]).slice(0,3)));
  console.log('conseil:', j.advice);
}
"