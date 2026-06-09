"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { MediaInput } from "./media-input";
import { CarouselBuilder } from "./carousel-builder";
import { usePostStatus } from "@/hooks/use-post-status";
import type { InstagramPostType } from "@/lib/validators";
import type { UserMediaRow } from "@/types/database";
import type { SelectedMediaItem } from "@/types/media";
import {
  ImageIcon,
  Film,
  Video,
  LayoutGrid,
  Clapperboard,
  ArrowLeft,
  Send,
  CheckCircle,
  Music,
  Sparkles,
  Clock,
} from "lucide-react";

interface PostFormProps {
  availablePlatforms: string[];
  instagramAccounts?: {
    id: string;
    accountName: string;
    accountId: string;
  }[];
  galleryItems: UserMediaRow[];
}

type Step =
  | "type"
  | "media"
  | "details"
  | "submitting"
  | "result"
  | "auto_reel_choose"
  | "auto_reel_details"
  | "auto_reel_time";

const POST_TYPES: {
  id: InstagramPostType;
  label: string;
  description: string;
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  mediaLabel: string;
  acceptsVideo: boolean;
}[] = [
  {
    id: "image",
    label: "Image Post",
    description: "Share a single photo with caption",
    icon: ImageIcon,
    mediaLabel: "image",
    acceptsVideo: false,
  },
  {
    id: "story_image",
    label: "Story (Image)",
    description: "Post an image to your story",
    icon: Film,
    mediaLabel: "image",
    acceptsVideo: false,
  },
  {
    id: "story_video",
    label: "Story (Video)",
    description: "Post a video to your story",
    icon: Video,
    mediaLabel: "video",
    acceptsVideo: true,
  },
  {
    id: "reel",
    label: "Reel",
    description: "Share a short-form video reel",
    icon: Clapperboard,
    mediaLabel: "video",
    acceptsVideo: true,
  },
  {
    id: "carousel",
    label: "Carousel",
    description: "Share multiple images in one post",
    icon: LayoutGrid,
    mediaLabel: "images",
    acceptsVideo: false,
  },
];

export function PostForm({
  availablePlatforms,
  instagramAccounts = [],
  galleryItems,
}: PostFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");
  const [postType, setPostType] = useState<InstagramPostType | null>(null);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>(
    () => instagramAccounts[0]?.id ?? ""
  );
  const [primaryMedia, setPrimaryMedia] = useState<SelectedMediaItem | null>(
    null
  );
  const [carouselItems, setCarouselItems] = useState<SelectedMediaItem[]>([]);
  const [coverItem, setCoverItem] = useState<SelectedMediaItem | null>(null);
  const [caption, setCaption] = useState("");
  const [audioName, setAudioName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultPostId, setResultPostId] = useState<string | null>(null);
  const [resultStatus, setResultStatus] = useState<string | null>(null);

  // Auto Reel Uploader state
  const [isAutoReelFlow, setIsAutoReelFlow] = useState(false);
  const [autoReelSelectedVideos, setAutoReelSelectedVideos] = useState<string[]>([]);
  const [autoReelCaption, setAutoReelCaption] = useState(
    "🇯🇵 当达到这种速度时，已经不再是地面移动，而是以音速前进 🚀🌍 这段模拟展示了如果以 马赫 1（约 1330 公里/小时）的速度乘坐超音速列车穿越日本，会是一种怎样的体验。 目前，日本最快的列车运行速度约为"
  );
  const [autoReelInterval, setAutoReelInterval] = useState(5);

  const coverFile2 = galleryItems.find(
    (item) => item.file_name === "2.jpg" || item.file_name.toLowerCase().endsWith("2.jpg")
  );

  const { status: polledStatus } = usePostStatus({
    postId: resultPostId ?? "",
    initialStatus: (resultStatus as "processing") ?? "processing",
    enabled: !!resultPostId && resultStatus === "processing",
  });

  const hasInstagram = availablePlatforms.includes("instagram");
  const selectedTypeConfig = POST_TYPES.find((t) => t.id === postType);
  const needsCaption =
    postType === "image" || postType === "reel" || postType === "carousel";
  const isCarousel = postType === "carousel";
  const isReel = postType === "reel";

  async function handleSubmit() {
    const mediaIds = isCarousel
      ? carouselItems.map((m) => m.mediaId)
      : primaryMedia
        ? [primaryMedia.mediaId]
        : [];

    if (!postType || mediaIds.length === 0) return;

    setSubmitting(true);
    setError(null);
    setStep("submitting");

    try {
      const body: Record<string, unknown> = {
        platform: "instagram",
        post_type: postType,
        media_ids: mediaIds,
      };
      if (caption) body.caption = caption;
      if (isReel && coverItem) body.cover_media_id = coverItem.mediaId;
      if (audioName && isReel) body.audio_name = audioName;
      if (selectedCredentialId) {
        body.platform_credential_id = selectedCredentialId;
      }

      const res = await fetch("/api/v1/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error.message);
      }

      setResultPostId(json.data.post_id);
      setResultStatus(json.data.status);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
      setStep("details");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBatchSubmit() {
    if (autoReelSelectedVideos.length === 0) return;

    setSubmitting(true);
    setError(null);
    setStep("submitting");

    try {
      const body: Record<string, unknown> = {
        video_media_ids: autoReelSelectedVideos,
        caption: autoReelCaption,
        cover_media_id: coverFile2?.id || undefined,
        interval_minutes: autoReelInterval,
        audio_name: "Original audio",
      };
      if (selectedCredentialId) {
        body.platform_credential_id = selectedCredentialId;
      }

      const res = await fetch("/api/v1/posts/auto-reel-uploader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error.message);
      }

      setResultPostId(json.data.post_id);
      setResultStatus(json.data.status);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start batch upload");
      setStep("auto_reel_time");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasInstagram) {
    return (
      <Card className="text-center py-12">
        <p className="text-text-muted mb-4">
          No platforms connected. Add your credentials in Settings to start
          posting.
        </p>
        <Button onClick={() => router.push("/settings")}>Go to Settings</Button>
      </Card>
    );
  }

  if (step === "result" && resultPostId) {
    const finalStatus = polledStatus ?? resultStatus;
    return (
      <Card className="text-center py-12">
        <div className="flex flex-col items-center gap-4">
          {finalStatus === "published" ? (
            <>
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle
                  size={28}
                  className="text-success"
                  strokeWidth={1.8}
                />
              </div>
              <h2 className="text-xl font-bold tracking-[-0.8px] font-[family-name:var(--font-heading)]">
                Post Published!
              </h2>
              <p className="text-text-muted text-sm">
                Your post has been successfully published to Instagram.
              </p>
            </>
          ) : (
            <>
              <StatusBadge status={finalStatus as "processing"} />
              <h2 className="text-xl font-bold tracking-[-0.8px] font-[family-name:var(--font-heading)]">
                Post Created
              </h2>
              <p className="text-text-muted text-sm">
                Your post is being processed. This may take a few moments.
              </p>
            </>
          )}
          <div className="flex gap-3 mt-4">
            <Button variant="secondary" onClick={() => router.push("/history")}>
              View History
            </Button>
            <Button
              onClick={() => {
                setStep("type");
                setPostType(null);
                setPrimaryMedia(null);
                setCarouselItems([]);
                setCoverItem(null);
                setCaption("");
                setAudioName("");
                setResultPostId(null);
                setResultStatus(null);
              }}
            >
              Create Another
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (step === "submitting") {
    return (
      <Card className="text-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-muted">Creating your post...</p>
        </div>
      </Card>
    );
  }

  const mediaContinueDisabled = isCarousel
    ? carouselItems.length < 2
    : !primaryMedia;

  return (
    <div className="max-w-2xl space-y-6">
      {step === "type" && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="processing">Instagram</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {POST_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  setIsAutoReelFlow(false);
                  setPostType(type.id);
                  setPrimaryMedia(null);
                  setCarouselItems([]);
                  setCoverItem(null);
                  setStep("media");
                }}
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface-elevated hover:border-primary/40 hover:bg-primary/5 transition-colors text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
                  <type.icon
                    size={20}
                    strokeWidth={1.8}
                    className="text-foreground"
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {type.label}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {type.description}
                  </p>
                </div>
              </button>
            ))}

            {/* Auto Reel Uploader Button */}
            <button
              type="button"
              onClick={() => {
                setIsAutoReelFlow(true);
                setAutoReelSelectedVideos([]);
                setStep("auto_reel_choose");
              }}
              className="flex items-start gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10 transition-all text-left cursor-pointer relative overflow-hidden group shadow-sm"
            >
              <div className="absolute top-0 right-0 bg-primary text-white text-[9px] px-2 py-0.5 rounded-bl font-semibold uppercase tracking-wider">
                AI Batch
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
                <Sparkles size={20} strokeWidth={1.8} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                  Auto Reel Uploader
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Batch post reels with auto cover (2.jpg) & delay interval.
                </p>
              </div>
            </button>
          </div>
        </>
      )}

      {step === "auto_reel_choose" && (
        <>
          <button
            type="button"
            onClick={() => {
              setIsAutoReelFlow(false);
              setStep("type");
            }}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            Back to post types
          </button>

          <Card>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold tracking-[-0.8px] font-[family-name:var(--font-heading)]">
                Choose your Reels
              </h2>
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-[11px]"
                onClick={() => {
                  const allVideoIds = galleryItems.filter((i) => i.kind === "video").map((i) => i.id);
                  if (autoReelSelectedVideos.length === allVideoIds.length) {
                    setAutoReelSelectedVideos([]);
                  } else {
                    setAutoReelSelectedVideos(allVideoIds);
                  }
                }}
              >
                {autoReelSelectedVideos.length === galleryItems.filter((i) => i.kind === "video").length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {galleryItems.filter((item) => item.kind === "video").length === 0 ? (
                <div className="text-center py-8 text-text-muted text-sm border border-dashed border-border rounded-xl">
                  No videos found in your gallery. Please upload videos first.
                </div>
              ) : (
                galleryItems
                  .filter((item) => item.kind === "video")
                  .map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        autoReelSelectedVideos.includes(item.id)
                          ? "border-primary bg-primary/5"
                          : "border-border bg-surface hover:bg-surface-elevated"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={autoReelSelectedVideos.includes(item.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAutoReelSelectedVideos([...autoReelSelectedVideos, item.id]);
                          } else {
                            setAutoReelSelectedVideos(autoReelSelectedVideos.filter((id) => id !== item.id));
                          }
                        }}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                      <div className="w-14 h-14 bg-black/10 rounded flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                        <video
                          src={item.public_url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.file_name}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          Uploaded {new Date(item.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </label>
                  ))
              )}
            </div>

            {error && (
              <div className="bg-error/10 border border-error/20 text-error text-sm px-4 py-3 rounded-lg mt-4">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button
                disabled={autoReelSelectedVideos.length === 0}
                onClick={() => {
                  setError(null);
                  setStep("auto_reel_details");
                }}
              >
                Continue ({autoReelSelectedVideos.length} selected)
              </Button>
            </div>
          </Card>
        </>
      )}

      {step === "auto_reel_details" && (
        <>
          <button
            type="button"
            onClick={() => setStep("auto_reel_choose")}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            Back to reels selection
          </button>

          <Card>
            <h2 className="text-base font-bold tracking-[-0.8px] font-[family-name:var(--font-heading)] mb-4">
              Post Details
            </h2>

            <div className="space-y-4">
              {instagramAccounts.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor="auto-reel-credential-select" className="text-xs font-semibold text-foreground">
                    Publish to Instagram Account
                  </label>
                  <select
                    id="auto-reel-credential-select"
                    value={selectedCredentialId}
                    onChange={(e) => setSelectedCredentialId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-medium"
                  >
                    {instagramAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountName} ({acc.accountId})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Textarea
                id="caption"
                label="Caption"
                placeholder="Write your caption..."
                value={autoReelCaption}
                onChange={(e) => setAutoReelCaption(e.target.value)}
                charCount={{ current: autoReelCaption.length, max: 2200 }}
              />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Cover Page Image</p>
                {coverFile2 ? (
                  <div className="p-3 rounded-lg border border-success/20 bg-success/5 space-y-3">
                    <p className="text-xs text-success font-medium flex items-center gap-1">
                      <CheckCircle size={14} /> Always use `2.jpg` (found in gallery)
                    </p>
                    <img
                      src={coverFile2.public_url}
                      alt="Cover 2.jpg"
                      className="w-32 h-48 object-cover rounded-lg border border-border"
                    />
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-warning/20 bg-warning/5">
                    <p className="text-xs text-warning font-medium">
                      ⚠ Cover image `2.jpg` not found in gallery. Please upload a file named `2.jpg` to the gallery to use it as cover.
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-error/10 border border-error/20 text-error text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep("auto_reel_choose")}>
                  Back
                </Button>
                <Button onClick={() => setStep("auto_reel_time")}>
                  Continue to Time Settings
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {step === "auto_reel_time" && (
        <>
          <button
            type="button"
            onClick={() => setStep("auto_reel_details")}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            Back to post details
          </button>

          <Card>
            <h2 className="text-base font-bold tracking-[-0.8px] font-[family-name:var(--font-heading)] mb-2 flex items-center gap-1.5">
              <Clock size={18} strokeWidth={1.8} />
              Posting Interval
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Specify the time interval between posting each of the selected videos. The first video will publish immediately.
            </p>

            <div className="space-y-5">
              <div className="space-y-1">
                <label htmlFor="interval" className="text-xs font-semibold text-foreground">
                  Time between posts (minutes)
                </label>
                <Input
                  id="interval"
                  type="number"
                  min="1"
                  value={autoReelInterval}
                  onChange={(e) => setAutoReelInterval(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="border border-border rounded-xl p-3 bg-surface-elevated space-y-2">
                <p className="text-xs font-bold text-foreground">Posting Schedule Preview</p>
                <div className="space-y-2 text-xs text-text-muted max-h-[150px] overflow-y-auto pr-1">
                  {autoReelSelectedVideos.map((id, index) => {
                    const item = galleryItems.find((i) => i.id === id);
                    const timeDelay = index * autoReelInterval;
                    return (
                      <div key={id} className="flex justify-between items-center border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                        <span className="truncate max-w-[200px] font-medium text-foreground">{item?.file_name || "Video"}</span>
                        <span className="font-semibold text-primary">
                          {index === 0 ? "Publishing Immediately ⚡" : `Post after ${timeDelay} mins ⏰`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="bg-error/10 border border-error/20 text-error text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep("auto_reel_details")}>
                  Back
                </Button>
                <Button onClick={handleBatchSubmit} loading={submitting}>
                  <Send size={14} strokeWidth={1.8} />
                  Start Auto Reel Upload
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {step === "media" && postType && (
        <>
          <button
            type="button"
            onClick={() => setStep("type")}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            Back to post types
          </button>

          <Card>
            <h2 className="text-base font-bold tracking-[-0.8px] font-[family-name:var(--font-heading)] mb-4">
              Add {selectedTypeConfig?.mediaLabel}
            </h2>

            {isCarousel ? (
              <CarouselBuilder
                galleryItems={galleryItems}
                items={carouselItems}
                onChange={setCarouselItems}
              />
            ) : (
              <MediaInput
                galleryItems={galleryItems}
                allowedKinds={
                  selectedTypeConfig?.acceptsVideo
                    ? (["video"] as const)
                    : (["image"] as const)
                }
                accept={
                  selectedTypeConfig?.acceptsVideo
                    ? "video/mp4,video/quicktime"
                    : "image/jpeg,image/png,image/webp"
                }
                value={primaryMedia}
                onChange={setPrimaryMedia}
              />
            )}

            <div className="mt-6 flex justify-end">
              <Button
                disabled={mediaContinueDisabled}
                onClick={() => setStep("details")}
              >
                Continue
              </Button>
            </div>
          </Card>
        </>
      )}

      {step === "details" && postType && (
        <>
          <button
            type="button"
            onClick={() => setStep("media")}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            Back to media
          </button>

          <Card>
            <h2 className="text-base font-bold tracking-[-0.8px] font-[family-name:var(--font-heading)] mb-4">
              Post Details
            </h2>

            <div className="space-y-4">
              {instagramAccounts.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor="credential-select" className="text-xs font-semibold text-foreground">
                    Publish to Instagram Account
                  </label>
                  <select
                    id="credential-select"
                    value={selectedCredentialId}
                    onChange={(e) => setSelectedCredentialId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-medium"
                  >
                    {instagramAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountName} ({acc.accountId})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {needsCaption && (
                <Textarea
                  id="caption"
                  label="Caption"
                  placeholder="Write your caption..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  charCount={{ current: caption.length, max: 2200 }}
                />
              )}

              {isReel && (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">
                      Cover image (optional)
                    </p>
                    <p className="text-xs text-text-muted">
                      Upload, pick from gallery, or paste an image URL.
                    </p>
                    <MediaInput
                      galleryItems={galleryItems}
                      allowedKinds={["image"] as const}
                      accept="image/jpeg,image/png,image/webp"
                      value={coverItem}
                      onChange={setCoverItem}
                    />
                  </div>
                  <Input
                    id="audio_name"
                    label="Audio Name (optional)"
                    placeholder="Original audio"
                    icon={Music}
                    value={audioName}
                    onChange={(e) => setAudioName(e.target.value)}
                  />
                </>
              )}

              {error && (
                <div className="bg-error/10 border border-error/20 text-error text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep("media")}>
                  Back
                </Button>
                <Button onClick={handleSubmit} loading={submitting}>
                  <Send size={14} strokeWidth={1.8} />
                  Publish Now
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Auto Reel flow specifics on the result screen */}
      {isAutoReelFlow && step === "result" && (
        <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5 text-left text-sm space-y-2 max-w-md mx-auto">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles size={16} className="text-primary animate-pulse" />
            Auto Reel Batch Started Successfully!
          </p>
          <p className="text-text-muted text-xs">
            The first video is publishing now. The remaining <strong>{autoReelSelectedVideos.length - 1}</strong> videos have been queued to post every <strong>{autoReelInterval} minutes</strong> in the background.
          </p>
        </div>
      )}
    </div>
  );
}
