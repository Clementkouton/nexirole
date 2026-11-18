import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardRateLimit, getClientIp } from "@/lib/rate-limit";
import { activateUserLicense, validateLicenseKey } from "@/lib/license";

/**
 * PARTIE 1 — Activation manuelle d'une clé de licence Chariow (modale de secours).
 *
 * POST { licenseKey, email }
 *  1. Rate limit 10 requêtes/h par IP,
 *  2. Validation de la clé auprès de l'API officielle Chariow
 *     (GET https://api.chariow.com/v1/licenses/{key}, Bearer CHARIOW_API_KEY),
 *     avec repli sur le journal local ChariowEvent rempli par le webhook,
 *  3. Détermination du plan (BOOST = 30 jours, PRO = 90 jours),
 *  4. Mise à jour Prisma : plan, licenseKey, licenseStatus ACTIVE, expiresAt,
 *     compteurs d'usage remis à zéro.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  licenseKey: z
    .string()
    .trim()
    .min(8, "La clé de licence est trop courte.")
    .max(64, "La clé de licence est trop longue."),
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
});

export async function POST(request: NextRequest) {
  /* 1. Anti-abus : 10 activations/h par IP */
  const ip = getClientIp(request);
  const guard = guardRateLimit(request, {
    route: "license-activate",
    clientId: ip,
    ip,
    limitPerHour: 10,
  });
  if (!guard.ok) return guard.response;

  /* 2. Validation du corps */
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }
  const { licenseKey, email } = parsed.data;

  /* 3. Le compte doit exister (l'utilisateur est connecté sur le dashboard) */
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    return NextResponse.json(
      {
        error:
          "Aucun compte NexiRole n'existe avec cet email. Connectez-vous d'abord, puis réessayez.",
        code: "USER_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  /* 4. Validation de la clé (API Chariow + repli journal webhook) */
  const check = await validateLicenseKey(licenseKey, email);
  if (!check.valid) {
    return NextResponse.json(
      {
        error: check.expired
          ? "Cette clé de licence a expiré. Renouvelez votre abonnement sur la page Tarifs."
          : "Clé de licence invalide ou introuvable chez Chariow. Vérifiez la saisie (aucun espace) ou contactez le support.",
        code: check.expired ? "LICENSE_EXPIRED" : "LICENSE_INVALID",
      },
      { status: 422 }
    );
  }

  const plan = check.plan === "PRO" ? "PRO" : "BOOST";

  /* 5. Activation : compteurs remis à zéro, plan actif */
  const result = await activateUserLicense(user.id, plan, licenseKey, check.expiresAt);

  return NextResponse.json({
    ok: true,
    plan: result.plan,
    licenseStatus: result.licenseStatus,
    expiresAt: result.expiresAt.toISOString(),
    message: `Licence ${plan === "PRO" ? "Carrière Pro" : "Pass Boost"} activée avec succès. Bon courage pour vos candidatures !`,
  });
}
