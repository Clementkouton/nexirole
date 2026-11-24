import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/ai";
import { hasGroqKey } from "@/lib/ai-guard";
import { getClientIp, guardRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { resoudreUtilisateur } from "@/lib/utilisateur-actuel";
import { etatCoach, consommerCoach, type EtatCoach } from "@/lib/coach-quota";
import { trouverPaysParNom } from "@/lib/countries-currencies";

/**
 * NexiRole — COACH DE NÉGOCIATION (un coaching précis, /api/salary-coach/[id]).
 *
 * GET    : détail complet du coaching (propriétaire uniquement).
 * PATCH  : édition des paramètres (jobTitle, experienceYears, pays/devise,
 *          keySkills, currentOffer) avec ou sans régénération de l'analyse
 *          IA (champ `regenerer: true` → nouvelle analyse Groq adaptée au
 *          nouveau pays/devise, quota du plan contrôlé puis consommé).
 * DELETE : suppression définitive.
 *
 * Identité : résolution tolérante (3 voies) — utilisateur-actuel.ts.
 * Toutes les opérations sont limitées au propriétaire du coaching.
 * LIMITES PAR PLAN : régénération = 1 simulation (Découverte : 2/mois,
 *   payants illimités) — le même contrat 403 QUOTA_EXCEEDED + upgradeUrl.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  jobTitle: z.string().min(2).max(120).optional(),
  experienceYears: z.coerce.number().min(0).max(50).optional(),
  countryName: z.string().min(2).max(100).optional(),
  currencyCode: z
    .string()
    .regex(/^[A-Za-z]{3}$/, "Devise invalide.")
    .optional(),
  keySkills: z.string().min(2).max(800).optional(),
  currentOffer: z.string().max(2000).optional(),
  regenerer: z.boolean().optional(),
});

const outputSchema = z.object({
  fourchette_min: z.string(),
  fourchette_cible: z.string(),
  fourchette_max: z.string(),
  analyse_marche: z.string(),
  arguments_valeur: z
    .array(z.object({ titre: z.string(), explication: z.string() }))
    .length(3),
  scripts_reponse: z.object({
    question_entretien: z.string(),
    contre_proposition_email: z.string(),
    alternatives_avantages: z
      .array(z.object({ titre: z.string(), description: z.string() }))
      .length(3),
  }),
});

type AnalyseSalariale = z.infer<typeof outputSchema>;

const NON_AUTH = {
  error: "Session expirée — déconnecte-toi puis reconnecte-toi, et recharge la page.",
};

const SYSTEM_PROMPT = `Tu es « Coach Négociation », négociateur salarial senior formé dans un grand cabinet de recrutement et ancien recruteur. Tu connais les fourchettes réelles des marchés locaux de tous les pays du monde et du remote international.

Règles absolues :
- Réponds UNIQUEMENT en français, en TEXTE BRUT : aucun markdown (pas de #, pas d'astérisques, pas de listes à puces, pas de blocs de code) dans aucune chaîne.
- Les trois fourchettes sont des chaînes formatées selon le pays ET la devise exacts fournis : montants réalistes pour ce pays, ce poste et cette expérience ; fourchette_min < fourchette_cible < fourchette_max.
- Format de chaque montant : « montant symbole-devises période », avec une espace comme séparateur de milliers et la période usuelle du marché indiqué (ex. « 450 000 FCFA / mois » pour un salaire mensuel en zone FCFA, « 45 000 € / an » pour un brut annuel en France, « 85 000 $ / an » aux États-Unis, « 180 000 NGN / mois » au Nigeria). Utilise le symbole de la devise si tu le connais (FCFA, €, $, DH, KSh...), sinon le code ISO.
- Base-toi sur les niveaux de salaire RÉELS du pays indiqué : adapte les ordres de grandeur, le coût de la vie et les usages locaux.
- Si une offre actuelle est fournie : place les fourchettes par rapport à elle. Si elle est basse pour le marché local, la cible la dépasse et tu l'expliques.
- analyse_marche : 2 à 3 phrases sur la tendance du marché LOCAL pour ce poste (demande, tension du recrutement, effet de l'expérience et des compétences listées, contexte du pays).
- arguments_valeur : EXACTEMENT 3 arguments, concrets et quantifiés, construits à partir des compétences du candidat. Chaque titre fait 8 mots maximum ; chaque explication fait 2 à 3 phrases et contient un impact métier chiffré ou observable exprimé dans la devise du pays.
- scripts_reponse.question_entretien : réponse MOT À MOT à « Quelles sont vos prétentions salariales ? », à la première personne, 5 à 8 phrases, ton confiant et poli, qui cite la cible puis la fourchette, et finit par une ouverture sur la valeur globale du poste.
- scripts_reponse.contre_proposition_email : e-mail complet en texte brut, commençant par la ligne « Objet : » suivie d'un objet précis, puis salutation, remerciement pour l'offre, 2 à 3 paragraphes fermes et polis qui citent la fourchette cible et justifient avec les arguments, proposition d'un échange téléphonique, formule de politesse, signature « [Prénom Nom] ».
- scripts_reponse.alternatives_avantages : EXACTEMENT 3 leviers NON financiers à négocier si le fixe est bloqué. Chaque titre fait 6 mots maximum, chaque description fait 1 à 2 phrases concrètes.`;

function construirePrompt(params: {
  jobTitle: string;
  experienceYears: number;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  keySkills: string;
  currentOffer: string;
}): string {
  const lignes = [
    `Analyse salariale à produire (mise à jour d'un coaching existant).`,
    `Poste visé : ${params.jobTitle}.`,
    `Expérience du candidat : ${params.experienceYears} an(s).`,
    `Compétences clés du candidat : ${params.keySkills}.`,
    `Pays du poste : ${params.countryName} — toutes les fourchettes utilisent EXCLUSIVEMENT la devise officielle ${params.currencyCode} (symbole usuel : ${params.currencySymbol}) avec la période usuelle de ce marché, au format exact demandé.`,
    params.currentOffer
      ? `Offre déjà reçue par le candidat : ${params.currentOffer}`
      : `Le candidat n'a pas encore reçu d'offre : base-toi uniquement sur le marché.`,
    `Produis maintenant l'analyse complète au format demandé.`,
  ];
  return lignes.filter(Boolean).join("\n");
}

async function lireEtatTolerant(userId: string): Promise<EtatCoach | null> {
  try {
    return await etatCoach(userId);
  } catch (error) {
    console.error("[salary-coach/[id]] état du plan indisponible :", error);
    return null;
  }
}

function estTableAbsente(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    e?.code === "P2021" ||
    String(e?.message ?? "").includes("salary_negotiations")
  );
}

function reponseTableAbsente(): NextResponse {
  return NextResponse.json(
    {
      error:
        "La sauvegarde des coachings n'est pas encore active : lance « npx prisma db push » (voir LISEZMOI-COACH-V2.md) puis recharge la page.",
    },
    { status: 503 }
  );
}

/* ── GET : détail d'un coaching ──────────────────────────────────────── */

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { utilisateur, diagnostic } = await resoudreUtilisateur();
    if (!utilisateur) {
      return NextResponse.json({ ...NON_AUTH, diagnostic }, { status: 401 });
    }

    const coaching = await prisma.salaryNegotiation.findFirst({
      where: { id, userId: utilisateur.userId },
    });
    if (!coaching) {
      return NextResponse.json(
        { error: "Coaching introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json({ coaching });
  } catch (error) {
    console.error("[salary-coach/[id]:GET]", error);
    if (estTableAbsente(error)) return reponseTableAbsente();
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

/* ── PATCH : édition des paramètres (+ régénération optionnelle) ─────── */

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { utilisateur, diagnostic } = await resoudreUtilisateur();
    if (!utilisateur) {
      return NextResponse.json({ ...NON_AUTH, diagnostic }, { status: 401 });
    }
    const userId = utilisateur.userId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Corps de requête JSON invalide." },
        { status: 400 }
      );
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Champs invalides : vérifie le poste, l'expérience, le pays sélectionné et les compétences.",
        },
        { status: 400 }
      );
    }
    const { regenerer = false, ...champs } = parsed.data;

    /* Le coaching doit exister et appartenir à l'utilisateur. */
    let coaching = await prisma.salaryNegotiation.findFirst({
      where: { id, userId },
    });
    if (!coaching) {
      return NextResponse.json(
        { error: "Coaching introuvable." },
        { status: 404 }
      );
    }

    /* Résolution du pays : le couple (pays, devise) est TOUJOURS canonique
       (issu de la liste officielle, jamais d'une saisie libre du client). */
    let paysFutur = {
      countryName: coaching.countryName,
      currencyCode: coaching.currencyCode,
      currencySymbol: coaching.currencySymbol,
    };
    if (champs.countryName) {
      const pays = trouverPaysParNom(champs.countryName);
      if (!pays) {
        return NextResponse.json(
          {
            error:
              "Pays inconnu : sélectionne ton pays dans la liste déroulante « Pays et Devise ».",
          },
          { status: 400 }
        );
      }
      if (champs.currencyCode && pays.currencyCode !== champs.currencyCode.toUpperCase()) {
        return NextResponse.json(
          {
            error:
              "Le pays et la devise sélectionnés ne sont pas cohérents : reprends la sélection dans la liste.",
          },
          { status: 400 }
        );
      }
      paysFutur = {
        countryName: pays.name,
        currencyCode: pays.currencyCode,
        currencySymbol: pays.currencySymbol,
      };
    } else if (champs.currencyCode) {
      const pays = trouverPaysParNom(coaching.countryName);
      if (!pays || pays.currencyCode !== champs.currencyCode.toUpperCase()) {
        return NextResponse.json(
          {
            error:
              "Devise incohérente avec le pays du coaching : reprends la sélection dans la liste.",
          },
          { status: 400 }
        );
      }
    }

    /* Régénération : garde-fous + limite du plan AVANT de dépenser l'IA. */
    if (regenerer) {
      const guard = guardRateLimit(request, {
        route: "salary-coach",
        clientId: userId,
        ip: getClientIp(request),
        limitPerHour: 15,
      });
      if (!guard.ok) return guard.response;

      const etat = await lireEtatTolerant(userId);
      if (etat?.reached) {
        const message = etat.compteurDedie
          ? `Vous avez utilisé vos ${etat.limit} simulations offertes du plan ${etat.planLabel} ce mois-ci. Passez au Pass Boost ou Carrière Pro pour des simulations illimitées.`
          : `Vous avez utilisé vos ${etat.limit} générations IA offertes ce mois-ci — le plan ${etat.planLabel} partage ce quota entre les dossiers IA et le Coach Négociation. Passez au Pass Boost ou Carrière Pro pour l'illimité.`;
        return NextResponse.json(
          {
            error: message,
            code: "QUOTA_EXCEEDED",
            reason: "COACH_LIMIT",
            plan: etat.plan,
            planLabel: etat.planLabel,
            used: etat.used,
            limit: etat.limit,
            upgradeUrl: "/pricing",
          },
          { status: 403 }
        );
      }

      if (!hasGroqKey()) {
        return NextResponse.json(
          {
            error:
              "L'IA n'est pas configurée : ajoutez votre clé GROQ_API_KEY (gratuite sur console.groq.com) dans .env.local puis redémarrez le serveur.",
          },
          { status: 503 }
        );
      }

      const parametres = {
        jobTitle: champs.jobTitle?.trim() || coaching.jobTitle,
        experienceYears: champs.experienceYears ?? coaching.experienceYears,
        countryName: paysFutur.countryName,
        currencyCode: paysFutur.currencyCode,
        currencySymbol: paysFutur.currencySymbol,
        keySkills: champs.keySkills?.trim() || coaching.keySkills,
        currentOffer: champs.currentOffer !== undefined
          ? champs.currentOffer.trim()
          : coaching.currentOffer || "",
      };

      const analyse = await generateStructured<AnalyseSalariale>({
        schema: outputSchema,
        system: SYSTEM_PROMPT,
        prompt: construirePrompt(parametres),
        temperature: 0.5,
        maxOutputTokens: 4000,
      });

      coaching = await prisma.salaryNegotiation.update({
        where: { id },
        data: {
          jobTitle: parametres.jobTitle,
          experienceYears: parametres.experienceYears,
          countryName: parametres.countryName,
          currencyCode: parametres.currencyCode,
          currencySymbol: parametres.currencySymbol,
          keySkills: parametres.keySkills,
          currentOffer: parametres.currentOffer || null,
          resultJson: analyse,
        },
      });

      /* Crédit consommé après succès, plan Découverte uniquement. */
      if (etat && etat.plan === "FREE") {
        await consommerCoach(userId, etat.compteurDedie);
      }

      return NextResponse.json({ coaching });
    }

    /* Mode « paramètres seulement » : aucune IA, aucun quota consommé. */
    const data: Record<string, string | number | null> = {};
    if (champs.jobTitle !== undefined) data.jobTitle = champs.jobTitle.trim();
    if (champs.experienceYears !== undefined) data.experienceYears = champs.experienceYears;
    if (champs.countryName !== undefined || champs.currencyCode !== undefined) {
      data.countryName = paysFutur.countryName;
      data.currencyCode = paysFutur.currencyCode;
      data.currencySymbol = paysFutur.currencySymbol;
    }
    if (champs.keySkills !== undefined) data.keySkills = champs.keySkills.trim();
    if (champs.currentOffer !== undefined) {
      data.currentOffer = champs.currentOffer.trim() || null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
    }

    coaching = await prisma.salaryNegotiation.update({ where: { id }, data });
    return NextResponse.json({ coaching });
  } catch (error) {
    console.error("[salary-coach/[id]:PATCH]", error);
    if (estTableAbsente(error)) return reponseTableAbsente();
    const message =
      error instanceof Error && error.message.includes("GROQ_API_KEY")
        ? error.message
        : "La mise à jour du coaching n'a pas abouti (service momentanément saturé ?). Réessaie dans quelques instants.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/* ── DELETE : suppression définitive ─────────────────────────────────── */

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { utilisateur, diagnostic } = await resoudreUtilisateur();
    if (!utilisateur) {
      return NextResponse.json({ ...NON_AUTH, diagnostic }, { status: 401 });
    }

    const existant = await prisma.salaryNegotiation.findFirst({
      where: { id, userId: utilisateur.userId },
      select: { id: true },
    });
    if (!existant) {
      return NextResponse.json(
        { error: "Coaching introuvable." },
        { status: 404 }
      );
    }

    await prisma.salaryNegotiation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[salary-coach/[id]:DELETE]", error);
    if (estTableAbsente(error)) return reponseTableAbsente();
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
