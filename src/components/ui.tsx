"use client";

/**
 * Mini bibliothèque d'UI NexiRole — zéro dépendance externe.
 * Remplace les composants shadcn/radix (Button, Input, Label, Textarea,
 * Skeleton, Switch, Tabs) par des équidents légers stylés avec la charte
 * NexiRole (navy #051937 + or #FFC107).
 */

import React, { createContext, useContext, useState } from "react";
import { cx, buttonClasses, type ButtonVariant } from "@/lib/ui-classes";

export { cx, buttonClasses };
export type { ButtonVariant };

interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
}

export function Button({ variant = "default", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(buttonClasses(variant), className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/*  Champ de formulaire                                                */
/* ------------------------------------------------------------------ */

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-navy shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-navy/40 focus:ring-2 focus:ring-navy/10 disabled:cursor-not-allowed disabled:bg-slate-50",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-navy/40 focus:ring-2 focus:ring-navy/10 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cx("block text-sm font-medium text-navy", className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/*  Squelette de chargement                                            */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-slate-200/70", className)} />;
}

/* ------------------------------------------------------------------ */
/*  Interrupteur (Switch)                                              */
/* ------------------------------------------------------------------ */

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label"?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, disabled, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:opacity-50",
        checked ? "bg-navy" : "bg-slate-300"
      )}
      {...rest}
    >
      <span
        className={cx(
          "inline-block size-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Onglets (Tabs)                                                     */
/* ------------------------------------------------------------------ */

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  defaultValue,
  className,
  children,
}: {
  defaultValue: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="tablist" className={cx("flex flex-wrap items-center gap-1", className)}>
      {children}
    </div>
  );
}

interface TabsTriggerProps extends React.ComponentProps<"button"> {
  value: string;
}

export function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger doit être utilisé dans <Tabs>.");
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? "active" : "inactive"}
      onClick={() => ctx.setValue(value)}
      className={className}
      {...props}
    />
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsContent doit être utilisé dans <Tabs>.");
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" data-state="active" className={className}>
      {children}
    </div>
  );
}
