import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface py-12 sm:py-16">
      <div className="page-shell grid gap-10 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Logo />
          <p className="mt-5 max-w-md text-sm leading-6 text-muted">
            게임의 한 턴을 실제 세계사의 얼굴과 장소로 연결하는 비공식 역사
            에디토리얼입니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted">
          <Link href="/explore" className="hover:text-ink">아카이브</Link>
          <Link href="/about" className="hover:text-ink">편집 원칙과 출처</Link>
          <a href="#top" className="hover:text-ink">맨 위로</a>
        </div>
        <p className="border-t border-line pt-6 text-xs leading-5 text-soft md:col-span-2">
          THE TURN은 2K 또는 Firaxis Games와 제휴하지 않은 비공식 팬 프로젝트입니다.
          Civilization 및 관련 표장은 각 권리자의 자산입니다. 역사 이미지의 권리는 각
          상세 페이지에 별도로 표기합니다.
        </p>
      </div>
    </footer>
  );
}
