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
  /** `h1` when the header is the page's title (page-style-guide §3: hero scale), else a section `h2`. */
  as?: "h1" | "h2";
};

export function Section({ id, className, children }: SectionProps) {
  return (
    <section id={id} className={cn("bg-work-ground py-16 sm:py-20", className)}>
      <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12">{children}</div>
    </section>
  );
}

export function SectionHeader({ title, subtitle, className, as = "h2" }: SectionHeaderProps) {
  const Heading = as;
  return (
    <div className={cn(as === "h1" ? "space-y-6" : "space-y-3", className)}>
      <Heading
        className={
          as === "h1"
            ? "font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            : "font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
        }
      >
        {title}
      </Heading>
      {subtitle ? (
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{subtitle}</p>
      ) : null}
    </div>
  );
}
