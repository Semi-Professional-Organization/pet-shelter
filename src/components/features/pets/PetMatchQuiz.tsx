"use client";

import Image from "next/image";
import { QuizAnswers } from "@/types/match";
import { usePetMatchQuizController, UsePetMatchQuizControllerProps } from "@/hooks/usePetMatchQuizController";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Compass,
  Home,
  Building2,
  Trees,
  Baby,
  Users,
  Dog,
  Cat,
  Footprints,
  Flame,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Heart,
} from "lucide-react";

export function PetMatchQuiz(props: UsePetMatchQuizControllerProps) {
  const { open, onOpenChange } = props;
  const { state, handlers } = usePetMatchQuizController(props);
  const { step, answers, isCalculated, matchResults } = state;
  const { setAnswers, handleNext, handlePrev, handleReset, handleSelectPet, handleApplyForPet } = handlers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[92vh] overflow-y-auto p-0 border border-border bg-card shadow-2xl rounded-2xl">
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-primary-foreground/15 text-primary-foreground">
              <Compass className="size-3.5" />
              Interactive Matcher
            </span>
          </div>
          <DialogHeader className="text-left">
            <DialogTitle className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-primary-foreground">
              Find Your Ideal Rescue Companion
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/80 text-sm mt-1">
              Answer 4 short lifestyle questions. Our weighted algorithm will score and rank adoptable animals best suited for your routine.
            </DialogDescription>
          </DialogHeader>

          {/* Progress bar */}
          {!isCalculated && (
            <div className="mt-6 flex items-center gap-2">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 transition-all duration-300 ${
                    s <= step ? "bg-primary-foreground" : "bg-primary-foreground/25"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Wizard Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {!isCalculated ? (
            <div>
              {/* Step 1: Housing & Species Preference */}
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Step 1 of 4</span>
                    <h3 className="font-heading text-lg sm:text-xl font-bold text-foreground mt-1">
                      What is your residence and pet preference?
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      Ensures compliance with local building guidelines and animal space requirements.
                    </p>
                  </div>

                  {/* Species Preference */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Are you looking for a Dog or Cat?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: "any", label: "Open to Any", icon: Heart },
                        { id: "dog", label: "Dogs Only", icon: Dog },
                        { id: "cat", label: "Cats Only", icon: Cat },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = answers.preferredSpecies === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setAnswers({ ...answers, preferredSpecies: item.id as QuizAnswers["preferredSpecies"] })}
                            className={`p-3.5 border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer text-center ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground font-bold shadow-sm"
                                : "border-border bg-card text-foreground hover:bg-muted"
                            }`}
                          >
                            <Icon className="size-5" />
                            <span className="text-xs font-semibold">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Housing Type */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Your Living Space
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        {
                          id: "condo_apartment",
                          title: "Condo / Apartment",
                          desc: "High-rise or stratified unit with shared elevators",
                          icon: Building2,
                        },
                        {
                          id: "landed_no_yard",
                          title: "Landed (No Yard)",
                          desc: "Townhouse or terrace without enclosed outdoor area",
                          icon: Home,
                        },
                        {
                          id: "landed_fenced_yard",
                          title: "Landed with Fenced Yard",
                          desc: "Secure private garden or courtyard for play",
                          icon: Trees,
                        },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = answers.housing === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setAnswers({ ...answers, housing: item.id as QuizAnswers["housing"] })}
                            className={`p-4 border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border bg-card hover:bg-muted/60"
                            }`}
                          >
                            <div>
                              <Icon className={`size-5 mb-2.5 ${isSelected ? "text-primary-ink" : "text-muted-foreground"}`} />
                              <div className="text-sm font-bold text-foreground">{item.title}</div>
                              <div className="text-xs text-muted-foreground mt-1 leading-snug">{item.desc}</div>
                            </div>
                            <div className="mt-3 text-2xs font-bold">
                              {isSelected ? (
                                <span className="text-primary-ink flex items-center gap-1">
                                  <CheckCircle2 className="size-3.5" /> Selected
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Select</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Household Dynamics */}
              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Step 2 of 4</span>
                    <h3 className="font-heading text-lg sm:text-xl font-bold text-foreground mt-1">
                      Who lives in your home?
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      Crucial for evaluating child safety gates and energy compatibility.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "adults_only",
                        title: "Adults Only",
                        desc: "Working professionals, couples, or solo households (18+)",
                        icon: Users,
                      },
                      {
                        id: "has_toddlers_kids",
                        title: "Young Children / Toddlers",
                        desc: "Kids under 10 years old present in the household",
                        icon: Baby,
                      },
                      {
                        id: "has_elderly",
                        title: "Elderly Family Members",
                        desc: "Seniors requiring gentle, low-trip hazard companions",
                        icon: Footprints,
                      },
                      {
                        id: "multi_generation",
                        title: "Multi-Generation Household",
                        desc: "Vibrant family with kids, adults, and grandparents",
                        icon: Users,
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSelected = answers.household === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setAnswers({ ...answers, household: item.id as QuizAnswers["household"] })}
                          className={`p-4 border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border bg-card hover:bg-muted/60"
                          }`}
                        >
                          <div className={`p-2 border ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted"}`}>
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-foreground">{item.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 3: Existing Household Pets */}
              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Step 3 of 4</span>
                    <h3 className="font-heading text-lg sm:text-xl font-bold text-foreground mt-1">
                      Do you have existing pets at home?
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      Prevents high-prey-drive incompatibilities and ensures peaceful introductions.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "none",
                        title: "No Current Pets",
                        desc: "This will be the only furry resident in the house",
                        icon: Home,
                      },
                      {
                        id: "dogs_only",
                        title: "Resident Dog(s)",
                        desc: "Must be comfortable sharing territory with other canines",
                        icon: Dog,
                      },
                      {
                        id: "cats_only",
                        title: "Resident Cat(s)",
                        desc: "Must have tested negative for feline prey aggression",
                        icon: Cat,
                      },
                      {
                        id: "both_dogs_and_cats",
                        title: "Both Dogs and Cats",
                        desc: "Requires universal high sociability with all species",
                        icon: Users,
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSelected = answers.existingPets === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setAnswers({ ...answers, existingPets: item.id as QuizAnswers["existingPets"] })}
                          className={`p-4 border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border bg-card hover:bg-muted/60"
                          }`}
                        >
                          <div className={`p-2 border ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted"}`}>
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-foreground">{item.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 4: Activity Routine & Experience */}
              {step === 4 && (
                <div className="space-y-6">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Step 4 of 4</span>
                    <h3 className="font-heading text-lg sm:text-xl font-bold text-foreground mt-1">
                      Daily Routine & Pet Experience
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      Matches energy output so your companion thrives in your schedule.
                    </p>
                  </div>

                  {/* Activity Routine */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Daily Walking & Active Play Time
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        {
                          id: "low_under_30m",
                          title: "Under 30 Mins",
                          desc: "Short potty breaks & relaxed couch cuddling",
                          icon: Footprints,
                        },
                        {
                          id: "moderate_30_60m",
                          title: "30 – 60 Mins",
                          desc: "Daily brisk neighborhood walks & yard fetch",
                          icon: Flame,
                        },
                        {
                          id: "active_1_2h",
                          title: "1 – 2+ Hours",
                          desc: "Jogging, hiking, dog parks, or agility training",
                          icon: Activity,
                        },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = answers.dailyActivity === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setAnswers({ ...answers, dailyActivity: item.id as QuizAnswers["dailyActivity"] })}
                            className={`p-3.5 border text-left transition-all cursor-pointer ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border bg-card hover:bg-muted/60"
                            }`}
                          >
                            <Icon className={`size-4 mb-1.5 ${isSelected ? "text-primary-ink" : "text-muted-foreground"}`} />
                            <div className="text-xs font-bold text-foreground">{item.title}</div>
                            <div className="text-2xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Experience */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Your Pet Ownership Background
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          id: "first_time",
                          title: "First-Time Adopter",
                          desc: "Looking for an easygoing, forgiving starter companion",
                        },
                        {
                          id: "some_experience",
                          title: "Experienced Pet Parent",
                          desc: "Comfortable with training routines or special medical care",
                        },
                      ].map((item) => {
                        const isSelected = answers.experience === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setAnswers({ ...answers, experience: item.id as QuizAnswers["experience"] })}
                            className={`p-3.5 border text-left transition-all cursor-pointer ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border bg-card hover:bg-muted/60"
                            }`}
                          >
                            <div className="text-xs font-bold text-foreground">{item.title}</div>
                            <div className="text-2xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Step Navigation Buttons */}
              <div className="flex items-center justify-between border-t border-border pt-6 mt-6">
                {step > 1 ? (
                  <Button variant="outline" size="sm" onClick={handlePrev} className="gap-1.5">
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>
                ) : (
                  <div />
                )}

                <Button size="sm" onClick={handleNext} className="gap-1.5">
                  {step === 4 ? "Calculate Best Matches" : "Next Step"}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : (
            /* Results View */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <h3 className="font-heading text-xl font-bold text-foreground">
                    Your Personalized Compatibility Matches
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ranked by safety criteria, housing size, and daily energy compatibility.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 self-start">
                  <RotateCcw className="size-3.5" />
                  Retake Quiz
                </Button>
              </div>

              {/* Match Cards */}
              <div className="space-y-4">
                {matchResults.slice(0, 3).map((match, idx) => {
                  const { pet, score } = match;
                  const isTopMatch = idx === 0;

                  return (
                    <div
                      key={pet.id}
                      className={`border p-4 sm:p-5 transition-all flex flex-col md:flex-row gap-5 items-start ${
                        isTopMatch
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card"
                      }`}
                    >
                      {/* Pet Thumbnail */}
                      <div className="relative w-full md:w-36 h-44 md:h-36 shrink-0 bg-muted overflow-hidden border border-border">
                        <Image
                          src={pet.image}
                          alt={pet.name}
                          fill
                          className="object-cover"
                          sizes="150px"
                        />
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-0.5 text-2xs font-bold bg-background/90 text-foreground border border-border">
                            {pet.species.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Info & Score */}
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-heading text-lg font-bold text-foreground">{pet.name}</h4>
                              <span className="text-xs text-muted-foreground">({pet.breed} • {pet.age})</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {pet.gender} • {pet.size} ({pet.weight}) • {pet.compatibility.energyLevel} Energy
                            </p>
                          </div>

                          {/* Match Badge */}
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground font-heading text-xs font-bold">
                            <Compass className="size-3.5" />
                            <span>{score.matchPercentage}% Match</span>
                          </div>
                        </div>

                        {/* Reasons */}
                        <div className="space-y-1 bg-background/60 p-2.5 border border-border text-xs">
                          <div className="font-bold text-foreground flex items-center gap-1">
                            <CheckCircle2 className="size-3 text-success-text" />
                            Why this match fits:
                          </div>
                          <ul className="list-disc list-inside text-muted-foreground space-y-0.5 pl-1">
                            {score.reasons.slice(0, 2).map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Cautions if any */}
                        {score.cautions.length > 0 && (
                          <div className="text-2xs text-warning-text flex items-start gap-1">
                            <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                            <span>{score.cautions[0]}</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {pet.status === "Available" && (
                            <Button
                              size="sm"
                              onClick={() => handleApplyForPet(pet)}
                              className="text-xs font-bold"
                            >
                              Apply to Adopt {pet.name}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectPet(pet)}
                            className="text-xs"
                          >
                            Full Profile
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border pt-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Close & Explore All Pets
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
