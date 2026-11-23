/* =====================================================================
   NexiRole - Helpers partages : Prisma + utilisateur connecte

   +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   POINT D'ADAPTATION UNIQUE : la fonction getUserId() ci-dessous.
   Par defaut : NextAuth v4 (getServerSession + authOptions de @/lib/auth).

   SI TON PROJET UTILISE AUTRE CHOSE, remplace le bloc indique
   par l'une des variantes ci-dessous (decommente + adapte les imports) :

   Variante B - NextAuth v5 / Auth.js :
     // import { auth } from "@/auth";
     // const session = await auth();
     // const u = session?.user as { id?: string; email?: string } | undefined;

   Variante C - Clerk :
     // import { auth } from "@clerk/nextjs/server";
     // const { userId } = await auth();
     // if (userId) return userId;
   +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   ===================================================================== */

type PrismaClient = {
  user: {
    findUnique(args: {
      where: { email: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: new () => PrismaClient;
};
import { auth } from "@/auth"
import { authOptions } from "@/lib/auth";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

/** Renvoie l'identifiant de l'utilisateur connecte, ou null. */
export async function getUserId(): Promise<string | null> {
  try {
    const session = await auth();
    const u = session?.user as { id?: string; email?: string } | undefined;

    if (u && u.id) return u.id;

    // Certains projets NextAuth n'exposent pas l'id en session :
    // on retombe sur l'e-mail pour retrouver l'utilisateur en base.
    if (u && u.email) {
      try {
        const user = await getPrisma().user.findUnique({
          where: { email: u.email },
          select: { id: true },
        });
        if (user) return user.id;
      } catch {
        // Le modele User ou le champ email n'existe pas tel quel :
        // adapte cette recherche a ton schema si besoin.
      }
    }

    return null;
  } catch {
    return null;
  }
}
