"use client";

import { SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
import { useState, useEffect, useCallback } from "react";
import { ShelterSettingsInput } from "@/lib/validations/settings";

const STORAGE_KEY = "hope_for_strays_settings_v2";

const defaultSettings: ShelterSettingsInput = {
  shelterName: "Hope for Strays",
  email: "info@hopeforstrays.org",
  phone: SHELTER_PHONE_DISPLAY,
  address: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia",
  operatingHours: "Tuesday – Sunday: 10:00 AM – 5:00 PM (Closed Mondays)",
  announcementBanner: "Weekend Adoption Drive & Free Microchip Clinic this Saturday 9 AM – 1 PM at Petaling Jaya sanctuary!",
  adoptionFeeDog: "Free",
  adoptionFeeCat: "Free",
  resendApiKey: "",
  emailFrom: "Hope for Strays <onboarding@resend.dev>",
  shelterNotificationEmail: "fergeley@gmail.com",
  storageProvider: "local",
  s3Bucket: "",
  s3Region: "ap-southeast-1",
  s3CdnUrl: "",
  cloudinaryCloudName: "",
};

export function useSettingsStore() {
  const [settings, setSettings] = useState<ShelterSettingsInput>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          return { ...defaultSettings, ...JSON.parse(saved) };
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    }
    return defaultSettings;
  });

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoaded(true);
  }, []);

  const saveSettings = useCallback((newSettings: ShelterSettingsInput) => {
    setSettings(newSettings);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      } catch (e) {
        console.error("Failed to persist settings", e);
      }
    }
  }, []);

  const resetToDefaultSettings = useCallback(() => {
    saveSettings(defaultSettings);
  }, [saveSettings]);

  return {
    settings,
    isLoaded,
    saveSettings,
    resetToDefaultSettings,
  };
}
