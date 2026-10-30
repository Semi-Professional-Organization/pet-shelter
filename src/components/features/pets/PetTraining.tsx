"use client";

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

/**
 * The pet page's Training row, built like the compatibility grid above it. Positive only:
 * it lists the training the tags record and renders nothing when there is none, because a
 * missing tag means unknown, not untrained.
 */
export function PetTraining({ tags }: { tags: readonly string[] }) {
  const { t } = useTypedTranslation();
  const training = trainingKindsIn(tags);
  if (training.length === 0) return null;

  return (
    <div className="space-y-3 pt-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
        {t("petDetail.trainingTitle")}
      </h2>

      {/* role="list": Safari drops list semantics from a list with list-style: none. */}
      <ul role="list" className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
        {training.map((kind) => {
          const Icon = ICON_BY_TRAINING[kind];
          return (
            <li key={kind} className="border border-border bg-background p-3 rounded-xl">
              <Icon className="size-4 mx-auto mb-1 text-muted-foreground" />
              <div className="text-xs font-bold text-success-text">{t(`petDetail.${kind}`)}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
