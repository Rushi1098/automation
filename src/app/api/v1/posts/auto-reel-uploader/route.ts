import { type NextRequest } from "next/server";
import { z } from "zod/v4";
import { apiError, apiSuccess } from "@/lib/api-response";
import { resolveUserId } from "@/lib/api-auth";
import { createPost, PostServiceError } from "@/services/post.service";
import { InstagramApiError } from "@/services/platforms/instagram/instagram.service";
import { startBackgroundAutoReelPosting } from "@/lib/auto-reel-scheduler";

const autoReelUploaderSchema = z.object({
  video_media_ids: z
    .array(z.string().uuid())
    .min(1, "At least one video media item must be selected"),
  caption: z.string().max(2200),
  cover_media_id: z.string().uuid().optional(),
  interval_minutes: z.coerce.number().int().min(1, "Interval must be at least 1 minute"),
  audio_name: z.string().optional(),
  platform_credential_id: z.string().uuid().optional(),
});

/**
 * POST /api/v1/posts/auto-reel-uploader
 *
 * Posts the first selected video immediately as an Instagram Reel.
 * Schedules the remaining selected videos to be published in the background with the specified delay interval.
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
    const parsed = autoReelUploaderSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        "Invalid request body",
        400,
        parsed.error.issues
      );
    }

    const {
      video_media_ids,
      caption,
      cover_media_id,
      interval_minutes,
      audio_name,
      platform_credential_id,
    } = parsed.data;

    // 3. Post the first Reel immediately
    const [firstMediaId, ...remainingMediaIds] = video_media_ids;

    console.log(`[AutoReelUploader API] Posting first Reel immediately: media ID ${firstMediaId}`);
    const post = await createPost(userId, {
      platform: "instagram",
      post_type: "reel",
      media_ids: [firstMediaId],
      caption,
      cover_media_id,
      audio_name,
      platform_credential_id,
    });

    // 4. If there are remaining Reels, schedule them in the background
    if (remainingMediaIds.length > 0) {
      console.log(`[AutoReelUploader API] Scheduling remaining ${remainingMediaIds.length} Reels in background.`);
      startBackgroundAutoReelPosting({
        userId,
        videoMediaIds: remainingMediaIds,
        caption,
        coverMediaId: cover_media_id,
        intervalMinutes: interval_minutes,
        audioName: audio_name,
        platformCredentialId: platform_credential_id,
      });
    }

    return apiSuccess(
      {
        post_id: post.id,
        container_id: post.container_id,
        status: post.status,
        queued_count: remainingMediaIds.length,
        status_check_url: `/api/v1/posts/${post.id}`,
      },
      201
    );

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

    const message = error instanceof Error ? error.message : "Failed to run Auto Reel Uploader batch";
    console.error("[posts/auto-reel-uploader] Batch run failed:", {
      error,
      message,
    });
    return apiError("AUTOMATION_ERROR", message, 500);
  }
}
