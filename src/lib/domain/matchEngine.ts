import { Pet } from "@/types/pet";
import { QuizAnswers, PetMatchResult, MatchScoreBreakdown } from "@/types/match";
import { isToiletTraining, trainingKindFor } from "@/lib/domain/petTraining";

/**
 * Evaluates compatibility between a prospective adopter's lifestyle and a rescue pet.
 * Uses a 2-Tiered Scoring Model:
 * 1. Hard Safety Gates (Kids safety, resident pets compatibility)
 * 2. Weighted Dimensional Scoring (Housing 30%, Activity 30%, Experience 25%, Medical/Prep 15%)
 */
export function calculatePetMatchScore(pet: Pet, answers: QuizAnswers): MatchScoreBreakdown {
  const reasons: string[] = [];
  const cautions: string[] = [];

  // -------------------------------------------------------------
  // TIER 1: HARD SAFETY GATES
  // -------------------------------------------------------------
  // Filter species preference if specified
  if (answers.preferredSpecies && answers.preferredSpecies !== "any") {
    if (pet.species !== answers.preferredSpecies) {
      return {
        housingScore: 0,
        activityScore: 0,
        experienceScore: 0,
        safetyScore: 0,
        totalScore: 0,
        matchPercentage: 0,
        reasons: [],
        cautions: [`You preferred ${answers.preferredSpecies}s, but ${pet.name} is a ${pet.species}.`],
        isHardGateDisqualified: true,
        disqualificationReason: `Species mismatch (${pet.species})`,
      };
    }
  }

  // Gate 1: Toddlers / Young Children Safety
  if (answers.household === "has_toddlers_kids" || answers.household === "multi_generation") {
    if (!pet.compatibility.goodWithKids) {
      return {
        housingScore: 0,
        activityScore: 0,
        experienceScore: 0,
        safetyScore: 0,
        totalScore: 10,
        matchPercentage: 10,
        reasons: [],
        cautions: [`${pet.name} is not recommended for households with young children for safety reasons.`],
        isHardGateDisqualified: true,
        disqualificationReason: "Not suited for young children",
      };
    }
  }

  // Gate 2: Resident Dogs Safety
  if (answers.existingPets === "dogs_only" || answers.existingPets === "both_dogs_and_cats") {
    if (!pet.compatibility.goodWithDogs) {
      return {
        housingScore: 0,
        activityScore: 0,
        experienceScore: 0,
        safetyScore: 0,
        totalScore: 15,
        matchPercentage: 15,
        reasons: [],
        cautions: [`${pet.name} prefers to be the only dog in the household.`],
        isHardGateDisqualified: true,
        disqualificationReason: "Not compatible with resident dogs",
      };
    }
  }

  // Gate 3: Resident Cats Safety
  if (answers.existingPets === "cats_only" || answers.existingPets === "both_dogs_and_cats") {
    if (!pet.compatibility.goodWithCats) {
      return {
        housingScore: 0,
        activityScore: 0,
        experienceScore: 0,
        safetyScore: 0,
        totalScore: 15,
        matchPercentage: 15,
        reasons: [],
        cautions: [`${pet.name} has a strong prey drive and is not safe around cats.`],
        isHardGateDisqualified: true,
        disqualificationReason: "Not compatible with resident cats",
      };
    }
  }

  // -------------------------------------------------------------
  // TIER 2: WEIGHTED DIMENSIONAL SCORING (Max: 100 points)
  // -------------------------------------------------------------

  // 1. Housing Compatibility (Weight: 30 pts)
  let housingScore = 20;
  if (answers.housing === "condo_apartment") {
    if (pet.species === "cat") {
      housingScore = 30;
      reasons.push("Cats thrive seamlessly in high-rise condo/apartment environments.");
    } else if (pet.size === "Small") {
      housingScore = 28;
      reasons.push("Small size is well-suited to condo by-laws and indoor living.");
    } else if (pet.size === "Medium" && pet.compatibility.energyLevel === "Low") {
      housingScore = 25;
      reasons.push("Calm temperament adapts well to apartment settings with regular walks.");
    } else {
      housingScore = 12;
      cautions.push("Larger or high-energy dogs in condos require committed outdoor exercise daily.");
    }
  } else if (answers.housing === "landed_fenced_yard") {
    if (pet.size === "Large" || pet.compatibility.energyLevel === "High") {
      housingScore = 30;
      reasons.push("Fenced yard provides ideal space for high energy & exercise.");
    } else {
      housingScore = 28;
      reasons.push("Landed property offers great freedom and safety.");
    }
  } else {
    // Landed no yard
    housingScore = 24;
    reasons.push("Landed home setup accommodates most pet sizes comfortably.");
  }

  // 2. Activity & Energy Routine (Weight: 30 pts)
  let activityScore = 20;
  const petEnergy = pet.compatibility.energyLevel;

  if (answers.dailyActivity === "low_under_30m") {
    if (petEnergy === "Low") {
      activityScore = 30;
      reasons.push("Low-energy companion matches your relaxed daily schedule.");
    } else if (petEnergy === "Moderate") {
      activityScore = 20;
    } else {
      activityScore = 8;
      cautions.push(`${pet.name} has high energy and needs more active stimulation than your daily 30m window.`);
    }
  } else if (answers.dailyActivity === "moderate_30_60m") {
    if (petEnergy === "Moderate" || petEnergy === "Low") {
      activityScore = 30;
      reasons.push("Your 30–60 min exercise routine is the perfect match for this pet's stamina.");
    } else {
      activityScore = 22;
      cautions.push("High-energy pet may occasionally desire weekend park trips or longer runs.");
    }
  } else {
    // Active 1-2h or very active 2h+
    if (petEnergy === "High" || petEnergy === "Moderate") {
      activityScore = 30;
      reasons.push("Your active lifestyle is an outstanding match for this athletic, playful companion!");
    } else {
      activityScore = 25;
      reasons.push("Accommodates your active outings at a comfortable pace.");
    }
  }

  // 3. Experience Match (Weight: 25 pts)
  let experienceScore = 18;
  const isSpecialNeeds = !!pet.medical.specialNeeds;
  const isSenior = pet.ageCategory === "senior";

  if (answers.experience === "first_time") {
    // ceiling: the temperament words are a substring test, so a negative tag such as
    // "Unfriendly" or "Uneasy" also counts. No seed pet carries one; production tags were not
    // checked. Upgrade path: match temperament through tag keys the way trainingKindFor does.
    // Toilet training (house or litter box, either species; the owner's call on 2026-10-30)
    // goes through trainingKindFor, the same matcher as the Training row, so the two agree.
    // Leash training is not what makes a pet easy for a first-time owner.
    const hasEasyTemperament = pet.tags.some((t) => /gentle|friendly|easy/i.test(t));
    const isToiletTrained = pet.tags.some((t) => isToiletTraining(trainingKindFor(t)));
    if ((hasEasyTemperament || isToiletTrained) && !isSpecialNeeds) {
      experienceScore = 25;
      reasons.push(
        hasEasyTemperament
          ? "Gentle & beginner-friendly demeanor makes them an easy first pet."
          : "Already house or litter box trained, which makes them an easy first pet."
      );
    } else if (isSpecialNeeds) {
      experienceScore = 12;
      cautions.push("Requires special medical or dietary attention — shelter staff can guide you through routines.");
    } else {
      experienceScore = 20;
    }
  } else {
    // Some experience or experienced
    experienceScore = 25;
    if (isSpecialNeeds) {
      reasons.push("Your pet experience will provide excellent care for their special requirements.");
    } else if (isSenior) {
      reasons.push("Experienced home is wonderful for a dignified senior rescue.");
    }
  }

  // 4. Safety & Preparedness (Weight: 15 pts)
  let safetyScore = 12;
  if (pet.medical.vaccinated && pet.medical.spayedNeutered && pet.medical.microchipped) {
    safetyScore = 15;
    reasons.push("Fully vaccinated, spayed/neutered, and microchipped — ready for immediate adoption.");
  } else {
    safetyScore = 12;
  }

  const rawTotal = housingScore + activityScore + experienceScore + safetyScore;
  const clampedTotal = Math.min(100, Math.max(0, rawTotal));

  return {
    housingScore,
    activityScore,
    experienceScore,
    safetyScore,
    totalScore: clampedTotal,
    matchPercentage: clampedTotal,
    reasons,
    cautions,
    isHardGateDisqualified: false,
  };
}

/**
 * Scores and sorts all pets in the shelter against the quiz answers.
 */
export function matchPetsWithQuiz(pets: Pet[], answers: QuizAnswers): PetMatchResult[] {
  const results: PetMatchResult[] = pets.map((pet) => ({
    pet,
    score: calculatePetMatchScore(pet, answers),
  }));

  // Sort: Non-disqualified first, then by descending match percentage
  return results.sort((a, b) => {
    if (a.score.isHardGateDisqualified && !b.score.isHardGateDisqualified) return 1;
    if (!a.score.isHardGateDisqualified && b.score.isHardGateDisqualified) return -1;
    return b.score.matchPercentage - a.score.matchPercentage;
  });
}
