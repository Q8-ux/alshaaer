import { z } from "zod";
import { appErrorResponse, requireAdminUser } from "@/lib/app-auth";
import {
  getTwilioVerifyConfigurationStatus,
  saveTwilioAccountConfiguration,
} from "@/lib/twilio-settings";

export const runtime = "edge";

const TwilioConfigurationSchema = z.object({
  accountSid: z.string().trim().regex(/^AC[a-z0-9]{32}$/i),
  authToken: z.string().trim().regex(/^[a-z0-9]{16,128}$/i),
  serviceSid: z.string().trim().regex(/^VA[a-z0-9]{32}$/i),
});

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await getTwilioVerifyConfigurationStatus());
  } catch (error) {
    return appErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdminUser();
    const configuration = TwilioConfigurationSchema.parse(await request.json());
    await saveTwilioAccountConfiguration(configuration);
    return Response.json(await getTwilioVerifyConfigurationStatus());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "راجع Account SID وAuth Token وVerify Service SID من Twilio." },
        { status: 400 },
      );
    }
    return appErrorResponse(error);
  }
}
