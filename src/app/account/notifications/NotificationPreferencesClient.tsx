"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getNotificationPreferencesAction,
  updateNotificationPreferencesAction,
} from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Camera, CheckCircle2, Loader2, Mail } from "lucide-react";

interface Preferences {
  photoUpdates: boolean;
  newsletter: boolean;
}

interface ToggleRowProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  /** False when this link may only switch notifications off. */
  canEnable: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({
  id,
  icon,
  title,
  description,
  checked,
  disabled,
  canEnable,
  onChange,
}: ToggleRowProps) {
  // An unsubscribe link may only turn things off, so re-enabling is not offered
  // rather than offered and then rejected by the server.
  const locked = !canEnable && !checked;
  return (
    <div className="flex items-start gap-4 border border-border bg-background p-4">
      <span className="mt-0.5 text-muted-foreground shrink-0" aria-hidden="true">
        {icon}
      </span>

      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold text-foreground cursor-pointer">
          {title}
        </label>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>

      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled || locked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-5 shrink-0 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export function NotificationPreferencesClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  // When arriving from a one-click link, the requested list is pre-highlighted
  // but nothing is switched off until the donor confirms.
  const requestedUnsubscribe = searchParams.get("unsubscribe");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [canEnable, setCanEnable] = useState(true);
  const [preferences, setPreferences] = useState<Preferences | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        setError(
          "This page needs the personalised link from one of our emails. Please open it from the footer of a recent message."
        );
        setLoading(false);
        return;
      }

      const result = await getNotificationPreferencesAction(token);
      if (cancelled) return;

      if (!result.success || !result.preferences) {
        setError(result.error || "We could not load your preferences.");
      } else {
        setMaskedEmail(result.maskedEmail || "");
        setCanEnable(result.canEnable !== false);
        setPreferences(result.preferences);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const persist = useCallback(
    async (patch: Partial<Preferences>) => {
      if (!token) return;

      setSaving(true);
      setError(null);

      const result = await updateNotificationPreferencesAction(token, patch);

      if (!result.success || !result.preferences) {
        setError(result.error || "We could not save that change.");
      } else {
        setPreferences(result.preferences);
        setSavedAt(Date.now());
      }
      setSaving(false);
    },
    [token]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground py-12">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading your preferences…
      </div>
    );
  }

  if (error && !preferences) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
            We couldn&apos;t open your preferences
          </CardTitle>
          <CardDescription className="leading-relaxed">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/">
            <Button variant="outline">Return to Hope for Strays</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (!preferences) return null;

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg">Email preferences</CardTitle>
        <CardDescription className="leading-relaxed">
          Choose what {maskedEmail || "your address"} hears from us about. Changes save
          immediately — you never need a password or an account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {requestedUnsubscribe && (
          <p
            className="border border-border bg-muted px-4 py-3 text-xs text-muted-foreground leading-relaxed"
            role="status"
          >
            You followed an unsubscribe link. Nothing has been changed yet — switch off
            whichever updates you no longer want below.
            {!canEnable && (
              <>
                {" "}
                This link can only turn updates off; to switch any back on, use the
                &ldquo;Manage email preferences&rdquo; link in a recent email.
              </>
            )}
          </p>
        )}

        <ToggleRow
          id="pref-photo-updates"
          icon={<Camera className="size-5" />}
          title="Photo updates for pets I sponsor"
          description="Occasional pictures of the animals your sponsorship supports, sent by their caregivers."
          checked={preferences.photoUpdates}
          disabled={saving}
          canEnable={canEnable}
          onChange={(next) => persist({ photoUpdates: next })}
        />

        <ToggleRow
          id="pref-newsletter"
          icon={<Mail className="size-5" />}
          title="Newsletter & general announcements"
          description="Shelter news, adoption drives, and volunteering appeals. A few times a year."
          checked={preferences.newsletter}
          disabled={saving}
          canEnable={canEnable}
          onChange={(next) => persist({ newsletter: next })}
        />

        <div className="flex items-center gap-2 min-h-6 pt-1" aria-live="polite">
          {saving && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Saving…
            </span>
          )}
          {!saving && error && (
            <span className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="size-3.5" aria-hidden="true" />
              {error}
            </span>
          )}
          {!saving && !error && savedAt && (
            <span className="flex items-center gap-2 text-xs text-success-accent">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Preferences saved.
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border">
          Donation acknowledgements, adoption application updates and other messages you
          specifically asked for are not affected by these settings.
        </p>
      </CardContent>
    </Card>
  );
}
