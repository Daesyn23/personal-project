import { NextResponse } from "next/server";
import { getGoogleOAuth2Client } from "@/lib/google-sheets-server";
import {
  fetchAllPlaylistItems,
  fetchAllPlaylistItemsOAuth,
  fetchPlaylistTitle,
  fetchPlaylistTitleOAuth,
  resolveYoutubeDataApiKey,
} from "@/lib/youtube-data-playlist";
import { parseYoutubePlaylistRss } from "@/lib/parse-youtube-playlist-rss";

export const runtime = "nodejs";

const RSS = "https://www.youtube.com/feeds/videos.xml?playlist_id=";

function oauthSetupMissing(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/.test(msg) ||
    /No Google refresh token yet/.test(msg)
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const playlistId = url.searchParams.get("playlistId")?.trim();
  if (!playlistId || !/^[\w-]+$/.test(playlistId)) {
    return NextResponse.json({ error: "Missing or invalid playlistId." }, { status: 400 });
  }

  const apiKey = resolveYoutubeDataApiKey();

  if (apiKey) {
    try {
      const [playlistTitle, videos] = await Promise.all([
        fetchPlaylistTitle(apiKey, playlistId),
        fetchAllPlaylistItems(apiKey, playlistId),
      ]);

      return NextResponse.json({
        playlistId,
        playlistTitle,
        videos,
        source: "youtube_data_api" as const,
        feedNote:
          videos.length > 0
            ? "Full playlist loaded via YouTube Data API (server API key)."
            : "No videos returned from the API for this playlist.",
      });
    } catch (e) {
      console.error("[api/youtube/playlist] Data API (key) failed, trying OAuth or RSS", e);
    }
  }

  try {
    const auth = await getGoogleOAuth2Client();
    const [playlistTitle, videos] = await Promise.all([
      fetchPlaylistTitleOAuth(auth, playlistId),
      fetchAllPlaylistItemsOAuth(auth, playlistId),
    ]);

    return NextResponse.json({
      playlistId,
      playlistTitle,
      videos,
      source: "youtube_oauth" as const,
      feedNote:
        videos.length > 0
          ? "Full playlist via your Google account (same Connect Google as Sheets). If you connected before YouTube was linked, press Reconnect Google once to approve YouTube access."
          : "No videos returned from the API for this playlist.",
    });
  } catch (e) {
    if (!oauthSetupMissing(e)) {
      console.error("[api/youtube/playlist] Data API (OAuth) failed, falling back to RSS", e);
    }
  }

  try {
    const feedUrl = `${RSS}${encodeURIComponent(playlistId)}`;
    const res = await fetch(feedUrl, {
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "Mozilla/5.0 (compatible; LessonPrep/1.0)",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `YouTube feed returned ${res.status}. Try again later.` },
        { status: 502 }
      );
    }

    const xml = await res.text();
    const { playlistTitle, videos } = parseYoutubePlaylistRss(xml);

    const rssHint =
      apiKey == null
        ? "YouTube’s playlist RSS feed only returns about the latest 15 videos (YouTube’s limit; there is no “next page” to fetch). For every video in the playlist, use YOUTUBE_API_KEY or Connect Google on the Sheet tab with YouTube Data API v3 enabled on the same Google Cloud project."
        : "API key failed; showing RSS-only subset (~15). Check quota/credentials, or use Connect Google + OAuth on the Sheet tab.";

    return NextResponse.json({
      playlistId,
      playlistTitle,
      videos,
      source: "rss" as const,
      feedNote:
        videos.length > 0
          ? rssHint
          : "No videos found in this playlist feed.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load playlist.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
