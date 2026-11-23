/**
 * Classes utilitaires des boutons NexiRole — module SANS "use client",
 * utilisable depuis les composants serveur comme client.
 * Palette : navy #051937 (primaire), or #FFC107 (accent).
 */

export function cx(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant = "default" | "outline" | "ghost";

export function buttonClasses(variant: ButtonVariant = "default"): string {
  const variants: Record<ButtonVariant, string> = {
    default: "bg-navy text-white hover:bg-navy-800",
    outline: "border border-slate-300 bg-white text-navy hover:bg-slate-50",
    ghost: "text-navy hover:bg-slate-100",
  };
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant]
  );
}
