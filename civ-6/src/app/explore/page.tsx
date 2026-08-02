import type { Metadata } from "next";
import { ExploreBrowser } from "@/components/explore-browser";
import { getAllEntries } from "@/lib/db";

export const metadata: Metadata = {
  title: "아카이브 탐험",
  description: "지도자, 문명, 도시, 위인을 이름과 시대, 키워드로 탐색하세요.",
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; era?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const entries = getAllEntries();

  return (
    <div className="page-shell pb-24 pt-16 sm:pt-24">
      <div className="mb-10 max-w-4xl sm:mb-14">
        <p className="eyebrow">The archive</p>
        <h1 className="display-title mt-5">이름 하나에서<br />시대 전체로.</h1>
        <p className="mt-7 max-w-2xl text-[17px] leading-8 text-muted">
          게임에서 마주친 인물과 장소를 검색하세요. 역사적 맥락, 게임에서의 표현,
          더 읽을 수 있는 원문 출처까지 한곳에 모았습니다.
        </p>
      </div>
      <ExploreBrowser
        key={`${params.q ?? ""}|${params.category ?? ""}|${params.era ?? ""}|${params.sort ?? ""}`}
        entries={entries}
        initialQuery={params.q ?? ""}
        initialCategory={params.category ?? ""}
        initialEra={params.era ?? ""}
        initialSort={params.sort ?? "editorial"}
      />
    </div>
  );
}
