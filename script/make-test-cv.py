"""Génère un CV PDF de test pour l'upload dans l'agent de recherche."""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

PATH = "/home/z/my-project/scripts/test-cv-marie.pdf"

text_lines = [
    "Marie Dupont — Senior Frontend Engineer",
    "Paris, France — marie.dupont@email.com — +33 6 12 34 56 78",
    "linkedin.com/in/mariedupont",
    "",
    "PROFIL PROFESSIONNEL",
    "Developpeuse frontend senior avec 6 ans d experience, specialisee React,",
    "TypeScript, Next.js et Node.js. Refonte de plateformes SaaS analytics,",
    "design systems, tests Jest et Playwright, CI/CD GitHub Actions, Docker.",
    "",
    "EXPERIENCES PROFESSIONNELLES",
    "Senior Frontend Engineer — Acme Corp (2020 - Aujourd'hui)",
    "- Refonte du front-end SaaS analytics en React/TypeScript : -40% de temps",
    "  de chargement, adoption de Next.js et d une architecture modularisee.",
    "- Mise en place d un design system partage (Storybook, Tailwind, a11y).",
    "- Encadrement de deux developpeurs juniors et revues de code.",
    "Developpeuse Frontend — AgenceWeb (2018 - 2020)",
    "- Applications web React/Node.js pour des clients retail et bancaire.",
    "- Integration REST API, tests unitaires Jest, deploiement Docker.",
    "",
    "COMPETENCES",
    "React, TypeScript, JavaScript ES6, Next.js, Node.js, Express, REST API,",
    "GraphQL, Jest, Playwright, Docker, Kubernetes, Git, GitHub Actions, CI/CD,",
    "AWS, Tailwind CSS, Storybook, accessibilite, agilite Scrum.",
    "",
    "FORMATION",
    "Master Informatique — Universite Paris-Saclay (2018 - 2020)",
    "Licence Informatique — Universite Paris Diderot (2015 - 2018)",
    "",
    "LANGUES",
    "Francais : langue maternelle — Anglais : C1 courant",
]

c = canvas.Canvas(PATH, pagesize=A4)
width, height = A4
y = height - 60
for line in text_lines:
    c.setFont("Helvetica", 10)
    c.drawString(50, y, line)
    y -= 16
c.save()
print("PDF créé :", PATH)
