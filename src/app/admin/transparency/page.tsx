import { TransparencyEditor } from "@/components/admin/TransparencyEditor";
import { requireAdminSection } from "@/lib/security/adminSectionGate";

export default async function AdminTransparencyPage() {
  // Was a client page whose only gate read the cookie's role, while every action
  // behind it reads the live one, so a suspended or demoted editor got the editor
  // and a refusal on every load and save.
  await requireAdminSection("/admin/transparency");

  // Every member this section admits holds MANAGE_CONTENT, and `/api/upload` takes a
  // report PDF from a MANAGE_CONTENT holder, so "Upload PDF" needs no flag of its own.
  return <TransparencyEditor />;
}
