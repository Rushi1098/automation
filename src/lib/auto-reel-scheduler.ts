import { createPost } from "@/services/post.service";

export interface ScheduleParams {
  userId: string;
  videoMediaIds: string[];
  caption: string;
  coverMediaId?: string;
  intervalMinutes: number;
  audioName?: string;
  platformCredentialId?: string;
}

/**
 * Spawns a background worker to post the remaining videos after the specified delay intervals.
 */
export function startBackgroundAutoReelPosting(params: ScheduleParams) {
  const {
    userId,
    videoMediaIds,
    caption,
    coverMediaId,
    intervalMinutes,
    audioName,
    platformCredentialId,
  } = params;

  if (videoMediaIds.length === 0) {
    return;
  }

  const remainingIds = [...videoMediaIds];
  console.log(
    `[AutoReelScheduler] Spawning background worker for user ${userId}. Remaining videos: ${remainingIds.length}. Interval: ${intervalMinutes} min.`
  );

  async function processNext() {
    if (remainingIds.length === 0) {
      console.log(`[AutoReelScheduler] Background posting completed for user ${userId}.`);
      return;
    }

    const nextMediaId = remainingIds.shift();
    if (!nextMediaId) return;

    const delayMs = intervalMinutes * 60 * 1000;
    console.log(`[AutoReelScheduler] Next post (media: ${nextMediaId}) scheduled in ${intervalMinutes} minutes.`);

    setTimeout(async () => {
      try {
        console.log(`[AutoReelScheduler] Running scheduled post in background for media ${nextMediaId}...`);
        const post = await createPost(userId, {
          platform: "instagram",
          post_type: "reel",
          media_ids: [nextMediaId],
          caption,
          cover_media_id: coverMediaId || undefined,
          audio_name: audioName || "Original audio",
          platform_credential_id: platformCredentialId,
        });
        console.log(`[AutoReelScheduler] Background post created successfully. Post ID: ${post.id}, Status: ${post.status}`);
      } catch (error) {
        console.error(`[AutoReelScheduler] Failed to create background post for media ${nextMediaId}:`, error);
      }

      // Chain the next video
      void processNext();
    }, delayMs);
  }

  // Start background loop
  void processNext();
}
