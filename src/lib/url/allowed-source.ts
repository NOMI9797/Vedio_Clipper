const YT_HOST = /^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)$/;
const IG_HOST = /^(www\.)?instagram\.com$/;
const FB_HOST = /^(www\.|m\.)?facebook\.com$/;

/**
 * YouTube, Instagram, or Facebook public video URLs accepted for link import.
 * Worker (yt-dlp) runs later; this is URL-shape validation only.
 */
export function parseSupportedVideoUrl(raw: string):
  | { ok: true; href: string; kind: "youtube" | "instagram" | "facebook" }
  | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 2000) {
    return { ok: false, reason: "URL length is invalid" };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reason: "Only http(s) links are allowed" };
  }
  const host = u.hostname.toLowerCase();
  if (YT_HOST.test(host) && isYouTubePath(u)) {
    return { ok: true, href: u.toString(), kind: "youtube" };
  }
  if (IG_HOST.test(host) && isInstagramPath(u)) {
    return { ok: true, href: u.toString(), kind: "instagram" };
  }
  if (host === "fb.watch" && u.pathname.length > 1) {
    return { ok: true, href: u.toString(), kind: "facebook" };
  }
  if (FB_HOST.test(host) && isFacebookPath(u)) {
    return { ok: true, href: u.toString(), kind: "facebook" };
  }
  return {
    ok: false,
    reason: "Use a public YouTube, Instagram, or Facebook video link",
  };
}

function isYouTubePath(u: URL): boolean {
  if (u.hostname.replace(/^www\./, "") === "youtu.be") {
    return u.pathname.length > 1;
  }
  const p = u.pathname;
  if (p === "/watch" && u.searchParams.get("v")) {
    return true;
  }
  if (p.startsWith("/shorts/") || p.startsWith("/embed/") || p.startsWith("/live/")) {
    return true;
  }
  return false;
}

function isInstagramPath(u: URL): boolean {
  const p = u.pathname;
  return (
    /^\/(p|reel|reels|tv)\/[^/]+/.test(p) || /^\/[^/]+\/reel\//.test(p)
  );
}

function isFacebookPath(u: URL): boolean {
  const p = u.pathname;
  if (p === "/watch" && (u.searchParams.get("v") || u.searchParams.get("video_id"))) {
    return true;
  }
  if (p.startsWith("/watch/") || p.includes("/videos/")) {
    return true;
  }
  if (p.includes("/reel/") || p.includes("/reels/") || p.includes("share/p/")) {
    return true;
  }
  return p.length > 1 && p !== "/" && u.searchParams.has("v");
}
