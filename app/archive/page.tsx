import UserArchive from "@/components/UserArchive";
import { getCurrentAppUser } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const user = await getCurrentAppUser();
  return <UserArchive displayName={user?.displayName || "الزائر"} />;
}
