import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminLogin from "@/components/AdminLogin";
import { getAdminSessionIdentity } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "دخول مركز بيانات أنت الشاعر",
  robots: { index: false, follow: false },
};

export default async function ControlCenterLoginPage() {
  if (await getAdminSessionIdentity()) redirect("/control-center");
  return <AdminLogin />;
}
