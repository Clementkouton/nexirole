import Link from "next/link";
import { IconShieldLock } from "@tabler/icons-react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-ice  flex flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <img src="/logo.png" alt="NexiRole" className="h-9 w-9 rounded-xl object-cover" />
        <span className="text-xl font-bold text-navy">NexiRole</span>
      </Link>

      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-xl shadow-slate-200/60 p-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 mb-4">
            <IconShieldLock className="size-3.5" />
            Espace sécurisé
          </div>
          <h1 className="text-2xl font-bold text-navy">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center max-w-sm">
        Vos données sont protégées : hachage bcrypt, cookies HttpOnly et limitation du
        nombre de tentatives.
      </p>
    </div>
  );
}