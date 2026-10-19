"use client";

import { SHELTER_WHATSAPP_URL } from "@/lib/domain/shelterIdentity";
import React, { useState, useEffect, useTransition, useRef } from "react";
import { RehabNeed } from "@/types/rehab";
import { getRehabNeedsAction } from "@/actions/rehabNeeds";
import { useLanguage } from "@/components/providers/LanguageProvider";
import {
  HeartHandshake,
  Search,
  Package,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  MapPin,
  Clock,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ALL_CATEGORY_VALUE,
  CategoryTab,
  DerivedCategory,
  withAllTab,
  getRehabNeedCategoryLabel,
} from "@/lib/presentation/categoryTabs";

/**
 * The one tab that is not derived from the fixture. Its wording is carried
 * over verbatim from the hardcoded list this component used to own, and is
 * deliberately not the FAQ strip's "All Topics": this list is a wishlist.
 */
const ALL_NEEDS_TAB: CategoryTab = {
  value: ALL_CATEGORY_VALUE,
  labelEn: "All Wishlist Items",
  labelMs: "Semua Barangan Keperluan",
};

export function RehabNeedsSection({
  initialNeeds,
  initialCategories,
}: { initialNeeds?: RehabNeed[]; initialCategories?: DerivedCategory[] } = {}) {
  const { isMs } = useLanguage();
  const [needs, setNeeds] = useState<RehabNeed[]>(initialNeeds || []);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY_VALUE);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isInitialMount = useRef(true);

  const categoryTabs = withAllTab(ALL_NEEDS_TAB, initialCategories);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (
        initialNeeds &&
        initialNeeds.length > 0 &&
        selectedCategory === ALL_CATEGORY_VALUE &&
        searchQuery.trim() === ""
      ) {
        return;
      }
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await getRehabNeedsAction({
          category: selectedCategory === ALL_CATEGORY_VALUE ? undefined : selectedCategory,
          search: searchQuery.trim() === "" ? undefined : searchQuery.trim(),
        });
        if (res.success && res.data) {
          setNeeds(res.data);
        }
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [selectedCategory, searchQuery, initialNeeds]);

  const handleCopySpec = (item: RehabNeed) => {
    const textToCopy = `${item.name} (${item.quantityNeeded}) - Hope for Strays Wishlist\nBrand: ${item.brand || "Any veterinary/hospital approved brand"}\nDeliver to: No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const getUrgencyBadge = (level: string) => {
    const norm = level.toLowerCase();
    if (norm === "critical") {
      return (
        <span className="inline-flex items-center gap-1 bg-danger-solid text-white text-2xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          <AlertCircle className="size-3" />
          {isMs ? "Kritikal" : "Critical"}
        </span>
      );
    }
    if (norm === "high") {
      return (
        <span className="inline-flex items-center gap-1 bg-warning-solid text-white text-2xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          <AlertCircle className="size-3" />
          {isMs ? "Tinggi" : "High Priority"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-success-solid text-white text-2xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
        <ShieldCheck className="size-3" />
        {isMs ? "Biasa" : "Normal"}
      </span>
    );
  };

  return (
    <div className="w-full space-y-10">
      {/* Category Pills & Search Filter */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {categoryTabs.map((tab) => {
            const isActive = selectedCategory === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setSelectedCategory(tab.value)}
                className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                  isActive
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {isMs ? tab.labelMs : tab.labelEn}
              </button>
            );
          })}
        </div>

        {/* Live Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={isMs ? "Cari barangan / jenama..." : "Search items / brands..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-xs sm:text-sm rounded-xl py-2"
          />
        </div>
      </div>

      {/* Loading state / Items Grid */}
      {isPending && needs.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Package className="size-10 mx-auto animate-bounce opacity-40 mb-3" />
          <p className="text-sm font-semibold">{isMs ? "Memuatkan senarai keperluan..." : "Loading wishlist needs..."}</p>
        </div>
      ) : needs.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-2xl bg-muted/20">
          <Package className="size-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <h3 className="font-heading text-lg font-bold text-foreground">
            {isMs ? "Tiada barangan dijumpai" : "No wishlist items found"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isMs ? "Cuba tukar kategori atau kata carian anda." : "Try switching categories or clearing your search term."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {needs.map((item) => (
            <div
              key={item.id}
              className="border border-border bg-card p-6 rounded-2xl flex flex-col justify-between space-y-5 hover:border-foreground/40 transition-all shadow-xs"
            >
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow bg-muted px-2.5 py-1 rounded-md">
                    {getRehabNeedCategoryLabel(item.category, isMs)}
                  </span>
                  {getUrgencyBadge(item.urgencyLevel)}
                </div>

                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground leading-snug">
                    {isMs ? item.nameMs : item.name}
                  </h3>
                  {isMs && (
                    <p className="text-xs text-muted-foreground font-medium mt-0.5 italic">
                      {item.name}
                    </p>
                  )}
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {isMs ? item.descriptionMs : item.description}
                </p>

                {/* Key Spec Badges */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-foreground">{isMs ? "Kuantiti Diperlukan:" : "Quantity Needed:"}</span>
                    <span className="font-medium text-foreground/90 bg-muted/60 px-2 py-0.5 rounded-sm">
                      {item.quantityNeeded}
                    </span>
                  </div>

                  {item.brand && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-foreground">{isMs ? "Cadangan Jenama:" : "Brand / Spec:"}</span>
                      <span className="font-medium text-muted-foreground">{item.brand}</span>
                    </div>
                  )}

                  {item.estimatedCostMYR && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-foreground">{isMs ? "Anggaran Kos:" : "Estimated Cost:"}</span>
                      <span className="font-mono font-bold text-success-accent ">
                        RM {item.estimatedCostMYR.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-border/80 flex items-center gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopySpec(item)}
                  className="w-full text-xs font-semibold gap-1.5 rounded-xl cursor-pointer"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="size-3.5 text-success-accent" />
                      {isMs ? "Disalin!" : "Copied Spec!"}
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      {isMs ? "Salin Spesifikasi" : "Copy Item Spec"}
                    </>
                  )}
                </Button>

                {item.shopeeLink && (
                  <a
                    href={item.shopeeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center size-9 shrink-0 border border-border bg-background hover:bg-muted text-foreground rounded-xl transition-colors"
                    title="Search on Shopee"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sanctuary Drop-off / Physical Delivery Guide */}
      <div className="border border-border bg-muted/30 p-6 sm:p-8 rounded-3xl space-y-5 mt-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              {isMs ? "Panduan Penghantaran & Bantuan Barangan" : "Physical Delivery & In-Kind Donation Guide"}
            </span>
            <h3 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
              {isMs ? "Lokasi Drop-Off & Alamat Kurier Santuari" : "Drop-off Location & Sanctuary Courier Address"}
            </h3>
          </div>
          <a
            href={`${SHELTER_WHATSAPP_URL}?text=Hi%20Hope%20for%20Strays%2C%20I%20would%20like%20to%20arrange%20a%20wishlist%20item%20drop-off.`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-foreground/85 transition-colors rounded-xl shrink-0"
          >
            <HeartHandshake className="size-4" />
            {isMs ? "WhatsApp Meja Santuari" : "WhatsApp Shelter Desk"}
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="border border-border bg-background p-4 rounded-2xl flex items-start gap-3.5">
            <MapPin className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm">
              <p className="font-bold text-foreground">
                {isMs ? "Pusat Santuari & Rumah Pemulihan PJ:" : "Sanctuary & Rehabilitation House:"}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia
              </p>
            </div>
          </div>

          <div className="border border-border bg-background p-4 rounded-2xl flex items-start gap-3.5">
            <Clock className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm">
              <p className="font-bold text-foreground">
                {isMs ? "Waktu Penerimaan Barangan:" : "Receiving Hours:"}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {isMs
                  ? "Selasa hingga Ahad: 10:00 pagi – 5:00 petang (Isnin tutup untuk sanitasi mendalam)"
                  : "Tuesday through Sunday: 10:00 AM – 5:00 PM (Closed Mondays for clinical deep clean)"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
