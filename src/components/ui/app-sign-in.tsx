"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ComponentType, FormEvent, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  IconAlertTriangle,
  IconCircle,
  IconCircleCheck,
  IconEye,
  IconEyeOff,
  IconFileExport,
  IconFileText,
  IconLoader2,
  IconLock,
  IconMail,
  IconRadar,
  IconUser,
} from "@tabler/icons-react";
import { loginAction, registerAction } from "@/app/actions/auth";

type AuthMode = "login" | "register";
type IconComponent = ComponentType<{ className?: string }>;

// Traduction française des erreurs OAuth renvoyées dans l'URL (?error=...)
const OAUTH_ERROR_MESSAGES: Record<string, string | undefined> = {
  OAuthAccountNotLinked:
    "Cet e-mail possède déjà un compte avec mot de passe. Connectez-vous avec votre mot de passe, puis ajoutez Google depuis votre espace.",
  OAuthCallbackError:
    "La connexion Google a été interrompue. Veuillez réessayer.",
  OAuthSignin:
    "Impossible de démarrer la connexion Google. Veuillez réessayer.",
  AccessDenied:
    "Accès refusé par le fournisseur de connexion.",
  Configuration:
    "Erreur de configuration du serveur d'authentification. Contactez le support.",
  Verification:
    "Le lien de vérification a expiré. Veuillez vous reconnecter.",
};

const BENEFITS: { icon: IconComponent; title: string; description: string }[] = [
  {
    icon: IconRadar,
    title: "Scan d'offres en direct",
    description:
      "L'agent IA passe au crible les offres et repère celles qui collent à votre profil.",
  },
  {
    icon: IconFileText,
    title: "CV & lettres calibrés ATS",
    description:
      "Des documents optimisés pour passer les filtres automatiques des recruteurs.",
  },
  {
    icon: IconFileExport,
    title: "Export PDF A4 instantané",
    description:
      "Votre dossier complet, prêt à envoyer au format A4 en un seul clic.",
  },
];

// ── Champ de formulaire réutilisable ────────────────────────
type AuthFieldProps = {
  id: string;
  label: string;
  icon: IconComponent;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  trailing?: ReactNode;
};

function AuthField({
  id,
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  trailing,
}: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          <Icon className="h-5 w-5" />
        </span>
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className={`w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-[#051937] focus:ring-4 focus:ring-[#051937]/10 ${
            trailing ? "pr-11" : "pr-4"
          }`}
        />
        {trailing}
      </div>
    </div>
  );
}

// ── Icône Google officielle ─────────────────────────────────
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.796 12.25c0-.85-.074-1.664-.212-2.44H12v4.62h6.583a5.63 5.63 0 0 1-2.443 3.69v3.07h3.95c2.31-2.13 3.706-5.26 3.706-8.94z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.238 0 5.957-1.073 7.943-2.903l-3.95-3.07c-1.09.737-2.484 1.17-3.993 1.17-3.07 0-5.674-2.075-6.6-4.865H1.313v3.17A11.995 11.995 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.332a7.2 7.2 0 0 1 0-4.664V6.5H1.313a12 12 0 0 0 0 11l4.087-3.168z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.686 0 3.196.58 4.39 1.72l3.28-3.28C17.644 1.19 14.95 0 12 0 7.533 0 3.63 2.606 1.313 6.5l4.087 3.168C6.326 6.875 8.93 4.75 12 4.75z"
      />
    </svg>
  );
}

// ── Squelette de chargement ─────────────────────────────────
function AuthCardSkeleton() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-md animate-pulse rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <div className="mx-auto h-12 w-12 rounded-xl bg-slate-200" />
        <div className="mx-auto mt-4 h-5 w-40 rounded-full bg-slate-200" />
        <div className="mx-auto mt-2 h-4 w-56 rounded-full bg-slate-100" />
        <div className="mt-6 h-11 rounded-xl bg-slate-100" />
        <div className="mx-auto mt-5 h-4 w-48 rounded-full bg-slate-100" />
        <div className="mt-5 space-y-4">
          <div className="h-16 rounded-xl bg-slate-100" />
          <div className="h-16 rounded-xl bg-slate-100" />
          <div className="h-12 rounded-xl bg-[#051937]/80" />
        </div>
      </div>
    </div>
  );
}

// ── Composant interne (utilise useSearchParams → sous Suspense) ──
function AppSignInInner({ initialMode }: { initialMode: AuthMode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status, update } = useSession();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<null | "login" | "register">(null);
  const [urlErrorDismissed, setUrlErrorDismissed] = useState(false);

  // callbackUrl sécurisé : uniquement relatif, jamais de domaine externe
  const callbackUrl = useMemo(() => {
    const raw = searchParams.get("callbackUrl");
    return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  }, [searchParams]);

  const oauthErrorCode = searchParams.get("error") ?? "";
  const oauthError =
    oauthErrorCode && !urlErrorDismissed
      ? OAUTH_ERROR_MESSAGES[oauthErrorCode] ??
        "Une erreur d'authentification est survenue. Réessayez."
      : null;

  // Nettoie ?error= de l'URL sans recharger la page
  useEffect(() => {
    if (!oauthErrorCode) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url.toString());
  }, [oauthErrorCode]);

  // Indicateur de robustesse du mot de passe (temps réel)
  const passwordChecks = useMemo(
    () => [
      { ok: password.length >= 8, label: "8 caractères min." },
      { ok: /[A-Z]/.test(password), label: "1 majuscule" },
      { ok: /\d/.test(password), label: "1 chiffre" },
    ],
    [password]
  );
  const passwordScore = passwordChecks.filter((check) => check.ok).length;
  const isPasswordValid = passwordScore === passwordChecks.length;

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setSuccess(null);
    setUrlErrorDismissed(false);
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      // v5 : le paramètre s'appelle redirectTo (ex-callbackUrl)
      await signIn("google", { redirectTo: callbackUrl });
    } catch {
      setError("Impossible de démarrer la connexion Google. Réessayez.");
      setGoogleLoading(false);
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formLoading) return;
    setError(null);

    if (mode === "register" && !isPasswordValid) {
      setError("Le mot de passe ne respecte pas encore tous les critères.");
      return;
    }

    setFormLoading(true);
    try {
      const result =
        mode === "login"
          ? await loginAction(email, password)
          : await registerAction(name, email, password);

      if (result?.error) {
        setError(result.error);
        setFormLoading(false);
        return;
      }

      setSuccess(mode);
      await update(); // rafraîchit la session côté client
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("Une erreur inattendue est survenue. Réessayez.");
      setFormLoading(false);
    }
  }

  // Session déjà active : carte « déjà connecté »
  if (status === "authenticated") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F8FAFC] px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5">
          <Image
            src="/logo.png"
            alt="Logo NexiRole"
            width={48}
            height={48}
            className="mx-auto h-12 w-12 rounded-xl object-contain"
          />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-[#051937]">
            Vous êtes déjà connecté
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Votre session est active. Accédez directement à votre espace candidat.
          </p>
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => router.replace(callbackUrl)}
              className="w-full rounded-xl bg-[#051937] px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#0a2a5c]"
            >
              Aller à mon espace
            </button>
            <button
              type="button"
              onClick={() => {
                void signOut({ redirectTo: "/login" });
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen bg-[#F8FAFC] lg:grid-cols-2">
      <style>{`
        @keyframes nxr-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nxr-fade-up { animation: nxr-fade-up 0.3s ease-out both; }
        @keyframes nxr-pop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .nxr-pop { animation: nxr-pop 0.35s ease-out both; }
      `}</style>

      {/* ── Panneau latéral de valeur (grand écran) ── */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden bg-[#051937] p-10 lg:flex xl:p-14"
        style={{
          backgroundImage:
            "radial-gradient(55rem 55rem at 115% -10%, rgba(255,193,7,0.16), transparent 60%), radial-gradient(45rem 45rem at -15% 110%, rgba(255,255,255,0.07), transparent 55%)",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-lg">
            <Image
              src="/logo.png"
              alt="Logo NexiRole"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          </span>
          <div>
            <p className="text-lg font-bold tracking-tight text-white">NexiRole</p>
            <p className="text-xs font-medium text-[#FFC107]">AI Career Copilot</p>
          </div>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-white xl:text-4xl">
            Votre copilote pour décrocher le bon poste.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            NexiRole surveille le marché, prépare vos documents et vous fait gagner
            des heures à chaque candidature.
          </p>

          <ul className="mt-10 space-y-6">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title} className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <benefit.icon className="h-5 w-5 text-[#FFC107]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{benefit.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    {benefit.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} NexiRole — Conçu pour les candidats qui veulent
          aller plus vite sans sacrifier la qualité.
        </p>
      </div>

      {/* ── Carte centrale ── */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
            <div className="flex flex-col items-center text-center">
              <Image
                src="/logo.png"
                alt="Logo NexiRole"
                width={48}
                height={48}
                className="h-12 w-12 rounded-xl object-contain"
              />
              <h1 className="mt-4 text-xl font-bold tracking-tight text-[#051937]">
                {mode === "login" ? "Content de vous revoir" : "Bienvenue sur NexiRole"}
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                {mode === "login"
                  ? "Connectez-vous pour accéder à votre espace candidat."
                  : "Créez votre compte et lancez votre première recherche assistée par IA."}
              </p>
            </div>

            {/* Sélecteur d'onglets fluide */}
            <div className="relative mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist">
              <span
                aria-hidden="true"
                className={`absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out ${
                  mode === "register" ? "translate-x-full" : "translate-x-0"
                }`}
              />
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => switchMode("login")}
                className={`relative z-10 rounded-lg py-2.5 text-sm font-semibold transition-colors duration-200 ${
                  mode === "login" ? "text-[#051937]" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                onClick={() => switchMode("register")}
                className={`relative z-10 rounded-lg py-2.5 text-sm font-semibold transition-colors duration-200 ${
                  mode === "register" ? "text-[#051937]" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Créer un compte
              </button>
            </div>

            {/* SSO Google — en premier */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || formLoading}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {googleLoading ? (
                <IconLoader2 className="h-5 w-5 animate-spin text-[#051937]" />
              ) : (
                <GoogleIcon />
              )}
              <span>{googleLoading ? "Redirection vers Google..." : "Continuer avec Google"}</span>
            </button>

            {/* Séparateur */}
            <div className="mt-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">
                ou avec votre adresse e-mail
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Erreurs (formulaire + OAuth) */}
            {(error || oauthError) && (
              <div className="nxr-fade-up mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="flex-1 text-sm leading-relaxed text-red-700">
                  {error ?? oauthError}
                  {oauthError && (
                    <button
                      type="button"
                      onClick={() => setUrlErrorDismissed(true)}
                      className="mt-1 block text-xs font-semibold text-red-600 underline underline-offset-2 transition-colors hover:text-red-800"
                    >
                      Masquer ce message
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Succès animé puis redirection */}
            {success ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
                <span className="nxr-pop grid h-14 w-14 place-items-center rounded-full bg-emerald-100">
                  <IconCircleCheck className="h-8 w-8 text-emerald-600" />
                </span>
                <p className="text-base font-bold text-[#051937]">
                  {success === "login" ? "Connexion réussie !" : "Compte créé avec succès !"}
                </p>
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                  Redirection vers votre espace...
                </p>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="mt-5 space-y-4" noValidate>
                {mode === "register" && (
                  <AuthField
                    id="name"
                    label="Nom complet"
                    icon={IconUser}
                    value={name}
                    onChange={setName}
                    placeholder="ex. Awa Diallo"
                    autoComplete="name"
                  />
                )}

                <AuthField
                  id="email"
                  label="Adresse e-mail"
                  icon={IconMail}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="vous@exemple.com"
                  autoComplete="email"
                />

                <div>
                  <AuthField
                    id="password"
                    label="Mot de passe"
                    icon={IconLock}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={setPassword}
                    placeholder={
                      mode === "login"
                        ? "Votre mot de passe"
                        : "Choisissez un mot de passe robuste"
                    }
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={
                          showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:text-[#051937]"
                      >
                        {showPassword ? (
                          <IconEyeOff className="h-4 w-4" />
                        ) : (
                          <IconEye className="h-4 w-4" />
                        )}
                      </button>
                    }
                  />

                  {mode === "login" ? (
                    <div className="mt-2 text-right">
                      <Link
                        href="/forgot-password"
                        className="text-xs font-semibold text-[#051937] transition-colors hover:text-[#0a2a5c] hover:underline"
                      >
                        Mot de passe oublié ?
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            passwordScore === 3
                              ? "bg-emerald-500"
                              : passwordScore === 2
                                ? "bg-[#FFC107]"
                                : "bg-red-400"
                          }`}
                          style={{ width: password ? `${(passwordScore / 3) * 100}%` : "0%" }}
                        />
                      </div>
                      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-3">
                        {passwordChecks.map((check) => (
                          <li
                            key={check.label}
                            className={`flex items-center gap-1.5 text-xs ${
                              check.ok ? "text-emerald-600" : "text-slate-400"
                            }`}
                          >
                            {check.ok ? (
                              <IconCircleCheck className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <IconCircle className="h-3.5 w-3.5 shrink-0" />
                            )}
                            {check.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={formLoading || (mode === "register" && !isPasswordValid)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#051937] px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#0a2a5c] hover:shadow-lg hover:shadow-[#051937]/25 focus:outline-none focus:ring-4 focus:ring-[#051937]/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {formLoading ? (
                    <>
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                      <span>
                        {mode === "login" ? "Vérification en cours..." : "Création du compte..."}
                      </span>
                    </>
                  ) : (
                    <span>
                      {mode === "login" ? "Se connecter à mon espace" : "Créer mon compte gratuit"}
                    </span>
                  )}
                </button>

                {mode === "register" && (
                  <p className="text-center text-xs leading-relaxed text-slate-400">
                    Aucune carte bancaire n&apos;est requise pour créer un compte.
                  </p>
                )}
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400 lg:hidden">
            © {new Date().getFullYear()} NexiRole
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Export public (useSearchParams isolé sous Suspense) ──
export function AppSignIn({ initialMode = "login" }: { initialMode?: AuthMode }) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <AppSignInInner initialMode={initialMode} />
    </Suspense>
  );
}