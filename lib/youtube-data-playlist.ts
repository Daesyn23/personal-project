import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import type { YoutubePlaylistVideo } from "@/lib/parse-youtube-playlist-rss";

/** Server-side: try dedicated env first, then generic Google Cloud API key. */
export function resolveYoutubeDataApiKey(): string | undefined {
  const a = process.env.YOUTUBE_API_KEY?.trim();
  const b = process.env.GOOGLE_API_KEY?.trim();
  return a || b || undefined;
}

function thumbUrl(snippet: {
  thumbnails?: {
    maxres?: { url?: string | null };
    high?: { url?: string | null };
    medium?: { url?: string | null };
    default?: { url?: string | null };
  };
}): string | undefined {
  const t = snippet.thumbnails;
  const pick = (u?: { url?: string | null }) =>
    typeof u?.url === "string" && u.url.trim() ? u.url : undefined;
  return pick(t?.maxres) || pick(t?.high) || pick(t?.medium) || pick(t?.default);
}

export async function fetchPlaylistTitle(apiKey: string, playlistId: string): Promise<string | null> {
  const u = new URL("https://www.googleapis.com/youtube/v3/playlists");
  u.searchParams.set("part", "snippet");
  u.searchParams.set("id", playlistId);
  u.searchParams.set("key", apiKey);
  const res = await fetch(u.toString(), { next: { revalidate: 3600 } });
  const json = (await res.json()) as {
    items?: { snippet?: { title?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    console.error("[youtube-data-api] playlists.list", json.error?.message ?? res.status);
    return null;
  }
  const title = json.items?.[0]?.snippet?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

/** Paginates through every playlistItems page (full playlist). */
export async function fetchAllPlaylistItems(apiKey: string, playlistId: string): Promise<YoutubePlaylistVideo[]> {
  const out: YoutubePlaylistVideo[] = [];
  let pageToken: string | undefined;

  do {
    const u = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    u.searchParams.set("part", "snippet,contentDetails");
    u.searchParams.set("maxResults", "50");
    u.searchParams.set("playlistId", playlistId);
    u.searchParams.set("key", apiKey);
    if (pageToken) u.searchParams.set("pageToken", pageToken);

    const res = await fetch(u.toString(), { next: { revalidate: 600 } });
    const json = (await res.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          resourceId?: { videoId?: string };
          publishedAt?: string;
          thumbnails?: {
            maxres?: { url?: string };
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
        contentDetails?: { videoPublishedAt?: string };
      }>;
      nextPageToken?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      throw new Error(json.error?.message || `YouTube API ${res.status}`);
    }

    const items = json.items ?? [];
    for (const item of items) {
      const vid = item.snippet?.resourceId?.videoId?.trim();
      if (!vid) continue;
      const title = (item.snippet?.title ?? vid).trim();
      const thumbnailUrl = thumbUrl(item.snippet ?? {}) || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      const publishedAt = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? null;
      out.push({
        videoId: vid,
        title,
        thumbnailUrl,
        publishedAt: publishedAt ?? null,
      });
    }

    pageToken = json.nextPageToken;
  } while (pageToken);

  return out;
}

export async function fetchPlaylistTitleOAuth(
  auth: OAuth2Client,
  playlistId: string
): Promise<string | null> {
  const yt = google.youtube({ version: "v3", auth });
  const res = await yt.playlists.list({
    part: ["snippet"],
    id: [playlistId],
  });
  const title = res.data.items?.[0]?.snippet?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

export async function fetchAllPlaylistItemsOAuth(
  auth: OAuth2Client,
  playlistId: string
): Promise<YoutubePlaylistVideo[]> {
  const yt = google.youtube({ version: "v3", auth });
  const out: YoutubePlaylistVideo[] = [];
  let pageToken: string | undefined;

  do {
    const res = await yt.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId,
      maxResults: 50,
      pageToken,
    });

    const items = res.data.items ?? [];
    for (const item of items) {
      const vid = item.snippet?.resourceId?.videoId?.trim();
      if (!vid) continue;
      const title = (item.snippet?.title ?? vid).trim();
      const thumbnailUrl =
        thumbUrl(item.snippet ?? {}) || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      const publishedAt =
        item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? null;
      out.push({
        videoId: vid,
        title,
        thumbnailUrl,
        publishedAt: publishedAt ?? null,
      });
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return out;
}
