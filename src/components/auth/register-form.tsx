"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  IconAlertCircle,
  IconArrowRight,
  IconLoader2,
  IconMail,
  IconUser,
} from "@tabler/icons-react";

import { registerAction } from "@/app/actions/auth";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordRules } from "@/components/auth/password-rules";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);

  const confirmMismatch = confirmTouched && confirm.length > 0 && confirm !== password;

  return (
    <div className="space-y-5">
      {state?.error && (
        <div className="flex items-start gap-2  rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </div>
      )}

      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirmMismatch) e.preventDefault();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-navy">
            Nom complet
          </label>
          <div className="relative">
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="Votre nom"
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 pr-11 text-sm text-navy placeholder:text-slate-400 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
            />
            <IconUser className="absolute right-4 top-1/2 size-4.5 -translate-y-1/2 text-slate-300" />
          </div>
        </div>

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
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />
        <PasswordRules value={password} />

        <PasswordField
          label="Confirmer le mot de passe"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setConfirmTouched(true);
          }}
          error={confirmMismatch ? "Les mots de passe ne correspondent pas." : undefined}
        />

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gold px-4 py-3 text-sm font-bold text-navy transition hover:brightness-95 disabled:opacity-60"
        >
          {pending ? (
            <>
              <IconLoader2 className="size-4.5 animate-spin" />
              Création du compte...
            </>
          ) : (
            <>
              Créer mon compte
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
        Déjà un compte ?{" "}
        <Link href="/login" className="font-semibold text-navy hover:text-gold transition">
          Se connecter
        </Link>
      </p>
    </div>
  );
}