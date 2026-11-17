"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCircleCheck,
  IconLoader2,
  IconMail,
} from "@tabler/icons-react";

import { forgotPasswordAction } from "@/app/actions/auth";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, null);

  if (state?.success) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-700">
          <div className="flex items-start gap-2">
            <IconCircleCheck className="mt-0.5 size-4 shrink-0" />
            <span>{state.success}</span>
          </div>
        </div>
        <Link
          href="/login"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90"
        >
          <IconArrowLeft className="size-4.5" />
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </div>
      )}

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

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? (
          <>
            <IconLoader2 className="size-4.5 animate-spin" />
            Envoi en cours...
          </>
        ) : (
          "Envoyer le lien de réinitialisation"
        )}
      </button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-navy hover:text-gold transition">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}