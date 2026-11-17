"use client";

import { IconCheck, IconX } from "@tabler/icons-react";

const RULES = [
  { label: "8 caractères minimum", test: (v: string) => v.length >= 8 },
  { label: "Une majuscule", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Une minuscule", test: (v: string) => /[a-z]/.test(v) },
  { label: "Un chiffre", test: (v: string) => /[0-9]/.test(v) },
  { label: "Un caractère spécial", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
      {RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.label}
            className={`flex items-center gap-1.5 text-xs ${
              ok ? "text-emerald-600" : "text-slate-400"
            }`}
          >
            {ok ? <IconCheck className="size-3.5" /> : <IconX className="size-3.5" />}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}