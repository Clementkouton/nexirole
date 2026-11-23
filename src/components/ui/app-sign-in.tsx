"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  IconAlertCircle,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconEye,
  IconEyeOff,
  IconFileExport,
  IconFileText,
  IconLoader2,
  IconLock,
  IconMail,
  IconRadar,
  IconShieldLock,
  IconUser,
} from "@tabler/icons-react";
import { loginAction, registerAction } from "@/app/actions/auth";

type Mode = "login" | "register";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "E-mail ou mot de passe incorrect.",
  OAuthAccountNotLinked:
    "Cet e-mail est déjà associé à une autre méthode de connexion. Utilisez Google ou votre mot de passe habituel.",
  AccessDenied: "Accès refusé. Réessayez ou contactez le support.",
  Verification: "Lien de vérification expiré. Demandez-en un nouveau.",
  default: "Une erreur est survenue lors de la connexion. Réessayez.",
};

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

const KEYFRAMES = `
@keyframes nxr-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes nxr-pop { 0% { opacity: 0; transform: scale(0.6); } 70% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
.nxr-fade-up { animation: nxr-fade-up 0.5s ease-out both; }
.nxr-pop { animation: nxr-pop 0.45s cubic-bezier(0.22, 1.2, 0.36, 1) both; }
`;

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.18 7.18 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function AuthField({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  icon,
  children,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#051937] focus:bg-white focus:ring-2 focus:ring-[#051937]/10"
        />
        {children ? (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">{children}</span>
        ) : null}
      </span>
    </label>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const checks = useMemo(
    () => [
      { ok: password.length >= 8, label: "8 caractères minimum" },
      { ok: /[A-Z]/.test(password), label: "Au moins une majuscule" },
      { ok: /[0-9]/.test(password), label: "Au moins un chiffre" },
    ],
    [password]
  );
  const score = checks.filter((check) => check.ok).length;
  if (!password) return null;

  const barColor = score <= 1 ? "bg-red-500" : score === 2 ? "bg-[#FFC107]" : "bg-green-500";
  const labelText = score <= 1 ? "Mot de passe faible" : score === 2 ? "Mot de passe correct" : "Mot de passe solide";
  const labelColor = score <= 1 ? "text-red-600" : score === 2 ? "text-[#B7791F]" : "text-green-600";

  return (
    <div className="mt-1.5 nxr-fade-up">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${labelColor}`}>{labelText}</span>
        <span className="text-xs text-slate-400">{score}/3</span>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              index < score ? barColor : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`flex items-center gap-1.5 text-xs ${check.ok ? "text-green-600" : "text-slate-400"}`}
          >
            <IconCheck className="h-3.5 w-3.5" />
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BenefitsPanel() {
  const benefits = [
    {
      icon: <IconRadar className="h-6 w-6 text-[#FFC107]" />,
      title: "Détection d'opportunités",
      text: "L'IA analyse le marché en continu et repère les offres qui collent à votre profil.",
    },
    {
      icon: <IconFileText className="h-6 w-6 text-[#FFC107]" />,
      title: "CV et lettres optimisés",
      text: "Générez des candidatures sur mesure, adaptées à chaque offre, en quelques secondes.",
    },
    {
      icon: <IconFileExport className="h-6 w-6 text-[#FFC107]" />,
      title: "Export PDF instantané",
      text: "Téléchargez vos documents prêts à envoyer, avec une mise en page professionnelle.",
    },
  ];

  return (
    <aside className="relative hidden w-[44%] max-w-2xl flex-col justify-between overflow-hidden bg-[#051937] p-12 lg:flex">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 12%, rgba(255,193,7,0.16), transparent 42%), radial-gradient(circle at 82% 85%, rgba(255,193,7,0.10), transparent 40%)",
        }}
      />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#FFC107]/30 bg-[#FFC107]/10 px-3 py-1 text-xs font-semibold text-[#FFC107]">
          <IconShieldLock className="h-3.5 w-3.5" />
          Votre carrière, en essor
        </span>
      </div>
      <div className="relative nxr-fade-up">
        <h2 className="text-3xl font-bold leading-tight text-white">
          L'assistant IA qui <span className="text-[#FFC107]">propulse votre carrière</span>
        </h2>
        <ul className="mt-8 space-y-6">
          {benefits.map((benefit) => (
            <li key={benefit.title} className="flex gap-4">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                {benefit.icon}
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{benefit.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-300">{benefit.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-xs text-slate-400">
        © {new Date().getFullYear()} NexiRole — Tous droits réservés
      </p>
    </aside>
  );
}

function AuthCardSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-md animate-pulse rounded-2xl border border-slate-100 bg-white p-8">
        <div className="h-10 w-2/3 rounded-lg bg-slate-100" />
        <div className="mt-6 h-12 rounded-full bg-slate-100" />
        <div className="mt-8 space-y-4">
          <div className="h-14 rounded-xl bg-slate-100" />
          <div className="h-14 rounded-xl bg-slate-100" />
        </div>
        <div className="mt-8 h-12 rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}

function AppSignInInner({ initialMode }: { initialMode?: Mode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [mode, setMode] = useState<Mode>(initialMode ?? "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const successHandledRef = useRef(false);

  const callbackUrl = useMemo(() => {
    const raw = searchParams.get("callbackUrl");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
    return raw;
  }, [searchParams]);

  const oauthError = searchParams.get("error");

  useEffect(() => {
    if (!oauthError) return;
    setFormError(OAUTH_ERROR_MESSAGES[oauthError] ?? OAUTH_ERROR_MESSAGES.default);
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    const queryString = url.searchParams.toString();
    window.history.replaceState(null, "", url.pathname + (queryString ? `?${queryString}` : ""));
  }, [oauthError]);

  function switchMode(next: Mode) {
    if (mode === next) return;
    setMode(next);
    setFormError(null);
    setPassword("");
  }

  async function runSuccessFlow() {
    if (successHandledRef.current) return;
    successHandledRef.current = true;
    setFormError(null);
    setRedirecting(true);
    try {
      await update();
    } catch {
      // La session sera de toute façon relue au prochain rendu.
    }
    router.replace(callbackUrl);
    router.refresh();
  }

  async function handleGoogle() {
    if (googleLoading || submitting) return;
    setGoogleLoading(true);
    setFormError(null);
    try {
      await signIn("google", { redirectTo: callbackUrl });
    } catch {
      setFormError("Impossible de démarrer la connexion Google. Réessayez.");
      setGoogleLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!EMAIL_REGEX.test(email.trim())) {
      setFormError("Veuillez saisir une adresse e-mail valide.");
      return;
    }
    if (!password) {
      setFormError("Veuillez saisir votre mot de passe.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await loginAction({ email: email.trim().toLowerCase(), password });
      if (result && result.error) {
        setFormError(result.error);
        setSubmitting(false);
        return;
      }
      await runSuccessFlow();
    } catch (error) {
      if (isNextRedirectError(error)) return;
      setFormError("Connexion impossible pour le moment. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (name.trim().length < 2) {
      setFormError("Veuillez saisir votre nom (2 caractères minimum).");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setFormError("Veuillez saisir une adresse e-mail valide.");
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setFormError("Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await registerAction({ name: name.trim(), email: email.trim().toLowerCase(), password });
      if (result && result.error) {
        setFormError(result.error);
        setSubmitting(false);
        return;
      }
      await runSuccessFlow();
    } catch (error) {
      if (isNextRedirectError(error)) return;
      setFormError("Inscription impossible pour le moment. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" && !redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <IconLoader2 className="h-8 w-8 animate-spin text-[#051937]/40" />
      </div>
    );
  }

  if (status === "authenticated" && !redirecting) {
    return (
      <div className="flex min-h-screen bg-[#F8FAFC]">
        <style>{KEYFRAMES}</style>
        <BenefitsPanel />
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-[0_20px_60px_rgba(5,25,55,0.10)] nxr-fade-up">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 nxr-pop">
              <IconCircleCheck className="h-10 w-10 text-green-500" />
            </span>
            <h1 className="mt-4 text-xl font-bold text-[#051937]">
              Vous êtes déjà connecté{session?.user?.name ? `, ${session.user.name}` : ""}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Accédez directement à votre espace NexiRole.</p>
            <button
              type="button"
              onClick={() => router.push(callbackUrl)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#051937] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0B2A5B]"
            >
              Aller à mon espace
              <IconArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void signOut({ redirectTo: "/" })}
              className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Se déconnecter
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#ffffff]">
      <style>{KEYFRAMES}</style>
      <BenefitsPanel />
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {formError ? (
            <div
              className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 nxr-fade-up"
              role="alert"
            >
              <IconAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="relative rounded-2xl border border-slate-100 bg-white p-8 shadow-[0_20px_60px_rgba(5,25,55,0.10)] nxr-fade-up">
            {redirecting ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/95">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 nxr-pop">
                  <IconCircleCheck className="h-10 w-10 text-green-500" />
                </span>
                <p className="text-sm font-semibold text-[#051937]">Connexion réussie</p>
                <p className="text-xs text-slate-500">Redirection vers votre espace…</p>
              </div>
            ) : (
              <>
                <div className="mb-8 text-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#FFC107]/10 px-3 py-1 text-xs font-semibold text-[#B7791F]">
                    <IconShieldLock className="h-3.5 w-3.5" />
                    Accès sécurisé
                  </span>
                  <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#051937]">
                    {mode === "login" ? "Bon retour parmi nous" : "Créez votre compte"}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {mode === "login"
                      ? "Connectez-vous pour retrouver votre espace carrière."
                      : "Quelques secondes suffisent pour démarrer."}
                  </p>
                </div>

                <div className="relative mb-8 grid grid-cols-2 rounded-full bg-slate-100 p-1">
                  <span
                    className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#051937] shadow transition-transform duration-300 ease-out ${
                      mode === "login" ? "translate-x-0" : "translate-x-[calc(100%+4px)]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className={`relative z-10 rounded-full py-2 text-sm font-semibold transition-colors ${
                      mode === "login" ? "text-white" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Connexion
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className={`relative z-10 rounded-full py-2 text-sm font-semibold transition-colors ${
                      mode === "register" ? "text-white" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Inscription
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleLoading || submitting}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#051937]/30 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {googleLoading ? (
                    <IconLoader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : (
                    <GoogleIcon className="h-5 w-5" />
                  )}
                  <span>Continuer avec Google</span>
                </button>

                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">ou par e-mail</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                {mode === "login" ? (
                  <form onSubmit={handleLogin} className="space-y-4" noValidate>
                    <AuthField
                      label="Adresse e-mail"
                      type="email"
                      value={email}
                      onChange={setEmail}
                      placeholder="vous@exemple.com"
                      autoComplete="email"
                      icon={<IconMail className="h-5 w-5 text-slate-400" />}
                    />
                    <AuthField
                      label="Mot de passe"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={setPassword}
                      placeholder="Votre mot de passe"
                      autoComplete="current-password"
                      icon={<IconLock className="h-5 w-5 text-slate-400" />}
                    >
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        className="text-slate-400 transition hover:text-[#051937]"
                      >
                        {showPassword ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
                      </button>
                    </AuthField>
                    <button
                      type="submit"
                      disabled={submitting || googleLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#051937] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0B2A5B] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <IconLoader2 className="h-5 w-5 animate-spin" />
                          Connexion en cours…
                        </>
                      ) : (
                        "Se connecter"
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-4" noValidate>
                    <AuthField
                      label="Nom complet"
                      type="text"
                      value={name}
                      onChange={setName}
                      placeholder="Clément Kouton"
                      autoComplete="name"
                      icon={<IconUser className="h-5 w-5 text-slate-400" />}
                    />
                    <AuthField
                      label="Adresse e-mail"
                      type="email"
                      value={email}
                      onChange={setEmail}
                      placeholder="vous@exemple.com"
                      autoComplete="email"
                      icon={<IconMail className="h-5 w-5 text-slate-400" />}
                    />
                    <div>
                      <AuthField
                        label="Mot de passe"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={setPassword}
                        placeholder="8+ caractères, 1 majuscule, 1 chiffre"
                        autoComplete="new-password"
                        icon={<IconLock className="h-5 w-5 text-slate-400" />}
                      >
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                          className="text-slate-400 transition hover:text-[#051937]"
                        >
                          {showPassword ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
                        </button>
                      </AuthField>
                      <PasswordStrength password={password} />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || googleLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#051937] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0B2A5B] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <IconLoader2 className="h-5 w-5 animate-spin" />
                          Création du compte…
                        </>
                      ) : (
                        "Créer mon compte"
                      )}
                    </button>
                  </form>
                )}

                <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
                  En continuant, vous acceptez les conditions d'utilisation et la politique de confidentialité de
                  NexiRole.
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export function AppSignIn({ initialMode = "login" }: { initialMode?: Mode }) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <AppSignInInner initialMode={initialMode} />
    </Suspense>
  );
}