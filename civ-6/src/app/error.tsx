"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-shell grid min-h-[70svh] place-items-center py-20 text-center">
      <div className="max-w-2xl">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#f3dfd9] text-[#9d3828]">
          <AlertTriangle size={21} />
        </span>
        <p className="eyebrow mt-7">Archive temporarily unavailable</p>
        <h1 className="mt-5 text-balance text-[clamp(2.8rem,7vw,5.6rem)] font-semibold leading-[0.98] tracking-[-0.065em]">
          기록을 여는 중<br />문제가 생겼습니다.
        </h1>
        <p className="mx-auto mt-7 max-w-lg text-[16px] leading-7 text-muted">
          잠시 후 다시 시도해 주세요. 로컬 데이터 파일을 갱신한 직후라면 개발 서버를
          재시작하거나 <code className="rounded bg-black/5 px-1.5 py-0.5">npm run db:seed</code>를 확인하세요.
        </p>
        <button className="primary-button mt-9 gap-2" onClick={reset}>
          <RotateCcw size={16} /> 다시 시도
        </button>
      </div>
    </div>
  );
}
