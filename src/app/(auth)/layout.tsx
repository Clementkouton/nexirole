/**
 * Layout du groupe (auth) : coquille centrée sur fond gris glace.
 * Les pages /login, /register, /forgot-password, /reset-password en héritent.
 * La navbar publique n'apparaît PAS ici : espace plein écran volontaire.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ice px-4 py-10">
      <div className="w-full max-w-XL rounded-2xl bg-white px-8 py-10 shadow-lg sm:px-12 sm:py-12 md:px-16 md:py-16 lg:px-20 lg:py-20">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-navy/10 bg-white px-3.5 py-1.5 text-xs font-semibold text-navy shadow-sm">
            <span className="size-1.5 rounded-full bg-gold" aria-hidden />
            Accès sécurisé
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}