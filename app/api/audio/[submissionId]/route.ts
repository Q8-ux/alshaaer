import { appErrorResponse, requireAppUser } from "@/lib/app-auth";
import { getAudioObject } from "@/lib/archive-store";

export const runtime = "edge";

export async function GET(
  _request: Request,
  context: { params: Promise<{ submissionId: string }> },
) {
  try {
    const user = await requireAppUser();
    const { submissionId } = await context.params;
    const { object, row } = await getAudioObject(user, submissionId);
    const filename = (row.audioFilename || "story.webm").replace(/["\\\r\n]/g, "_");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", row.audioContentType || "audio/webm");
    headers.set("content-disposition", `inline; filename="${filename}"`);
    headers.set("cache-control", "private, no-store");
    return new Response(object.body, { headers });
  } catch (error) {
    return appErrorResponse(error);
  }
}
