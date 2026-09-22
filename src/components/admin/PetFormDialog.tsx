"use client";

import React, { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pet, PetStatus } from "@/types/pet";
import { petFormSchema, PetFormInput, isRehabilitationStatus } from "@/lib/validations/pet";
import { normalizePetStatus, getAllowedPetStatusTransitions } from "@/lib/domain/stateMachine";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { QrImageUpload } from "@/components/admin/QrImageUpload";
import { QrPreviewDialog } from "@/components/admin/QrPreviewDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Loader2, Star, Eye, Send } from "lucide-react";
import type { PhotoNotificationOptions } from "@/actions/pets";
import { AGE_BANDS, formatAgeBandRange } from "@/lib/domain/petAge";

/** Admin UI is English-only; the year range beside each name comes from the domain (PS-114). */
const ADMIN_AGE_BAND_NAMES: Record<(typeof AGE_BANDS)[number], string> = {
  puppy_kitten: "Puppy / Kitten",
  young: "Young",
  adult: "Adult",
  senior: "Senior",
};

interface PetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPet?: Pet | null;
  onSave: (data: PetFormInput, notification?: PhotoNotificationOptions) => void;
}

export function PetFormDialog({
  open,
  onOpenChange,
  editingPet,
  onSave,
}: PetFormDialogProps) {
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(["Vaccinated", "House-Trained"]);
  const [primaryImage, setPrimaryImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Array<{ url: string; name: string; size: number }>>([]);
  const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
  const [notifySponsors, setNotifySponsors] = useState(true);
  const [caregiverCaption, setCaregiverCaption] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PetFormInput>({
    resolver: zodResolver(petFormSchema),
    defaultValues: {
      name: "",
      species: "dog",
      breed: "",
      age: "",
      ageCategory: "adult",
      gender: "Male",
      size: "Medium",
      weight: "15 kg",
      status: "Available",
      adoptionFee: "Free",
      description: "",
      rescueStory: "",
      image: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80",
      tags: ["Vaccinated", "House-Trained"],
      featured: false,
      intakeDate: new Date().toISOString().split("T")[0],
      customQrUrl: "",
      vaccinated: true,
      microchipped: true,
      spayedNeutered: true,
      specialNeeds: "",
      goodWithDogs: true,
      goodWithCats: true,
      goodWithKids: true,
      energyLevel: "Moderate",
    },
  });

  const [prevKey, setPrevKey] = useState<string | null>(null);
  const currentKey = open ? (editingPet ? `edit-${editingPet.id}` : "create-new") : null;

  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    // Reset alongside every other per-pet field. Without this, a caregiver note
    // typed for one animal survives closing the dialog and would be emailed to a
    // different animal's supporters.
    setNotifySponsors(true);
    setCaregiverCaption("");
    if (editingPet) {
      reset({
        name: editingPet.name,
        species: editingPet.species,
        breed: editingPet.breed,
        age: editingPet.age,
        ageCategory: editingPet.ageCategory,
        gender: editingPet.gender,
        size: editingPet.size,
        weight: editingPet.weight,
        // Normalized: the legacy `Rehabilitation` alias matches no <option> below, so a
        // controlled select would fall back to the first one — silently rewriting an animal
        // under care to Available on the next save.
        status: normalizePetStatus(editingPet.status),
        adoptionFee: editingPet.adoptionFee,
        description: editingPet.description,
        rescueStory: editingPet.rescueStory,
        image: editingPet.image,
        tags: editingPet.tags,
        featured: editingPet.featured || false,
        intakeDate: editingPet.intakeDate,
        customQrUrl: editingPet.customQrUrl || "",
        rehabStage: editingPet.rehabStage,
        rehabStageMs: editingPet.rehabStageMs,
        rehabProgressPercent: editingPet.rehabProgressPercent,
        isArchived: editingPet.isArchived ?? false,
        deletedAt: editingPet.deletedAt || null,
        vaccinated: editingPet.medical.vaccinated,
        microchipped: editingPet.medical.microchipped,
        spayedNeutered: editingPet.medical.spayedNeutered,
        specialNeeds: editingPet.medical.specialNeeds || "",
        goodWithDogs: editingPet.compatibility.goodWithDogs,
        goodWithCats: editingPet.compatibility.goodWithCats,
        goodWithKids: editingPet.compatibility.goodWithKids,
        energyLevel: editingPet.compatibility.energyLevel as "Low" | "Moderate" | "High",
      });
      setTags(editingPet.tags);
      setPrimaryImage(editingPet.image);
      setGalleryImages(
        (editingPet.galleryImages || []).map((url) => ({
          url,
          name: url.split("/").pop() || url,
          size: 0,
        }))
      );
    } else {
      const defaultImg = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80";
      reset({
        name: "",
        species: "dog",
        breed: "",
        age: "",
        ageCategory: "adult",
        gender: "Male",
        size: "Medium",
        weight: "15 kg",
        status: "Available",
        adoptionFee: "Free",
        description: "",
        rescueStory: "",
        image: defaultImg,
        tags: ["Vaccinated", "Friendly"],
        featured: false,
        intakeDate: new Date().toISOString().split("T")[0],
        customQrUrl: "",
        rehabStage: undefined,
        rehabStageMs: undefined,
        rehabProgressPercent: undefined,
        isArchived: false,
        deletedAt: null,
        vaccinated: true,
        microchipped: true,
        spayedNeutered: true,
        specialNeeds: "",
        goodWithDogs: true,
        goodWithCats: true,
        goodWithKids: true,
        energyLevel: "Moderate",
      });
      setTags(["Vaccinated", "Friendly"]);
      setPrimaryImage(defaultImg);
      setGalleryImages([]);
    }
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      const newTags = [...tags, tagInput.trim()];
      setTags(newTags);
      setValue("tags", newTags, { shouldValidate: true });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = tags.filter((t) => t !== tagToRemove);
    setTags(newTags);
    setValue("tags", newTags, { shouldValidate: true });
  };

  // Rehabilitation details are only collected — and only valid — while the pet is under care.
  const statusField = register("status");
  const watchedStatus = watch("status");
  const isUnderRehabilitation = isRehabilitationStatus(watchedStatus);

  const allowedStatusOptions = useMemo(() => {
    if (editingPet?.status) {
      return getAllowedPetStatusTransitions(editingPet.status);
    }
    return ["Available", "Pending", "Adopted", "In Rehabilitation"] as PetStatus[];
  }, [editingPet?.status]);

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    statusField.onChange(event);
    const next = event.target.value as Pet["status"];
    if (!isRehabilitationStatus(next)) {
      setValue("rehabStage", undefined, { shouldValidate: true });
      setValue("rehabStageMs", undefined, { shouldValidate: true });
      setValue("rehabProgressPercent", undefined, { shouldValidate: true });
    }
  };

  // Photos present in the form that are not already on the saved record. This is
  // what decides whether supporters hear about this save at all — editing a
  // description or reordering an existing gallery notifies nobody.
  const existingGallery = editingPet?.galleryImages || [];
  const newlyAddedPhotos = galleryImages
    .map((img) => img.url)
    .filter((url) => url && !existingGallery.includes(url));
  const canNotifySponsors = Boolean(editingPet) && newlyAddedPhotos.length > 0;

  const onSubmit = async (data: PetFormInput) => {
    // Update with current image selections
    const finalData = {
      ...data,
      image: primaryImage || data.image,
      galleryImages: galleryImages.map((img) => img.url),
    };
    await new Promise((r) => setTimeout(r, 400));
    onSave(
      finalData as PetFormInput,
      canNotifySponsors
        ? { notifySponsors, caption: caregiverCaption.trim() || undefined }
        : undefined
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto p-6 sm:p-8 bg-card border-border">
        <DialogHeader className="mb-4 pb-2 border-b border-border">
          <DialogTitle className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {editingPet ? `Edit Pet Profile: ${editingPet.name}` : "Add New Rescue Animal"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Update pet particulars, medical clearance, and rescue background details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          
          {/* 1. Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-border pb-1">
              1. Basic Particulars
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-semibold">Pet Name *</Label>
                <Input id="name" placeholder="e.g. Barnaby" className="text-sm py-2.5" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="species" className="text-sm font-semibold">Species *</Label>
                <select
                  id="species"
                  {...register("species")}
                  className="w-full bg-background border border-input px-3.5 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-foreground"
                >
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="breed" className="text-sm font-semibold">Breed *</Label>
                <Input id="breed" placeholder="e.g. Mixed Breed / Tabby" className="text-sm py-2.5" {...register("breed")} />
                {errors.breed && <p className="text-xs text-destructive">{errors.breed.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="gender" className="text-sm font-semibold">Gender *</Label>
                <select
                  id="gender"
                  {...register("gender")}
                  className="w-full bg-background border border-input px-3 py-2 text-sm text-foreground"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="age" className="text-sm font-semibold">Age (Text) *</Label>
                <Input id="age" placeholder="e.g. 2 years" className="text-sm py-2" {...register("age")} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ageCategory" className="text-sm font-semibold">Age Stage *</Label>
                <select
                  id="ageCategory"
                  {...register("ageCategory")}
                  className="w-full bg-background border border-input px-3 py-2 text-sm text-foreground"
                >
                  {AGE_BANDS.map((band) => (
                    <option key={band} value={band}>
                      {`${ADMIN_AGE_BAND_NAMES[band]} (${formatAgeBandRange(band)})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="size" className="text-sm font-semibold">Size *</Label>
                <select
                  id="size"
                  {...register("size")}
                  className="w-full bg-background border border-input px-3 py-2 text-sm text-foreground"
                >
                  <option value="Small">Small (&lt; 10 kg)</option>
                  <option value="Medium">Medium (10–25 kg)</option>
                  <option value="Large">Large (25+ kg)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="weight" className="text-sm font-semibold">Weight *</Label>
                <Input id="weight" placeholder="e.g. 18 kg" className="text-sm py-2 font-mono" {...register("weight")} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status" className="text-sm font-semibold">Adoption Status *</Label>
                <select
                  id="status"
                  {...statusField}
                  onChange={handleStatusChange}
                  className="w-full bg-background border border-input px-3 py-2 text-sm text-foreground font-semibold"
                >
                  {allowedStatusOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === "Pending"
                        ? "Pending Application"
                        : opt === "Adopted"
                        ? "Adopted (Happy Tail)"
                        : opt === "In Rehabilitation"
                        ? "In Rehabilitation (Under Care)"
                        : "Available"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adoptionFee" className="text-sm font-semibold">Adoption Fee *</Label>
                <Input id="adoptionFee" placeholder="e.g. Free" className="text-sm py-2 font-mono" {...register("adoptionFee")} />
              </div>
            </div>

            {isUnderRehabilitation && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-dashed border-border p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rehabStage" className="text-sm font-semibold">Rehabilitation Stage</Label>
                  <Input
                    id="rehabStage"
                    placeholder="e.g. Post-operative physiotherapy"
                    className="text-sm py-2"
                    {...register("rehabStage")}
                  />
                  {errors.rehabStage && (
                    <p className="text-xs text-destructive">{errors.rehabStage.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rehabStageMs" className="text-sm font-semibold">Peringkat Pemulihan (BM)</Label>
                  <Input
                    id="rehabStageMs"
                    placeholder="cth. Fisioterapi selepas pembedahan"
                    className="text-sm py-2"
                    {...register("rehabStageMs")}
                  />
                  {errors.rehabStageMs && (
                    <p className="text-xs text-destructive">{errors.rehabStageMs.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rehabProgressPercent" className="text-sm font-semibold">Progress (%)</Label>
                  <Input
                    id="rehabProgressPercent"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    placeholder="0-100"
                    className="text-sm py-2 font-mono"
                    {...register("rehabProgressPercent", {
                      setValueAs: (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
                    })}
                  />
                  {errors.rehabProgressPercent && (
                    <p className="text-xs text-destructive">{errors.rehabProgressPercent.message}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Photo & Visuals */}
          <div className="space-y-6 border-t border-border pt-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-border pb-1">
              2. Photo & Visuals
            </h3>

            {/* Primary Image Upload */}
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold mb-3 block">Primary Photo for Listing *</Label>
                <ImageUpload
                  maxImages={1}
                  onImagesChange={(images) => {
                    if (images.length > 0) {
                      setPrimaryImage(images[0].url);
                      setValue("image", images[0].url, { shouldValidate: true });
                    } else {
                      setPrimaryImage(null);
                      setValue("image", "", { shouldValidate: true });
                    }
                  }}
                  initialImages={
                    primaryImage
                      ? [
                          {
                            url: primaryImage,
                            name: primaryImage.split("/").pop() || primaryImage,
                            size: 0,
                          },
                        ]
                      : []
                  }
                  label=""
                  description="Upload or drag-and-drop the main pet photo"
                />
              </div>
            </div>

            {/* Gallery Images Upload */}
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-sm font-semibold mb-3 block">Gallery Photos (up to 3 additional)</Label>
                <ImageUpload
                  maxImages={3}
                  onImagesChange={setGalleryImages}
                  initialImages={galleryImages}
                  label=""
                  description="Add 3 more photos to showcase the pet from different angles"
                />
              </div>

              {canNotifySponsors && (
                <div className="border border-border bg-muted/40 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <input
                      id="notify-sponsors"
                      type="checkbox"
                      checked={notifySponsors}
                      onChange={(e) => setNotifySponsors(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-primary cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor="notify-sponsors"
                        className="flex items-center gap-1.5 text-sm font-semibold text-foreground cursor-pointer"
                      >
                        <Send className="size-3.5" aria-hidden="true" />
                        Notify active sponsors about this photo update
                      </label>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {newlyAddedPhotos.length} new photo
                        {newlyAddedPhotos.length === 1 ? "" : "s"} detected. Emails go only to
                        this animal&apos;s reconciled sponsors on a qualifying tier who have
                        not opted out of photo updates.
                      </p>
                    </div>
                  </div>

                  {notifySponsors && (
                    <div className="space-y-1.5 pl-7">
                      <Label htmlFor="caregiver-caption" className="text-xs font-semibold">
                        Caregiver note (optional)
                      </Label>
                      <Textarea
                        id="caregiver-caption"
                        value={caregiverCaption}
                        onChange={(e) => setCaregiverCaption(e.target.value)}
                        maxLength={280}
                        rows={2}
                        placeholder="e.g. Barnaby finally mastered the stairs this morning!"
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {caregiverCaption.length}/280 characters. Included in the email.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dedicated Donation QR (optional) */}
            <div className="space-y-3 pt-2 border-t border-border">
              <QrImageUpload
                label="Dedicated Donation QR (optional)"
                description="For a medical fund drive scoped to this animal. Leave empty to use the shelter-wide codes."
                value={watch("customQrUrl") ?? ""}
                onChange={(url) =>
                  setValue("customQrUrl", url, { shouldValidate: true, shouldDirty: true })
                }
              />
              {errors.customQrUrl && (
                <p className="text-3xs text-destructive font-medium">
                  {errors.customQrUrl.message}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQrPreviewOpen(true)}
                className="text-xs"
              >
                <Eye className="size-3.5 mr-1.5" /> Preview donor view
              </Button>
            </div>
          </div>

          {/* 3. Description & Rescue Story */}
          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-border pb-1">
              3. Description & Rescue Story
            </h3>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-sm font-semibold">Short Card Summary *</Label>
              <Input
                id="description"
                placeholder="e.g. Gentle adult dog with calm temperament, walks nicely on leash."
                className="text-sm py-2"
                {...register("description")}
              />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rescueStory" className="text-sm font-semibold">Full Rescue Background Story *</Label>
              <Textarea
                id="rescueStory"
                rows={3}
                placeholder="Tell the animal's rescue story in Petaling Jaya, rehabilitation progress, and personality traits..."
                className="text-sm leading-relaxed"
                {...register("rescueStory")}
              />
              {errors.rescueStory && <p className="text-xs text-destructive">{errors.rescueStory.message}</p>}
            </div>

            {/* Dynamic Tags */}
            <div className="space-y-2 pt-1">
              <Label className="text-sm font-semibold">Characteristic Tags & Badges *</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Type trait (e.g. 'House-Trained', 'Playful') and press Add..."
                  className="text-sm py-2"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddTag} className="text-xs font-semibold px-4">
                  <Plus className="size-3.5 mr-1" /> Add Tag
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 bg-secondary text-secondary-foreground border border-border px-3 py-1 text-xs font-semibold"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Veterinary & Compatibility */}
          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-border pb-1">
              4. Veterinary Clearance & Compatibility
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="vaccinated" {...register("vaccinated")} className="size-4.5 accent-foreground" />
                <Label htmlFor="vaccinated" className="text-sm font-medium cursor-pointer">Vaccinated</Label>
              </div>

              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="microchipped" {...register("microchipped")} className="size-4.5 accent-foreground" />
                <Label htmlFor="microchipped" className="text-sm font-medium cursor-pointer">Microchipped</Label>
              </div>

              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="spayedNeutered" {...register("spayedNeutered")} className="size-4.5 accent-foreground" />
                <Label htmlFor="spayedNeutered" className="text-sm font-medium cursor-pointer">Spayed / Neutered</Label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="specialNeeds" className="text-sm font-semibold">Special Medical Notes (Optional)</Label>
              <Input id="specialNeeds" placeholder="e.g. Daily allergy supplement; healthy recovery from knee surgery" className="text-sm py-2" {...register("specialNeeds")} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="goodWithDogs" {...register("goodWithDogs")} className="size-4.5 accent-foreground" />
                <Label htmlFor="goodWithDogs" className="text-sm font-medium cursor-pointer">Good with Dogs</Label>
              </div>

              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="goodWithCats" {...register("goodWithCats")} className="size-4.5 accent-foreground" />
                <Label htmlFor="goodWithCats" className="text-sm font-medium cursor-pointer">Good with Cats</Label>
              </div>

              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="goodWithKids" {...register("goodWithKids")} className="size-4.5 accent-foreground" />
                <Label htmlFor="goodWithKids" className="text-sm font-medium cursor-pointer">Good with Kids</Label>
              </div>

              <div className="space-y-1">
                <Label htmlFor="energyLevel" className="text-xs font-semibold">Energy Level</Label>
                <select id="energyLevel" {...register("energyLevel")} className="w-full bg-background border border-input px-2 py-1.5 text-xs text-foreground">
                  <option value="Low">Low</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2 border-t border-border/60">
              <input type="checkbox" id="featured" {...register("featured")} className="size-4.5 accent-foreground" />
              <Label htmlFor="featured" className="text-sm font-semibold cursor-pointer flex items-center gap-1.5">
                <Star className="size-4 text-warning-accent fill-warning-accent/20" />
                Feature on Homepage Showcase
              </Label>
            </div>
          </div>

          {/* Submit */}
          <div className="border-t border-border pt-5 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-sm font-semibold px-5">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="text-sm font-semibold px-7">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : editingPet ? (
                "Update Pet Profile"
              ) : (
                "Create Pet Record"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Mounted only while open: otherwise it resolves (and can encode) a QR
          on every keystroke of the pet form. */}
      {qrPreviewOpen && (
        <QrPreviewDialog
          open={qrPreviewOpen}
          onOpenChange={setQrPreviewOpen}
          petCustomQrUrl={watch("customQrUrl") ?? ""}
          petName={watch("name") || editingPet?.name || "This animal"}
        />
      )}
    </Dialog>
  );
}
