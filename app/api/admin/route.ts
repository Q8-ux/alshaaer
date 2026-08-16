import { z } from "zod";
import { appErrorResponse, requireAdminUser } from "@/lib/app-auth";
import { getAdminDashboard, updateManagedUser } from "@/lib/archive-store";

export const runtime = "edge";

const UserUpdateSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]).optional(),
  role: z.enum(["admin", "user"]).optional(),
});

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await getAdminDashboard());
  } catch (error) {
    return appErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdminUser();
    const body = UserUpdateSchema.parse(await request.json());
    const user = await updateManagedUser({ admin, ...body });
    return Response.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "بيانات تعديل المستخدم غير مكتملة." }, { status: 400 });
    }
    return appErrorResponse(error);
  }
}
