// =============================================================
// NEXIROLE â€” Activation manuelle d'une clÃ© de licence Chariow
// Source de vÃ©ritÃ© = journal des Ã©vÃ©nements Chariow (ChariowEvent),
// alimentÃ© par le webhook /api/webhooks/chariow.
// =============================================================

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { LICENSE_KEYS, PLAN_DURATION_DAYS, deepFind, detectPlan, type PayablePlan } from "@/lib/chariow";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LICENSE_KEY_REGEX = /^[A-Za-z0-9][A-Za-z0-9\-_]{5,80}$/;

export async function POST(request: NextRequest) {
  // 1) Authentification
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Vous devez Ãªtre connectÃ© pour activer une licence." }, { status: 401 });
  }

  // 2) Corps de la requÃªte
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "RequÃªte invalide." }, { status: 400 });
  }

  const rawKey =
    typeof (body as { licenseKey?: unknown })?.licenseKey === "string"
      ? (body as { licenseKey: string }).licenseKey.trim()
      : "";

  if (!LICENSE_KEY_REGEX.test(rawKey)) {
    return NextResponse.json({ error: "Format de clÃ© de licence invalide." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 401 });
    }

    // 3) ClÃ© dÃ©jÃ  utilisÃ©e par un AUTRE compte ?
    const taken = await prisma.user.findFirst({ where: { licenseKey: rawKey, id: { not: user.id } } });
    if (taken) {
      return NextResponse.json({ error: "Cette clÃ© est dÃ©jÃ  utilisÃ©e par un autre compte." }, { status: 403 });
    }

    // 4) ClÃ© dÃ©jÃ  rattachÃ©e Ã  CE compte (activÃ©e par le webhook) ?
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
        { error: "Cette licence a expirÃ©. Effectuez un nouvel achat pour la renouveler." },
        { status: 410 },
      );
    }

    // 5) Recherche de la clÃ© dans le journal Chariow (licences Ã©mises)
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
        { error: "ClÃ© de licence inconnue. VÃ©rifiez la clÃ© reÃ§ue aprÃ¨s votre achat." },
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
        message: "Cette licence Ã©tait dÃ©jÃ  expirÃ©e.",
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
      { error: "Erreur serveur. VÃ©rifiez que la base est Ã  jour (npx prisma db push)." },
      { status: 500 },
    );
  }
}