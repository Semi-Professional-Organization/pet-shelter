"use client";

import { PUBLIC_ROS_REGISTRATION_NO, SHELTER_WHATSAPP_URL, SHELTER_WHATSAPP_DISPLAY, SHELTER_PHONE_TEL, SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
import Link from "next/link";
import { PawPrint, MapPin, Phone, Mail, Clock, MessageCircle } from "lucide-react";
import { ThemeToggle } from "@/components/providers/ThemeToggle";
import { LanguageToggle } from "@/components/providers/LanguageToggle";
import { useLanguage, useTypedTranslation } from "@/components/providers/LanguageProvider";

export function Footer() {
  const { t, isMs } = useTypedTranslation();
  // Untyped, for the one link whose key exists in no dictionary. Its English
  // fallback is the only text it has, so it cannot use the typed `t` until the
  // key is added — tasks/open/translation-keys-the-dictionary-does-not-have.md.
  // (`nav.sponsorWall` was the other; the navbar already shipped Malay for
  // the same link, so the key now exists and both read it.)
  const { t: untypedT } = useLanguage();

  return (
    <footer className="border-t border-border bg-frame-footer text-foreground">
      <div className="w-full px-6 py-12 sm:px-8 sm:py-14 lg:px-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4 md:grid-cols-2">
          {/* Column 1: Organization */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center bg-primary text-primary-foreground rounded-lg">
                <PawPrint className="size-4.5" />
              </div>
              <span className="font-heading text-xl font-bold tracking-tight">
                Hope for Strays
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("footer.orgDesc")}
            </p>
          </div>

          {/* Column 2: Navigation Links */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3">
              {t("footer.quickLinksTitle")}
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/pets" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {t("nav.adoptablePets")}
                </Link>
              </li>
              <li>
                <Link href="/applications/track" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {t("nav.trackApplication")}
                </Link>
              </li>
              <li>
                <Link href="/bulletins" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {t("nav.bulletins")}
                </Link>
              </li>
              <li>
                <Link href="/adoption" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {t("nav.adoptionProcess")}
                </Link>
              </li>
              <li>
                <Link href="/get-involved#volunteer" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {t("nav.volunteerFoster")}
                </Link>
              </li>
              <li>
                <Link href="/donate" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {t("nav.donate")}
                </Link>
              </li>
              <li>
                <Link href="/transparency" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {t("nav.transparency")}
                </Link>
              </li>
              <li>
                <Link href="/sponsors" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {t("nav.sponsorWall")}
                </Link>
              </li>
              <li>
                <Link href="/sponsor/dashboard" className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium">
                  {untypedT("nav.sponsorPortal", "Sponsor Portal")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Hours */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3">
              {t("footer.visitingHoursTitle")}
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2.5">
                <Clock className="size-4 text-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-foreground">{isMs ? "Selasa – Ahad" : "Tuesday – Sunday"}</p>
                  <p className="font-medium">{isMs ? "10:00 Pagi – 5:00 Petang" : "10:00 AM – 5:00 PM"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("footer.closedMondays")}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Column 4: Location & Contact */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3">
              {t("footer.locationContactTitle")}
            </h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <MapPin className="size-4 text-foreground shrink-0 mt-0.5" />
                <span className="leading-relaxed">{t("footer.address")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 text-foreground shrink-0" />
                <a href={`tel:${SHELTER_PHONE_TEL}`} className="text-foreground hover:underline font-semibold">
                  {SHELTER_PHONE_DISPLAY}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <MessageCircle className="size-4 tone-success tone-ink shrink-0" />
                <a 
                  href={`${SHELTER_WHATSAPP_URL}?text=Hi%20Hope%20for%20Strays%2C%20I%20have%20an%20enquiry%20regarding%20volunteering%20or%20fostering.`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-foreground hover:underline font-semibold"
                >
                  WhatsApp: {SHELTER_WHATSAPP_DISPLAY}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 text-foreground shrink-0" />
                <a href="mailto:info@hopeforstrays.org" className="text-foreground hover:underline font-semibold">
                  info@hopeforstrays.org
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Legal & Staff */}
        <div className="mt-10 border-t border-border pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <p>© 2024 Hope for Strays.</p>
            <span className="text-muted-foreground/40 hidden sm:inline">•</span>
            <p className="font-mono">{t("footer.rosReg", { regNo: PUBLIC_ROS_REGISTRATION_NO })}</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground hover:underline font-medium">
              {t("footer.privacyNotice")}
            </Link>
            <span className="text-muted-foreground/40">•</span>
            <Link href="/terms" className="hover:text-foreground hover:underline font-medium">
              {t("footer.adoptionTerms")}
            </Link>
            <span className="text-muted-foreground/40">•</span>
            <Link href="/admin/login" className="font-semibold hover:text-foreground hover:underline">
              {t("footer.staffPortal")}
            </Link>
            <span className="text-muted-foreground/40">•</span>
            <LanguageToggle />
            <span className="text-muted-foreground/40">•</span>
            <ThemeToggle showLabel={true} />
          </div>
        </div>
      </div>
    </footer>
  );
}
