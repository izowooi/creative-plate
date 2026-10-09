// 정적 산출물(dist/)을 만든다. 확장 프로그램의 lib/ 를 그대로 복사해 파서·수집기를 한 곳에서만 유지한다.
// Cloudflare Pages 빌드는 저장소 전체를 체크아웃하므로 root_dir 밖(../extension)도 읽을 수 있다.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const extension = join(here, "..", "extension");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "lib"), { recursive: true });

for (const name of readdirSync(join(here, "src"))) {
  if (name !== "hosted.css") cpSync(join(here, "src", name), join(dist, name), { recursive: true });
}
for (const name of readdirSync(join(extension, "lib"))) {
  cpSync(join(extension, "lib", name), join(dist, "lib", name));
}
// 확장의 뷰어와 같은 모양을 쓰되 호스팅 전용 스타일을 덧붙인다
writeFileSync(join(dist, "style.css"),
  readFileSync(join(extension, "viewer.css"), "utf8") + "\n" + readFileSync(join(here, "src", "hosted.css"), "utf8"));
console.log(`dist 생성 완료: ${readdirSync(dist).join(", ")}`);
