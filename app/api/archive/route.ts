import { appErrorResponse, requireAppUser } from "@/lib/app-auth";
import { listUserArchive } from "@/lib/archive-store";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const user = await requireAppUser();
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 100);
    const archive = await listUserArchive(
      user.id,
      Number.isFinite(requestedLimit) ? requestedLimit : 100,
    );
    return Response.json({ archive });
  } catch (error) {
    return appErrorResponse(error);
  }
}
