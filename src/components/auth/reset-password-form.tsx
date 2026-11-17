"use client";

import { useActionState, useState } from "react";
import { IconAlertCircle, IconLoader2, IconLock } from "@tabler/icons-react";

import { resetPasswordAction } from "@/app/actions/auth";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordRules } from "@/components/auth/password-rules";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);

  const confirmMismatch = confirmTouched && confirm.length > 0 && confirm !== password;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmMismatch) e.preventDefault();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="token" value={token} />

      {state?.error && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </div>
      )}

      <PasswordField
        label="Nouveau mot de passe"
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />
      <PasswordRules value={password} />

      <PasswordField
        label="Confirmer le nouveau mot de passe"
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
        className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? (
          <>
            <IconLoader2 className="size-4.5 animate-spin" />
            Mise à jour...
          </>
        ) : (
          <>
            <IconLock className="size-4.5" />
            Mettre à jour le mot de passe
          </>
        )}
      </button>
    </form>
  );
}