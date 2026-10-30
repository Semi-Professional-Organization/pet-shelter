"use client";

import { useId } from "react";
import { Footprints, type LucideIcon } from "lucide-react";

import { HouseCheck, LitterBox } from "@/components/icons/pet-icons";
import { useTypedTranslation } from "@/components/providers/LanguageProvider";
import { trainingKindsIn, type TrainingKind } from "@/lib/domain/petTraining";

/**
 * Kept out of `lib/domain/petTraining.ts` for the reason `PetStatusIcon` gives: that
 * module stays React-free. The exhaustive `Record` means a new kind fails the typecheck
 * here until it has an icon.
 */
const ICON_BY_TRAINING: Record<TrainingKind, LucideIcon> = {
  houseTrained: HouseCheck,
  litterBoxTrained: LitterBox,
  leashTrained: Footprints,
};

// Each variant copies the compatibility grid it sits under, which differ in size.
const STYLES = {
  page: {
    wrapper: "space-y-3 pt-2",
    heading: "text-xs font-bold uppercase tracking-wider text-foreground",
    list: "grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center",
    item: "border border-border bg-background p-3 rounded-xl",
    icon: "size-4 mx-auto mb-1 text-muted-foreground",
    label: "text-xs font-bold text-success-text",
  },
  dialog: {
    wrapper: "space-y-3 border-t border-border pt-5",
    heading: "text-sm font-bold uppercase tracking-wider text-foreground",
    list: "grid grid-cols-2 sm:grid-cols-4 gap-3 text-center",
    item: "border border-border bg-background p-3.5 rounded-xl",
    icon: "size-4.5 mx-auto mb-1.5 text-muted-foreground",
    label: "text-sm font-bold text-success-text",
  },
} as const;

/**
 * The Training row, on the pet page (`page`) and the gallery quick view (`dialog`). Positive
 * only: it lists the training the tags record and renders nothing when there is none, because
 * a missing tag means unknown, not untrained. The tag chips leave these tags out
 * (`tagsWithoutTraining`), so each fact shows once.
 */
export function PetTraining({ tags, variant = "page" }: { tags: readonly string[]; variant?: keyof typeof STYLES }) {
  const { t } = useTypedTranslation();
  const headingId = useId();
  const training = trainingKindsIn(tags);
  if (training.length === 0) return null;

  const style = STYLES[variant];
  const Heading = variant === "page" ? "h2" : "h3";

  return (
    <div className={style.wrapper}>
      <Heading id={headingId} className={style.heading}>
        {t("petDetail.trainingTitle")}
      </Heading>

      {/* role="list": Safari drops list semantics from a list with list-style: none. */}
      <ul role="list" aria-labelledby={headingId} className={style.list}>
        {training.map((kind) => {
          const Icon = ICON_BY_TRAINING[kind];
          return (
            <li key={kind} className={style.item}>
              <Icon className={style.icon} />
              <div className={style.label}>{t(`petDetail.${kind}`)}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
