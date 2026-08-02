const localSiteUrl = "http://localhost:3000";

export function getSiteUrl() {
  const configured = process.env.SITE_URL?.trim() || localSiteUrl;
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SITE_URL은 http 또는 https URL이어야 합니다.");
  }
  return url.origin;
}
