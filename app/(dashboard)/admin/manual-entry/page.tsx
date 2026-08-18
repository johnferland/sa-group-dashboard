import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";

export default async function ManualEntryAdminPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "super_admin") redirect("/");

  return (
    <Page>
      <PageHeader
        title="Manual entry"
        description="Closed-won deals, revenue, and social SQLs will live here. Weekly leads are on each brand dashboard."
      />
    </Page>
  );
}
