import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  checkQuota,
  consumeUsage,
  type LicenseState,
  type UsageKind,
} from "@/lib/license";

/**
 * Garde d'accès IA — PARTIE 3 : anti-abus + quotas de licence.
 *
 * S'applique aux routes /api/search-jobs, /api/agent/scan,
 * /api/generate-from-url et /api/improve-cv :
 *  1. 5 requêtes/heure par IP pour les visiteurs anonymes (429 en français),
 *  2. quotas du plan FREE vérifiés dans Prisma (403 QUOTA_EXCEEDED),
 *  3. compteur d'usage incrémenté après contrôle.
 *
 * Le client ouvre automatiquement la modale d'abonnement quand il reçoit
 * `{ code: "QUOTA_EXCEEDED" }` (intercepteur du tableau de bord).
 */

/**
 * Indique si une clé GROQ_API_KEY exploitable est configurée.
 * (Historique : cette fonction était dans src/lib/ai.ts ; elle vit ici pour
 * unifier les garde-fous. Les routes l'importent depuis "@/lib/ai-guard".)
 */
export function hasGroqKey(): boolean {
  return Boolean(
    process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 10
  );
}

export interface AiAccessContext {
  userId: string | null;
  email: string | null;
  license: LicenseState | null;
}

export type AiAccessResult =
  | { ok: true; ctx: AiAccessContext }
  | { ok: false; response: NextResponse };

export async function requireAiAccess(
  request: Request,
  kind: UsageKind,
  routeName: string
): Promise<AiAccessResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ?? null;
  const ip = getClientIp(request);

  /* 1. Limite horaire : 5/h pour les anonymes, 5/h pour le plan FREE,
        20/h pour les licences actives (garde-fou anti-spam). */
  const limitPerHour = userId ? 20 : 5;
  const guard = guardRateLimit(request, {
    route: routeName,
    clientId: userId ?? "anon",
    ip,
    limitPerHour,
  });
  if (!guard.ok) return { ok: false, response: guard.response };

  /* 2. Quotas du plan FREE (recherches : 3/mois, dossiers : 2/mois). */
  if (userId) {
    const quota = await checkQuota(userId, kind);
    if (!quota.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: quota.message,
            code: "QUOTA_EXCEEDED",
            reason: quota.reason,
            upgradeUrl: "/pricing",
          },
          { status: 403 }
        ),
      };
    }
    // 3. Consommation immédiate du crédit.
    await consumeUsage(userId, kind);
    return { ok: true, ctx: { userId, email, license: quota.state } };
  }

  return { ok: true, ctx: { userId: null, email: null, license: null } };
}
