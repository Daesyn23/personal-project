/** Curated JLPT lesson playlists (public YouTube playlists). */
export type JlptPlaylistKey = "n5" | "n4" | "n3";

export type JlptPlaylistDef = {
  key: JlptPlaylistKey;
  label: string;
  /** Full playlist URL for “open full playlist on YouTube”. */
  playlistUrl: string;
  playlistId: string;
};

export const JLPT_YOUTUBE_PLAYLISTS: JlptPlaylistDef[] = [
  {
    key: "n5",
    label: "JLPT N5",
    playlistUrl: "https://www.youtube.com/playlist?list=PLag_mhJfCJ-1-EZcPapMFPTlzVzwjz33M",
    playlistId: "PLag_mhJfCJ-1-EZcPapMFPTlzVzwjz33M",
  },
  {
    key: "n4",
    label: "JLPT N4",
    playlistUrl: "https://www.youtube.com/playlist?list=PLag_mhJfCJ-2sBVFtpD-tI79jmR4G02lN",
    playlistId: "PLag_mhJfCJ-2sBVFtpD-tI79jmR4G02lN",
  },
  {
    key: "n3",
    label: "JLPT N3",
    playlistUrl: "https://www.youtube.com/playlist?list=PLag_mhJfCJ-1C8Keyl9bOFhpMT_XHxOOy",
    playlistId: "PLag_mhJfCJ-1C8Keyl9bOFhpMT_XHxOOy",
  },
];
