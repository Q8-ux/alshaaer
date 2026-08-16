import { redirect } from "next/navigation";
import AdminLogin from "@/components/AdminLogin";
import { getAdminSessionIdentity } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdminSessionIdentity()) redirect("/admin");
  return <AdminLogin />;
}
