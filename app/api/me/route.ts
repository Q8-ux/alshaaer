import { appErrorResponse, requireAppUser } from "@/lib/app-auth";
import { isGuestUser } from "@/lib/user-auth";

export const runtime = "edge";

export async function GET() {
  try {
    const user = await requireAppUser();
    return Response.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      isGuest: isGuestUser(user),
    });
  } catch (error) {
    return appErrorResponse(error);
  }
}
