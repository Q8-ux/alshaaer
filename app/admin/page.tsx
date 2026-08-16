import AdminDashboard from "@/components/AdminDashboard";
import { redirect } from "next/navigation";
import { ArchiveError } from "@/lib/archive-store";
import { requireAdminUser } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

async function getAdminPageUser() {
  try {
    return await requireAdminUser();
  } catch (error) {
    if (error instanceof ArchiveError && (error.status === 401 || error.status === 403)) {
      redirect("/admin/login");
    }
    throw error;
  }
}

export default async function AdminPage() {
  const user = await getAdminPageUser();
  return <AdminDashboard displayName={user.displayName} />;
}
