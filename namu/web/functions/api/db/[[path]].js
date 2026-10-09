import { json } from "../../../server/auth.js";
import { proxyDb } from "../../../server/db.js";

export async function onRequest({ request, env, data, params }) {
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const result = await proxyDb({ request, env, token: data.token, parts });
  return result.response || json({ error: result.error }, result.status);
}
