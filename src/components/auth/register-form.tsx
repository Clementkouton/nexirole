"use client";

/**
 * Formulaire d'inscription — validation Zod côté client + serveur,
 * mot de passe fort imposé (8+, majuscule, minuscule, chiffre, spécial),
 * confirmation, états de chargement.
 */
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  IconAlertCircle,
  IconArrowRight,
  IconLoader2,
  IconMail,
  IconUser,
} from "@tabler/icons-react";
import { cx } from "@/lib/ui-classes";

import { registerAction, type FormState } from "@/actions/auth-actions";
import { registerSchema, zodFieldErrors } from "@/lib/auth-validations";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";

const INITIAL: FormState = { status: "idle" };

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, INITIAL);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const fieldError = (field: string) =>
    clientErrors[field] ?? state.fieldErrors?.[field];

  function handleValidate(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      event.preventDefault();
      setClientErrors(zodFieldErrors(parsed.error));
    } else {
      setClientErrors({});
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy">
          Créez votre compte
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Gratuit — CV, lettres et offres d&apos;emploi analysées par l&apos;IA.
        </p>
      </div>

      {state.status === "error" && state.message ? (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="space-y-4">
        <GoogleButton label="Continuer avec Google" />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            ou par email
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form action={formAction} onSubmit={handleValidate} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-navy">
              Nom complet
            </label>
            <div className="relative">
              <IconUser
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Marie Dupont"
                aria-invalid={Boolean(fieldError("name"))}
                className={cx(
                  "w-full rounded-xl border bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-navy/10",
                  fieldError("name")
                    ? "border-red-400 focus:border-red-400"
                    : "border-slate-200 focus:border-navy/40"
                )}
              />
            </div>
            {fieldError("name") ? (
              <p className="text-xs font-medium text-red-600" role="alert">
                {fieldError("name")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-navy">
              Email
            </label>
            <div className="relative">
              <IconMail
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                aria-invalid={Boolean(fieldError("email"))}
                className={cx(
                  "w-full rounded-xl border bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-navy/10",
                  fieldError("email")
                    ? "border-red-400 focus:border-red-400"
                    : "border-slate-200 focus:border-navy/40"
                )}
              />
            </div>
            {fieldError("email") ? (
              <p className="text-xs font-medium text-red-600" role="alert">
                {fieldError("email")}
              </p>
            ) : null}
          </div>

          <PasswordField
            name="password"
            label="Mot de passe"
            error={fieldError("password")}
            autoComplete="new-password"
          />

          <div className="-mt-1 rounded-xl bg-gold-soft px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600">
            <span className="font-semibold text-navy">Mot de passe fort requis :</span>{" "}
            8 caractères minimum, avec au moins une majuscule, une minuscule,
            un chiffre et un caractère spécial (ex : <span className="font-mono">A1b2c3d!</span>).
          </div>

          <PasswordField
            name="confirmPassword"
            label="Confirmer le mot de passe"
            error={fieldError("confirmPassword")}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <>
                <IconLoader2 className="size-4 animate-spin" aria-hidden />
                Création du compte…
              </>
            ) : (
              <>
                Créer mon compte
                <IconArrowRight className="size-4" aria-hidden />
              </>
            )}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        Déjà inscrit ?{" "}
        <Link
          href="/login"
          className="font-semibold text-navy underline-offset-2 hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </div>
  );
}
