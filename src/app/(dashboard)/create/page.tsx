import { createClient } from "@/lib/supabase/server";
import { PostForm } from "@/components/create-post/post-form";
import { syncUserMediaFromStorage } from "@/lib/user-media-sync";
import type { UserMediaRow } from "@/types/database";

export default async function CreatePostPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await syncUserMediaFromStorage(user.id);
  }

  const { data: credentials } = await supabase
    .from("platform_credentials")
    .select("id, platform, credentials")
    .eq("is_active", true);

  const availablePlatforms = Array.from(
    new Set((credentials ?? []).map((c) => c.platform as string))
  );

  const instagramAccounts = (credentials ?? [])
    .filter((c) => c.platform === "instagram")
    .map((c) => {
      const creds = (c.credentials ?? {}) as Record<string, string>;
      return {
        id: c.id as string,
        accountName: creds.account_name || "Instagram Account",
        accountId: creds.account_id || "",
      };
    });

  let galleryRows: UserMediaRow[] = [];
  if (user) {
    const { data } = await supabase
      .from("user_media")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    galleryRows = (data ?? []) as UserMediaRow[];
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-[-0.8px] font-[family-name:var(--font-heading)] text-foreground">
          Create Post
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Choose a post type and add your content
        </p>
      </div>

      <PostForm
        availablePlatforms={availablePlatforms}
        instagramAccounts={instagramAccounts}
        galleryItems={galleryRows}
      />
    </div>
  );
}
