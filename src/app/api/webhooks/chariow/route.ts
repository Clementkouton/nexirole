import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
 * Contrat officiel Chariow (chariow.dev) :
 *  - POST signé : en-tête `x-chariow-signature: sha256=<hex>` = HMAC-SHA256 du
 *    corps brut avec le secret du Pulse (CHARIOW_WEBHOOK_SECRET, préfixe whsec_),
 *  - idempotence : en-tête `x-pulse-delivery-id` (stable pendant les 5 tentatives),
 *  - événements : successful.sale, license.issued, license.activated,
 *    license.expired, license.nearing_expiry, license.revoked, affiliate.joined…
 *  - payload : { event, license?: {key, status, expires_at…}, product?: {id, name},
 *    customer?: {email, name…}, sale?: {custom_fields, custom_metadata…} }.
 *
 * Comportements :
 *  - ACHAT RÉUSSI / LICENCE ÉMISE : active le compte correspondant à l'email
 *    (le champ personnalisé « email » du checkout NexiRole est lu s'il existe),
 *    ou crée une entrée pré-activée si l'utilisateur s'inscrit juste après.
 *  - REMBOURSEMENT / RÉVOCATION : rétrogradation immédiate vers FREE (REVOKED).
 *  - Chaque événement est journalisé dans ChariowEvent (eventId unique) pour
 *    garantir l'idempotence et éviter les doubles traitements.
 */

export const runtime = "nodejs";

const ACTIVATION_EVENTS = new Set(["successful.sale", "license.issued", "license.activated"]);
const REVOKED_EVENTS = new Set(["license.revoked"]);
const EXPIRED_EVENTS = new Set(["license.expired"]);

interface ChariowPayload {
  event?: string;
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
}

/* ------------------------------------------------------------------ */
/*  Extraction tolérante des champs utiles                             */
/* ------------------------------------------------------------------ */

function resolveEmail(payload: ChariowPayload): string | null {
  const direct = payload.customer?.email?.trim().toLowerCase();
  if (direct) return direct;

  // Champ personnalisé « email » du checkout (liste name/value)
  const customField = payload.sale?.custom_fields?.find((field) =>
    /e[-_ ]?mail/i.test(field.name ?? "")
  )?.value;
  if (customField?.includes("@")) return customField.trim().toLowerCase();

  // Métadonnées personnalisées
  const meta = payload.sale?.custom_metadata?.email;
  if (meta?.includes("@")) return meta.trim().toLowerCase();

  return null;
}

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
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
    const sharedSecretOk =
      request.headers.get("x-webhook-secret") === secret ||
      request.nextUrl.searchParams.get("secret") === secret;
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

  /* 2. Parse du payload */
  let payload: ChariowPayload & Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as ChariowPayload & Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const eventType = payload.event ?? request.headers.get("x-pulse-event") ?? "unknown";
  // Idempotence : x-pulse-delivery-id, sinon empreinte du corps
  const eventId =
    request.headers.get("x-pulse-delivery-id") ??
    `sha-${createHash("sha256").update(rawBody).digest("hex").slice(0, 40)}`;

  /* 3. Idempotence : un événement déjà traité est ignoré silencieusement */
  const existing = await prisma.chariowEvent.findUnique({ where: { eventId } });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  /* 4. Champs métier */
  const email = resolveEmail(payload);
  const licenseKey = payload.license?.key?.trim() ?? null;
  const licenseExpiry = payload.license?.expires_at
    ? new Date(payload.license.expires_at)
    : null;
  const plan: PlanId | null = planFromChariowProduct(
    payload.product?.id,
    payload.product?.name
  );

  /* 5. Journalisation systématique (audit + idempotence) */
  try {
    await prisma.chariowEvent.create({
      data: {
        eventId,
        eventType,
        customerEmail: email,
        licenseKey,
        payload: payload as unknown as import("@/generated/prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Violation de l'unicité eventId = livraison déjà traitée → on sort.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    // Autre erreur (base injoignable…) : 501/500 pour que Chariow retente.
    console.error("[chariow-webhook] journalisation impossible :", error);
    return NextResponse.json(
      { error: "Traitement différé — réessayez plus tard." },
      { status: 500 }
    );
  }

  /* 6. Traitement métier */
  try {
    if (ACTIVATION_EVENTS.has(eventType) && email) {
      const finalPlan: PlanId = plan ?? "BOOST";
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await activateUserLicense(user.id, finalPlan, licenseKey, licenseExpiry);
        console.info(`[chariow-webhook] ${eventType} → licence ${finalPlan} activée pour ${email}.`);
      } else {
        // Utilisateur pas encore inscrit : entrée pré-activée liée à l'email.
        await upsertPreActivatedUser(
          email,
          finalPlan,
          licenseKey,
          licenseExpiry,
          payload.customer?.name ?? null
        );
        console.info(`[chariow-webhook] compte pré-activé créé pour ${email} (${finalPlan}).`);
      }
    } else if (REVOKED_EVENTS.has(eventType) && email) {
      await revokeUserLicenseByEmail(email, "REVOKED");
      console.info(`[chariow-webhook] licence révoquée pour ${email} → plan FREE.`);
    } else if (EXPIRED_EVENTS.has(eventType) && email) {
      await revokeUserLicenseByEmail(email, "EXPIRED");
      console.info(`[chariow-webhook] licence expirée pour ${email} → plan FREE.`);
    } else {
      console.info(`[chariow-webhook] événement ${eventType} journalisé (aucune action).`);
    }
  } catch (error) {
    console.error("[chariow-webhook] erreur de traitement :", error);
    // 200 quand même : Chariow a déjà journalisé, une erreur Prisma ne doit
    // pas déclencher 5 nouvelles tentatives qui re-activeraient deux fois.
  }

  return NextResponse.json({ ok: true });
}
