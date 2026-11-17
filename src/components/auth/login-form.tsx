"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  IconAlertCircle,
  IconArrowRight,
  IconCircleCheck,
  IconLoader2,
  IconMail,
} from "@tabler/icons-react";

import { loginAction } from "@/app/actions/auth";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";

interface LoginFormProps {
  registered?: boolean;
  reset?: boolean;
  oauthError?: string;
}

export function LoginForm({ registered, reset, oauthError }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, null);

  const banner = state?.error ?? oauthError;

  return (
    <div className="space-y-5">
      {registered && (
        <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <IconCircleCheck className="mt-0.5 size-4 shrink-0" />
          Compte créé avec succès. Connectez-vous maintenant.
        </div>
      )}
      {reset && (
        <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <IconCircleCheck className="mt-0.5 size-4 shrink-0" />
          Mot de passe mis à jour. Connectez-vous avec votre nouveau mot de passe.
        </div>
      )}
      {banner && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          {banner}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-navy">
            Email
          </label>
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="vous@exemple.com"
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 pr-11 text-sm text-navy placeholder:text-slate-400 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
            />
            <IconMail className="absolute right-4 top-1/2 size-4.5 -translate-y-1/2 text-slate-300" />
          </div>
        </div>

        <PasswordField
          label="Mot de passe"
          name="password"
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-navy hover:text-gold transition"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:opacity-60"
        >
          {pending ? (
            <>
              <IconLoader2 className="size-4.5 animate-spin" />
              Connexion en cours...
            </>
          ) : (
            <>
              Se connecter
              <IconArrowRight className="size-4.5" />
            </>
          )}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">ou</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <GoogleButton />

      <p className="text-center text-sm text-slate-500">
        Pas encore de compte ?{" "}
        <Link href="/register" className="font-semibold text-navy hover:text-gold transition">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}