// =============================================================
// NEXIROLE — Activation manuelle d'une clé de licence Chariow
// Source de vérité = journal des événements Chariow (ChariowEvent),
// alimenté par le webhook /api/webhooks/chariow.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LICENSE_KEYS, PLAN_DURATION_DAYS, deepFind, detectPlan, type PayablePlan } from "@/lib/chariow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LICENSE_KEY_REGEX = /^[A-Za-z0-9][A-Za-z0-9\-_]{5,80}$/;

export async function POST(request: NextRequest) {
  // 1) Authentification
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Vous devez être connecté pour activer une licence." }, { status: 401 });
  }

  // 2) Corps de la requête
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const rawKey =
    typeof (body as { licenseKey?: unknown })?.licenseKey === "string"
      ? (body as { licenseKey: string }).licenseKey.trim()
      : "";

  if (!LICENSE_KEY_REGEX.test(rawKey)) {
    return NextResponse.json({ error: "Format de clé de licence invalide." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 401 });
    }

    // 3) Clé déjà utilisée par un AUTRE compte ?
    const taken = await prisma.user.findFirst({ where: { licenseKey: rawKey, id: { not: user.id } } });
    if (taken) {
      return NextResponse.json({ error: "Cette clé est déjà utilisée par un autre compte." }, { status: 403 });
    }

    // 4) Clé déjà rattachée à CE compte (activée par le webhook) ?
    if (user.licenseKey === rawKey) {
      const stillValid =
        user.plan !== "FREE" &&
        user.licenseStatus === "ACTIVE" &&
        user.expiresAt !== null &&
        user.expiresAt.getTime() > Date.now();
      if (stillValid) {
        return NextResponse.json({
          ok: true,
          plan: user.plan,
          licenseStatus: user.licenseStatus,
          expiresAt: user.expiresAt,
        });
      }
      return NextResponse.json(
        { error: "Cette licence a expiré. Effectuez un nouvel achat pour la renouveler." },
        { status: 410 },
      );
    }

    // 5) Recherche de la clé dans le journal Chariow (licences émises)
    const events = await prisma.chariowEvent.findMany({
      where: { eventType: { contains: "license" }, processed: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    let plan: PayablePlan | null = null;
    let issuedAt: Date | null = null;

    for (const event of events) {
      const parsedPayload: unknown = event.payload;
      const candidate = deepFind(parsedPayload, LICENSE_KEYS);
      if (typeof candidate === "string" && candidate.trim() === rawKey) {
        plan = detectPlan(parsedPayload);
        issuedAt = event.createdAt;
        break;
      }
    }

    if (!plan) {
      return NextResponse.json(
        { error: "Clé de licence inconnue. Vérifiez la clé reçue après votre achat." },
        { status: 404 },
      );
    }

    const durationDays = PLAN_DURATION_DAYS[plan];
    const expiresAt = new Date((issuedAt ?? new Date()).getTime() + durationDays * 86_400_000);

    if (expiresAt.getTime() <= Date.now()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: "FREE", licenseKey: rawKey, licenseStatus: "EXPIRED", expiresAt },
      });
      return NextResponse.json({
        ok: true,
        plan: "FREE",
        licenseStatus: "EXPIRED",
        expiresAt,
        message: "Cette licence était déjà expirée.",
      });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { plan, licenseKey: rawKey, licenseStatus: "ACTIVE", expiresAt },
    });

    return NextResponse.json({
      ok: true,
      plan: updated.plan,
      licenseStatus: updated.licenseStatus,
      expiresAt: updated.expiresAt,
    });
  } catch (error) {
    console.error("[LICENSE-ACTIVATE] Erreur :", error);
    return NextResponse.json(
      { error: "Erreur serveur. Vérifiez que la base est à jour (npx prisma db push)." },
      { status: 500 },
    );
  }
}