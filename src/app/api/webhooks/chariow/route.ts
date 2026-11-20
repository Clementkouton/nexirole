import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PAID_EVENT_PATTERN =
  /(payment|checkout|order|subscription|license|invoice|purchase)[_.:\-]?(succeed|success|succeeded|paid|complete|completed|confirmed|active|activated|created|captured|fulfilled)/i;

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.CHARIOW_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[webhooks/chariow] CHARIOW_WEBHOOK_SECRET absent : signature non vérifiée.");
    return true;
  }
  if (!signatureHeader) {
    console.warn("[webhooks/chariow] En-tête de signature absent : événement accepté (mode tolérant).");
    return true;
  }
  const v1Match = signatureHeader.match(/v1=([a-f0-9]{32,})/i);
  const provided = (v1Match ? v1Match[1] : signatureHeader.trim()).toLowerCase();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return provided === expected;
  }
}

function findEmail(value: unknown): string | null {
  if (typeof value === "string") {
    return EMAIL_PATTERN.test(value) ? value.toLowerCase().trim() : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEmail(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "customer_email", "buyer_email", "payer_email", "billing_email"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && EMAIL_PATTERN.test(candidate)) {
        return candidate.toLowerCase().trim();
      }
    }
    for (const item of Object.values(record)) {
      const found = findEmail(item);
      if (found) return found;
    }
  }
  return null;
}

function detectPlan(flatPayload: string): "BOOST" | "PRO" {
  const proId = (process.env.CHARIOW_PRODUCT_PRO_ID ?? "carriere-pro").toLowerCase();
  const boostId = (process.env.CHARIOW_PRODUCT_BOOST_ID ?? "pass-boost").toLowerCase();
  if (flatPayload.includes(proId)) return "PRO";
  if (flatPayload.includes(boostId)) return "BOOST";
  if (/pass[\s_-]?boost/.test(flatPayload)) return "BOOST";
  if (/\bpro\b/.test(flatPayload)) return "PRO";
  return "BOOST";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("x-chariow-signature") ??
    request.headers.get("x-webhook-signature") ??
    request.headers.get("x-signature");

  if (!verifySignature(rawBody, signatureHeader)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    console.warn("[webhooks/chariow] Corps non JSON ignoré.");
    return NextResponse.json({ received: true });
  }

  const eventType = String(
    payload.event ?? payload.type ?? payload.event_type ?? ""
  ).toLowerCase();
  const flatPayload = JSON.stringify(payload).toLowerCase();
  const isPaidEvent =
    PAID_EVENT_PATTERN.test(eventType) ||
    (eventType.length === 0 && PAID_EVENT_PATTERN.test(flatPayload));

  if (!isPaidEvent) {
    console.log(`[webhooks/chariow] Événement ignoré : ${eventType || "inconnu"}`);
    return NextResponse.json({ received: true, ignored: eventType || "unknown" });
  }

  const email = findEmail(payload);
  if (!email) {
    console.warn("[webhooks/chariow] Aucun e-mail trouvé dans la charge utile.");
    return NextResponse.json({ received: true, warning: "email introuvable" });
  }

  const plan = detectPlan(flatPayload);
  const days = plan === "PRO" ? 90 : 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (!user) {
      console.warn(`[webhooks/chariow] Aucun utilisateur pour ${email}.`);
      return NextResponse.json({ received: true, warning: "utilisateur introuvable" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan,
        licenseStatus: "ACTIVE",
        expiresAt,
        searchesUsed: 0,
        generationsUsed: 0,
      },
    });

    console.log(
      `[webhooks/chariow] ${plan} activé pour ${email} jusqu'au ${expiresAt.toISOString()}`
    );
    return NextResponse.json({
      received: true,
      plan,
      email,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[webhooks/chariow] Erreur Prisma :", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
