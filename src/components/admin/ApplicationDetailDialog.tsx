"use client";

import React, { useState } from "react";
import { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  MapPin,
  Home,
  User,
  Calendar,
  Send,
  Loader2,
  Copy,
  Check,
  MessageCircle,
} from "lucide-react";
import { scheduleApplicationInterview } from "@/actions/applications";
import { CANONICAL_ROLES, PERMISSIONS, ROLE_LABELS, roleHasPermission } from "@/lib/security/permissions";
import {
  APPLICATION_STATUS_SEQUENCE,
  getApplicationStatusPresentation,
} from "@/lib/presentation/applicationStatusPresentation";

// Who a reader should ask, read from the permission matrix rather than named here, so the
// notice follows the matrix the actions enforce. "Super Admin or Volunteer Coordinator" today.
const REVIEWER_ROLES = new Intl.ListFormat("en", { type: "disjunction" }).format(
  CANONICAL_ROLES.filter((role) => roleHasPermission(role, PERMISSIONS.REVIEW_APPLICATIONS)).map(
    (role) => ROLE_LABELS[role]
  )
);

interface ApplicationDetailDialogProps {
  application: AdoptionApplicationRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves with the server's answer, which the dialog waits for before it reports. */
  onUpdateStatus: (
    id: string,
    status: ApplicationStatus,
    notes: string,
    notifyApplicant?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  /** Shows on the board what a successful schedule wrote; it writes nothing itself. */
  onInterviewScheduled: (
    id: string,
    written: { status: ApplicationStatus; adminReviewNotes: string }
  ) => void;
  /**
   * REVIEW_APPLICATIONS. Without it the decision and scheduling tabs are not
   * offered: both actions refuse a member who may only read applications.
   */
  canReview: boolean;
}

export function ApplicationDetailDialog({
  application,
  open,
  onOpenChange,
  onUpdateStatus,
  onInterviewScheduled,
  canReview,
}: ApplicationDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<"review" | "interview">("review");
  const [status, setStatus] = useState<ApplicationStatus>("SUBMITTED");
  const [notes, setNotes] = useState("");
  const [notifyApplicant, setNotifyApplicant] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Interview Scheduling State
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("14:00");
  const [meetingType, setMeetingType] = useState<"in_person" | "video_call">("in_person");
  const [location, setLocation] = useState(
    "Hope for Strays Shelter, No. 18 Jalan SS 2/72, Petaling Jaya"
  );
  const [interviewNotes, setInterviewNotes] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [saving, setSaving] = useState(false);

  const [prevKey, setPrevKey] = useState<string | null>(null);
  const currentKey =
    application && open ? `${application.id}-${application.status}-${open}` : null;

  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    if (application) {
      setStatus(application.status);
      setNotes(application.adminReviewNotes || "");
      setErrorMessage(null);
      setSuccessMessage(null);
      setActiveTab("review");

      // Default next interview date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setInterviewDate(tomorrow.toISOString().split("T")[0]);
    }
  }

  if (!application) return null;

  const trackingUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/applications/track?ref=${encodeURIComponent(
          application.id
        )}&email=${encodeURIComponent(application.email)}`
      : `/applications/track?ref=${application.id}&email=${application.email}`;

  const handleCopyTrackingLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(trackingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  const cleanPhone = (application.phone || "").replace(/[^0-9]/g, "");
  const waPhone = cleanPhone.startsWith("0") ? `60${cleanPhone.slice(1)}` : cleanPhone;
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(
    `Hi ${application.applicantName}, this is Hope for Strays regarding your adoption application for ${application.petName} (Ref: ${application.id}). You can track your status live at: ${trackingUrl}`
  )}`;

  const handleSave = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      const result = await onUpdateStatus(application.id, status, notes, notifyApplicant);
      if (!result.success) {
        setErrorMessage(result.error || "Failed to update status.");
        return;
      }
    } finally {
      setSaving(false);
    }
    setSuccessMessage("Application review saved successfully!");
    setTimeout(() => {
      onOpenChange(false);
    }, 600);
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!interviewDate || !interviewTime || !location.trim()) {
      setErrorMessage("Please complete all required date, time, and location fields.");
      return;
    }

    setScheduling(true);
    try {
      const res = await scheduleApplicationInterview({
        applicationId: application.id,
        interviewDate,
        interviewTime,
        meetingType,
        location,
        coordinatorNotes: interviewNotes,
        notifyApplicant,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to schedule interview.");
      } else {
        setSuccessMessage(
          notifyApplicant
            ? "Meet & Greet scheduled! Confirmation email dispatched."
            : "Meet & Greet scheduled. No email was sent."
        );
        setStatus(res.status);
        // The server has already written the status and the meeting's notes; the board
        // only shows them. A status save here would be a second write.
        onInterviewScheduled(application.id, {
          status: res.status,
          adminReviewNotes: res.adminReviewNotes,
        });
        setTimeout(() => {
          onOpenChange(false);
        }, 800);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error scheduling interview");
    } finally {
      setScheduling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-6 sm:p-8 bg-card border-border">
        <DialogHeader className="mb-4 pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <DialogTitle className="font-heading text-2xl font-bold">
                Application for {application.petName}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Submitted on {application.createdAt} by {application.applicantName} (Ref:{" "}
                <code className="font-mono text-foreground font-semibold">{application.id}</code>)
              </DialogDescription>
            </div>

            {/* Quick Actions Header: Copy Link & WhatsApp */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyTrackingLink}
                className="text-xs font-semibold gap-1.5 h-8 px-2.5"
                title="Copy public tracking link for applicant"
              >
                {copiedLink ? (
                  <>
                    <Check className="size-3.5 text-success-accent" /> Copied Link
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> Copy Tracking Link
                  </>
                )}
              </Button>

              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-success-solid hover:bg-success-solid text-white text-xs font-semibold px-2.5 h-8 rounded-md transition shadow-xs"
              >
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            </div>
          </div>
        </DialogHeader>

        {errorMessage && (
          <div className="bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive flex items-center gap-2 rounded-md">
            <XCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="tone-soft tone-success border p-3 text-xs flex items-center gap-2 rounded-md">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* 1. Applicant Contact Info */}
          <div className="border border-border bg-background p-4 space-y-2.5 rounded-lg shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <User className="size-3.5" /> Applicant Profile
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Name: </span>
                <span>{application.applicantName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="size-3 text-foreground" />
                <a href={`tel:${application.phone}`} className="text-foreground hover:underline font-mono">
                  {application.phone}
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="size-3 text-foreground" />
                <a href={`mailto:${application.email}`} className="text-foreground hover:underline">
                  {application.email}
                </a>
              </div>
              <div className="flex items-start gap-1.5">
                <MapPin className="size-3 text-foreground shrink-0 mt-0.5" />
                <span>{application.address}</span>
              </div>
            </div>
          </div>

          {/* 2. Living Situation & Experience */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-border bg-background p-4 space-y-2 text-xs rounded-lg shadow-sm">
              <h3 className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Home className="size-3.5" /> Residence
              </h3>
              <p><strong className="text-foreground">Housing:</strong> {application.housingType.replace(/_/g, " ")}</p>
              <p><strong className="text-foreground">Fenced Gate/Yard:</strong> {application.hasFencedYard}</p>
            </div>

            <div className="border border-border bg-background p-4 space-y-2 text-xs rounded-lg shadow-sm">
              <h3 className="font-bold uppercase tracking-wider text-foreground">
                Pet Experience
              </h3>
              <p><strong className="text-foreground">Experience:</strong> {application.householdExperience}</p>
              <p><strong className="text-foreground">Current Pets:</strong> {application.currentPets}</p>
              {application.currentPetDetails && (
                <p className="text-muted-foreground italic">&ldquo;{application.currentPetDetails}&rdquo;</p>
              )}
            </div>
          </div>

          {/* Applicant Statement */}
          {application.applicantNotes && (
            <div className="bg-muted/30 border border-border p-4 text-xs space-y-1 rounded-lg">
              <span className="font-bold uppercase tracking-wider text-foreground">Applicant Statement:</span>
              <p className="text-muted-foreground leading-relaxed italic">
                &ldquo;{application.applicantNotes}&rdquo;
              </p>
            </div>
          )}

          {!canReview && (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                You can read this application. Recording a decision or scheduling a meet and
                greet needs the {REVIEWER_ROLES} role.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs shrink-0"
              >
                Close
              </Button>
            </div>
          )}

          {/* Tab Navigation */}
          {canReview && (
          <div className="border-b border-border flex gap-4 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab("review")}
              className={`pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === "review"
                  ? "border-primary text-primary-ink"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Review & Decision
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("interview")}
              className={`pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === "interview"
                  ? "border-primary text-primary-ink"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="size-3.5" />
              Schedule Meet & Greet
            </button>
          </div>
          )}

          {/* Tab 1: Review & Decision */}
          {canReview && activeTab === "review" && (
            <div className="space-y-4">
              
              {/* Quick 1-Click Status Selection Pills */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Application Status</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {APPLICATION_STATUS_SEQUENCE.map((option) => {
                    const presentation = getApplicationStatusPresentation(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setStatus(option)}
                        aria-pressed={status === option}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                          status === option
                            ? presentation.pillClass
                            : "bg-background border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {presentation.actionLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="app-notes" className="text-xs font-semibold">Coordinator Review Remarks</Label>
                <Textarea
                  id="app-notes"
                  rows={3}
                  placeholder="Log housing verification notes, applicant feedback, or remarks sent in the email update..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>

              {/* Email dispatch toggle */}
              <div className="flex items-center gap-2 p-3 bg-muted/40 border border-border rounded-md text-xs">
                <input
                  id="notify-applicant"
                  type="checkbox"
                  checked={notifyApplicant}
                  onChange={(e) => setNotifyApplicant(e.target.checked)}
                  className="size-4 rounded border-input text-primary-ink focus:ring-primary"
                />
                <Label htmlFor="notify-applicant" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                  <Mail className="size-3.5 text-muted-foreground" />
                  Dispatch automated status update email with live tracking link to <strong>{application.email}</strong>
                </Label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs font-semibold uppercase tracking-wider px-6"
                >
                  {saving ? "Saving..." : "Save Decision"}
                </Button>
              </div>
            </div>
          )}

          {/* Tab 2: Schedule Meet & Greet */}
          {canReview && activeTab === "interview" && (
            <form onSubmit={handleScheduleInterview} className="space-y-4">
              <div className="p-3 tone-soft tone-info border rounded-lg text-xs">
                Scheduling a Meet & Greet moves a submitted application to <strong>Under Review</strong> (any other status stays as it is) and adds the session to the applicant&apos;s live tracking dashboard. The invitation email goes out only if the box below is ticked.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="interviewDate" className="text-xs font-semibold">Appointment Date *</Label>
                  <Input
                    id="interviewDate"
                    type="date"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="interviewTime" className="text-xs font-semibold">Time Slot *</Label>
                  <Input
                    id="interviewTime"
                    type="time"
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="meetingType" className="text-xs font-semibold">Interaction Format *</Label>
                  <select
                    id="meetingType"
                    value={meetingType}
                    onChange={(e) => setMeetingType(e.target.value as "in_person" | "video_call")}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-semibold text-foreground"
                  >
                    <option value="in_person">In-Person Shelter Visit (Petaling Jaya)</option>
                    <option value="video_call">Virtual Video Call (Google Meet / Zoom)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="location" className="text-xs font-semibold">Sanctuary Address or Video Link *</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Hope for Strays Sanctuary or https://meet.google.com/..."
                    required
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="interviewNotes" className="text-xs font-semibold">Coordinator Instructions (Visible to Applicant)</Label>
                <Textarea
                  id="interviewNotes"
                  rows={2}
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                  placeholder="e.g. Please bring existing dog for outdoor socialization, arrive 10 minutes early..."
                  className="text-xs leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-muted/40 border border-border rounded-md text-xs">
                <input
                  id="notify-interview"
                  type="checkbox"
                  checked={notifyApplicant}
                  onChange={(e) => setNotifyApplicant(e.target.checked)}
                  className="size-4 rounded border-input text-primary-ink focus:ring-primary"
                />
                <Label htmlFor="notify-interview" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                  <Send className="size-3.5 text-muted-foreground" />
                  Dispatch calendar invitation email with location details to <strong>{application.email}</strong>
                </Label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={scheduling}
                  size="sm"
                  className="text-xs font-semibold uppercase tracking-wider px-6 gap-1.5"
                >
                  {scheduling ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Scheduling...
                    </>
                  ) : (
                    <>
                      <Calendar className="size-3.5" /> Confirm Meet & Greet
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
