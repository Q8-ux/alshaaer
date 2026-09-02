import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { ArchiveError } from "@/lib/archive-store";
import { requireAdminUser } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "مركز بيانات أنت الشاعر",
  robots: { index: false, follow: false },
};

async function getAdminPageUser() {
  try {
    return await requireAdminUser();
  } catch (error) {
    if (error instanceof ArchiveError && (error.status === 401 || error.status === 403)) {
      redirect("/control-center/login");
    }
    throw error;
  }
}

export default async function ControlCenterPage() {
  const user = await getAdminPageUser();
  return <AdminDashboard displayName={user.displayName} />;
}
