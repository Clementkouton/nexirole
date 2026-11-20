import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email) {
      return NextResponse.json(
        {
          plan: "free",
          licenseStatus: "inactive",
          expiresAt: null,
          searchesUsed: 0,
          generationsUsed: 0,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email.toLowerCase().trim(), mode: "insensitive" } },
      select: {
        plan: true,
        licenseStatus: true,
        expiresAt: true,
        searchesUsed: true,
        generationsUsed: true,
      },
    });

    return NextResponse.json(
      {
        plan: user?.plan ?? "free",
        licenseStatus: user?.licenseStatus ?? "inactive",
        expiresAt: user?.expiresAt ?? null,
        searchesUsed: user?.searchesUsed ?? 0,
        generationsUsed: user?.generationsUsed ?? 0,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[license/status] Erreur :", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
