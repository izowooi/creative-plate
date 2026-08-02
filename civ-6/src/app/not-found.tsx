import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page-shell grid min-h-[70svh] place-items-center py-20 text-center">
      <div>
        <p className="eyebrow">404 · Lost in time</p>
        <h1 className="mt-5 text-balance text-[clamp(3.2rem,9vw,7rem)] font-semibold leading-[0.95] tracking-[-0.07em]">
          이 기록은 아직<br />발견되지 않았습니다.
        </h1>
        <p className="mx-auto mt-7 max-w-lg text-[17px] leading-7 text-muted">주소가 달라졌거나 준비 중인 이야기일 수 있습니다.</p>
        <Link href="/explore" className="primary-button mt-9 gap-2"><ArrowLeft size={16} /> 아카이브로</Link>
      </div>
    </div>
  );
}
