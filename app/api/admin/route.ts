import { z } from "zod";
import { appErrorResponse, requireAdminUser } from "@/lib/app-auth";
import { getAdminDashboard, updateManagedUser } from "@/lib/archive-store";

export const runtime = "edge";

const UserUpdateSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]).optional(),
  role: z.enum(["admin", "user"]).optional(),
});

const DashboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
  search: z.string().trim().max(160).default(""),
  sourceMode: z.enum(["text", "audio"]).optional(),
  state: z.enum(["received", "audio_saved", "analyzed", "completed", "failed"]).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminUser();
    const url = new URL(request.url);
    const query = DashboardQuerySchema.parse(Object.fromEntries(url.searchParams));
    return Response.json(await getAdminDashboard(query));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "خيارات تصفح الأرشيف غير صالحة." }, { status: 400 });
    }
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
