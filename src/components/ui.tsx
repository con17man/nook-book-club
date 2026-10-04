import type { ComponentProps, ReactNode } from "react";

export const buttonStyles = {
  primary:
    "inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center rounded-lg border border-danger/30 bg-card px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60",
  link: "text-sm font-medium text-accent underline-offset-4 hover:underline",
};

export const inputStyles =
  "block w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`rounded-2xl border border-line bg-card p-5 sm:p-6 ${className}`} {...props} />;
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="mb-2 text-xs font-semibold tracking-widest text-accent uppercase">{eyebrow}</p>}
      <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{title}</h1>
      {children && <div className="mt-3 text-muted">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 font-serif text-xl font-semibold">{children}</h2>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "success" | "danger"; children: ReactNode }) {
  const tones = {
    neutral: "bg-paper text-muted border-line",
    accent: "bg-accent-soft text-accent border-accent/20",
    success: "bg-success/10 text-success border-success/20",
    danger: "bg-danger/10 text-danger border-danger/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
