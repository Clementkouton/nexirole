import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ============================================================
// Webhook Chariow (Pulses) — activation automatique BOOST / PRO
// Événements officiels Chariow (chariow.dev) :
//   successful.sale | license.activated | license.issued  → activation
//   license.expired | license.revoked                     → journalisés
//   abandoned.sale  | failed.sale                         → ignorés
// Compatibilité conservée : payment.succeeded (payloads de test).
// Signature HMAC-SHA256 vérifiée si CHARIOW_PULSE_SECRET est défini.
// ============================================================

const PLANS: Record<string, { plan: "BOOST" | "PRO"; days: number }> = {
  boost: { plan: "BOOST", days: 30 },
  pro: { plan: "PRO", days: 90 },
};

const ACTIVATION_EVENTS = new Set([
  "successful.sale",
  "license.activated",
  "license.issued",
  "payment.succeeded", // compatibilité tests manuels
  "payment.success",
]);

const SILENT_EVENTS = new Set([
  "abandoned.sale",
  "failed.sale",
  "license.expired",
  "license.revoked",
]);

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

// Recherche en profondeur d'une clé dans un JSON arbitraire (payload variable)
function deepFind(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFind(item, keys);
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (key in record && record[key] !== null && record[key] !== "") return record[key];
  }
  for (const child of Object.values(record)) {
    const found = deepFind(child, keys);
    if (found !== undefined && found !== null && found !== "") return found;
  }
  return undefined;
}

// Plan à partir du produit Chariow : metadata.plan > url > name > handle legacy
function resolvePlan(payload: Record<string, unknown>): { plan: "BOOST" | "PRO"; days: number } | null {
  const data = payload.data as Record<string, unknown> | undefined;
  const product = (payload.product ?? data?.product ?? {}) as Record<string, unknown>;

  const candidates: string[] = [];

  // 1) metadata du produit Chariow — recommandé : {"plan": "boost"}
  const meta = product.metadata;
  if (typeof meta === "string") {
    try {
      candidates.push(toText((JSON.parse(meta) as Record<string, unknown>)?.plan));
    } catch {
      /* metadata non JSON */
    }
  } else if (meta && typeof meta === "object") {
    candidates.push(toText((meta as Record<string, unknown>).plan));
  }

  // 2) URL produit : https://boutique.mychariow.com/nexirole-pass-boost
  const url = toText(product.url);
  if (url) candidates.push(url.split("?")[0].split("/").pop() ?? "");

  // 3) Nom du produit : "NexiRole Pass Boost (30 jours)"
  candidates.push(toText(product.name));

  // 4) Compatibilité legacy : product.handle / slug
  candidates.push(toText(deepFind(product, ["handle", "slug"])));

  for (const candidate of candidates) {
    const text = candidate.toLowerCase();
    if (!text) continue;
    if (/\bboost\b/.test(text)) return PLANS.boost;
    if (/\bpro\b/.test(text)) return PLANS.pro;
  }
  return null;
}

// Signature officielle : "sha256=" + hex(HMAC-SHA256(corps brut, whsec_...))
function verifySignature(request: NextRequest, raw: string): boolean {
  const secret = process.env.CHARIOW_PULSE_SECRET;
  if (!secret) {
    console.warn("[Chariow] CHARIOW_PULSE_SECRET non configuré — signature non vérifiée");
    return true;
  }
  const received = (request.headers.get("x-chariow-signature") ?? "")
    .replace(/^sha256=/, "")
    .trim();
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();

  let payload: Record<string, unknown>;
  try {
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    console.error("[Chariow] Payload JSON invalide :", raw.slice(0, 500));
    return NextResponse.json({ ok: false, error: "payload JSON invalide" }, { status: 400 });
  }

  const eventName = toText(payload.event ?? payload.type).toLowerCase();
  const deliveryId =
    request.headers.get("x-pulse-delivery-id") ??
    `hash-${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40)}`;

  console.log(`[Chariow] Pulse reçu — event="${eventName || "(inconnu)"}" — delivery=${deliveryId}`);
  console.log(`[Chariow] Payload brut : ${raw.slice(0, 2000)}`);

  if (!verifySignature(request, raw)) {
    console.error("[Chariow] Signature invalide — 401");
    return NextResponse.json({ ok: false, error: "signature invalide" }, { status: 401 });
  }

  if (!eventName || SILENT_EVENTS.has(eventName)) {
    return NextResponse.json({ ok: true, deliveryId, ignored: eventName || "(sans event)" });
  }

  if (!ACTIVATION_EVENTS.has(eventName)) {
    console.warn(`[Chariow] Événement non géré : ${eventName}`);
    return NextResponse.json({ ok: true, deliveryId, ignored: eventName });
  }

  // 1) Email client — customer.email (officiel) ou n'importe où (compatibilité)
  const customer = payload.customer as Record<string, unknown> | undefined;
  const email = toText(customer?.email ?? deepFind(payload, ["email"])).toLowerCase().trim();
  if (!email) {
    console.warn("[Chariow] Aucun email client dans le payload");
    return NextResponse.json({ ok: true, deliveryId, warning: "email client introuvable" });
  }

  // 2) Produit acheté → plan
  const planInfo = resolvePlan(payload);
  if (!planInfo) {
    console.warn(`[Chariow] Produit non reconnu pour ${email} — ajoutez metadata {"plan":"boost"} ou {"plan":"pro"} sur le produit Chariow`);
    return NextResponse.json({ ok: true, deliveryId, warning: "produit non reconnu" });
  }

  // 3) Utilisateur NexiRole correspondant
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.warn(`[Chariow] Utilisateur introuvable : ${email}`);
    return NextResponse.json({ ok: true, deliveryId, warning: "utilisateur introuvable" });
  }

  const chariowLicenseKey = toText(deepFind(payload, ["key"]));
  if (chariowLicenseKey) {
    console.log(`[Chariow] Clé de licence Chariow : ${chariowLicenseKey}`);
  }

  // 4) Expiration : license.expires_at (événements license.*) sinon +30j/+90j
  const now = new Date();
  const alreadyActive =
    user.licenseStatus === "ACTIVE" &&
    user.plan === planInfo.plan &&
    !!user.expiresAt &&
    user.expiresAt.getTime() > now.getTime();

  const licenseExpiresRaw = toText(deepFind(payload, ["expires_at"]));
  const licenseExpires = licenseExpiresRaw ? new Date(licenseExpiresRaw) : null;

  const expiresAt =
    alreadyActive && user.expiresAt
      ? user.expiresAt // anti-doublon : un Pulse rejoué ne rallonge pas la licence
      : licenseExpires && !Number.isNaN(licenseExpires.getTime())
        ? licenseExpires
        : new Date(now.getTime() + planInfo.days * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { email },
    data: {
      plan: planInfo.plan,
      licenseStatus: "ACTIVE",
      expiresAt,
      searchesUsed: 0,
      generationsUsed: 0,
    },
  });

  console.log(`[Chariow] Licence activée — ${email} → ${planInfo.plan} jusqu'au ${expiresAt.toISOString()}`);

  return NextResponse.json({
    ok: true,
    deliveryId,
    event: eventName,
    plan: planInfo.plan,
    email,
    expiresAt: expiresAt.toISOString(),
    alreadyActive,
  });
}