import { type NextRequest } from "next/server";
import { z } from "zod/v4";
import { apiError, apiSuccess } from "@/lib/api-response";
import { resolveUserId } from "@/lib/api-auth";
import { InstagramAutomationService } from "@/services/instagram/instagram-automation.service";
import { PostServiceError } from "@/services/post.service";
import { InstagramApiError } from "@/services/platforms/instagram/instagram.service";

const autoVideoPostSchema = z.object({
  media_id: z.string().uuid().optional(),
  prompt: z.string().max(1000).optional(),
  post_type: z.enum(["reel", "story_video"]).default("reel"),
  audio_name: z.string().max(100).optional(),
});

/**
 * POST /api/v1/posts/auto-video
 *
 * Automatically posts a video from the gallery to Instagram.
 * If no `media_id` is specified, it picks the user's latest uploaded video.
 * Auto-generates an engaging caption using AI.
 * Auto-generates and attaches a beautiful cover page.
 *
 * Accepts both browser session cookies and Bearer API keys (ideal for n8n/automations).
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const userId = await resolveUserId(request);
    if (!userId) {
      return apiError("UNAUTHORIZED", "Authentication required", 401);
    }

    // 2. Parse and validate body
    const body = await request.json().catch(() => ({}));
    const parsed = autoVideoPostSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
          "VALIDATION_ERROR",
          "Invalid request body",
          400,
          parsed.error.issues
      );
    }

    const { media_id, prompt, post_type, audio_name } = parsed.data;

    // 3. Trigger the automation service
    const automationService = new InstagramAutomationService();
    const result = await automationService.automateVideoPost(userId, {
      mediaId: media_id,
      prompt,
      postType: post_type,
      audioName: audio_name,
    });

    // 4. Return standard API success envelope
    return apiSuccess({
      post_id: result.post.id,
      container_id: result.post.container_id,
      status: result.post.status,
      auto_caption: result.autoCaption,
      auto_cover_url: result.autoCoverUrl,
      status_check_url: `/api/v1/posts/${result.post.id}`,
    }, 201);

  } catch (error) {
    if (error instanceof PostServiceError) {
      return apiError(error.code, error.message, 400);
    }
    if (error instanceof InstagramApiError) {
      return apiError(
        "PLATFORM_API_ERROR",
        error.message,
        error.statusCode >= 500 ? 502 : 400,
        error.apiError
      );
    }
    
    const message = error instanceof Error ? error.message : "Failed to run video post automation";
    console.error("[posts/auto-video] Automation run failed:", {
      error,
      message,
    });
    return apiError("AUTOMATION_ERROR", message, 500);
  }
}
