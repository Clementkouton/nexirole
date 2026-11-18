interface SectionHeadingProps {
  badge: string;
  title: React.ReactNode;
  subtitle?: string;
}

export function SectionHeading({ badge, title, subtitle }: SectionHeadingProps) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-navy shadow-sm">
        {badge}
      </span>
      <h2 className="mt-5 font-heading text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-base leading-relaxed text-slate-800">{subtitle}</p>
      ) : null}
    </div>
  );
}
