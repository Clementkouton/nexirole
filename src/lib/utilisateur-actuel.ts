import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * NexiRole — Résolution TOLÉRANTE de l'utilisateur courant pour les routes API.
 *
 * POURQUOI CE FICHIER EXISTE :
 * auth() ne fournit pas toujours un session.user.id exploitable — cas
 * classique : le jeton JWT du navigateur a été créé AVANT que le callback
 * `jwt` ne stocke l'id utilisateur, ou la session n'atteint pas la route.
 * Résultat : session présente mais userId manquant → 401 injustifié.
 *
 * On essaie donc successivement TROIS voies indépendantes (la première qui
 * réussit gagne) :
 *   1. session.user.id                              (voie normale)
 *   2. session.user.email → recherche en base       (jeton ancien sans id)
 *   3. décodage du cookie de session (next-auth/jwt) → sub / id / email
 *      → recherche en base                          (session non transmise)
 *
 * AUCUNE exception ne remonte de ce fichier : tous les essais sont capturés
 * et résumés dans un `diagnostic` en français, renvoyé au client en cas de
 * 401 pour rendre le débogage immédiat. Aucun secret ni valeur de jeton
 * n'est jamais inclus — uniquement des noms de cookies et des booléens.
 */

const NOMS_COOKIE_SESSION = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export interface UtilisateurResolu {
  userId: string;
  /** Voie qui a permis d'identifier l'utilisateur (pour les logs). */
  methode: string;
}

export interface Resolution {
  utilisateur: UtilisateurResolu | null;
  /** Résumé lisible des essais — affiché côté client uniquement en échec. */
  diagnostic: string;
}

/** Retrouve l'id en base par id puis par email. Jamais de throw. */
async function idEnBase(id?: string, email?: string): Promise<string | null> {
  try {
    if (id) {
      const u = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (u) return u.id;
    }
    if (email) {
      const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (u) return u.id;
    }
  } catch {
    // base indisponible : traité par les routes (erreur 500 dédiée)
  }
  return null;
}

export async function resoudreUtilisateur(): Promise<Resolution> {
  const notes: string[] = [];

  // ── Voie 1 + 2 : session auth() (id direct, puis email) ────────────
  let utilisateurSession: { id?: unknown; email?: unknown } | null = null;
  try {
    const session = await auth();
    utilisateurSession = session?.user ?? null;
  } catch (e) {
    notes.push("auth() a échoué");
    if (e instanceof Error && e.message) notes.push(e.message.slice(0, 140));
  }

  if (utilisateurSession) {
    notes.push("session présente");
    const idSession = typeof utilisateurSession.id === "string" ? utilisateurSession.id : "";
    const emailSession = typeof utilisateurSession.email === "string" ? utilisateurSession.email : "";

    if (idSession) {
      const userId = await idEnBase(idSession, emailSession);
      if (userId) {
        return {
          utilisateur: { userId, methode: "session.id" },
          diagnostic: notes.join(" · "),
        };
      }
      notes.push("id de session absent de la base");
    }

    if (emailSession) {
      const userId = await idEnBase(undefined, emailSession);
      if (userId) {
        return {
          utilisateur: { userId, methode: "session.email" },
          diagnostic: notes.join(" · "),
        };
      }
      notes.push("email de session inconnu en base");
    }

    if (!idSession) notes.push("session sans id utilisateur");
    if (!emailSession) notes.push("session sans email");
  } else {
    notes.push("session absente");
  }

  // ── Voie 3 : décodage du cookie de session ─────────────────────────
  let magasin: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    magasin = await cookies();
  } catch {
    notes.push("cookies() indisponible");
  }

  if (magasin) {
    const secrets = [
      process.env.AUTH_SECRET,
      process.env.NEXTAUTH_SECRET,
    ].filter((s): s is string => typeof s === "string" && s.length > 0);

    if (secrets.length === 0) notes.push("AUTH_SECRET absente");

    for (const nom of NOMS_COOKIE_SESSION) {
      const jeton = magasin.get(nom)?.value;
      if (!jeton) continue;
      notes.push(`cookie ${nom} présent`);

      // Salt utilisé par Auth.js lors du chiffrement : le nom du cookie
      // (variante avec ou sans préfixe __Secure- selon l'environnement).
      const sels = [nom, nom.replace("__Secure-", "")];

      for (const secret of secrets) {
        for (const sel of sels) {
          try {
            const payload = await decode({ token: jeton, secret, salt: sel });
            if (!payload) continue;
            notes.push("jeton de session décodé");

            const candidatId =
              (typeof payload.sub === "string" && payload.sub) ||
              (typeof payload.id === "string" && payload.id) ||
              "";
            const candidatEmail =
              typeof payload.email === "string" ? payload.email : "";

            const userId = await idEnBase(candidatId || undefined, candidatEmail || undefined);
            if (userId) {
              return {
                utilisateur: { userId, methode: "cookie:" + nom },
                diagnostic: notes.join(" · "),
              };
            }
            notes.push("jeton décodé mais utilisateur inconnu en base");
          } catch {
            // mauvais secret ou salt : essai suivant
          }
        }
      }
      notes.push("décodage du jeton impossible");
    }
    if (notes.every((n) => !n.startsWith("cookie "))) {
      notes.push("aucun cookie de session trouvé");
    }
  }

  return { utilisateur: null, diagnostic: notes.join(" · ") };
}
