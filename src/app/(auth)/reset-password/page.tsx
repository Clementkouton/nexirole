import Link from "next/link";
import { IconAlertCircle } from "@tabler/icons-react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Nouveau mot de passe — NexiRole" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Token absent ou manifestement invalide dans l'URL : pas la peine de
  // rendre le formulaire — la validation complète reste côté serveur.
  if (!token || token.length < 32) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Ce lien de réinitialisation est invalide ou incomplet.</span>
        </div>
        <p className="text-center text-sm text-slate-500">
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

  return <ResetPasswordForm token={token} />;
}
