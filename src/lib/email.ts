import { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";
import { DonationReceipt } from "@/types/sponsorship";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { APP_BASE_URL as SHARED_APP_BASE_URL, appUrl } from "@/lib/appUrl";
import {
  DESIGN_TONES,
  DesignTone,
  EMAIL_BRAND,
  EMAIL_TONE,
  EMAIL_RECEIPT,
} from "@/lib/presentation/emailTokens";
import { getApplicationStatusPresentation } from "@/lib/presentation/applicationStatusPresentation";
import { escapeHtml } from "@/lib/presentation/escapeHtml";
import { isTaxClaimable, SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";

export interface EmailResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export interface InterviewDetails {
  interviewDate: string;
  interviewTime: string;
  location: string;
  meetingType: "in_person" | "video_call";
  coordinatorNotes?: string;
  coordinatorName?: string;
}

const SHELTER_NAME = "Hope for Strays Animal Shelter";
const SHELTER_EMAIL = process.env.SHELTER_NOTIFICATION_EMAIL || "applications@hopeforstrays.org";
const FROM_EMAIL = process.env.EMAIL_FROM || "Hope for Strays <onboarding@resend.dev>";
const SHELTER_ADDRESS = "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia";
const SHELTER_PHONE = SHELTER_PHONE_DISPLAY;
const APP_BASE_URL = SHARED_APP_BASE_URL;

function getTrackingUrl(appId: string, email: string): string {
  return `${APP_BASE_URL}/applications/track?ref=${encodeURIComponent(appId)}&email=${encodeURIComponent(email)}`;
}

/**
 * Deliverability-Optimized Transactional Email Dispatcher.
 */
async function sendRawEmail({
  to,
  subject,
  html,
  text,
  template,
  entityId,
  entity,
  replyTo,
  extraHeaders,
  category = "transactional",
}: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  template: string;
  entityId?: string;
  /**
   * Audit-log target entity: the record this email is about. Required, because the audit viewer
   * sorts by it and a default filed every donation receipt under adoption applications.
   */
  entity: string;
  replyTo?: string;
  extraHeaders?: Record<string, string>;
  category?: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const recipientList = Array.isArray(to) ? to : [to];
  const primaryRecipient = recipientList[0] || "unknown";
  const effectiveReplyTo = replyTo || SHELTER_EMAIL;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "test") {
      console.log(`[Email Simulation] Template: [${template}] | To: ${recipientList.join(", ")} | Subject: "${subject}"`);
    }

    const messageId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    recordAuditLog({
      actorId: "system_mailer",
      actorEmail: "mailer@hopeforstrays.org",
      actorRole: "SYSTEM",
      action: "EMAIL_SENT",
      entity,
      entityId: entityId || "system",
      details: {
        template,
        recipient: primaryRecipient,
        subject,
        messageId,
        simulated: true,
      },
    });

    return {
      success: true,
      simulated: true,
      messageId,
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipientList,
        reply_to: effectiveReplyTo,
        subject,
        html,
        text,
        headers: {
          "X-Entity-Ref-ID": entityId || "system",
          "X-Auto-Response-Suppress": "OOF, AutoReply",
          ...(extraHeaders || {}),
        },
        tags: [
          { name: "category", value: category },
          { name: "template", value: template.toLowerCase() },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Email Dispatch Error]", res.status, errText);

      recordAuditLog({
        actorId: "system_mailer",
        actorEmail: "mailer@hopeforstrays.org",
        actorRole: "SYSTEM",
        action: "EMAIL_FAILED",
        entity,
        entityId: entityId || "system",
        details: {
          template,
          recipient: primaryRecipient,
          subject,
          error: `HTTP ${res.status}: ${errText}`,
        },
      });

      return { success: false, error: `HTTP ${res.status}: ${errText}` };
    }

    const data = await res.json();

    recordAuditLog({
      actorId: "system_mailer",
      actorEmail: "mailer@hopeforstrays.org",
      actorRole: "SYSTEM",
      action: "EMAIL_SENT",
      entity,
      entityId: entityId || "system",
      details: {
        template,
        recipient: primaryRecipient,
        subject,
        messageId: data.id,
        simulated: false,
      },
    });

    return { success: true, messageId: data.id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown email dispatch failure";
    console.error("[Email Network Error]", errorMsg);

    recordAuditLog({
      actorId: "system_mailer",
      actorEmail: "mailer@hopeforstrays.org",
      actorRole: "SYSTEM",
      action: "EMAIL_FAILED",
      entity,
      entityId: entityId || "system",
      details: {
        template,
        recipient: primaryRecipient,
        subject,
        error: errorMsg,
      },
    });

    return { success: false, error: errorMsg };
  }
}

/**
 * One badge rule and one card rule per tone, generated from the hex mirror.
 *
 * Generated rather than hand-written, because the property that matters is *completeness*.
 * The email previously carried four badge classes named after application statuses
 * (`badge-approved`, `badge-review`, …) while the app has seven tones, so `care`, `neutral`
 * and `highlight` had no email representation at all: a notification about an animal under
 * veterinary care fell back to the default sky badge — the colour the app reserves for
 * "informational". A loop means a new tone reaches the inbox in the colour it has on screen
 * without anyone remembering to come back here and add a rule.
 *
 * The class name is the tone name, so `designToneFor` below can compose it from the tone the
 * app already publishes rather than from a second status → colour table.
 */
const TONE_RULES = DESIGN_TONES.map(
  (tone) =>
    `    .badge-${tone} { background: ${EMAIL_TONE[tone].surface}; color: ${EMAIL_TONE[tone].text}; }\n` +
    `    .card-${tone} { background: ${EMAIL_TONE[tone].surface}; border-left-color: ${EMAIL_TONE[tone].accent}; }`
).join("\n");

/**
 * The design-system tone an application status is shown in — the same one the app uses.
 *
 * Read out of `applicationStatusPresentation`, which already owns status → tone for every
 * admin surface, instead of being restated here. A second copy is the defect this whole
 * change exists to remove: an approved application was emerald in the admin table and
 * green-700 in the inbox, and nothing detected the two drifting apart.
 *
 * `toneClass` is `tone-<tone>` by the design system's own definition — `globals.css` declares
 * exactly one `.tone-*` selector per tone, and `designSystemGuards` enforces it — so the tone
 * name is recoverable from it. The fallback mirrors the presentation module's own (an
 * unrecognised status is informational): a status email is not worth failing a dispatch over,
 * and the guard asserts that no real status reaches it.
 */
function designToneFor(status: ApplicationStatus): DesignTone {
  const tone = getApplicationStatusPresentation(status).toneClass.replace(/^tone-/, "");
  return (DESIGN_TONES as readonly string[]).includes(tone) ? (tone as DesignTone) : "info";
}

/**
 * Common Accessible, Lightweight HTML Wrapper (under 15KB)
 */
function wrapEmailHtml(content: string, footerExtra = ""): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: ${EMAIL_BRAND.foreground}; margin: 0; padding: 24px; background-color: ${EMAIL_BRAND.background}; }
    .container { max-width: 600px; margin: 0 auto; background: ${EMAIL_BRAND.card}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { background: ${EMAIL_BRAND.primary}; color: ${EMAIL_BRAND.primaryForeground}; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 28px; }
    .badge { display: inline-block; background: ${EMAIL_TONE.info.surface}; color: ${EMAIL_TONE.info.text}; padding: 4px 10px; border-radius: 4px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
    .card { background: ${EMAIL_BRAND.muted}; border-left: 4px solid ${EMAIL_TONE.info.accent}; padding: 16px; margin: 20px 0; border-radius: 0 6px 6px 0; }
${TONE_RULES}
    .steps { margin: 20px 0; padding-left: 20px; }
    .steps li { margin-bottom: 10px; }
    .btn-track { display: inline-block; background: ${EMAIL_BRAND.primary}; color: ${EMAIL_BRAND.primaryForeground} !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; margin: 16px 0; text-align: center; }
    .footer { background: ${EMAIL_BRAND.muted}; padding: 20px; text-align: center; font-size: 12px; color: ${EMAIL_BRAND.mutedForeground}; border-top: 1px solid ${EMAIL_BRAND.border}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${SHELTER_NAME}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      ${SHELTER_NAME} &bull; ${SHELTER_ADDRESS}<br/>
      Phone: ${SHELTER_PHONE} &bull; Hours: Tuesday – Sunday: 10:00 AM – 5:00 PM
      ${footerExtra}
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * 1. Sends confirmation email to the public adopter upon submitting an adoption application.
 */
export async function sendApplicationConfirmationEmail(
  app: AdoptionApplicationRecord
): Promise<EmailResult> {
  const subject = `Application Received: Adoption Inquiry for ${app.petName} - ${SHELTER_NAME}`;
  const trackingUrl = getTrackingUrl(app.id, app.email);

  const text = `
Dear ${app.applicantName},

Thank you for your interest in adopting ${app.petName} from ${SHELTER_NAME}!

We have received your application (Ref: ${app.id}). Our adoption coordinators review every submission carefully to ensure the best possible match for both animals and families.

Summary of Submission:
- Pet: ${app.petName}
- Applicant: ${app.applicantName} (${app.email} / ${app.phone})
- Housing: ${app.housingType.replace(/_/g, " ")} (Fenced yard: ${app.hasFencedYard})
- Current Pets: ${app.currentPets}

Track Your Application Live:
${trackingUrl}

Next Steps:
1. Application Review: Our team reviews applications within 1-2 business days.
2. Shelter Visit / Interaction: We will contact you at ${app.phone} or ${app.email} to schedule a meet-and-greet in our Petaling Jaya facility.
3. Adoption Completion: Once approved, you will complete the 100% free adoption formalities and receive vaccination records and microchip details.

If you have questions, please reach out to us by replying to this email or calling ${SHELTER_PHONE}.

Warm regards,
The Adoption Team
${SHELTER_NAME}
${SHELTER_ADDRESS}
  `.trim();

  const html = wrapEmailHtml(`
    <span class="badge">Application Ref: ${app.id}</span>
    <h2 style="margin-top:0;">Thank you, ${escapeHtml(app.applicantName)}!</h2>
    <p>We have successfully received your adoption application for <strong>${escapeHtml(app.petName)}</strong>.</p>
    
    <div class="card">
      <strong>Summary of Submission:</strong><br/>
      Pet: ${escapeHtml(app.petName)}<br/>
      Applicant: ${escapeHtml(app.applicantName)} (${escapeHtml(app.email)} / ${escapeHtml(app.phone)})<br/>
      Housing: ${escapeHtml(app.housingType.replace(/_/g, " "))} (Fenced yard: ${escapeHtml(app.hasFencedYard)})<br/>
      Current Pets: ${escapeHtml(app.currentPets)}
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${trackingUrl}" class="btn-track">🔍 Track Your Application Live &rarr;</a>
    </div>

    <h3 style="margin-bottom: 8px;">What Happens Next?</h3>
    <ol class="steps">
      <li><strong>Review:</strong> Our coordinator team is evaluating your application (typically 1–2 business days).</li>
      <li><strong>Meet & Greet:</strong> We will contact you to arrange an interaction at our Petaling Jaya sanctuary.</li>
      <li><strong>Adoption Finalization:</strong> Finalize paperwork, receive full medical clearance records, and bring your new companion home (100% Free Adoption).</li>
    </ol>

    <p style="font-size: 14px; color: ${EMAIL_BRAND.mutedForeground};">Have questions in the meantime? Reply directly to this email or call us at <strong>${SHELTER_PHONE}</strong>.</p>
  `);

  return sendRawEmail({
    to: app.email,
    subject,
    text,
    html,
    template: "APPLICATION_CONFIRMATION",
    entity: "AdoptionApplication",
    entityId: app.id,
  });
}

/**
 * 2. Sends an alert notification to shelter staff coordinators when a new application is submitted.
 */
export async function sendStaffApplicationAlert(
  app: AdoptionApplicationRecord
): Promise<EmailResult> {
  const subject = `[New Application] ${app.applicantName} applied for ${app.petName} (${app.id})`;

  // The only two values in this alert that are resolved rather than passed straight through. Both
  // halves below read them from here; neither re-derives a fallback of its own. Writing `|| "None"`
  // twice by hand is precisely how the HTML half came to omit the applicant's own notes while the
  // plain text carried them — see docs/archives/tasks/URGENT_RECEIPT_EMAIL_CORRECTNESS.md. The HTML escapes
  // at the point of use: `notes` is free text straight off a public form.
  const fields = {
    petId: app.petId || "N/A",
    notes: app.applicantNotes || "None",
  };

  const text = `
New Adoption Application Submitted
-----------------------------------
Application ID: ${app.id}
Pet: ${app.petName} (ID: ${fields.petId})
Applicant: ${app.applicantName}
Email: ${app.email}
Phone: ${app.phone}
Address: ${app.address}
Housing: ${app.housingType} (Fenced yard: ${app.hasFencedYard})
Current Pets: ${app.currentPets}
Experience: ${app.householdExperience}
Notes: ${fields.notes}

Review in Admin Dashboard:
https://hopeforstrays.org/admin/applications
  `.trim();

  const html = wrapEmailHtml(`
    <h2 style="margin-top:0; font-size: 18px; color: ${EMAIL_BRAND.primary};">🐾 New Adoption Application Submitted</h2>
    <p>A new adoption application has been submitted for <strong>${escapeHtml(app.petName)}</strong>.</p>
    <div class="card">
      <strong>Application Reference:</strong> ${app.id}<br/>
      <strong>Target Pet:</strong> ${escapeHtml(app.petName)} (ID: ${escapeHtml(fields.petId)})<br/>
      <strong>Applicant:</strong> ${escapeHtml(app.applicantName)}<br/>
      <strong>Email:</strong> ${escapeHtml(app.email)}<br/>
      <strong>Phone:</strong> ${escapeHtml(app.phone)}<br/>
      <strong>Address:</strong> ${escapeHtml(app.address)}<br/>
      <strong>Housing:</strong> ${escapeHtml(app.housingType)} (Fenced: ${escapeHtml(app.hasFencedYard)})<br/>
      <strong>Experience:</strong> ${escapeHtml(app.householdExperience)}<br/>
      <strong>Current Pets:</strong> ${escapeHtml(app.currentPets)}<br/>
      <strong>Notes:</strong> ${escapeHtml(fields.notes)}
    </div>
    <p><a href="https://hopeforstrays.org/admin/applications" style="display:inline-block;background:${EMAIL_BRAND.primary};color:${EMAIL_BRAND.primaryForeground};padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:600;">Open Coordinator Dashboard</a></p>
  `);

  return sendRawEmail({
    to: SHELTER_EMAIL,
    replyTo: app.email,
    subject,
    text,
    html,
    template: "STAFF_ALERT",
    entity: "AdoptionApplication",
    entityId: app.id,
  });
}

/**
 * 3. Sends status update email to the applicant (Approved, Under Review, or Rejected).
 */
export async function sendApplicationStatusUpdateEmail(
  app: AdoptionApplicationRecord,
  newStatus: ApplicationStatus,
  notes?: string
): Promise<EmailResult> {
  const petName = app.petName;
  const trackingUrl = getTrackingUrl(app.id, app.email);
  let subject = "";
  let statusTitle = "";
  let messageBody = "";

  // The status badge is coloured by the app's own status → tone mapping, so the inbox cannot
  // disagree with the admin table about what an approved application looks like. Every tone
  // has a badge rule, so this cannot fall back to the informational sky it used to.
  const badgeClass = `badge badge-${designToneFor(newStatus)}`;

  if (newStatus === "APPROVED") {
    subject = `🎉 Application Approved! Welcome to the family, ${app.applicantName} (${petName})`;
    statusTitle = `Great News! Your Application for ${petName} is Approved!`;
    messageBody = `
      <div class="card card-success">
        <strong>Congratulations ${escapeHtml(app.applicantName)}!</strong><br/>
        Our adoption coordinator team has reviewed and approved your adoption application for <strong>${escapeHtml(petName)}</strong>!
      </div>
      <h3 style="margin-bottom: 8px;">Next Steps to Welcome ${escapeHtml(petName)} Home:</h3>
      <ol class="steps">
        <li><strong>Adoption Appointment:</strong> Visit our shelter at ${SHELTER_ADDRESS} to meet ${escapeHtml(petName)} and sign the adoption charter.</li>
        <li><strong>Medical Dossier:</strong> We will provide full vaccination passports, deworming history, and microchip registration certificates (100% Free of charge).</li>
        <li><strong>Starter Essentials:</strong> Bring a secure pet carrier (for cats) or leash/collar (for dogs) on adoption day.</li>
      </ol>
      ${notes ? `<p><strong>Coordinator Remarks:</strong><br/><em>${escapeHtml(notes)}</em></p>` : ""}
      <div style="text-align:center;margin:20px 0;">
        <a href="${trackingUrl}" class="btn-track">🔍 View Official Adoption Dossier &rarr;</a>
      </div>
      <p>If you have any questions or would like to confirm your arrival time, reply directly to this email or call us at <strong>${SHELTER_PHONE}</strong>.</p>
    `;
  } else if (newStatus === "UNDER_REVIEW") {
    subject = `Application Update: Review in Progress for ${petName} - ${SHELTER_NAME}`;
    statusTitle = `Your Application for ${petName} is Under Active Review`;
    messageBody = `
      <div class="card card-warning">
        Our adoption coordinators are currently reviewing your application details, housing profile, and compatibility requirements for <strong>${escapeHtml(petName)}</strong>.
      </div>
      <p>A team member may reach out to you via phone (<strong>${escapeHtml(app.phone)}</strong>) or email if additional verification or reference checks are required.</p>
      ${notes ? `<p><strong>Coordinator Notes:</strong><br/><em>${escapeHtml(notes)}</em></p>` : ""}
      <div style="text-align:center;margin:20px 0;">
        <a href="${trackingUrl}" class="btn-track">🔍 Track Application Progress &rarr;</a>
      </div>
      <p>Thank you for your patience as we find loving, lifelong homes for our rescue animals.</p>
    `;
  } else if (newStatus === "REJECTED") {
    subject = `Adoption Application Status Update: ${petName} - ${SHELTER_NAME}`;
    statusTitle = `Application Status Update for ${petName}`;
    messageBody = `
      <p>Dear ${escapeHtml(app.applicantName)},</p>
      <p>Thank you so much for your interest in adopting <strong>${escapeHtml(petName)}</strong> and for taking the time to share your application with us.</p>
      <div class="card">
        <!-- Neutral on purpose: the badge carries the danger tone, but a rejection letter
             does not need a red panel shouting at the applicant as well. -->
        After careful evaluation of ${escapeHtml(petName)}'s specific behavioral needs and current shelter applications, we regret to inform you that we are unable to proceed with this adoption match at this time.
      </div>
      ${notes ? `<p><strong>Shelter Feedback:</strong><br/><em>${escapeHtml(notes)}</em></p>` : ""}
      <p>We receive multiple inquiries for our rescues, and our decisions are made solely with the animal's specific temperament and long-term wellbeing in mind. We warmly encourage you to check back for other wonderful animals who may be an ideal match for your home.</p>
    `;
  } else {
    subject = `Application Status Update: ${petName} (${newStatus})`;
    statusTitle = `Application Status: ${newStatus}`;
    messageBody = `<p>Your application status has been updated to <strong>${newStatus}</strong>.</p>`;
  }

  const plainText = `
Dear ${app.applicantName},

Status Update for ${petName} (Application Ref: ${app.id}):
Status: ${newStatus}

Track Application Online:
${trackingUrl}

${notes ? `Coordinator Notes:\n${notes}\n` : ""}

Shelter Contact:
${SHELTER_NAME}
${SHELTER_ADDRESS}
Phone: ${SHELTER_PHONE}
  `.trim();

  const html = wrapEmailHtml(`
    <span class="${badgeClass}">Status: ${newStatus.replace(/_/g, " ")}</span>
    <h2 style="margin-top:0;">${statusTitle}</h2>
    ${messageBody}
  `);

  return sendRawEmail({
    to: app.email,
    subject,
    text: plainText,
    html,
    template: `STATUS_UPDATE_${newStatus}`,
    entity: "AdoptionApplication",
    entityId: app.id,
  });
}

/**
 * 4. Sends Meet & Greet / Interview scheduling invitation to the applicant.
 */
export async function sendInterviewInvitationEmail(
  app: AdoptionApplicationRecord,
  details: InterviewDetails
): Promise<EmailResult> {
  const subject = `📅 Meet & Greet Invitation for ${app.petName} - ${SHELTER_NAME}`;
  const meetingTypeLabel = details.meetingType === "video_call" ? "Virtual Video Call" : "In-Person Shelter Visit";
  const trackingUrl = getTrackingUrl(app.id, app.email);

  const plainText = `
Dear ${app.applicantName},

Great news! We would love to invite you for a Meet & Greet session with ${app.petName}!

Session Details:
- Date: ${details.interviewDate}
- Time: ${details.interviewTime}
- Format: ${meetingTypeLabel}
- Location / Link: ${details.location}
${details.coordinatorName ? `- Coordinator: ${details.coordinatorName}` : ""}
${details.coordinatorNotes ? `\nSpecial Instructions:\n${details.coordinatorNotes}` : ""}

Track & View Appointment Online:
${trackingUrl}

What to Bring / Prepare:
1. Identification (IC / Passport copy).
2. All household members who will be living with ${app.petName} are encouraged to attend.
3. If you have existing dogs, let us know in advance so we can prepare a safe temperament introduction.

If you need to reschedule or have questions, please call us at ${SHELTER_PHONE} or reply to this email.

Warm regards,
The Adoption Team
${SHELTER_NAME}
  `.trim();

  const html = wrapEmailHtml(`
    <span class="badge badge-info">Meet &amp; Greet Scheduled</span>
    <h2 style="margin-top:0;">You're Invited to Meet ${escapeHtml(app.petName)}! 🐾</h2>
    <p>Dear ${escapeHtml(app.applicantName)},</p>
    <p>We are delighted to invite you for an interaction session with <strong>${escapeHtml(app.petName)}</strong>.</p>
    
    <div class="card card-info">
      <strong>Session Schedule:</strong><br/>
      📅 <strong>Date:</strong> ${details.interviewDate}<br/>
      ⏰ <strong>Time:</strong> ${details.interviewTime}<br/>
      📍 <strong>Format:</strong> ${meetingTypeLabel}<br/>
      🏠 <strong>Location:</strong> ${escapeHtml(details.location)}<br/>
      ${details.coordinatorName ? `👤 <strong>Coordinator:</strong> ${escapeHtml(details.coordinatorName)}<br/>` : ""}
    </div>

    ${details.coordinatorNotes ? `
      <div style="background:${EMAIL_BRAND.muted};border:1px solid ${EMAIL_BRAND.border};padding:12px;border-radius:6px;margin:16px 0;font-size:13px;">
        <strong>Coordinator Instructions:</strong><br/>
        <em>${escapeHtml(details.coordinatorNotes)}</em>
      </div>
    ` : ""}

    <div style="text-align:center;margin:20px 0;">
      <a href="${trackingUrl}" class="btn-track">📅 View Appointment & Location on Maps &rarr;</a>
    </div>

    <h3 style="margin-bottom: 8px;">What to Bring / Prepare:</h3>
    <ul class="steps">
      <li><strong>Identification:</strong> A copy of your IC or Passport.</li>
      <li><strong>Household Members:</strong> We encourage all family / housemates to participate in the interaction.</li>
      <li><strong>Pet Socialization:</strong> If you currently have pets, let us know so our trainers can prepare a guided socialization area.</li>
    </ul>

    <p style="font-size: 14px; color: ${EMAIL_BRAND.mutedForeground};">Need to reschedule or running late? Call us at <strong>${SHELTER_PHONE}</strong> or reply to this email.</p>
  `);

  return sendRawEmail({
    to: app.email,
    subject,
    text: plainText,
    html,
    template: "INTERVIEW_INVITATION",
    entity: "AdoptionApplication",
    entityId: app.id,
  });
}

/** The payment rails a donation can arrive on, read off the receipt that renders them. */
type PaymentMethod = DonationReceipt["paymentMethod"];

/**
 * Payment-rail labels for the statutory Sec 44(6) receipt.
 *
 * Exhaustive by construction. Keyed off `DonationReceipt["paymentMethod"]` — the exact union the
 * templates below render — so a fourth rail added to that type fails the build here rather than
 * silently receipting the donation as something it was not. A card donation was previously
 * receipted as a bank transfer in the HTML half; see
 * docs/archives/tasks/URGENT_RECEIPT_EMAIL_CORRECTNESS.md.
 *
 * `online_banking` deliberately does not name a bank: the receipt carries no bank field, so the
 * old "(Maybank)" in the plain-text half was an unverifiable claim on a tax document.
 */
/** The subset of a sponsorship pledge the welcome mail renders. */
export interface SponsorshipWelcomeInput {
  pledgeRef: string;
  petName: string;
  sponsorName: string;
  sponsorEmail: string;
  tierName: string;
  amountMYR: number;
  frequency: "one_time" | "monthly";
  paymentMethod: PaymentMethod;
  reconciliationNotice: string;
}

const PAYMENT_RAIL_LABELS: Record<PaymentMethod, string> = {
  duitnow_qr: "DuitNow QR (PayNet)",
  online_banking: "Direct Bank Transfer",
  card: "Credit / Debit Card",
};

/**
 * 5. Sends an official receipt whose tax-filing status follows its donor identifier.
 */
export async function sendDonationReceiptEmail(
  receipt: DonationReceipt
): Promise<EmailResult> {
  // Single source of truth for every value both halves of this receipt state. The plain-text and
  // HTML bodies below read from here and never re-derive a value of their own — one field resolved
  // twice, by hand, in two languages is exactly what let the two halves disagree about how the
  // donor paid.
  const fields = {
    frequencyLabel:
      receipt.frequency === "monthly" ? "Monthly Recurring Partner" : "One-Time Contribution",
    amount: `RM ${receipt.amountMYR.toFixed(2)}`,
    paymentRail: PAYMENT_RAIL_LABELS[receipt.paymentMethod],
    donorPhone: receipt.donorPhone ?? "",
    taxIdOrIc: receipt.taxIdOrIc ?? "",
    targetPetName: receipt.targetPetName ?? "",
    notes: receipt.notes ?? "",
    // Whether this document may call itself deductible. Resolved once, here, for the
    // same reason every other field is: the two halves stated the payment rail
    // differently once already, and a receipt that claims relief in the HTML and
    // disclaims it in the plain text would be a worse version of that bug.
    claimable: isTaxClaimable(receipt),
  };

  const subject = `🐾 Official Donation Receipt: ${fields.amount} - ${receipt.receiptNumber} (${SHELTER_NAME})`;

  const plainText = `
${fields.claimable ? "OFFICIAL DONATION RECEIPT & TAX DEDUCTION DOSSIER" : "OFFICIAL DONATION RECEIPT"}
===================================================
${SHELTER_NAME}
${SHELTER_ADDRESS}
Phone: ${SHELTER_PHONE} | Email: ${SHELTER_EMAIL}
Registrar of Societies (PPM): ${receipt.shelterRegistrationNo}
${fields.claimable ? `LHDN Tax Exemption Reference: ${receipt.taxDeductibleRef}` : ""}

Receipt No: ${receipt.receiptNumber}
Date Issued: ${receipt.date}
Contribution Frequency: ${fields.frequencyLabel}

DONOR INFORMATION:
- Issued To: ${receipt.donorName}
- Email: ${receipt.donorEmail}
${fields.donorPhone ? `- Phone: ${fields.donorPhone}\n` : ""}${fields.taxIdOrIc ? `- NRIC / Passport / SSM: ${fields.taxIdOrIc}\n` : ""}
SPONSORSHIP ALLOCATION:
- Allocation: ${receipt.tierName}
${fields.targetPetName ? `- Dedicated Animal: ${fields.targetPetName}\n` : ""}- Payment Rail: ${fields.paymentRail}
${fields.notes ? `- Donor Message: "${fields.notes}"\n` : ""}
TOTAL CONTRIBUTION RECEIVED: ${fields.amount}

${
    fields.claimable
      ? "* Under Subsection 44(6) of the Income Tax Act 1967 (Malaysia), donations to Pertubuhan Kebajikan Hope for Strays are eligible for income tax deductions."
      : "* This receipt carries no NRIC, passport or SSM number, so it cannot be filed against a tax return. Contact the shelter before filing if you need tax documentation."
  }
* This receipt is computer-generated and valid without signature.

Thank you for your life-saving generosity and support of our shelter animals!
  `.trim();

  const html = wrapEmailHtml(`
    <div style="border-bottom: 2px solid ${EMAIL_RECEIPT.ink}; padding-bottom: 16px; margin-bottom: 20px;">
      <span class="badge badge-success">${fields.claimable ? "Official Tax-Exempt e-Receipt" : "Official Donation Receipt"}</span>
      <h2 style="margin: 8px 0 4px 0; font-size: 22px; color: ${EMAIL_RECEIPT.ink};">Thank You for Your Generous Contribution!</h2>
      <p style="margin: 0; font-size: 13px; color: ${EMAIL_RECEIPT.inkMuted};">
        Receipt Reference: <strong style="font-family: monospace; color: ${EMAIL_RECEIPT.ink};">${receipt.receiptNumber}</strong> &bull; Date: ${receipt.date}
      </p>
    </div>

    <p>Dear <strong>${escapeHtml(receipt.donorName)}</strong>,</p>
    <p>We gratefully acknowledge receipt of your gift of <strong style="font-size: 16px; color: ${EMAIL_RECEIPT.ink};">${fields.amount}</strong> (${fields.frequencyLabel}) to <strong>${SHELTER_NAME}</strong>.</p>

    <div class="card" style="background:${EMAIL_RECEIPT.paper}; border-left: 4px solid ${EMAIL_RECEIPT.inkAccent}; padding: 18px; margin: 20px 0;">
      <table style="width:100%; font-size: 13px; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.inkFaint}; width: 40%;"><strong>Issued To:</strong></td>
          <td style="padding: 4px 0; font-weight: 600; color: ${EMAIL_RECEIPT.ink};">${escapeHtml(receipt.donorName)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.inkFaint};"><strong>Email / Contact:</strong></td>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.ink};">${escapeHtml(receipt.donorEmail)} ${fields.donorPhone ? `(${escapeHtml(fields.donorPhone)})` : ""}</td>
        </tr>
        ${fields.taxIdOrIc ? `
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.inkFaint};"><strong>Tax ID / NRIC / SSM:</strong></td>
          <td style="padding: 4px 0; font-family: monospace; font-weight: 600; color: ${EMAIL_RECEIPT.ink};">${escapeHtml(fields.taxIdOrIc)}</td>
        </tr>` : ""}
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.inkFaint};"><strong>Allocation Fund:</strong></td>
          <td style="padding: 4px 0; font-weight: 600; color: ${EMAIL_RECEIPT.ink};">${escapeHtml(receipt.tierName)}</td>
        </tr>
        ${fields.targetPetName ? `
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.inkFaint};"><strong>Dedicated Pet:</strong></td>
          <td style="padding: 4px 0; font-weight: 600; color: ${EMAIL_RECEIPT.inkSoft};">🐾 ${escapeHtml(fields.targetPetName)}</td>
        </tr>` : ""}
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.inkFaint};"><strong>Payment Rail:</strong></td>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.ink};">${fields.paymentRail}</td>
        </tr>
        ${fields.notes ? `
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.inkFaint};"><strong>Donor Message:</strong></td>
          <td style="padding: 4px 0; color: ${EMAIL_RECEIPT.ink}; font-style: italic;">&quot;${escapeHtml(fields.notes)}&quot;</td>
        </tr>` : ""}
        <tr style="border-top: 1px solid ${EMAIL_RECEIPT.rule};">
          <td style="padding: 10px 0 4px 0; font-size: 15px; font-weight: 700; color: ${EMAIL_RECEIPT.ink};"><strong>Total Received:</strong></td>
          <td style="padding: 10px 0 4px 0; font-size: 18px; font-weight: 800; color: ${EMAIL_RECEIPT.inkAccent};">${fields.amount}</td>
        </tr>
      </table>
    </div>

    <div style="background:${EMAIL_RECEIPT.panel}; padding: 14px; border-radius: 6px; font-size: 12px; color: ${EMAIL_RECEIPT.inkSoft}; margin: 20px 0; line-height: 1.5; border: 1px solid ${EMAIL_RECEIPT.rule};">
      <strong>${fields.claimable ? "Malaysian Tax Deduction Information" : "Receipt filing status"}:</strong><br/>
      Official Shelter Registration No: <strong>${receipt.shelterRegistrationNo}</strong><br/>
      ${fields.claimable ? `LHDN Inland Revenue Board Tax Exemption Reference: <strong>${receipt.taxDeductibleRef}</strong><br/>` : ""}
      ${
        fields.claimable
          ? "<em>* This computer-generated receipt is valid for personal or corporate tax filing in Malaysia under Section 44(6) of the Income Tax Act 1967.</em>"
          : "<em>* This receipt carries no NRIC, passport or SSM number, so it cannot be filed against a tax return. Contact the shelter before filing if you need tax documentation.</em>"
      }
    </div>

    <p style="font-size: 14px; color: ${EMAIL_BRAND.mutedForeground};">
      Because of donors like you, 100% of our rescued dogs and cats receive full veterinary clearance, spay/neuter surgery, and free adoption placements.
    </p>

    <p style="font-size: 13px; color: ${EMAIL_BRAND.mutedForeground}; margin-top: 24px;">
      Warm regards,<br/>
      <strong>The Hope for Strays Sanctuary & Caretaker Team</strong><br/>
      ${SHELTER_ADDRESS}
    </p>
  `);

  return sendRawEmail({
    to: receipt.donorEmail,
    subject,
    text: plainText,
    html,
    template: "DONATION_RECEIPT",
    // NOT "DonationReceipt": the audit viewer's receipt list (`receiptLogs` in
    // useAuditLogController), the LHDN CSV fallback (`generateReceiptsCsvString`) and the row
    // highlight all treat that entity as a donation. Filed there, every receipt email would be
    // counted as a second donation and exported as a zero-amount line in a tax file.
    entity: "DonationReceiptEmail",
    entityId: receipt.receiptNumber,
  });
}


/**
 * Welcome mail for a new pet sponsorship.
 *
 * Deliberately not a tax document. The commitment has not been reconciled
 * against the shelter's bank statement, so this acknowledges it, carries the
 * supporter's badge, and states plainly when the official receipt follows.
 * Sending a numbered receipt here would hand someone a filing document for a
 * transfer that may never arrive — see `reconcilePetSponsorshipAction`.
 *
 * Both halves render from one `fields` object, the pattern the receipt mail
 * adopted, so the plain-text and HTML versions cannot state different amounts.
 */
export async function sendSponsorshipWelcomeEmail(
  pledge: SponsorshipWelcomeInput
): Promise<EmailResult> {
  const tone = EMAIL_TONE.care;

  const fields = {
    amount: `RM ${pledge.amountMYR.toFixed(2)}`,
    cadence: pledge.frequency === "monthly" ? " / month" : "",
    frequencyLabel:
      pledge.frequency === "monthly" ? "Monthly Sponsorship" : "One-Time Sponsorship",
    paymentRail: PAYMENT_RAIL_LABELS[pledge.paymentMethod],
  };

  const subject = `🐾 We recorded your pledge for ${pledge.petName}`;

  const plainText = `
SPONSORSHIP PLEDGE RECORDED FOR ${pledge.petName.toUpperCase()}
===================================================
${SHELTER_NAME}
${SHELTER_ADDRESS}
Phone: ${SHELTER_PHONE} | Email: ${SHELTER_EMAIL}

Dear ${pledge.sponsorName},

We recorded your pledge for ${pledge.petName}. Thank you for standing behind an
animal who needed someone while the shelter matches your transfer.

YOUR SPONSORSHIP:
- Sponsored Animal: ${pledge.petName}
- Care Programme: ${pledge.tierName}
- Commitment: ${fields.amount}${fields.cadence} (${fields.frequencyLabel})
- Payment Rail: ${fields.paymentRail}
- Pledge Reference: ${pledge.pledgeRef}

WHAT HAPPENS NEXT:
${pledge.reconciliationNotice}

Please quote ${pledge.pledgeRef} in your transfer description so our coordinator
can match your payment quickly.

IMPORTANT: This confirms your sponsorship pledge; it is not a receipt. Your
official receipt is issued separately once your payment has been reconciled.

With gratitude,
The ${SHELTER_NAME} Team
  `.trim();

  const html = wrapEmailHtml(`
    <div style="border-bottom: 2px solid ${EMAIL_BRAND.border}; padding-bottom: 16px; margin-bottom: 20px;">
      <span class="badge" style="background:${tone.surface};color:${tone.text};">Sponsorship Pledge Recorded</span>
      <h2 style="margin: 8px 0 4px 0; font-size: 22px; color: ${EMAIL_BRAND.foreground};">
        Thank you for sponsoring ${escapeHtml(pledge.petName)}!
      </h2>
      <p style="margin: 0; font-size: 13px; color: ${EMAIL_BRAND.mutedForeground};">
        Pledge Reference: <strong style="font-family: monospace; color: ${EMAIL_BRAND.foreground};">${escapeHtml(pledge.pledgeRef)}</strong>
      </p>
    </div>

    <p>Dear <strong>${escapeHtml(pledge.sponsorName)}</strong>,</p>
    <p>
      We recorded your pledge for <strong>${escapeHtml(pledge.petName)}</strong>. Once the shelter
      matches the transfer, your support pays for the care that gets a rescued animal from intake
      to a home.
    </p>

    <div style="text-align:center; margin: 24px 0;">
      <div style="display:inline-block; background:${tone.surface}; border: 2px solid ${tone.accent}; border-radius: 14px; padding: 20px 28px; text-align:center;">
        <div style="font-size: 34px; line-height: 1;">🐾</div>
        <div style="font-size: 15px; font-weight: 800; color:${tone.text}; text-transform: uppercase; letter-spacing: 1px; margin-top: 6px;">
          Rescue Sponsor
        </div>
        <div style="font-size: 13px; font-weight: 700; color:${EMAIL_BRAND.foreground}; margin-top: 4px;">
          ${escapeHtml(pledge.petName)}
        </div>
        <div style="font-size: 11px; color:${tone.text}; margin-top: 2px;">
          ${fields.amount}${fields.cadence} &bull; ${fields.frequencyLabel}
        </div>
      </div>
    </div>

    <div class="card" style="background:${EMAIL_BRAND.muted}; border-left: 4px solid ${tone.accent}; padding: 18px; margin: 20px 0;">
      <table style="width:100%; font-size: 13px; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.mutedForeground}; width: 40%;"><strong>Sponsored Animal:</strong></td>
          <td style="padding: 4px 0; font-weight: 600; color: ${EMAIL_BRAND.foreground};">🐾 ${escapeHtml(pledge.petName)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.mutedForeground};"><strong>Care Programme:</strong></td>
          <td style="padding: 4px 0; font-weight: 600; color: ${EMAIL_BRAND.foreground};">${escapeHtml(pledge.tierName)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.mutedForeground};"><strong>Commitment:</strong></td>
          <td style="padding: 4px 0; font-weight: 700; color: ${EMAIL_BRAND.foreground};">${fields.amount}${fields.cadence} <span style="font-weight:500; color:${EMAIL_BRAND.mutedForeground};">(${fields.frequencyLabel})</span></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.mutedForeground};"><strong>Payment Rail:</strong></td>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.foreground};">${fields.paymentRail}</td>
        </tr>
      </table>
    </div>

    <div style="background:${EMAIL_TONE.warning.surface}; border: 1px solid ${EMAIL_TONE.warning.accent}; padding: 14px; border-radius: 6px; font-size: 13px; color: ${EMAIL_TONE.warning.text}; margin: 20px 0; line-height: 1.55;">
      <strong>What happens next</strong><br/>
      ${escapeHtml(pledge.reconciliationNotice)}<br/><br/>
      Please quote <strong style="font-family: monospace;">${escapeHtml(pledge.pledgeRef)}</strong> in your
      transfer description so we can match your payment quickly.
    </div>

    <div style="background:${EMAIL_BRAND.muted}; padding: 14px; border-radius: 6px; font-size: 12px; color: ${EMAIL_BRAND.mutedForeground}; margin: 20px 0; line-height: 1.5;">
      <em>
        This confirms your sponsorship pledge and is <strong>not</strong> a receipt. Your official
        receipt is issued separately once your payment has been reconciled.
      </em>
    </div>

    <p style="font-size: 13px; color: ${EMAIL_BRAND.mutedForeground}; margin-top: 24px;">
      With gratitude,<br/>
      <strong>The ${SHELTER_NAME} Team</strong><br/>
      ${SHELTER_ADDRESS}
    </p>
  `);

  return sendRawEmail({
    to: pledge.sponsorEmail,
    subject,
    text: plainText,
    html,
    template: "SPONSORSHIP_WELCOME",
    entity: "PetSponsorship",
    entityId: pledge.pledgeRef,
  });
}

/** The subset of a recorded general gift the acknowledgement mail renders. */
export interface DonationPledgeEmailInput {
  pledgeRef: string;
  donorName: string;
  donorEmail: string;
  tierName: string;
  amountMYR: number;
  frequency: "one_time" | "monthly";
  paymentMethod: PaymentMethod;
  targetPetName?: string;
  reconciliationNotice: string;
}

/**
 * 5b. Acknowledges a general gift that has been recorded but not yet reconciled.
 *
 * ## This is not a receipt, and says so in both halves
 *
 * Until 2026-09-22 the donation form sent `sendDonationReceiptEmail` immediately,
 * so a supporter who had sent no money received an official Section 44(6) document
 * with a live `HFS-DON-*` number on it. This mail replaces that one at submission
 * time. The receipt still exists and is still sent — from
 * `reconcileDonationPledgeAction`, once a coordinator has matched the transfer.
 *
 * Nothing here passes through `isTaxClaimable`, because there is no receipt to ask
 * the question about. Both halves disclaim the tax status explicitly rather than
 * merely omitting it: a donor who has had a tax document from this shelter before
 * will otherwise assume this is one, and file it.
 *
 * Its audit entity is `DonationPledge`, and its details carry no `receiptNumber`.
 * `isReceiptAuditRow` in `src/lib/domain/receiptAuditRow.ts` — the one classifier
 * the receipts tab, the audit viewer and the CSV fallback share — calls a row a
 * receipt on the action `DONATION_RECEIVED`, the entity `DonationReceipt`, or a
 * non-empty `receiptNumber`. An acknowledgement that tripped any of them would put
 * an unpaid gift back into the LHDN CSV fallback, which is the defect this whole
 * change removes.
 */
export async function sendDonationPledgeEmail(
  pledge: DonationPledgeEmailInput
): Promise<EmailResult> {
  const tone = EMAIL_TONE.care;

  // Single source of truth for every value both halves state, for the reason
  // `sendDonationReceiptEmail` gives: one field resolved twice by hand, in two
  // languages, is exactly what let the two halves of that receipt disagree.
  const fields = {
    amount: `RM ${pledge.amountMYR.toFixed(2)}`,
    cadence: pledge.frequency === "monthly" ? " / month" : "",
    frequencyLabel:
      pledge.frequency === "monthly" ? "Monthly Contribution" : "One-Time Contribution",
    paymentRail: PAYMENT_RAIL_LABELS[pledge.paymentMethod],
    dedication: pledge.targetPetName ?? "",
  };

  const subject = `🐾 We recorded your gift of ${fields.amount} — ${pledge.pledgeRef}`;

  const plainText = `
DONATION PLEDGE RECORDED — THIS IS NOT A RECEIPT
===================================================
${SHELTER_NAME}
${SHELTER_ADDRESS}
Phone: ${SHELTER_PHONE} | Email: ${SHELTER_EMAIL}

Dear ${pledge.donorName},

Thank you. We have recorded your intention to give, and your gift now sits with
our coordinator to be matched against the shelter's bank statement.

YOUR GIFT:
- Programme: ${pledge.tierName}
- Amount: ${fields.amount}${fields.cadence} (${fields.frequencyLabel})
- Payment Rail: ${fields.paymentRail}
${fields.dedication ? `- In honour of: ${fields.dedication}\n` : ""}- Pledge Reference: ${pledge.pledgeRef}

WHAT HAPPENS NEXT:
${pledge.reconciliationNotice}

Please quote ${pledge.pledgeRef} in your transfer description so our coordinator
can match your payment quickly.

IMPORTANT: This email confirms that we recorded your pledge. It is NOT a receipt
and it carries no receipt number, so it cannot be used to claim tax relief. Your
official Section 44(6) receipt is issued and emailed separately, once your
payment has been reconciled.

With gratitude,
The ${SHELTER_NAME} Team
  `.trim();

  const html = wrapEmailHtml(`
    <div style="border-bottom: 2px solid ${EMAIL_BRAND.border}; padding-bottom: 16px; margin-bottom: 20px;">
      <span class="badge" style="background:${tone.surface};color:${tone.text};">Donation Pledge Recorded</span>
      <h2 style="margin: 8px 0 4px 0; font-size: 22px; color: ${EMAIL_BRAND.foreground};">
        Thank you for your gift!
      </h2>
      <p style="margin: 0; font-size: 13px; color: ${EMAIL_BRAND.mutedForeground};">
        Pledge Reference: <strong style="font-family: monospace; color: ${EMAIL_BRAND.foreground};">${escapeHtml(pledge.pledgeRef)}</strong>
      </p>
    </div>

    <p>Dear <strong>${escapeHtml(pledge.donorName)}</strong>,</p>
    <p>
      We have recorded your intention to give. Your gift now sits with our coordinator to be
      matched against the shelter's bank statement — once it is, it pays for the care that gets a
      rescued animal from intake to a home.
    </p>

    <div class="card" style="background:${EMAIL_BRAND.muted}; border-left: 4px solid ${tone.accent}; padding: 18px; margin: 20px 0;">
      <table style="width:100%; font-size: 13px; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.mutedForeground}; width: 40%;"><strong>Programme:</strong></td>
          <td style="padding: 4px 0; font-weight: 600; color: ${EMAIL_BRAND.foreground};">${escapeHtml(pledge.tierName)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.mutedForeground};"><strong>Amount:</strong></td>
          <td style="padding: 4px 0; font-weight: 700; color: ${EMAIL_BRAND.foreground};">${fields.amount}${fields.cadence} <span style="font-weight:500; color:${EMAIL_BRAND.mutedForeground};">(${fields.frequencyLabel})</span></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.mutedForeground};"><strong>Payment Rail:</strong></td>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.foreground};">${fields.paymentRail}</td>
        </tr>
        ${
          fields.dedication
            ? `<tr>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.mutedForeground};"><strong>In honour of:</strong></td>
          <td style="padding: 4px 0; color: ${EMAIL_BRAND.foreground};">🐾 ${escapeHtml(fields.dedication)}</td>
        </tr>`
            : ""
        }
      </table>
    </div>

    <div style="background:${EMAIL_TONE.warning.surface}; border: 1px solid ${EMAIL_TONE.warning.accent}; padding: 14px; border-radius: 6px; font-size: 13px; color: ${EMAIL_TONE.warning.text}; margin: 20px 0; line-height: 1.55;">
      <strong>What happens next</strong><br/>
      ${escapeHtml(pledge.reconciliationNotice)}<br/><br/>
      Please quote <strong style="font-family: monospace;">${escapeHtml(pledge.pledgeRef)}</strong> in your
      transfer description so we can match your payment quickly.
    </div>

    <div style="background:${EMAIL_BRAND.muted}; padding: 14px; border-radius: 6px; font-size: 12px; color: ${EMAIL_BRAND.mutedForeground}; margin: 20px 0; line-height: 1.5;">
      <em>
        This email confirms that we recorded your pledge. It is <strong>not</strong> a receipt, it
        carries no receipt number, and it cannot be used to claim tax relief. Your official
        Section 44(6) receipt is issued and emailed separately once your payment has been
        reconciled.
      </em>
    </div>

    <p style="font-size: 13px; color: ${EMAIL_BRAND.mutedForeground}; margin-top: 24px;">
      With gratitude,<br/>
      <strong>The ${SHELTER_NAME} Team</strong><br/>
      ${SHELTER_ADDRESS}
    </p>
  `);

  return sendRawEmail({
    to: pledge.donorEmail,
    subject,
    text: plainText,
    html,
    template: "DONATION_PLEDGE",
    entity: "DonationPledge",
    entityId: pledge.pledgeRef,
  });
}

/**
 * Resolves a possibly-relative asset path into an absolute URL.
 *
 * Gallery images may be stored as site-relative paths depending on the active
 * storage provider, and an email client has no base URL to resolve them against —
 * a relative `src` is a broken image for every recipient.
 *
 * Anything carrying a non-http(s) scheme is dropped rather than pasted into an
 * `<img src>`: the pet schema validates gallery entries with Zod's `url()`, which
 * accepts `javascript:` and `data:`, so a stored value is not by itself evidence
 * that the URL is safe to render.
 */
export function absolutizeAssetUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return "";
  return appUrl(url);
}

export interface PetPhotoUpdateEmailInput {
  petId: string;
  petName: string;
  sponsorName: string;
  sponsorEmail: string;
  /** Newly added gallery image URLs, already truncated to a sane count. */
  imageUrls: string[];
  /** Optional short note from the caregiver who took the photos. */
  caption?: string;
  /** Signed link to this supporter's own notification preference page. */
  preferencesUrl: string;
  /** RFC 8058 one-click POST endpoint. */
  oneClickUnsubscribeUrl: string;
}

/**
 * Sends a "new photo" update to an active supporter of a specific animal.
 *
 * Deliverability notes:
 * - `List-Unsubscribe` / `List-Unsubscribe-Post` implement RFC 8058 one-click
 *   unsubscribe, which Gmail and Yahoo require of bulk senders. §3.1: "The
 *   List-Unsubscribe header field MUST contain one HTTPS URI." Exactly one, so a
 *   provider cannot POST the one-click request at the preference *page*, which
 *   has no POST handler and would 405.
 * - The paired URL is a POST endpoint on purpose: a plain GET link is followed by
 *   inbox scanners and prefetchers, which would unsubscribe supporters who never
 *   touched it.
 * - Tagged `sponsor_update` rather than `transactional`, because this is
 *   consent-based mail and should be reported and throttled as such.
 * - Rounded corners use `border-radius`, which Outlook on Windows ignores; the
 *   image degrades to square rather than breaking.
 */
export async function sendPetPhotoUpdateEmail(
  input: PetPhotoUpdateEmailInput
): Promise<EmailResult> {
  const petName = input.petName;
  const safePetName = escapeHtml(petName);
  const profileUrl = appUrl(`pets/${encodeURIComponent(input.petId)}`);
  const images = input.imageUrls.map(absolutizeAssetUrl).filter(Boolean);
  const primaryImage = images[0];
  const caption = input.caption?.trim();

  const subject = `New photo of ${petName}!`;

  const plainText = `
Update on ${petName}

Dear ${input.sponsorName},

There is a new photo of ${petName}, the animal you sponsor at ${SHELTER_NAME}.

${caption ? `From ${petName}'s caregiver:\n"${caption}"\n` : ""}
${images.length > 0 ? `View the photo${images.length > 1 ? "s" : ""}:\n${images.join("\n")}\n` : ""}
Visit ${petName}'s profile:
${profileUrl}

---
You are receiving this because you sponsor ${petName}.
Manage your email preferences or unsubscribe:
${input.preferencesUrl}

${SHELTER_NAME}
${SHELTER_ADDRESS}
  `.trim();

  const galleryHtml = images
    .map(
      (url, index) => `
      <img
        src="${escapeHtml(url)}"
        alt="${safePetName}, a rescue animal at ${escapeHtml(SHELTER_NAME)} - new photo ${index + 1} of ${images.length}"
        width="520"
        style="display:block;width:100%;max-width:520px;height:auto;border:0;outline:none;text-decoration:none;border-radius:12px;margin:0 auto 12px auto;"
      />`
    )
    .join("");

  const footerExtra = `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid ${EMAIL_BRAND.border};line-height:1.6;">
      You are receiving this because you sponsor ${safePetName}.<br/>
      <a href="${escapeHtml(input.preferencesUrl)}" style="color:${EMAIL_TONE.info.accent};text-decoration:underline;">Manage email preferences</a>
      &nbsp;&bull;&nbsp;
      <a href="${escapeHtml(input.preferencesUrl)}&amp;unsubscribe=photo" style="color:${EMAIL_BRAND.mutedForeground};text-decoration:underline;">Unsubscribe from photo updates</a>
    </div>
  `;

  const html = wrapEmailHtml(
    `
    <span class="badge">Sponsor Update</span>
    <h2 style="margin-top:0;">Update on ${safePetName}</h2>
    <p>Dear ${escapeHtml(input.sponsorName)}, there ${images.length > 1 ? "are new photos" : "is a new photo"} of the animal you sponsor.</p>

    ${primaryImage ? `<div style="margin:20px 0;">${galleryHtml}</div>` : ""}

    ${
      caption
        ? `<div class="card">
             <strong>From ${safePetName}'s caregiver:</strong><br/>
             <em>${escapeHtml(caption)}</em>
           </div>`
        : ""
    }

    <div style="text-align:center;margin:24px 0;">
      <a href="${escapeHtml(profileUrl)}" class="btn-track">Visit ${safePetName}'s Profile &rarr;</a>
    </div>

    <p style="font-size:14px;color:${EMAIL_BRAND.mutedForeground};">
      Thank you for standing by ${safePetName}. Your sponsorship pays for the food, veterinary care and shelter that made this photo possible.
    </p>
  `,
    footerExtra
  );

  return sendRawEmail({
    to: input.sponsorEmail,
    subject,
    text: plainText,
    html,
    template: "PET_PHOTO_UPDATE",
    entityId: input.petId,
    // NOT "Pet": `useAuditLogController` builds its Adoptions tab as
    // entity === "AdoptionApplication" || action.includes("APPLICATION") || entity === "Pet",
    // so filing here would bury the adoption trail under bulk-mail rows.
    entity: "SponsorNotification",
    category: "sponsor_update",
    extraHeaders: {
      "List-Unsubscribe": `<${input.oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

/**
 * Sends a staff invitation containing a single-use, expiring redemption link.
 *
 * The raw token appears only here and in the recipient's inbox: the database
 * holds nothing but its scrypt hash, and the audit trail records the invitation
 * without the token.
 *
 * Every interpolated value is escaped. The name and role text originate from an
 * administrator's form input, and this is an HTML body.
 */
export async function sendStaffInvitationEmail(invite: {
  email: string;
  name: string;
  roleLabel: string;
  roleDescription: string;
  token: string;
  expiresAt: Date;
  invitedByName: string;
  userId: string;
}): Promise<EmailResult> {
  const acceptUrl =
    `${APP_BASE_URL}/admin/invite` +
    `?token=${encodeURIComponent(invite.token)}` +
    `&email=${encodeURIComponent(invite.email)}`;

  const expiryText = invite.expiresAt.toLocaleString("en-MY", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  });

  const subject = `You have been invited to the ${SHELTER_NAME} staff portal`;

  const plainText = [
    `Hello ${invite.name},`,
    ``,
    `${invite.invitedByName} has invited you to join the ${SHELTER_NAME} staff portal as ${invite.roleLabel}.`,
    `${invite.roleDescription}`,
    ``,
    `Set your password and activate your account:`,
    acceptUrl,
    ``,
    `This link can be used once and expires on ${expiryText}.`,
    `If you were not expecting this invitation, you can ignore this email — the account stays inactive until the link is used.`,
    ``,
    `${SHELTER_NAME}`,
    SHELTER_ADDRESS,
  ].join("\n");

  const html = wrapEmailHtml(`
    <span class="badge">Staff Invitation</span>
    <h2 style="margin: 0 0 12px; font-size: 20px;">Hello ${escapeHtml(invite.name)},</h2>

    <p>
      <strong>${escapeHtml(invite.invitedByName)}</strong> has invited you to join the
      ${SHELTER_NAME} staff portal as
      <strong>${escapeHtml(invite.roleLabel)}</strong>.
    </p>

    <div class="card">
      <strong>Your access level:</strong> ${escapeHtml(invite.roleLabel)}<br/>
      <span style="font-size: 13px; color: ${EMAIL_BRAND.mutedForeground};">${escapeHtml(invite.roleDescription)}</span>
    </div>

    <p>Choose a password to activate your account:</p>

    <p style="text-align: center;">
      <a href="${escapeHtml(acceptUrl)}" class="btn-track">Activate Your Staff Account</a>
    </p>

    <div class="card card-warning">
      This link works once and expires on <strong>${escapeHtml(expiryText)}</strong>.
      If it lapses, ask an administrator to resend your invitation.
    </div>

    <p style="font-size: 13px; color: ${EMAIL_BRAND.mutedForeground}; margin-top: 24px;">
      If you were not expecting this invitation you can safely ignore this email —
      the account remains inactive until the link is used.
    </p>
  `);

  return sendRawEmail({
    to: invite.email,
    subject,
    text: plainText,
    html,
    template: "STAFF_INVITATION",
    entity: "User",
    entityId: invite.userId,
});
}

/**
 * 6. Delivers a Gold sponsor's question to the sanctuary care team.
 *
 * Addressed to the shelter with `replyTo` set to the sponsor, so a caretaker answers by
 * replying — the same shape as `sendStaffApplicationAlert`, and the reason this perk needs
 * no inbox UI of its own.
 */
export async function sendCaretakerQuestionEmail(question: {
  sponsorName: string;
  sponsorEmail: string;
  tier: string;
  message: string;
}): Promise<EmailResult> {
  const subject = `[${question.tier} Sponsor Q&A] Question from ${question.sponsorName}`;

  const text = `
Caretaker Question from a Sponsor
-----------------------------------
Sponsor: ${question.sponsorName}
Email: ${question.sponsorEmail}
Sponsorship standing: ${question.tier}

Message:
${question.message}

Reply directly to this email to answer the sponsor.
  `.trim();

  const html = wrapEmailHtml(`
    <div style="border-bottom: 2px solid ${EMAIL_BRAND.foreground}; padding-bottom: 16px; margin-bottom: 20px;">
      <span class="badge" style="background:${EMAIL_TONE.warning.surface};color:${EMAIL_TONE.warning.text};">${escapeHtml(question.tier)} Sponsor Privilege</span>
      <h2 style="margin: 8px 0 4px 0; font-size: 22px; color: ${EMAIL_BRAND.foreground};">Question for the Care Team</h2>
    </div>

    <p><strong>${escapeHtml(question.sponsorName)}</strong> (${escapeHtml(question.sponsorEmail)}) asked:</p>

    <div class="card" style="background:${EMAIL_BRAND.muted}; border-left: 4px solid ${EMAIL_BRAND.primary}; padding: 18px; margin: 20px 0; white-space: pre-wrap;">${escapeHtml(question.message)}</div>

    <p style="font-size: 13px; color: ${EMAIL_BRAND.mutedForeground};">
      Reply directly to this email to answer the sponsor. Gold sponsors are told to expect a
      response within three working days.
    </p>
  `);

  return sendRawEmail({
    to: SHELTER_EMAIL,
    replyTo: question.sponsorEmail,
    subject,
    text,
    html,
    template: "CARETAKER_QUESTION",
    entity: "Sponsor",
  });
}
