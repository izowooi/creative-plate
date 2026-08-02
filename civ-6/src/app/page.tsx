import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Map, Palette, Sparkles } from "lucide-react";
import { categoryMeta, categoryValues, type Category, type Entry } from "@/lib/content";
import { getAllEntries, getCategoryCounts } from "@/lib/db";
import { EntryCard } from "@/components/entry-card";
import { HistoryImage } from "@/components/history-image";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

function chooseFeatured(entries: Entry[]) {
  const desiredCategories: Category[] = ["leaders", "cities", "great-people", "great-works"];
  return desiredCategories
    .map(
      (category) =>
        entries.find((entry) => entry.category === category && entry.featured) ??
        entries.find((entry) => entry.category === category),
    )
    .filter((entry): entry is Entry => Boolean(entry));
}

export default function Home() {
  const entries = getAllEntries();
  const counts = getCategoryCounts();
  const featured = chooseFeatured(entries);
  const spotlight =
    entries.find((entry) => entry.slug.includes("seondeok")) ??
    entries.find((entry) => entry.featured) ??
    entries[0];
  const sourceCount = entries.reduce((total, entry) => total + entry.sources.length, 0);

  return (
    <>
      <section className="hero-stage" aria-labelledby="hero-title">
        <Image
          src="/images/generated/history-objects-hero.png"
          alt="청동 천문 도구와 오래된 지도, 석상, 푸른 유리구가 놓인 현대적 역사 정물"
          fill
          preload
          sizes="100vw"
        />
        <div className="hero-content page-shell">
          <p className="hero-kicker">A HISTORY EDITORIAL FOR EVERY TURN</p>
          <h1 id="hero-title" className="hero-title">
            아는 만큼,
            <br />다음 턴이 달라진다.
          </h1>
          <p className="hero-description">
            게임 속 한 줄의 이름을 실제로 숨 쉬었던 사람과 장소, 작품의 이야기로 되돌립니다.
            선덕여왕부터 상트페테르부르크와 《사계》까지, 세계사를 알고 다시 플레이하세요.
          </p>
          <div className="hero-actions">
            <Link href="/explore" className="primary-button gap-2">
              아카이브 탐험하기 <ArrowRight size={17} />
            </Link>
            <Link href="/about" className="secondary-button">
              이 프로젝트의 관점
            </Link>
          </div>
        </div>
        <p className="hero-meta">현대적 재구성 이미지 · OpenAI ImageGen</p>
      </section>

      <div className="stat-strip">
        <div className="page-shell grid grid-cols-4">
          <div className="stat-item"><strong>{entries.length}</strong><span>이야기</span></div>
          <div className="stat-item"><strong>{sourceCount}</strong><span>참고 자료</span></div>
          <div className="stat-item"><strong>{categoryValues.length}</strong><span>관점</span></div>
          <div className="stat-item"><strong>100%</strong><span>출처 표기</span></div>
        </div>
      </div>

      <section className="section-space page-shell">
        <Reveal>
          <SectionHeading
            eyebrow="Start somewhere"
            title="게임에서 만난 이름, 이제는 이야기로."
            description="익숙한 초상과 도시 이름, 게임 속 걸작을 다섯 가지 렌즈로 펼쳐 보세요. 각 글은 역사 기록과 게임의 표현을 구분해 설명합니다."
          />
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {categoryValues.map((category, index) => {
            const meta = categoryMeta[category];
            const icons: Record<Category, React.ReactNode> = {
              leaders: <Sparkles size={21} strokeWidth={1.6} />,
              civilizations: <BookOpen size={21} strokeWidth={1.6} />,
              cities: <Map size={21} strokeWidth={1.6} />,
              "great-people": <span className="text-xl leading-none">✦</span>,
              "great-works": <Palette size={21} strokeWidth={1.6} />,
            };
            return (
              <Reveal key={category} delay={index * 0.06}>
                <Link href={`/explore?category=${category}`} className="category-panel block">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-full bg-ink text-white">
                      {icons[category]}
                    </span>
                    <span className="text-xs font-medium text-soft">{counts[category] ?? 0} ARTICLES</span>
                  </div>
                  <h3 className="mt-16 text-[2rem] font-semibold tracking-[-0.05em]">{meta.label}</h3>
                  <p className="relative z-10 mt-3 max-w-[260px] text-sm leading-6 text-muted">{meta.description}</p>
                  <span className="category-number" aria-hidden="true">0{index + 1}</span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {spotlight ? (
        <section className="border-y border-line bg-surface py-[clamp(84px,12vw,160px)]">
          <div className="page-shell grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
            <Reveal className="relative aspect-[5/4] overflow-hidden rounded-[30px] bg-[#e4e2dc]">
              <HistoryImage
                src={spotlight.image ?? ""}
                alt={spotlight.imageAlt || `${spotlight.name} 관련 자료 이미지`}
                className="h-full w-full object-cover"
                sizes="(max-width: 1024px) 100vw, 56vw"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-5 pb-5 pt-16 text-[11px] leading-5 text-white/70">
                {spotlight.imageCredit || "역사 자료 이미지"} · {spotlight.imageLicense || "출처 상세 페이지 참고"}
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="eyebrow">Editor&apos;s focus · {categoryMeta[spotlight.category].label}</p>
              <h2 className="mt-5 text-balance text-[clamp(2.8rem,6vw,5.8rem)] font-semibold leading-[0.98] tracking-[-0.065em]">
                {spotlight.name}
              </h2>
              <p className="mt-3 text-lg text-soft">{spotlight.nameEn} · {spotlight.era}</p>
              <p className="mt-8 text-[17px] leading-8 text-muted">{spotlight.summary}</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {spotlight.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full border border-line px-3 py-1.5 text-xs text-muted">{tag}</span>
                ))}
              </div>
              <Link href={`/archive/${spotlight.slug}`} className="primary-button mt-10 gap-2">
                전체 이야기 읽기 <ArrowRight size={17} />
              </Link>
            </Reveal>
          </div>
        </section>
      ) : null}

      <section className="section-space page-shell">
        <Reveal>
          <SectionHeading
            eyebrow="Curated stories"
            title="오늘, 네 개의 이야기로 떠나보세요."
            description="한 명의 지도자와 하나의 도시, 한 사람의 위인과 한 작품을 차례로 읽으면 서로 멀어 보이던 사건들이 연결되기 시작합니다."
          />
        </Reveal>
        <div className="grid gap-x-6 gap-y-14 sm:grid-cols-2 xl:grid-cols-4">
          {featured.map((entry, index) => (
            <Reveal key={entry.slug} delay={index * 0.08}>
              <EntryCard
                entry={entry}
                priority={index === 0}
                sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 25vw"
              />
            </Reveal>
          ))}
        </div>
        <div className="mt-14 flex justify-center">
          <Link href="/explore" className="secondary-button gap-2">
            모든 이야기 보기 <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="pb-[clamp(84px,12vw,160px)]">
        <div className="page-shell">
          <Reveal className="quote-stage">
            <span className="quote-mark">“</span>
            <p className="quote-copy">역사는 외우는 것이 아니라, 다음 선택을 다르게 보게 하는 렌즈다.</p>
            <p className="relative z-10 mt-10 max-w-xl text-sm leading-6 text-white/55">
              게임은 시대를 압축합니다. THE TURN은 그 압축을 다시 천천히 펼칩니다.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-line bg-surface py-[clamp(84px,11vw,140px)]">
        <div className="page-shell">
          <Reveal>
            <SectionHeading
              eyebrow="Across the ages"
              title="시간을 따라 발견하기."
              description="게임의 시대 구분과 실제 역사학의 구분은 같지 않습니다. 각 글에서 그 차이도 함께 짚습니다."
            />
          </Reveal>
          <div className="era-rail">
            {["고대·고전", "중세", "르네상스·근세", "산업·근대", "여러 시대"].map((label, index) => (
              <div className="era-node" key={label}>
                <span className="text-xs font-semibold text-cobalt">0{index + 1}</span>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">{label}</p>
                <p className="mt-2 text-xs leading-5 text-soft">사람과 지식, 도시가 연결된 순간들</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
