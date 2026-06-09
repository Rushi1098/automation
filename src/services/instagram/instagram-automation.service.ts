import { createAdminClient } from "@/lib/supabase/admin";
import { generateOpenRouterJsonResponse } from "@/lib/openrouter";
import { createPost } from "@/services/post.service";
import type { PostRow } from "@/types/database";

export interface AutoVideoPostOptions {
  mediaId?: string;
  prompt?: string;
  postType?: "reel" | "story_video";
  audioName?: string;
}

interface AIDecision {
  caption: string;
  cover_query: string;
}

export class InstagramAutomationService {
  /**
   * Automates the generation of captions, cover image, and publishes a video as an Instagram Reel or Story.
   */
  async automateVideoPost(
    userId: string,
    options: AutoVideoPostOptions = {}
  ): Promise<{ post: PostRow; autoCaption: string; autoCoverUrl: string }> {
    const supabase = createAdminClient();
    const postType = options.postType ?? "reel";

    // 1. Resolve the video media item
    let videoMedia: { id: string; public_url: string; file_name: string } | null = null;

    if (options.mediaId) {
      const { data, error } = await supabase
        .from("user_media")
        .select("id, public_url, file_name")
        .eq("user_id", userId)
        .eq("id", options.mediaId)
        .eq("kind", "video")
        .single();

      if (error || !data) {
        throw new Error("Specified video media item not found in your gallery.");
      }
      videoMedia = data as { id: string; public_url: string; file_name: string };
    } else {
      // Find the latest uploaded video
      const { data, error } = await supabase
        .from("user_media")
        .select("id, public_url, file_name")
        .eq("user_id", userId)
        .eq("kind", "video")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        throw new Error("No videos found in your gallery to automate. Please upload a video first.");
      }
      videoMedia = data as { id: string; public_url: string; file_name: string };
    }

    // 2. Retrieve OpenRouter API Key
    const openRouterApiKey = await this.getOpenRouterApiKey(userId);

    // 3. Call AI to generate caption and cover image search query
    const aiResponse = await this.generateCaptionAndCoverQuery(
      videoMedia.file_name,
      options.prompt,
      openRouterApiKey
    );

    // 4. Resolve the cover image url from LoremFlickr
    const coverUrl = await this.resolveCoverImageUrl(aiResponse.cover_query);

    // 5. Build and submit post to the PostService
    const post = await createPost(userId, {
      platform: "instagram",
      post_type: postType,
      media_ids: [videoMedia.id],
      caption: aiResponse.caption,
      cover_url: coverUrl,
      audio_name: options.audioName || "Original audio",
    });

    return {
      post,
      autoCaption: aiResponse.caption,
      autoCoverUrl: coverUrl,
    };
  }

  private async getOpenRouterApiKey(userId: string): Promise<string | undefined> {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("platform_credentials")
      .select("credentials")
      .eq("user_id", userId)
      .eq("platform", "openrouter")
      .maybeSingle();

    const creds = data?.credentials as { api_key?: string } | undefined;
    return creds?.api_key;
  }

  private async generateCaptionAndCoverQuery(
    fileName: string,
    userPrompt?: string,
    apiKey?: string
  ): Promise<AIDecision> {
    const model = process.env.OPENROUTER_CLAUDE_MODEL ?? "minimax/minimax-m2.7";

    const systemPrompt = `You are a social media optimization expert. Your task is to generate a highly engaging, viral Instagram caption and a matching image search query for the cover page.
  
Inputs:
- Video File Name: The name of the video file uploaded by the user.
- User Prompt (optional): Guidance provided by the user on the desired theme or tone.

Guidelines for Caption:
- Create a strong hook to capture attention in the first 3 seconds.
- Format with clean line breaks, bullet points, and relevant emojis.
- End with 3 to 5 trending hashtags.
- The caption should not sound generic or robotic.

Guidelines for Cover Query:
- Generate a 1-3 word query describing a visually stunning, high-quality image that matches the video topic (e.g. "sunset beach", "tech developer", "aesthetic coffee", "financial growth"). This query will be used to fetch a matching photo from an image library.

You MUST return a JSON object with this exact structure:
{
  "caption": "Your generated caption here",
  "cover_query": "Your cover query here"
}`;

    const userMessage = JSON.stringify({
      fileName,
      userPrompt: userPrompt || "No prompt provided. Match the filename theme.",
    });

    try {
      const decision = await generateOpenRouterJsonResponse<AIDecision>({
        model,
        systemPrompt,
        userMessage,
        apiKey,
      });

      if (!decision.caption || !decision.cover_query) {
        throw new Error("AI response was missing required fields.");
      }

      return decision;
    } catch (error) {
      console.error("[InstagramAutomationService] AI Generation failed:", error);
      // Fallback in case of OpenRouter / AI failures
      const cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      return {
        caption: `Check out this new video: ${cleanName}! 🎬✨ #videopost #socialsyncs #automation`,
        cover_query: "abstract gradient",
      };
    }
  }

  /**
   * Resolves a direct image URL from LoremFlickr redirect.
   * Instagram API requires direct image access, so resolving the 302 redirect
   * on the server side ensures we send a direct static photo URL.
   */
  private async resolveCoverImageUrl(query: string): Promise<string> {
    const fallbackUrl = `https://picsum.photos/1080/1920?random=${Date.now()}`;
    const cleanQuery = encodeURIComponent(query.trim().toLowerCase());
    const queryUrl = `https://loremflickr.com/1080/1920/${cleanQuery}`;

    try {
      // Perform a HEAD request to follow the redirect and get the final URL
      const response = await fetch(queryUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });

      if (response.ok && response.url && !response.url.includes("loremflickr")) {
        return response.url;
      }
      
      // If we didn't get a redirected URL or got a placeholder, fallback
      return fallbackUrl;
    } catch (error) {
      console.error("[InstagramAutomationService] Failed to resolve cover image redirect:", error);
      return fallbackUrl;
    }
  }
}
