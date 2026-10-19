import { TransparencyEditor } from "@/components/admin/TransparencyEditor";
import { requireAdminSection } from "@/lib/security/adminSectionGate";
import { hasPermission, PERMISSIONS } from "@/lib/security/rbac";

export default async function AdminTransparencyPage() {
  // Was a client page whose only gate read the cookie's role, while every action
  // behind it reads the live one, so a suspended or demoted editor got the editor
  // and a refusal on every load and save.
  const session = await requireAdminSection("/admin/transparency");

  // `/api/upload` stores files for MANAGE_PET_MEDIA holders only. A Content
  // Editor holds MANAGE_CONTENT alone, so its "Upload PDF" was always refused.
  return (
    <TransparencyEditor canUploadFiles={hasPermission(session, PERMISSIONS.MANAGE_PET_MEDIA)} />
  );
}
