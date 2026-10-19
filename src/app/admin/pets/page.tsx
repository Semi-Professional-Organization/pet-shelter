import { PetDataTable } from "@/components/admin/PetDataTable";
import { getAdminPets } from "@/actions/pets";
import { requireAdminSection } from "@/lib/security/adminSectionGate";

/**
 * Saving a pet can schedule a supporter photo-update fan-out via `after()`,
 * which runs inside this route's budget. At the dispatcher's concurrency a full
 * recipient list is ~50 sequential provider round-trips, which does not fit in a
 * short platform default — and a killed invocation drops the tail silently.
 */
export const maxDuration = 60;

export default async function AdminPetsPage() {
  // Refuses a role without MANAGE_PETS here, with the 403 page. The data load
  // below used to be the only check, and its refusal was swallowed, so such a role
  // got the bundled demo animals as an editable inventory.
  await requireAdminSection("/admin/pets");

  // getAdminPets re-checks the same capability. Not caught: a failure that fell
  // through to the client table's fallback would show the browser's demo animals as
  // though they were the inventory.
  const pets = await getAdminPets();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Adoptable Animals Inventory
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Manage all dog, cat, and rescue animal records currently housed in our Petaling Jaya sanctuary.
        </p>
      </div>

      <PetDataTable initialPets={pets} />
    </div>
  );
}
