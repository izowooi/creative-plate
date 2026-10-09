import { json } from "../../server/auth.js";

// 미들웨어를 통과했다면 로그인된 상태다.
export async function onRequestGet() {
  return json({ ok: true });
}
