import { requireAdminSection } from "@/lib/security/adminSectionGate";
import { hasPermission, PERMISSIONS } from "@/lib/security/rbac";
import { roleCanEditGlobalQr } from "@/lib/security/qrAccess";
import { ShelterSettingsForm } from "./ShelterSettingsForm";

export default async function AdminSettingsPage() {
  // Opens for MANAGE_SETTINGS (edit the configuration) or SEND_SHELTER_EMAIL (send a
  // test email); the form decides which of the two this member gets.
  const session = await requireAdminSection("/admin/settings");

  return (
    <ShelterSettingsForm
      canManageSettings={hasPermission(session, PERMISSIONS.MANAGE_SETTINGS)}
      canEditQr={roleCanEditGlobalQr(session.role)}
    />
  );
}
