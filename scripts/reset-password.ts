// scripts/reset-password.ts — OUTIL TEMPORAIRE, à supprimer après usage
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const email = process.argv[2]?.toLowerCase().trim();
const newPassword = process.argv[3];

if (!email || !newPassword || newPassword.length < 8) {
  console.error("Usage : npx tsx scripts/reset-password.ts <email> <nouveauMotDePasse>");
  process.exit(1);
}

async function main() {
  const hash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Aucun utilisateur pour ${email}`);
    process.exit(1);
  }
  // Champ « password » ; si votre schéma l'appelle « passwordHash », changez la clé
  await prisma.user.update({ where: { email }, data: { password: hash } });
  console.log(`Mot de passe réinitialisé (bcrypt, 12 rounds) pour ${email}`);
  await prisma.$disconnect();
}

void main();