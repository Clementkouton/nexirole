// =============================================================
// NEXIROLE — Webhook Chariow Pulse
// -------------------------------------------------------------
// Endpoint   : https://nexirole.vercel.app/api/webhooks/chariow
// Secret     : variable d'environnement CHARIOW_WEBHOOK_SECRET
//              (identique côté Chariow Pulse et côté Vercel)
// Événements : license.issued, successful.sale, refund.*, license.revoked…
//
// Garanties professionnelles :
//   - réponse TOUJOURS en JSON (jamais de corps vide) ;
//   - aucune exception non maîtrisée (payload quelconque accepté) ;
//   - idempotence via ChariowEvent.eventId unique ;
//   - journalisation complète dans les logs Vercel.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_KEYS,
  LICENSE_KEYS,
  PLAN_DURATION_DAYS,
  deepFind,
  detectPlan,
  extractEventId,
  extractEventType,
  isTerminationEvent,
  normalizeEmail,
  normalizeLicenseKey,
  safeEqual,
} from "@/lib/chariow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET : sonde de santé (visible dans un navigateur). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "nexirole-chariow-webhook",
    secretConfigured: Boolean(process.env.CHARIOW_WEBHOOK_SECRET),
    message:
      "Webhook NexiRole opérationnel. Les événements Chariow Pulse doivent arriver en POST (idéalement signés via ?secret=…).",
    timestamp: new Date().toISOString(),
  });
}

/** POST : réception des événements Chariow Pulse. */
export async function POST(request: NextRequest) {
  // --- 0) Lecture du corps brut ---
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: false, error: "corps_illisible" }, { status: 400 });
  }

  // --- 1) Vérification du secret partagé (?secret=… ou en-tête) ---
  const expectedSecret = process.env.CHARIOW_WEBHOOK_SECRET;
  if (expectedSecret) {
    const url = new URL(request.url);
    const received =
      url.searchParams.get("secret") ??
      request.headers.get("x-webhook-secret") ??
      request.headers.get("x-chariow-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    if (received.length === 0) {
      // Tolérance : Chariow n'envoie pas encore le secret — on accepte mais on alerte.
      console.warn(
        "[CHARIOW] Livraison sans secret — acceptée par tolérance. Ajoutez ?secret=VOTRE_SECRET à l'URL dans Chariow Pulse.",
      );
    } else if (!safeEqual(received, expectedSecret)) {
      console.error("[CHARIOW] Secret invalide — livraison rejetée (401).");
      return NextResponse.json({ ok: false, error: "secret_invalide" }, { status: 401 });
    }
  } else {
    console.warn("[CHARIOW] CHARIOW_WEBHOOK_SECRET non configuré — livraison acceptée SANS vérification.");
  }

  // --- 2) Analyse JSON (tolérante) ---
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    console.error("[CHARIOW] JSON invalide :", rawBody.slice(0, 300));
    return NextResponse.json({ ok: false, error: "json_invalide" }, { status: 400 });
  }

  // --- 3) Extraction tolérante des informations clés ---
  const eventType = extractEventType(payload, rawBody);
  const eventId = extractEventId(payload, rawBody);
  const email = normalizeEmail(deepFind(payload, EMAIL_KEYS));
  const licenseKey = normalizeLicenseKey(deepFind(payload, LICENSE_KEYS));

  console.log("[CHARIOW] Événement reçu :", {
    eventId,
    eventType,
    email,
    licenseKeyPresent: Boolean(licenseKey),
  });

  // --- 4) Traitement en base, de manière idempotente ---
  try {
    const existing = await prisma.chariowEvent.findUnique({ where: { eventId } });
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, eventId, eventType });
    }
    if (!existing) {
      await prisma.chariowEvent.create({
        data: { eventId, eventType, payload: JSON.stringify(payload) },
      });
    }

    let activation: Record<string, unknown>;

    if (isTerminationEvent(eventType)) {
      // Remboursement / révocation / expiration → retour au plan gratuit.
      if (email) {
        await prisma.user.updateMany({
          where: { email, plan: { not: "FREE" } },
          data: { plan: "FREE", licenseStatus: "EXPIRED", expiresAt: null },
        });
      }
      activation = { action: "desactivation", email };
    } else {
      const plan = detectPlan(payload);
      if (!plan) {
        console.error("[CHARIOW] Plan indéterminé pour l'événement", eventId, "— à activer manuellement.");
        activation = { action: "aucune", raison: "plan_indetermine" };
      } else if (!email) {
        activation = { action: "aucune", raison: "email_absent" };
      } else {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          console.error(
            "[CHARIOW] Aucun compte NexiRole pour",
            email,
            "— la clé reste activable manuellement depuis le Dashboard.",
          );
          activation = { action: "aucune", raison: "compte_introuvable", email };
        } else {
          const expiresAt = new Date(Date.now() + PLAN_DURATION_DAYS[plan] * 86_400_000);
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan,
              licenseStatus: "ACTIVE",
              expiresAt,
              ...(licenseKey ? { licenseKey } : {}),
            },
          });
          activation = { action: "activation", plan, email, expiresAt: expiresAt.toISOString() };
        }
      }
    }

    console.log("[CHARIOW] Événement traité :", { eventId, eventType, activation });

    return NextResponse.json({ ok: true, eventId, eventType, activation });
  } catch (error) {
    console.error("[CHARIOW] ERREUR DE TRAITEMENT :", error);
    const errorCode =
      typeof error === "object" && error !== null
        ? (error as { code?: unknown }).code
        : null;
    const prismaCode = typeof errorCode === "string" ? errorCode : null;
    return NextResponse.json(
      {
        ok: false,
        error: "erreur_base_de_donnees",
        prismaCode,
        hint: "Exécutez « npx prisma db push » sur la base de production, puis cliquez sur « Rejouer » dans Chariow Pulse.",
      },
      { status: 500 },
    );
  }
}