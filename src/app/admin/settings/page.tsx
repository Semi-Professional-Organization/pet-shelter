import { requireAdminSection } from "@/lib/security/adminSectionGate";
import { hasPermission, PERMISSIONS } from "@/lib/security/rbac";
import { roleCanEditGlobalQr } from "@/lib/security/qrAccess";
import { ShelterSettingsForm } from "./ShelterSettingsForm";

export default async function AdminSettingsPage() {
  // Opens for MANAGE_SETTINGS (edit the configuration) or SEND_SHELTER_EMAIL (send a
  // test email); the form decides which of the two this member gets.
  const session = await requireAdminSection("/admin/settings");

  // Two answers on purpose. Today they agree, because `roleCanEditGlobalQr` asks for
  // MANAGE_SETTINGS, but QR editing has its own rule in qrAccess.ts, the place
  // docs/qr-codes.md names for "who may write which scope". Widening that rule would
  // also need the section and the form to offer the QR tab to the new holders: today
  // only MANAGE_SETTINGS holders reach it.
  return (
    <ShelterSettingsForm
      canManageSettings={hasPermission(session, PERMISSIONS.MANAGE_SETTINGS)}
      canEditQr={roleCanEditGlobalQr(session.role)}
      ownEmail={session.email}
    />
  );
}
