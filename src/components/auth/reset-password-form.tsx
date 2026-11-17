"use client";

/**
 * Nouveau mot de passe — le token (URL ?token=…) est transmis via un champ
 * caché ; il est validé côté serveur (empreinte SHA-256 + expiration 1 h).
 */
import { useActionState, useState } from "react";
import Link from "next/link";
import { IconAlertCircle, IconArrowRight, IconLoader2 } from "@tabler/icons-react";

import { resetPasswordAction, type FormState } from "@/actions/auth-actions";
import { resetPasswordSchema, zodFieldErrors } from "@/lib/auth-validations";
import { PasswordField } from "@/components/auth/password-field";

const INITIAL: FormState = { status: "idle" };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, INITIAL);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const fieldError = (field: string) =>
    clientErrors[field] ?? state.fieldErrors?.[field];

  function handleValidate(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
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
          Nouveau mot de passe
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Choisissez un mot de passe fort pour sécuriser votre compte.
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

      <form action={formAction} onSubmit={handleValidate} noValidate className="space-y-4">
        {/* Token transmis en champ caché — validé côté serveur */}
        <input type="hidden" name="token" value={token} />

        <PasswordField
          name="password"
          label="Nouveau mot de passe"
          error={fieldError("password")}
          autoComplete="new-password"
        />

        <div className="-mt-1 rounded-xl bg-gold-soft px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600">
          <span className="font-semibold text-navy">Mot de passe fort requis :</span>{" "}
          8 caractères minimum, avec au moins une majuscule, une minuscule,
          un chiffre et un caractère spécial.
        </div>

        <PasswordField
          name="confirmPassword"
          label="Confirmer le nouveau mot de passe"
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
              Mise à jour…
            </>
          ) : (
            <>
              Mettre à jour le mot de passe
              <IconArrowRight className="size-4" aria-hidden />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link
          href="/forgot-password"
          className="font-semibold text-navy underline-offset-2 hover:underline"
        >
          Demander un nouveau lien
        </Link>
      </p>
    </div>
  );
}
