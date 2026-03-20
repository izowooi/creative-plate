import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // R2 캐시를 붙이고 싶다면 여기에서 incremental cache override 를 켤 수 있습니다.
});
