"use client";

/**
 * Champ mot de passe accessible : bouton afficher/masquer, icône verrou,
 * message d'erreur sous le champ (aria-invalid + aria-describedby).
 */
import { useId, useState } from "react";
import { IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import { cx } from "@/lib/ui-classes";

export function PasswordField({
  name,
  label,
  error,
  autoComplete = "current-password",
  placeholder = "••••••••",
}: {
  name: string;
  label: string;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = useId();

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-navy">
        {label}
      </label>
      <div className="relative">
        <IconLock
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cx(
            "w-full rounded-xl border bg-white py-2.5 pl-10 pr-11 text-sm text-navy shadow-sm outline-none transition-colors placeholder:text-slate-400",
            "focus:ring-2 focus:ring-navy/10",
            error
              ? "border-red-400 focus:border-red-400"
              : "border-slate-200 focus:border-navy/40",
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-navy"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        >
          {visible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
