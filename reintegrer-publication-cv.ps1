#Requires -Version 5.1
<#
=====================================================================
 NEXIROLE - Reintegration de la PUBLICATION du CV Builder vers la
 page publique /u/[slug]  (100% additif pour le backend)
=====================================================================
 DIAGNOSTIC CONFIRME (rapport elements-pour-correctif.txt) :
   - La page /u/kouton-clement affiche FIDELEMENT le contenu de la
     table PublicResume : donnees de TEST figees ("Ajou", ",k,,;,",
     experience vide, linkedin pollue).
   - Le pipeline de normalisation est SAIN (aucune perte reelle,
     aucun [object Object]) : le "PERTE experiences" etait un
     element VIDE, correctement filtre.
   - Le builder actuel ne sauvegarde QUE dans le localStorage :
     plus aucun chemin d'ecriture vers PublicResume. Les donnees
     enrichies ("Ameliorer avec l'IA") n'atteignent donc jamais
     la page publique.

 CE SCRIPT (conforme AGENTS.md) :
   [1/3] cree src/app/api/public-cv/builder/route.ts (NOUVEAU
         fichier, aucune route existante modifiee) :
         GET  = etat de publication (slug, lien, vues),
         POST = ecriture des donnees du builder dans PublicResume
                (upsert par slug, photo preservee, isPublic: true).
   [2/3] patche le builder (src/app/dashboard/cv-builder/page.tsx)
         avec 4 patchs ancre (import icone, etats, logique de
         publication, bouton "Publier en ligne" + lien "Voir en
         ligne"). Sauvegarde .bak AVANT ecriture, abandon si ancre
         absente ou non unique (aucune ecriture partielle).
   [3/3] verifie (npx tsc --noEmit sauf -SkipTsc) et affiche le
         protocole de test localhost:3000.

 GARANTIES :
   - ecriture UTF-8 SANS BOM, fins de ligne LF ;
   - chaque patch verifie son ancre (unique) AVANT d'ecrire ;
   - aucun placeholder : tout le code ecrit est complet et type ;
   - icones : @tabler/icons-react uniquement.

 EXECUTION (PowerShell 5.1, depuis la racine du projet) :
   powershell -ExecutionPolicy Bypass -File .\reintegrer-publication-cv.ps1

 ROLLBACK : restaurer les fichiers .bak-publi-<horodatage> crees
 a cote des fichiers modifies.
=====================================================================
#>

param(
    [switch]$SkipTsc
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Write-TextFile {
  param([string]$Path, [string]$Content)
  [System.IO.File]::WriteAllText((Join-Path (Get-Location).Path $Path), $Content, $Utf8NoBom)
}

function Read-TextFile {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Join-Path (Get-Location).Path $Path))
}

function Backup-File {
  param([string]$Path, [string]$Tag)
  if (Test-Path -LiteralPath $Path) {
    $bak = "$Path.bak-$Tag-$stamp"
    Copy-Item -LiteralPath $Path -Destination $bak -Force
    Write-Host ("  [BAK] " + $Path + " -> " + $bak)
    return $bak
  }
  return $null
}

function Test-Uffid {
  param([string]$Text, [string]$Label)
  if ($Text.Contains([string][char]0xFFFD)) {
    throw "Caracteres corrompus (U+FFFD) detectes dans $Label - encodage casse. Abandon."
  }
}

function Apply-Patch {
  param([string]$Text, [string]$Label, [string]$Find, [string]$Replace)
  $Find = $Find.Replace("`r`n", "`n")
  $Replace = $Replace.Replace("`r`n", "`n")
  if ($Text.Contains($Replace)) {
    Write-Host "  [=] $Label : deja applique, ignore"
    return $Text
  }
  if (-not $Text.Contains($Find)) {
    throw "ANCRE INTROUVABLE [$Label]. Le fichier a probablement derive. Abandon (aucune ecriture)."
  }
  $count = ([regex]::Matches($Text, [regex]::Escape($Find))).Count
  if ($count -ne 1) {
    throw "ANCRE NON UNIQUE [$Label] ($count occurrences). Abandon (aucune ecriture)."
  }
  Write-Host "  [+] $Label"
  return $Text.Replace($Find, $Replace)
}

Write-Host "=============================================================="
Write-Host " NEXIROLE - Reintegration publication CV -> /u/[slug]"
Write-Host "=============================================================="

if (-not (Test-Path -LiteralPath "package.json")) {
  throw "Lancez ce script depuis la racine du projet (package.json introuvable)."
}
$builderPath = "src/app/dashboard/cv-builder/page.tsx"
if (-not (Test-Path -LiteralPath $builderPath)) {
  throw "Fichier introuvable : $builderPath"
}

# ============================================================================
Write-Host "`n[1/3] Creation de la route de publication (nouveau fichier)..."
# ============================================================================

$routePath = "src/app/api/public-cv/builder/route.ts"
$routeMarker = "Publication du CV Builder vers la page publique"

$routeTs = @'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Publication du CV Builder vers la page publique /u/[slug].
 * GET  : etat de publication (slug, lien public, nombre de vues)
 *        pour l'utilisateur connecte.
 * POST : ecriture des donnees du builder dans PublicResume
 *        (recherche par slug, mise a jour sinon creation, photo
 *        existante preservee, isPublic force a true).
 * Ce fichier ne modifie aucune autre route, page ou modele.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function slugifyNom(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const publishSchema = z.object({
  slug: z.string().regex(SLUG_RE).optional(),
  theme: z
    .object({
      webTemplate: z.string().max(40).default("classique"),
      accentColor: z.string().max(20).default("#FFC107"),
      qrTemplate: z.string().max(40).default("executif"),
    })
    .optional(),
  data: z.object({
    personal: z.object({
      fullName: z.string().max(120).default(""),
      title: z.string().max(160).default(""),
      email: z.string().max(160).default(""),
      phone: z.string().max(40).default(""),
      location: z.string().max(120).default(""),
      linkedin: z.string().max(200).default(""),
    }),
    summary: z.string().max(4000).default(""),
    experiences: z
      .array(
        z.object({
          role: z.string().max(160).default(""),
          company: z.string().max(160).default(""),
          period: z.string().max(80).default(""),
          location: z.string().max(120).default(""),
          achievements: z.array(z.string().max(800)).max(12).default([]),
        })
      )
      .max(15)
      .default([]),
    education: z
      .array(
        z.object({
          degree: z.string().max(160).default(""),
          school: z.string().max(160).default(""),
          period: z.string().max(80).default(""),
        })
      )
      .max(15)
      .default([]),
    skills: z.array(z.string().max(80)).max(40).default([]),
    languages: z
      .array(
        z.object({
          name: z.string().max(60).default(""),
          level: z.string().max(60).default(""),
        })
      )
      .max(12)
      .default([]),
  }),
});

async function resolveSlug(
  preferred: string | undefined,
  fallbackName: string
): Promise<string | null> {
  const direct = (preferred ?? "").trim();
  if (direct !== "" && SLUG_RE.test(direct)) return direct;
  const derived = slugifyNom(fallbackName ?? "");
  return derived.length >= 2 ? derived : null;
}

function publicUrlFrom(request: NextRequest, slug: string): string {
  try {
    return `${new URL(request.url).origin.replace(/\/+$/, "")}/u/${slug}`;
  } catch {
    return `/u/${slug}`;
  }
}

function resumeJson(
  row: { slug: string; viewsCount: number } | null,
  request: NextRequest
) {
  if (!row) return null;
  return {
    slug: row.slug,
    publicUrl: publicUrlFrom(request, row.slug),
    viewsCount: typeof row.viewsCount === "number" ? row.viewsCount : 0,
  };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  const asked = new URL(request.url).searchParams.get("slug") ?? undefined;
  const sessionName = typeof session.user.name === "string" ? session.user.name : "";
  const slug = await resolveSlug(asked, sessionName);
  if (!slug) {
    return NextResponse.json({ publicResume: null });
  }
  try {
    const row = await prisma.publicResume.findUnique({ where: { slug } });
    return NextResponse.json({ publicResume: resumeJson(row, request) });
  } catch (error) {
    console.error("[public-cv/builder][GET]", error);
    return NextResponse.json(
      { error: "Lecture de la configuration impossible." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Connexion requise. Reconnectez-vous puis reessayez." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requete JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees du CV invalides (publication refusee)." },
      { status: 400 }
    );
  }

  const { slug: slugDemande, theme, data } = parsed.data;
  const slug = await resolveSlug(slugDemande, data.personal.fullName);
  if (!slug) {
    return NextResponse.json(
      {
        error:
          "Impossible de deriver le slug : renseignez votre nom complet (etape 1).",
      },
      { status: 400 }
    );
  }

  const experiences = data.experiences.filter(
    (e) => e.role !== "" || e.company !== "" || e.achievements.length > 0
  );
  const education = data.education.filter(
    (e) => e.degree !== "" || e.school !== ""
  );
  const skills = data.skills.map((s) => s.trim()).filter(Boolean);
  const languages = data.languages.filter((l) => l.name !== "");

  try {
    const existing = await prisma.publicResume.findUnique({ where: { slug } });
    const existingCv =
      existing?.cvData &&
      typeof existing.cvData === "object" &&
      !Array.isArray(existing.cvData)
        ? (existing.cvData as unknown as Record<string, unknown>)
        : null;
    const photo =
      existingCv &&
      typeof existingCv.photo === "string" &&
      existingCv.photo.length > 0
        ? existingCv.photo
        : null;

    const cvData = {
      personal: data.personal,
      summary: data.summary,
      experiences,
      education,
      skills,
      languages,
      ...(theme ? { theme } : {}),
      photo,
    };

    const payload = JSON.parse(JSON.stringify(cvData));

    const row = existing
      ? await prisma.publicResume.update({
          where: { slug },
          data: { cvData: payload, isPublic: true },
        })
      : await prisma.publicResume.create({
          data: { slug, cvData: payload, isPublic: true, viewsCount: 0 },
        });

    return NextResponse.json({ publicResume: resumeJson(row, request) });
  } catch (error) {
    console.error("[public-cv/builder][POST]", error);
    return NextResponse.json(
      {
        error:
          "Enregistrement impossible. Si le probleme persiste, ouvrez /api/diagnostic-cv?slug=" +
          slug,
      },
      { status: 500 }
    );
  }
}
'@

if (Test-Path -LiteralPath $routePath) {
  $existingRoute = Read-TextFile $routePath
  if ($existingRoute.Contains($routeMarker)) {
    Write-Host "  [=] $routePath : deja presente, ignoree"
  } else {
    $null = Backup-File $routePath "publi"
    Write-TextFile $routePath ($routeTs.Replace("`r`n", "`n"))
    Write-Host ("  [OK] remplacee : " + $routePath)
  }
} else {
  New-Item -ItemType Directory -Path (Split-Path -Parent (Join-Path (Get-Location).Path $routePath)) -Force | Out-Null
  Write-TextFile $routePath ($routeTs.Replace("`r`n", "`n"))
  Write-Host ("  [OK] creee : " + $routePath)
}

# ============================================================================
Write-Host "`n[2/3] Patchs ancre du builder (sauvegarde + abandon si derive)..."
# ============================================================================

$builder = Read-TextFile $builderPath
$builder = $builder.Replace("`r`n", "`n")
Test-Uffid $builder $builderPath

# --- Patch B1 : import de l'icone IconWorld (@tabler/icons-react) ----------
$builder = Apply-Patch -Text $builder -Label "B1 import IconWorld" -Find @'
  IconWand,
  IconX,
} from "@tabler/icons-react";
'@ -Replace @'
  IconWand,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
'@

# --- Patch B2 : etats de publication ---------------------------------------
$builder = Apply-Patch -Text $builder -Label "B2 etats publication" -Find @'
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
'@ -Replace @'
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  /* CV public : publication du builder vers la page /u/[slug] */
  const [pubSlug, setPubSlug] = useState<string | null>(null);
  const [pubUrl, setPubUrl] = useState<string | null>(null);
  const [pubViews, setPubViews] = useState<number | null>(null);
  const [pubLoading, setPubLoading] = useState(false);
'@

# --- Patch B3 : chargement de la config + fonction de publication ----------
$builder = Apply-Patch -Text $builder -Label "B3 logique publication" -Find @'
  function update(patch: Partial<CvBuilderData>) {
'@ -Replace @'
  /* -------------------------------------------------------------- */
  /*  CV public - publication du builder vers /u/[slug]              */
  /* -------------------------------------------------------------- */

  /* Configuration existante (slug, lien, vues) au chargement. */
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public-cv/builder", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { publicResume?: { slug?: string; publicUrl?: string; viewsCount?: number } | null }
          | null;
        if (cancelled || !json?.publicResume?.slug) return;
        setPubSlug(json.publicResume.slug);
        setPubUrl(json.publicResume.publicUrl ?? null);
        setPubViews(
          typeof json.publicResume.viewsCount === "number"
            ? json.publicResume.viewsCount
            : 0
        );
      } catch {
        /* serveur injoignable : bloc en mode non publie */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  /* Design du builder -> templateId comprehensible par la page publique. */
  function mapDesignTemplate(id: "modern" | "sleek" | "bold" | "clean"): string {
    if (id === "sleek") return "sleek-executive";
    if (id === "bold") return "bold-minimalism";
    if (id === "clean") return "clean-ats";
    return "modern-accent";
  }

  async function handlePublishPublicCv() {
    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (etape 1) avant la publication.");
      setStep(0);
      setMobileTab("form");
      return;
    }
    setPubLoading(true);
    try {
      const res = await fetch("/api/public-cv/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: pubSlug ?? undefined,
          theme: {
            webTemplate: mapDesignTemplate(design.template),
            accentColor: design.accent,
            qrTemplate: "executif",
          },
          data: {
            personal: {
              fullName: data.personal.fullName.trim(),
              title: data.personal.title.trim(),
              email: data.personal.email.trim(),
              phone: data.personal.phone.trim(),
              location: data.personal.location.trim(),
              linkedin: data.personal.linkedin.trim(),
            },
            summary: data.summary.trim(),
            experiences: data.experiences
              .map((e) => ({
                role: e.role.trim(),
                company: e.company.trim(),
                period: e.period.trim(),
                location: e.location.trim(),
                achievements: e.achievements.map((a) => a.trim()).filter(Boolean),
              }))
              .filter(
                (e) => e.role !== "" || e.company !== "" || e.achievements.length > 0
              ),
            education: data.education
              .map((e) => ({
                degree: e.degree.trim(),
                school: e.school.trim(),
                period: e.period.trim(),
              }))
              .filter((e) => e.degree !== "" || e.school !== ""),
            skills: data.skills.map((s) => s.trim()).filter(Boolean),
            languages: data.languages
              .map((l) => ({ name: l.name.trim(), level: l.level.trim() }))
              .filter((l) => l.name !== ""),
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            publicResume?: { slug?: string; publicUrl?: string; viewsCount?: number };
            error?: string;
          }
        | null;
      if (!res.ok || !json?.publicResume?.slug) {
        toast.error(
          json?.error ?? `Publication impossible (code ${res.status}). Reessayez.`
        );
        return;
      }
      setPubSlug(json.publicResume.slug);
      setPubUrl(json.publicResume.publicUrl ?? null);
      setPubViews(
        typeof json.publicResume.viewsCount === "number"
          ? json.publicResume.viewsCount
          : 0
      );
      toast.success("CV publie en ligne ! Le lien Voir en ligne est actif dans l'en-tete.");
    } catch {
      toast.error("Impossible de joindre le serveur. Verifiez votre connexion et reessayez.");
    } finally {
      setPubLoading(false);
    }
  }

  function update(patch: Partial<CvBuilderData>) {
'@

# --- Patch B4 : bouton Publier + lien Voir en ligne dans l'en-tete ----------
$builder = Apply-Patch -Text $builder -Label "B4 bouton Publier en-tete" -Find @'
            <Button
              type="button"
              onClick={handlePrint}
'@ -Replace @'
            {pubSlug !== null && (
              <a
                href={pubUrl ?? `/u/${pubSlug}`}
                target="_blank"
                rel="noreferrer"
                title="Ouvrir votre CV public dans un nouvel onglet"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-bold text-navy transition-colors hover:bg-slate-50"
              >
                <IconWorld className="size-4 text-gold" />
                <span className="hidden sm:inline">
                  Voir en ligne
                  {typeof pubViews === "number" && pubViews > 0
                    ? ` - ${pubViews} vue(s)`
                    : null}
                </span>
                <span className="sm:hidden">En ligne</span>
              </a>
            )}

            <button
              type="button"
              onClick={handlePublishPublicCv}
              disabled={pubLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-xs font-semibold text-navy transition-colors hover:bg-[#FFD056] disabled:cursor-not-allowed disabled:opacity-60"
              title="Publier la version actuelle du CV sur votre page publique"
            >
              {pubLoading ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconWorld className="size-4" />
              )}
              <span className="hidden sm:inline">Publier en ligne</span>
              <span className="sm:hidden">Publier</span>
            </button>

            <Button
              type="button"
              onClick={handlePrint}
'@

$null = Backup-File $builderPath "publi"
Write-TextFile $builderPath $builder
Write-Host ("  [OK] ecrit : " + $builderPath + " (" + $builder.Length + " caracteres)")

# ============================================================================
Write-Host "`n[3/3] Verification..."
# ============================================================================

if (-not (Read-TextFile $routePath).Contains($routeMarker)) {
  throw "VERIFICATION ECHOUEE : la route creee est illisible."
}
$written = Read-TextFile $builderPath
foreach ($needle in @(
  "IconWorld,",
  "pubSlug, setPubSlug",
  "handlePublishPublicCv",
  "api/public-cv/builder",
  "Publier en ligne"
)) {
  if (-not $written.Contains($needle)) {
    throw ("VERIFICATION ECHOUEE : marqueur absent du builder : " + $needle)
  }
}
Write-Host "  [OK] marqueurs presents dans les 2 fichiers"

if (-not $SkipTsc) {
  Write-Host "`n  npx tsc --noEmit en cours (1-2 min, Ctrl+C pour ignorer)..."
  npx tsc --noEmit
  if ($LASTEXITCODE -ne 0) {
    throw "tsc a signale des erreurs : corrigez avant de tester."
  }
  Write-Host "  [OK] tsc : aucune erreur de type"
} else {
  Write-Host "  [i] -SkipTsc : verification des types ignoree"
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " TERMINE - protocole de test (localhost:3000)"
Write-Host "=============================================================="
Write-Host ""
Write-Host " 1) Serveur de dev (si besoin) :  npm run dev"
Write-Host " 2) Ouvrez  http://localhost:3000/dashboard/cv-builder"
Write-Host "    - Etape 1 : corrigez le champ LinkedIn"
Write-Host "      (remplacez la valeur polluee par https://www.linkedin.com/in/votre-profil)"
Write-Host " 3) Cliquez  [Publier en ligne]  (bouton or, en haut a droite)"
Write-Host "    -> toast de succes + lien  Voir en ligne - N vues"
Write-Host " 4) Ouvrez  http://localhost:3000/u/kouton-clement  (Ctrl+Shift+R)"
Write-Host "    Attendu : PROFIL enrichi, EXPERIENCES avec puces,"
Write-Host "    FORMATION licence/Master/DT, COMPETENCES completes,"
Write-Host "    LANGUES, CONTACT propre. Les 48 vues sont conservees."
Write-Host " 5) Git (hygiene) : ne commitez PAS les .bak :"
Write-Host '    git add src/app/api/public-cv/builder/route.ts src/app/dashboard/cv-builder/page.tsx'
Write-Host '    git commit -m "feat(cv): publication du builder vers la page publique /u/[slug]"'
Write-Host ""
Write-Host " Rollback : restaurez les fichiers .bak-publi-$stamp"
Write-Host ""
