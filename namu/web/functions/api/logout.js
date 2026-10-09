import { clearedCookie, json } from "../../server/auth.js";

export async function onRequestPost() {
  return json({ ok: true }, 200, { "Set-Cookie": clearedCookie() });
}
