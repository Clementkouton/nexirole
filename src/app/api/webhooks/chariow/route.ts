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
 * PARTIE 1 — Webhook Chariow « Pulse » V3 : activation automatique + révocation.
 *
 * Contrat officiel Chariow (chariow.dev, guides « Pulses » + « Pulse Security ») :
 *  - Configuration : Dashboard Chariow (https://app.chariow.com)
 *      Automatisations → Pulses → Créer un pulse
 *      → champ « Pulse URL » : https://nexirole.vercel.app/api/webhooks/chariow
 *      → événements : successful.sale, license.issued, license.activated,
 *        license.revoked, license.expired (laisser « Appliquer à un produit » vide).
 *  - Signature : en-tête `x-chariow-signature: sha256=<hex>` = HMAC-SHA256 du
 *    corps BRUT avec le secret de signature du Pulse (`whsec_...`, onglet
 *    Overview → Signing secret → Reveal). Ce secret — et NON la clé API —
 *    doit être défini dans Vercel sous CHARIOW_WEBHOOK_SECRET.
 *  - Idempotence : en-tête `x-pulse-delivery-id` (stable pendant les
 *    tentatives de retry), sinon empreinte SHA-256 du corps.
 *  - Retry Chariow : 5 tentatives puis le Pulse est désactivé
 *    automatiquement → toute réponse non-2xx est critique.
 *
 * V3 — corrections majeures :
 *  1. `license.nearing_expiry` n'est PLUS traité comme une expiration : la
 *     licence reste active (simple notification J-7). La V2 rétrogradait
 *     à tort le compte jusqu'à 7 jours avant la fin réelle.
 *  2. Détection du plan à 4 niveaux : ID produit (env) → métadonnée produit
 *     `plan` → nom produit → MONTANT de la vente (4 500 FCFA / 9,90 $ →
 *     BOOST ; 11 000 FCFA / 24,90 $ → PRO) pour survivre à tout renommage.
 *  3. Extraction de l'email client renforcée (customer.email, champs
 *     personnalisés du checkout, métadonnées, URL de checkout).
 *  4. Journalisation riche : chaque livraison trace événement + email + plan
 *     + action pour un débogage direct dans les logs Vercel.
 */

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  Classification des événements (liste officielle + motifs de secours) */
/* ------------------------------------------------------------------ */

/** Événements Chariow officiels qui ACTIVENT une licence. */
const ACTIVATION_EVENTS = new Set([
  "successful.sale",
  "license.issued",
  "license.activated",
]);
/** Événements Chariow officiels qui RÉVOQUENT (remboursement, litige…). */
const REVOCATION_EVENTS = new Set(["license.revoked"]);
/** Événements Chariow officiels de FIN DE VALIDITÉ effective. */
const EXPIRY_EVENTS = new Set(["license.expired"]);
/** Événements officiels SANS ACTION (notification seulement). */
const NO_ACTION_EVENTS = new Set([
  "license.nearing_expiry",
  "abandoned.sale",
  "failed.sale",
  "affiliate.joined",
]);

/** Motifs de secours pour les libellés non officiellement répertoriés. */
const REVOCATION_PATTERN = /refund|revok|chargeback|dispute|\bvoid\b|cancel/i;
const EXPIRY_PATTERN = /expir/i;
const NEGATIVE_PATTERN =
  /refund|revok|chargeback|dispute|\bvoid\b|cancel|expir|fail|error|reject|pending|abandon|unpaid|declin/i;
const POSITIVE_PATTERN =
  /sale|paid|payment|purchase|order|checkout|success|complete|licen[cs]e|activ|key/i;

/* ------------------------------------------------------------------ */
/*  Payload Chariow (formes officielles + variantes tolérées)           */
/* ------------------------------------------------------------------ */

interface ChariowPayload {
  event?: string;
  type?: string;
  event_type?: string;
  note?: string;
  license?: {
    key?: string;
    status?: string;
    expires_at?: string | null;
  } | null;
  product?: {
    id?: string;
    name?: string;
    metadata?: Record<string, unknown> | string | null;
    price?: { value?: number; currency?: string } | null;
  } | null;
  customer?: { email?: string | null; name?: string | null } | null;
  sale?: {
    amount?: { value?: number; currency?: string } | null;
    custom_fields?: Array<{ name?: string; value?: string }> | null;
    custom_metadata?: Record<string, string> | null;
  } | null;
  checkout?: { url?: string | null } | null;
  /** Variante de payload imbriquée : { data: { …même forme… } } */
  data?: ChariowPayload | null;
}

/* ------------------------------------------------------------------ */
/*  Extraction tolérante des champs utiles                             */
/* ------------------------------------------------------------------ */

function pickEmail(level: ChariowPayload): string | null {
  const candidates: unknown[] = [
    level.customer?.email,
    (level as { customer_email?: unknown }).customer_email,
    (level as { email?: unknown }).email,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.includes("@")) {
      return candidate.trim().toLowerCase();
    }
  }

  // Champ personnalisé « email » saisi sur le checkout (liste name/value)
  const customField = level.sale?.custom_fields?.find((field) =>
    /e[-_ ]?mail/i.test(field.name ?? "")
  )?.value;
  if (customField?.includes("@")) return customField.trim().toLowerCase();

  // Métadonnées personnalisées de la vente
  const meta = level.sale?.custom_metadata?.email;
  if (typeof meta === "string" && meta.includes("@")) {
    return meta.trim().toLowerCase();
  }

  // Paramètre email de l'URL de checkout (données pré-remplies Chariow)
  const checkoutUrl = level.checkout?.url;
  if (checkoutUrl) {
    try {
      const parsed = new URL(checkoutUrl);
      const fromQuery = parsed.searchParams.get("email");
      if (fromQuery?.includes("@")) return fromQuery.trim().toLowerCase();
    } catch {
      // URL de checkout invalide : on ignore
    }
  }

  return null;
}

function resolveEmail(payload: ChariowPayload): string | null {
  return pickEmail(payload) ?? (payload.data ? pickEmail(payload.data) : null);
}

/* ------------------------------------------------------------------ */
/*  Détection du plan — 4 niveaux de recoupement                       */
/* ------------------------------------------------------------------ */

/** Tarifs officiels NexiRole (page /pricing). */
const PRICE_BOOK: Array<{ target: number; currency: string; plan: PlanId }> = [
  { target: 4500, currency: "XOF", plan: "BOOST" },
  { target: 11000, currency: "XOF", plan: "PRO" },
  { target: 9.9, currency: "USD", plan: "BOOST" },
  { target: 24.9, currency: "USD", plan: "PRO" },
];

/** FCFA dans l'UI Chariow = code ISO XOF (on accepte les deux libellés). */
function normalizeCurrency(currency?: string | null): string {
  const value = (currency ?? "").trim().toUpperCase();
  if (value === "FCFA" || value === "XAF") return "XOF";
  return value;
}

function planFromAmount(
  amount?: { value?: number; currency?: string } | null
): PlanId | null {
  if (!amount || typeof amount.value !== "number" || amount.value <= 0) {
    return null;
  }
  const currency = normalizeCurrency(amount.currency);
  for (const entry of PRICE_BOOK) {
    if (entry.currency !== currency) continue;
    const tolerance = currency === "XOF" ? 100 : 0.5;
    if (Math.abs(amount.value - entry.target) <= tolerance) return entry.plan;
  }
  return null;
}

/** product.metadata peut être un objet { plan: "pro" } ou une chaîne JSON. */
function planFromProductMetadata(
  metadata: Record<string, unknown> | string | null | undefined
): PlanId | null {
  if (!metadata) return null;
  let object: Record<string, unknown> | null = null;
  if (typeof metadata === "string") {
    try {
      object = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof metadata === "object") {
    object = metadata;
  }
  const plan = object?.plan ?? object?.nexirole_plan;
  if (typeof plan !== "string") return null;
  const value = plan.trim().toLowerCase();
  if (value === "pro") return "PRO";
  if (value === "boost") return "BOOST";
  return null;
}

function resolvePlan(
  payload: ChariowPayload,
  product: ChariowPayload["product"]
): PlanId | null {
  const level = payload.data ? { ...payload.data, ...payload } : payload;

  // 1. Correspondance exacte par ID produit (env Vercel)
  const byId = planFromChariowProduct(product?.id, null);
  if (byId) return byId;

  // 2. Métadonnée produit « plan » définie dans Chariow
  const byMetadata = planFromProductMetadata(product?.metadata);
  if (byMetadata) return byMetadata;

  // 3. Nom du produit (Pass Boost / Carrière Pro…)
  const byName = planFromChariowProduct(null, product?.name);
  if (byName) return byName;

  // 4. Montant de la vente (4500 FCFA / 9,90 $ → BOOST ; 11000 / 24,90 → PRO)
  const byAmount =
    planFromAmount(level.sale?.amount) ?? planFromAmount(product?.price);
  return byAmount;
}

/* ------------------------------------------------------------------ */
/*  Vérification de la signature (contrat officiel Pulse Security)      */
/* ------------------------------------------------------------------ */

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
  const provided = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(provided, expected);
}

/* ------------------------------------------------------------------ */
/*  Contrôle de disponibilité (GET) — utile pour vérifier l'URL Pulse   */
/* ------------------------------------------------------------------ */

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "nexirole-chariow-webhook",
    version: "v3",
    secretConfigured: Boolean(process.env.CHARIOW_WEBHOOK_SECRET?.trim()),
    message:
      "Webhook NexiRole opérationnel. Les événements Chariow Pulse arrivent en POST, signés (x-chariow-signature) ou ?secret=….",
  });
}

/* ------------------------------------------------------------------ */
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  /* 1. Authentification du webhook (signature HMAC du corps brut) */
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
      console.error(
        "[chariow-webhook] signature invalide — vérifiez que CHARIOW_WEBHOOK_SECRET contient bien le secret de signature du Pulse (whsec_…) et NON la clé API."
      );
      return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error(
      "[chariow-webhook] CHARIOW_WEBHOOK_SECRET absent en production — webhook refusé. Ajoutez le secret de signature du Pulse (whsec_…) dans Vercel puis redéployez."
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
  const plan = resolvePlan(payload, product);

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
    // 6a. Payload de TEST Chariow (« Send a test pulse ») : la doc officielle
    //     garantit la présence d'un champ `note` et d'identifiants test_…
    //     → journalisation uniquement, jamais d'activation.
    const isChariowTest =
      (typeof payload.note === "string" && payload.note.length > 0) ||
      eventType.startsWith("test.");

    let action: "activate" | "revoke" | "expire" | "none" = "none";
    if (isChariowTest) action = "none";
    else if (ACTIVATION_EVENTS.has(eventType)) action = "activate";
    else if (REVOCATION_EVENTS.has(eventType)) action = "revoke";
    else if (EXPIRY_EVENTS.has(eventType)) action = "expire";
    else if (NO_ACTION_EVENTS.has(eventType)) action = "none";
    else {
      // 6b. Motifs de secours pour un libellé non officiel
      if (REVOCATION_PATTERN.test(eventType)) {
        action = "revoke";
      } else if (
        EXPIRY_PATTERN.test(eventType) &&
        !/nearing/i.test(eventType) &&
        !/before|upcoming|soon|remind/i.test(eventType)
      ) {
        action = "expire";
      } else if (!NEGATIVE_PATTERN.test(eventType) && POSITIVE_PATTERN.test(eventType)) {
        action = "activate";
      }
    }

    if (action === "revoke" && email) {
      await revokeUserLicenseByEmail(email, "REVOKED");
      console.info(
        `[chariow-webhook] ${eventType} → licence RÉVOQUÉE pour ${email}.`
      );
    } else if (action === "expire" && email) {
      await revokeUserLicenseByEmail(email, "EXPIRED");
      console.info(
        `[chariow-webhook] ${eventType} → licence EXPIRÉE pour ${email}.`
      );
    } else if (action === "activate" && email) {
      const finalPlan: PlanId = plan ?? "BOOST";
      const user = await prisma.user.findUnique({ where: { email: email as string } });
      if (user) {
        await activateUserLicense(user.id, finalPlan, licenseKey, licenseExpiry);
        console.info(
          `[chariow-webhook] ${eventType} → plan ${finalPlan} ACTIVÉ pour ${email}` +
            (licenseExpiry ? ` jusqu'au ${licenseExpiry.toISOString()}` : "") +
            (product?.id ? ` (produit ${product.id})` : "") +
            "."
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
        console.info(
          `[chariow-webhook] compte pré-activé créé pour ${email} (${finalPlan}) — sera adopté à l'inscription.`
        );
      }
    } else {
      console.info(
        `[chariow-webhook] « ${eventType} » journalisé sans action` +
          (email ? ` (client ${email})` : " (pas d'email client dans le payload — test Chariow ?)") +
          `.`
      );
    }
  } catch (error) {
    console.error("[chariow-webhook] erreur de traitement :", error);
    // 200 quand même : l'événement est déjà journalisé, une erreur Prisma ne
    // doit pas déclencher 5 nouvelles tentatives qui re-activeraient deux fois.
  }

  return NextResponse.json({ ok: true });
}