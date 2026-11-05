# Guided Tutorial 03: Multi-Language Expansion (Adding Mandarin & Tamil)

> **Superseded facts (2026-11-05).** This tutorial was written when the shelter was believed to
> be a registered society with LHDN Subsection 44(6) approval. It is neither (#239). The ROS
> numbers, LHDN reference and society name below are not real, the site issues no tax receipts,
> and none of them may be copied into `src/`, where `tests/unit/shelterIdentity.test.ts` rejects
> them.

**Target Feature**: Expand the zero-dependency localization engine from bilingual (`en` & `ms`) to a 4-language platform supporting **Malaysian Simplified Chinese (`zh-MY`)** and **Tamil (`ta-MY`)** with strict compile-time key parity.  
**Skill Focus**: TypeScript Indexed Dictionaries, React Context State, and Accessible UI Switchers.

---

## 🎯 1. Why This Feature Earns Its Place

The Klang Valley and Selangor community is multicultural and multilingual:
1. **Adoption Outreach**: Many senior citizens and families in Petaling Jaya, Subang, and Klang primarily read Chinese or Tamil.
2. **Community Inclusion**: Volunteer signups, foster programs, and DuitNow QR donations increase when legal and animal care instructions are readable in the user's native tongue.
3. **Zero Runtime Bloat**: By maintaining typed local dictionaries, we add **0 external dependencies, 0 network API calls, and 0 latency**.

---

## 📋 2. Step-by-Step Implementation

### Step 1: Update Language Types & Metadata
📁 **Target File**: [`src/lib/i18n/translations.ts`](file:///c:/Users/User/pet-shelter/src/lib/i18n/translations.ts) (Lines 1–25)

```typescript
export type Language = 'en' | 'ms' | 'zh' | 'ta';

export interface LanguageOption {
  code: Language;
  label: string;      // e.g. "English", "Bahasa Melayu", "简体中文", "தமிழ்"
  shortLabel: string; // e.g. "EN", "BM", "中文", "தமி"
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "ms", label: "Bahasa Melayu", shortLabel: "BM" },
  { code: "zh", label: "简体中文", shortLabel: "中文" },
  { code: "ta", label: "தமிழ்", shortLabel: "தமி" },
];
```

---

### Step 2: Implement Complete Dictionary Structure
📁 **Target File**: [`src/lib/i18n/translations.ts`](file:///c:/Users/User/pet-shelter/src/lib/i18n/translations.ts)

Create the `zh` and `ta` dictionaries ensuring every single key matches `TranslationDictionary`:

```typescript
const zh: TranslationDictionary = {
  nav: {
    adopt: "领养",
    donate: "捐款与税收减免",
    track: "申请进度追踪",
    bulletins: "庇护所公告",
    login: "员工登入",
    adminDashboard: "管理后台",
  },
  common: {
    available: "待领养",
    pending: "申请审核中",
    adopted: "已领养",
    freeAdoption: "100% 免费领养",
    filterBy: "筛选条件",
    clearFilters: "重置所有筛选",
    loading: "载入中...",
    search: "搜寻",
    all: "全部",
    male: "公",
    female: "母",
    dog: "狗",
    cat: "猫",
    dogs: "狗狗",
    cats: "猫咪",
    allSpecies: "全部物种",
    save: "储存",
    cancel: "取消",
    back: "返回",
    confirm: "确认",
    close: "关闭",
    viewDetails: "查看详情",
    applyToAdopt: "申请免费领养",
    trackStatus: "追踪申请状态",
  },
  hero: {
    badge: "雪兰莪注册非营利动物庇护所 (ROS PPM-012-10-18042016)",
    title: "给流浪毛孩一个温暖的永久家庭。",
    subtitle: "雪兰莪八打灵再也流浪动物救援中心。提供完整的兽医健康筛查、绝育手术与核心疫苗接种。绝不收取商业领养费。",
    ctaAdopt: "寻找毛孩伙伴",
    ctaDonate: "支持医疗基金 (LHDN免税)",
    statRescues: "850+ 成功救援",
    statAdoptions: "720+ 成功领养",
    statCare: "100% 兽医体检",
  },
  // ... continue with home, pets, petDetail, medicalTimeline, adoptionForm, tracking, donations, bulletins, footer
};

// Export all languages mapped strictly to Record<Language, TranslationDictionary>
export const translations: Record<Language, TranslationDictionary> = {
  en,
  ms,
  zh,
  ta,
};
```

---

### Step 3: Accessible Multi-Language Toggle
📁 **Target File**: [`src/components/LanguageToggle.tsx`](file:///c:/Users/User/pet-shelter/src/components/LanguageToggle.tsx)

```tsx
"use client";

import React from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/translations";
import { Globe } from "lucide-react";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language Selector"
      className="inline-flex items-center gap-1 p-1 bg-muted/50 border border-border rounded-xl"
    >
      <Globe className="size-3.5 text-muted-foreground ml-1.5 mr-0.5" aria-hidden="true" />
      {SUPPORTED_LANGUAGES.map((lang) => {
        const isActive = language === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => setLanguage(lang.code)}
            aria-pressed={isActive}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              isActive
                ? "bg-background text-foreground shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40"
            }`}
            title={lang.label}
          >
            {lang.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
```

---

### Step 4: Automated Key Parity Test Suite
📁 **Target File**: [`tests/unit/i18n.test.ts`](file:///c:/Users/User/pet-shelter/tests/unit/i18n.test.ts)

Verify 100% parity across all 4 languages to prevent missing string bugs:

```typescript
import { describe, it, expect } from "vitest";
import { translations, Language } from "@/lib/i18n/translations";

describe("4-Language i18n Key Parity Suite", () => {
  const languages: Language[] = ["en", "ms", "zh", "ta"];

  it("should have all 4 language dictionaries defined", () => {
    languages.forEach((lang) => {
      expect(translations[lang]).toBeDefined();
    });
  });

  it("should ensure 100% namespace parity with English base", () => {
    const baseNamespaces = Object.keys(translations.en).sort();

    languages.forEach((lang) => {
      const currentNamespaces = Object.keys(translations[lang]).sort();
      expect(currentNamespaces).toEqual(baseNamespaces);
    });
  });
});
```

---

## 🧪 3. Verification & Quality Gates

```bash
# 1. Run Vitest Unit Tests
npm test -- --run

# 2. Strict Type Check
npx tsc --noEmit
```
