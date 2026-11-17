"use client";

import { useState } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

interface PasswordFieldProps {
  label: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export function PasswordField({
  label,
  name,
  placeholder,
  autoComplete,
  error,
  value,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-semibold text-navy">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          required
          placeholder={placeholder ?? "••••••••"}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={`w-full rounded-full border bg-white px-4 py-2.5 pr-11 text-sm text-navy placeholder:text-slate-400 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 ${
            error ? "border-red-400" : "border-slate-200"
          }`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-navy"
        >
          {visible ? <IconEyeOff className="size-4.5" /> : <IconEye className="size-4.5" />}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}