import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionProps = {
  id?: string;
  className?: string;
  children: ReactNode;
};

type SectionHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
};

export function Section({ id, className, children }: SectionProps) {
  return (
    <section id={id} className={cn("bg-work-ground py-16 sm:py-20", className)}>
      <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12">{children}</div>
    </section>
  );
}

export function SectionHeader({ title, subtitle, className }: SectionHeaderProps) {
  return (
    <div className={cn("max-w-2xl space-y-3", className)}>
      <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{subtitle}</p>
      ) : null}
    </div>
  );
}
