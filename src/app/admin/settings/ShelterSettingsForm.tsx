"use client";

import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { shelterSettingsSchema, ShelterSettingsInput } from "@/lib/validations/settings";
import { isPlaceholderFormUrl } from "@/lib/volunteerFormUrl";
import { useSettingsStore } from "@/lib/client/settingsStore";
import {
  updateShelterSettings,
  sendTestEmailAction,
  loadShelterSettings,
} from "@/actions/settings";
import { DonationQrSettings } from "@/components/admin/DonationQrSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  RotateCcw,
  Save,
  Mail,
  Send,
  Loader2,
  HardDrive,
  Building,
  DollarSign,
  Key,
  ShieldCheck,
  AlertTriangle,
  ClipboardList,
  QrCode,
  Eye,
  EyeOff,
} from "lucide-react";

/**
 * The settings screen. Both capabilities come from the page's verified session,
 * not the browser's copy of it, which can hold a role the server no longer gives.
 *
 * The section opens for MANAGE_SETTINGS or SEND_SHELTER_EMAIL, because a Volunteer
 * Coordinator legitimately sends test emails here. Everything else on the screen
 * needs MANAGE_SETTINGS: the read that fills the form and the save that writes it.
 * So a member without it is shown only the test email tool. The whole form used to
 * render for them, filled from this browser's copy or the built-in defaults
 * because the read was refused, with a "Save All Settings" that was refused too.
 */
export function ShelterSettingsForm({
  canManageSettings,
  canEditQr,
  ownEmail,
}: {
  canManageSettings: boolean;
  /** Display-only. `updateShelterSettings` re-checks server-side. */
  canEditQr: boolean;
  /** The signed-in member's address, the test email's default for one who cannot read the settings. */
  ownEmail: string;
}) {
  const { settings, saveSettings, resetToDefaultSettings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<
    "general" | "email" | "storage" | "donation"
  >("general");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Test Email State. A member without MANAGE_SETTINGS never loads the shelter's
  // notification address, so their default is their own inbox, where they can watch
  // the test arrive, rather than this browser's copy or the hard-coded fallback.
  const [testRecipient, setTestRecipient] = useState(
    canManageSettings ? settings.shelterNotificationEmail || "fergeley@gmail.com" : ownEmail
  );
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    messageId?: string;
    simulated?: boolean;
    error?: string;
  } | null>(null);

  const form = useForm<ShelterSettingsInput>({
    resolver: zodResolver(shelterSettingsSchema),
    defaultValues: settings,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  // `useSettingsStore` is backed by localStorage, so it only knows what this
  // browser last saved. The QR fields now really persist, so a second admin
  // would otherwise open the page with empty QR inputs and blank the saved
  // codes on their next save. Pull the persisted keys from the server once on
  // mount, and only when they are authoritative.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    // The read needs MANAGE_SETTINGS and would only be refused.
    if (!canManageSettings) return;

    let cancelled = false;

    loadShelterSettings()
      .then(({ settings: server, fromDatabase }) => {
        if (cancelled || !fromDatabase) return;
        // Do not clobber work in progress: this resolves after mount, and
        // writing to the store fires the reset effect over the whole form.
        if (formRef.current.formState.isDirty) return;

        saveSettings({
          ...settingsRef.current,
          ...(server as Partial<ShelterSettingsInput>),
        });
      })
      .catch(() => {
        // Keep the local copy; the save path re-reads before writing.
      });

    return () => {
      cancelled = true;
    };
  }, [saveSettings, canManageSettings]);

  useEffect(() => {
    reset(settings);
    if (canManageSettings && settings.shelterNotificationEmail) {
      setTestRecipient(settings.shelterNotificationEmail);
    }
  }, [settings, reset, canManageSettings]);

  const currentStorageProvider = watch("storageProvider");
  const watchedVolunteerFormUrl = watch("volunteerFormUrl");

  const onSubmit = async (data: ShelterSettingsInput) => {
    setSaveError(null);

    const res = await updateShelterSettings(data);

    if (!res.success) {
      // Previously the local copy was written first and a failure was
      // swallowed, so a rejected save looked identical to a successful one.
      setSaveError(res.error || "Could not save settings.");
      return;
    }

    saveSettings(res.data ?? data);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 4000);
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestResult(null);

    if (!testRecipient.trim()) {
      setTestResult({ success: false, error: "Please enter a test recipient email address." });
      return;
    }

    setSendingTest(true);
    try {
      const res = await sendTestEmailAction({
        recipientEmail: testRecipient,
        customSubject: "🐾 Hope for Strays - Live Settings Verification Email",
        customMessage: "This test email confirms that your Resend email service and shelter notification pipeline are working 100% properly from the Admin Settings dashboard.",
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed to dispatch test email",
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Rendered on the Email tab for a member who manages settings, and alone for one
  // who may only send a test email.
  const testEmailTool = (
    <div className="border border-border bg-muted/30 p-6 rounded-lg space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
        <Send className="size-4 text-primary" />
        Live Email Dispatch Verification Tool
      </h3>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Send an immediate test email to verify that your Resend API key and template renderer are fully operational.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            type="email"
            placeholder="Enter test recipient email (e.g. fergeley@gmail.com)"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            className="text-xs bg-background"
          />
        </div>
        <Button
          type="button"
          onClick={handleSendTestEmail}
          disabled={sendingTest}
          size="sm"
          className="text-xs font-semibold gap-1.5 shrink-0 px-5"
        >
          {sendingTest ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="size-3.5" />
              Send Test Email
            </>
          )}
        </Button>
      </div>

      {testResult && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-start gap-2.5 border ${
            testResult.success
              ? "tone-soft tone-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-success-accent" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">
              {testResult.success ? "Test Email Delivered Successfully!" : "Test Email Dispatch Failed"}
            </p>
            {testResult.messageId && (
              <p className="font-mono text-2xs">
                Resend Message ID: <strong>{testResult.messageId}</strong> {testResult.simulated && "(Simulation Mode)"}
              </p>
            )}
            {testResult.error && <p>{testResult.error}</p>}
          </div>
        </div>
      )}
    </div>
  );

  if (!canManageSettings) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Shelter Settings &amp; Service Integrations
          </h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            The shelter&apos;s configuration is changed by a Super Admin. From here you can
            send a test email to check that the shelter&apos;s email service is working.
          </p>
        </div>

        {testEmailTool}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Shelter Settings & Service Integrations
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Configure sanctuary identity, standard fees, live announcement banner, transactional emails (Resend), and media storage providers.
        </p>
      </div>

      {saveError && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-4 text-xs font-semibold flex items-center gap-2 rounded-lg shadow-sm animate-in">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {savedSuccess && (
        <div className="tone-soft tone-success border p-4 text-xs font-semibold flex items-center gap-2 rounded-lg shadow-sm animate-in">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Shelter settings and service parameters updated successfully! Changes are active immediately.</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-border gap-2 sm:gap-6 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={`pb-3 px-1 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "general"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building className="size-4" />
          Sanctuary Identity & Fees
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("email")}
          className={`pb-3 px-1 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "email"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mail className="size-4" />
          Transactional Email (Resend)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("storage")}
          className={`pb-3 px-1 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "storage"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardDrive className="size-4" />
          Media Storage Provider
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("donation")}
          className={`pb-3 px-1 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "donation"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <QrCode className="size-4" />
          Donation &amp; QR Codes
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* TAB 1: General Sanctuary Identity & Fees */}
        {activeTab === "general" && (
          <div className="border border-border bg-card p-6 sm:p-8 space-y-6 rounded-lg shadow-sm">
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-border pb-1">
                1. Sanctuary Identity & Location
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="shelterName" className="text-xs font-semibold">Organisation / Sanctuary Name *</Label>
                  <Input id="shelterName" {...register("shelterName")} className="text-sm py-2.5" />
                  {errors.shelterName && <p className="text-xs text-destructive">{errors.shelterName.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold">Contact & WhatsApp Helpline *</Label>
                  <Input id="phone" {...register("phone")} className="text-sm py-2.5 font-mono" />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">Public Inquiry Email *</Label>
                  <Input id="email" type="email" {...register("email")} className="text-sm py-2.5" />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="operatingHours" className="text-xs font-semibold">Visiting Hours *</Label>
                  <Input id="operatingHours" {...register("operatingHours")} className="text-sm py-2.5" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs font-semibold">Sanctuary Address in Petaling Jaya *</Label>
                <Input id="address" {...register("address")} className="text-sm py-2.5" />
              </div>
            </div>

            {/* Standard Adoption Fees */}
            <div className="space-y-4 border-t border-border pt-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-border pb-1 flex items-center gap-1.5">
                <DollarSign className="size-4 text-success-accent" />
                2. Adoption Fee Model
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="adoptionFeeDog" className="text-xs font-semibold">Dog Adoption Fee *</Label>
                  <Input id="adoptionFeeDog" {...register("adoptionFeeDog")} className="text-sm py-2.5 font-semibold text-success-text " />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adoptionFeeCat" className="text-xs font-semibold">Cat Adoption Fee *</Label>
                  <Input id="adoptionFeeCat" {...register("adoptionFeeCat")} className="text-sm py-2.5 font-semibold text-success-text " />
                </div>
              </div>
            </div>

            {/* Live Announcement Banner */}
            <div className="space-y-3 border-t border-border pt-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-border pb-1">
                3. Live Site Announcement Banner
              </h2>

              <div className="space-y-1.5">
                <Label htmlFor="announcementBanner" className="text-xs font-semibold">Headline Banner Text</Label>
                <Textarea
                  id="announcementBanner"
                  rows={2}
                  placeholder="e.g. Weekend Adoption Drive & Free Microchip Clinic this Saturday 9 AM – 1 PM!"
                  className="text-sm leading-relaxed"
                  {...register("announcementBanner")}
                />
              </div>
            </div>

            {/* Volunteer intake (external Google Form) */}
            <div className="space-y-4 border-t border-border pt-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-border pb-1 flex items-center gap-1.5">
                <ClipboardList className="size-4 text-success-text" />
                4. Volunteer Intake Form
              </h2>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Volunteer applications are collected in an external Google Form. The
                public <strong className="text-foreground">Apply to Volunteer</strong> button
                in the volunteer section of <code className="font-mono">/get-involved</code>{" "}
                opens the form URL below.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="volunteerFormUrl" className="text-xs font-semibold">
                  Official Volunteer Application Form URL
                </Label>
                <Input
                  id="volunteerFormUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://forms.gle/your-volunteer-form"
                  className="text-sm py-2.5 font-mono"
                  {...register("volunteerFormUrl")}
                />
                {errors.volunteerFormUrl && (
                  <p className="text-xs text-destructive">{errors.volunteerFormUrl.message}</p>
                )}
                {isPlaceholderFormUrl(watchedVolunteerFormUrl) && !errors.volunteerFormUrl && (
                  <p className="text-xs text-warning-text flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Not configured yet — the public page falls back to the WhatsApp
                    coordinator until you paste a real form URL.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="volunteerFormResponsesUrl" className="text-xs font-semibold">
                  Volunteer Form Responses Sheet URL
                </Label>
                <Input
                  id="volunteerFormResponsesUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="text-sm py-2.5 font-mono"
                  {...register("volunteerFormResponsesUrl")}
                />
                {errors.volunteerFormResponsesUrl && (
                  <p className="text-xs text-destructive">
                    {errors.volunteerFormResponsesUrl.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Linked from the <strong className="text-foreground">Volunteer Form Responses</strong>{" "}
                  shortcut in the admin header. This is the responses sheet, not the public form.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Transactional Email & Live Dispatcher */}
        {activeTab === "email" && (
          <div className="space-y-6">
            <div className="border border-border bg-card p-6 sm:p-8 space-y-6 rounded-lg shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="space-y-0.5">
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Mail className="size-4 text-primary" />
                    Resend Transactional Email Service
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Automate application confirmations, coordinator alerts, status updates, and interview invitations.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold tone-soft tone-success border px-2.5 py-1 rounded-full">
                  <ShieldCheck className="size-3.5" />
                  Service Connected
                </span>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="resendApiKey" className="text-xs font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Key className="size-3.5" /> Resend API Key Override
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-2xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {showApiKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      {showApiKey ? "Hide Key" : "Reveal Key"}
                    </button>
                  </Label>
                  <Input
                    id="resendApiKey"
                    type={showApiKey ? "text" : "password"}
                    placeholder="re_xxxxxxxxxxxxxxxxx (defaults to RESEND_API_KEY from .env.local)"
                    {...register("resendApiKey")}
                    className="text-sm font-mono py-2.5"
                  />
                  <p className="text-2xs text-muted-foreground">
                    Leave blank to inherit the global <code className="bg-muted px-1 py-0.5 rounded text-foreground">RESEND_API_KEY</code> from your environment.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="emailFrom" className="text-xs font-semibold">Sender Email Address (From) *</Label>
                    <Input
                      id="emailFrom"
                      placeholder="Hope for Strays <onboarding@resend.dev>"
                      {...register("emailFrom")}
                      className="text-sm py-2.5 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="shelterNotificationEmail" className="text-xs font-semibold">Staff Notification Destination *</Label>
                    <Input
                      id="shelterNotificationEmail"
                      type="email"
                      placeholder="fergeley@gmail.com"
                      {...register("shelterNotificationEmail")}
                      className="text-sm py-2.5 font-mono"
                    />
                    <p className="text-2xs text-muted-foreground">
                      Receives coordinator alerts whenever a public adopter submits an application.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {testEmailTool}
          </div>
        )}

        {/* TAB 3: Media Storage Provider */}
        {activeTab === "storage" && (
          <div className="border border-border bg-card p-6 sm:p-8 space-y-6 rounded-lg shadow-sm">
            <div className="border-b border-border pb-3">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <HardDrive className="size-4 text-primary" />
                Media & Photo Upload Storage
              </h2>
              <p className="text-xs text-muted-foreground">
                Configure where pet gallery photos and listing thumbnails are stored.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="storageProvider" className="text-xs font-semibold">Active Storage Provider *</Label>
                <select
                  id="storageProvider"
                  {...register("storageProvider")}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground font-semibold"
                >
                  <option value="local">Local Filesystem (/public/uploads) — Default</option>
                  <option value="s3">AWS S3 / Cloudflare R2 / MinIO / Supabase Storage</option>
                  <option value="cloudinary">Cloudinary Media Cloud</option>
                </select>
              </div>

              {currentStorageProvider === "s3" && (
                <div className="space-y-4 p-4 bg-muted/40 border border-border rounded-lg animate-in">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">S3-Compatible Settings</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="s3Bucket" className="text-xs font-semibold">Bucket Name</Label>
                      <Input id="s3Bucket" placeholder="hope-for-strays-uploads" {...register("s3Bucket")} className="text-sm font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="s3Region" className="text-xs font-semibold">Region</Label>
                      <Input id="s3Region" placeholder="ap-southeast-1" {...register("s3Region")} className="text-sm font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s3CdnUrl" className="text-xs font-semibold">Custom CDN URL (Optional)</Label>
                    <Input id="s3CdnUrl" placeholder="https://cdn.hopeforstrays.org" {...register("s3CdnUrl")} className="text-sm font-mono" />
                  </div>
                </div>
              )}

              {currentStorageProvider === "cloudinary" && (
                <div className="space-y-4 p-4 bg-muted/40 border border-border rounded-lg animate-in">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Cloudinary Settings</h3>
                  <div className="space-y-1.5">
                    <Label htmlFor="cloudinaryCloudName" className="text-xs font-semibold">Cloud Name</Label>
                    <Input id="cloudinaryCloudName" placeholder="pet-shelter-cloud" {...register("cloudinaryCloudName")} className="text-sm font-mono" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Donation & QR Codes */}
        {activeTab === "donation" && (
          <DonationQrSettings form={form} canEdit={canEditQr} />
        )}

        {/* Form Footer / Save Actions */}
        <div className="border-t border-border pt-5 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetToDefaultSettings}
            className="text-xs text-muted-foreground"
          >
            <RotateCcw className="size-3.5 mr-1" /> Reset Defaults
          </Button>

          <Button type="submit" disabled={isSubmitting} size="sm" className="text-xs font-semibold uppercase tracking-wider px-6 py-2">
            <Save className="size-3.5 mr-1.5" />
            {isSubmitting ? "Saving..." : "Save All Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
