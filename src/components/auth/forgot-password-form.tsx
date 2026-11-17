"use client";

/**
 * Demande de réinitialisation : la réponse est TOUJOURS identique que
 * l'email existe ou non (prévention de l'énumération d'utilisateurs).
 */
import { useActionState, useState } from "react";
import Link from "next/link";
import { IconAlertCircle, IconCheck, IconLoader2, IconMail, IconArrowRight } from "@tabler/icons-react";
import { cx } from "@/lib/ui-classes";

import { forgotPasswordAction, type FormState } from "@/actions/auth-actions";
import { forgotPasswordSchema, zodFieldErrors } from "@/lib/auth-validations";

const INITIAL: FormState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, INITIAL);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  function handleValidate(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
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
          Mot de passe oublié ?
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Saisissez votre email : nous vous enverrons un lien pour choisir un
          nouveau mot de passe. Le lien est valable 1 heure.
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

      {state.status === "success" && state.message ? (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          <IconCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </div>
      ) : null}

      {state.status !== "success" ? (
        <form action={formAction} onSubmit={handleValidate} noValidate className="space-y-4">
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
                aria-invalid={Boolean(clientErrors.email ?? state.fieldErrors?.email)}
                className={cx(
                  "w-full rounded-xl border bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-navy/10",
                  clientErrors.email ?? state.fieldErrors?.email
                    ? "border-red-400 focus:border-red-400"
                    : "border-slate-200 focus:border-navy/40"
                )}
              />
            </div>
            {clientErrors.email ?? state.fieldErrors?.email ? (
              <p className="text-xs font-medium text-red-600" role="alert">
                {clientErrors.email ?? state.fieldErrors?.email}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <>
                <IconLoader2 className="size-4 animate-spin" aria-hidden />
                Envoi en cours…
              </>
            ) : (
              <>
                Envoyer le lien de réinitialisation
                <IconArrowRight className="size-4" aria-hidden />
              </>
            )}
          </button>
        </form>
      ) : null}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-navy underline-offset-2 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
