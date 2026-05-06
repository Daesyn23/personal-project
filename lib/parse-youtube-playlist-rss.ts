export type YoutubePlaylistVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string | null;
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Pick largest thumbnail by declared width. */
function pickThumbnail(entryXml: string): string {
  const re = /<media:thumbnail[^>]+url="([^"]+)"[^>]*width="(\d+)"/g;
  let bestUrl = "";
  let bestW = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(entryXml)) !== null) {
    const w = parseInt(m[2], 10);
    if (Number.isFinite(w) && w >= bestW) {
      bestW = w;
      bestUrl = m[1];
    }
  }
  if (bestUrl) return bestUrl;
  const fallback = /<media:thumbnail[^>]+url="([^"]+)"/.exec(entryXml);
  return fallback?.[1] ?? "";
}

export function parseYoutubePlaylistRss(xml: string): {
  playlistTitle: string | null;
  videos: YoutubePlaylistVideo[];
} {
  const entryIdx = xml.indexOf("<entry>");
  const head = entryIdx > 0 ? xml.slice(0, entryIdx) : xml;
  const titleMatch = head.match(/<title>([^<]*)<\/title>/);
  const playlistTitle = titleMatch?.[1] ? decodeXmlEntities(titleMatch[1].trim()) : null;

  const videos: YoutubePlaylistVideo[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let em: RegExpExecArray | null;
  while ((em = entryRe.exec(xml)) !== null) {
    const block = em[1];
    const vid = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(block);
    if (!vid?.[1]) continue;
    const videoId = vid[1].trim();
    const tm = /<title>([^<]*)<\/title>/.exec(block);
    const title = tm?.[1] ? decodeXmlEntities(tm[1].trim()) : videoId;
    const pub = /<published>([^<]+)<\/published>/.exec(block);
    const publishedAt = pub?.[1]?.trim() ?? null;
    let thumbnailUrl = pickThumbnail(block);
    if (!thumbnailUrl) {
      thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
    videos.push({ videoId, title, thumbnailUrl, publishedAt });
  }

  return { playlistTitle, videos };
}
