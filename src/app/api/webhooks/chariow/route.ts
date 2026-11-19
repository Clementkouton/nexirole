import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  activateUserLicense,
  planFromChariowProduct,
  revokeUserLicenseByEmail,
  upsertPreActivatedUser,
  type PlanId,
} from "@/lib/license";

/**
 * PARTIE 1 — Webhook Chariow « Pulse » : activation automatique + révocation.
 *
 * Contrat Chariow (portail chariow.dev + help.chariow.com) :
 *  - URL à coller dans Chariow : Automatisation → Pulses → Créer un pulse
 *    → champ « Pulse URL ». Recommandation NexiRole (fonctionne quelle que
 *    soit la politique de signature de Chariow) :
 *      https://nexirole.vercel.app/api/webhooks/chariow?secret=VOTRE_SECRET
 *    (VOTRE_SECRET = valeur de CHARIOW_WEBHOOK_SECRET).
 *  - Si Chariow signe le corps : en-tête `x-chariow-signature: sha256=<hex>`
 *    = HMAC-SHA256 du corps brut avec le secret du Pulse.
 *  - Idempotence : en-tête `x-pulse-delivery-id` (stable pendant les
 *    tentatives), sinon empreinte SHA-256 du corps.
 *  - Payload attendu : { event, license?: {key, status, expires_at…},
 *    product?: {id, name}, customer?: {email, name…},
 *    sale?: {custom_fields, custom_metadata…} } — variante imbriquée
 *    { data: { …même forme… } } également acceptée.
 *
 * V2 — détection des événements PAR MOTIFS (et non plus par liste figée) :
 * quels que soient les libellés réels du Pulse (« successful.sale »,
 * « Vente réussie », « license.issued », etc.), une vente / émission de
 * licence déclenche l'activation, un remboursement / litige la révocation,
 * une expiration la rétrogradation. Tout événement inconnu est journalisé
 * dans ChariowEvent (audit) sans action risquée.
 */

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  Classification tolérante des événements                            */
/* ------------------------------------------------------------------ */

/** Remboursement / annulation / litige → révocation immédiate. */
const REVOCATION_PATTERN = /refund|revok|chargeback|dispute|\bvoid\b|cancel/i;
/** Fin de validité côté Chariow → rétrogradation (status EXPIRED). */
const EXPIRY_PATTERN = /expir/i;
/** Tout ce qui est négatif ou neutre ne doit JAMAIS activer une licence. */
const NEGATIVE_PATTERN =
  /refund|revok|chargeback|dispute|\bvoid\b|cancel|expir|fail|error|reject|pending|abandon|unpaid|declin|refund_request/i;
/** Vente réussie, paiement, commande, licence émise / activée… */
const POSITIVE_PATTERN =
  /sale|paid|payment|purchase|order|checkout|success|complete|licen[cs]e|activ|key/i;

interface ChariowPayload {
  event?: string;
  type?: string;
  event_type?: string;
  license?: {
    key?: string;
    status?: string;
    expires_at?: string | null;
  } | null;
  product?: { id?: string; name?: string } | null;
  customer?: { email?: string | null; name?: string | null } | null;
  sale?: {
    custom_fields?: Array<{ name?: string; value?: string }> | null;
    custom_metadata?: Record<string, string> | null;
  } | null;
  /** Variante de payload imbriquée : { data: { …même forme… } } */
  data?: ChariowPayload | null;
}

/* ------------------------------------------------------------------ */
/*  Extraction tolérante des champs utiles                             */
/* ------------------------------------------------------------------ */

function resolveEmail(payload: ChariowPayload): string | null {
  const inspect = (level: ChariowPayload): string | null => {
    const direct = level.customer?.email?.trim().toLowerCase();
    if (direct) return direct;

    // Champ personnalisé « email » du checkout (liste name/value)
    const customField = level.sale?.custom_fields?.find((field) =>
      /e[-_ ]?mail/i.test(field.name ?? "")
    )?.value;
    if (customField?.includes("@")) return customField.trim().toLowerCase();

    // Métadonnées personnalisées
    const meta = level.sale?.custom_metadata?.email;
    if (meta?.includes("@")) return meta.trim().toLowerCase();

    return null;
  };

  return inspect(payload) ?? (payload.data ? inspect(payload.data) : null);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(provided.toLowerCase(), expected.toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  Contrôle de disponibilité (GET) — utile pour vérifier l'URL Pulse   */
/* ------------------------------------------------------------------ */

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "nexirole-chariow-webhook",
    secretConfigured: Boolean(process.env.CHARIOW_WEBHOOK_SECRET?.trim()),
    message:
      "Webhook NexiRole opérationnel. Les événements Chariow Pulse doivent arriver en POST (signés ou ?secret=…).",
  });
}

/* ------------------------------------------------------------------ */
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  /* 1. Authentification du webhook (signature HMAC ou secret partagé) */
  const secret = process.env.CHARIOW_WEBHOOK_SECRET?.trim();
  const signatureHeader =
    request.headers.get("x-chariow-signature") ??
    request.headers.get("x-chariow-signature-sha256");

  if (secret) {
    const signatureOk = verifySignature(rawBody, signatureHeader, secret);
    const sharedHeader = request.headers.get("x-webhook-secret");
    const sharedQuery = request.nextUrl.searchParams.get("secret");
    const sharedSecretOk =
      (sharedHeader !== null && safeEqual(sharedHeader, secret)) ||
      (sharedQuery !== null && safeEqual(sharedQuery, secret));
    if (!signatureOk && !sharedSecretOk) {
      console.warn("[chariow-webhook] signature invalide — requête rejetée.");
      return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error(
      "[chariow-webhook] CHARIOW_WEBHOOK_SECRET absent en production — webhook refusé."
    );
    return NextResponse.json(
      { error: "Webhook non configuré (secret manquant). Ajoutez CHARIOW_WEBHOOK_SECRET." },
      { status: 503 }
    );
  } else {
    console.warn(
      "[chariow-webhook] CHARIOW_WEBHOOK_SECRET absent — requête acceptée en développement uniquement."
    );
  }

  /* 2. Analyse du payload */
  let payload: ChariowPayload;
  try {
    payload = JSON.parse(rawBody) as ChariowPayload;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const eventType = String(
    payload.event ??
      payload.type ??
      payload.event_type ??
      request.headers.get("x-pulse-event") ??
      "unknown"
  );

  // Idempotence : x-pulse-delivery-id, sinon empreinte du corps
  const eventId =
    request.headers.get("x-pulse-delivery-id") ??
    `sha-${createHash("sha256").update(rawBody).digest("hex").slice(0, 40)}`;

  /* 3. Idempotence : un événement déjà traité est ignoré silencieusement */
  const existing = await prisma.chariowEvent.findUnique({ where: { eventId } });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  /* 4. Champs métier (top-level, puis variante imbriquée data: {…}) */
  const email = resolveEmail(payload);
  const license = payload.license ?? payload.data?.license ?? null;
  const product = payload.product ?? payload.data?.product ?? null;
  const customerName = payload.customer?.name ?? payload.data?.customer?.name ?? null;
  const licenseKey = license?.key?.trim() ?? null;
  const licenseExpiry = license?.expires_at ? new Date(license.expires_at) : null;
  const plan: PlanId | null = planFromChariowProduct(product?.id, product?.name);

  /* 5. Journalisation systématique (audit + idempotence) */
  try {
    await prisma.chariowEvent.create({
      data: {
        eventId,
        eventType,
        customerEmail: email,
        licenseKey,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Violation de l'unicité eventId = livraison déjà traitée → on sort.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    // Autre erreur (base injoignable…) : 500 pour que Chariow retente.
    console.error("[chariow-webhook] journalisation impossible :", error);
    return NextResponse.json(
      { error: "Traitement différé — réessayez plus tard." },
      { status: 500 }
    );
  }

  /* 6. Traitement métier selon la nature de l'événement */
  try {
    const isRevocation = REVOCATION_PATTERN.test(eventType);
    const isExpiry = !isRevocation && EXPIRY_PATTERN.test(eventType);
    const isActivation =
      !NEGATIVE_PATTERN.test(eventType) &&
      POSITIVE_PATTERN.test(eventType) &&
      Boolean(email);

    if (isRevocation && email) {
      await revokeUserLicenseByEmail(email, "REVOKED");
      console.info(`[chariow-webhook] ${eventType} → licence révoquée pour ${email}.`);
    } else if (isExpiry && email) {
      await revokeUserLicenseByEmail(email, "EXPIRED");
      console.info(`[chariow-webhook] ${eventType} → licence expirée pour ${email}.`);
    } else if (isActivation) {
      const finalPlan: PlanId = plan ?? "BOOST";
      const user = await prisma.user.findUnique({ where: { email: email as string } });
      if (user) {
        await activateUserLicense(user.id, finalPlan, licenseKey, licenseExpiry);
        console.info(
          `[chariow-webhook] ${eventType} → licence ${finalPlan} activée pour ${email}.`
        );
      } else {
        // Utilisateur pas encore inscrit : entrée pré-activée liée à l'email.
        await upsertPreActivatedUser(
          email as string,
          finalPlan,
          licenseKey,
          licenseExpiry,
          customerName
        );
        console.info(`[chariow-webhook] compte pré-activé créé pour ${email} (${finalPlan}).`);
      }
    } else {
      console.info(`[chariow-webhook] événement « ${eventType} » journalisé (aucune action).`);
    }
  } catch (error) {
    console.error("[chariow-webhook] erreur de traitement :", error);
    // 200 quand même : l'événement est déjà journalisé, une erreur Prisma ne
    // doit pas déclencher 5 nouvelles tentatives qui re-activeraient deux fois.
  }

  return NextResponse.json({ ok: true });
}
