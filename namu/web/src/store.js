// Crawler 가 쓰는 {get, set} 저장소 인터페이스를 Supabase(/api/db 중계)로 구현한다.
// 키 규칙(확장 프로그램의 chrome.storage 와 같다): page:<key> -> nw_pages, css:* / font:* -> nw_assets, index -> 최근 문서 목록.
const enc = encodeURIComponent;
const toSeconds = (iso) => Date.parse(iso) / 1000;

export class DbError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function pageFromRow(row) {
  return { title: row.title, url: row.final_url, status: row.status, html: row.html, via: row.via, note: row.note, fetched_at: toSeconds(row.fetched_at) };
}

export class SupabaseStore {
  constructor({ fetchImpl = (...a) => fetch(...a), base = "/api/db", now = () => Date.now() } = {}) {
    Object.assign(this, { fetchImpl, base, now });
    this.assets = new Map(); // CSS(수백 KB)는 문서를 열 때마다 받지 않도록 세션 동안 메모리에 둔다
  }

  async request(path, init = {}) {
    const res = await this.fetchImpl(`${this.base}/${path}`, { credentials: "same-origin", ...init });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new DbError(`DB 오류 ${res.status}: ${detail}`, res.status);
    }
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  async upsert(table, row) {
    await this.request(`${table}?on_conflict=key`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
  }

  async get(keys) {
    const out = {};
    for (const key of typeof keys === "string" ? [keys] : keys) {
      const value = await this.getOne(key);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  async getOne(key) {
    if (key === "index") {
      const rows = await this.request("nw_pages?select=key,title,status,via,fetched_at&order=fetched_at.desc&limit=100");
      return Object.fromEntries(rows.map((r) => [r.key, { title: r.title, status: r.status, via: r.via, fetched_at: toSeconds(r.fetched_at) }]));
    }
    if (key.startsWith("page:")) {
      const rows = await this.request(`nw_pages?key=eq.${enc(key.slice(5))}&select=*&limit=1`);
      return rows[0] ? pageFromRow(rows[0]) : undefined;
    }
    if (key.startsWith("css:") || key.startsWith("font:")) {
      if (this.assets.has(key)) return this.assets.get(key);
      const rows = await this.request(`nw_assets?key=eq.${enc(key)}&select=body&limit=1`);
      if (!rows[0]) return undefined;
      this.assets.set(key, rows[0].body);
      return rows[0].body;
    }
    return undefined;
  }

  async set(items) {
    for (const [key, value] of Object.entries(items)) {
      if (key === "index") continue; // 목록은 nw_pages 에서 바로 만든다
      if (key.startsWith("page:")) {
        await this.upsert("nw_pages", {
          key: key.slice(5), title: value.title, status: value.status, final_url: value.url ?? null, via: value.via,
          note: value.note ?? "", html: value.html ?? "", fetched_at: new Date(value.fetched_at * 1000).toISOString(),
        });
      } else if (key.startsWith("css:") || key.startsWith("font:")) {
        await this.upsert("nw_assets", { key, kind: key.split(":", 1)[0], body: value, fetched_at: new Date(this.now()).toISOString() });
        this.assets.set(key, value);
      }
    }
  }

  // ----- 수집 대기열 -----

  async enqueue(title) {
    try {
      await this.request("nw_jobs", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ title }) });
      return { queued: true };
    } catch (e) {
      if (e.status === 409) return { queued: false, duplicate: true }; // 같은 문서가 이미 대기/진행 중
      throw e;
    }
  }

  async jobs(limit = 30) {
    return this.request(`nw_jobs?select=*&order=requested_at.desc&limit=${limit}`);
  }

  async clearFinishedJobs() {
    await this.request("nw_jobs?status=in.(done,not_found,error)", { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
}
