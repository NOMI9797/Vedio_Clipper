/**
 * Normalize provider language strings to ISO 639-1 (best effort).
 */
export function toIso639_1(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") {
    return "und";
  }
  const t = raw.trim().toLowerCase();
  if (t.length === 2 && /^[a-z]{2}$/.test(t)) {
    return t;
  }
  const beforeDash = t.split(/[-_]/)[0] ?? t;
  if (beforeDash.length === 2 && /^[a-z]{2}$/.test(beforeDash)) {
    return beforeDash;
  }
  const map: Record<string, string> = {
    english: "en",
    spanish: "es",
    french: "fr",
    german: "de",
    italian: "it",
    portuguese: "pt",
    japanese: "ja",
    chinese: "zh",
    korean: "ko",
    hindi: "hi",
    arabic: "ar",
    russian: "ru",
  };
  return map[t] ?? "und";
}
