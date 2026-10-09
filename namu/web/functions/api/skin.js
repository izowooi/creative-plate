import { json } from "../../server/auth.js";
import { fetchSkin } from "../../server/skin.js";

export async function onRequestGet({ request }) {
  const path = new URL(request.url).searchParams.get("path");
  const result = await fetchSkin({ path, cache: globalThis.caches ? caches.default : null });
  return result.response || json({ error: result.error }, result.status);
}
