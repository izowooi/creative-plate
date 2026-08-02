import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpenText, Clock3, Gamepad2, MapPin } from "lucide-react";
import { categoryMeta } from "@/lib/content";
import { getAllEntries, getEntryBySlug, getRelatedEntries } from "@/lib/db";
import { EntryCard } from "@/components/entry-card";
import { HistoryImage } from "@/components/history-image";
import { MarkdownArticle } from "@/components/markdown-article";
import { Reveal } from "@/components/reveal";
import { extractHeadings, imageLicenseUrl, relationReason, withoutTrailingSources } from "@/lib/presentation";

export function generateStaticParams() {
  return getAllEntries().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getEntryBySlug(slug);
  if (!entry) notFound();
  return {
    title: entry.name,
    description: entry.summary,
    openGraph: entry.image
      ? { title: entry.name, description: entry.summary, images: [{ url: entry.image }] }
      : undefined,
  };
}

export default async function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getEntryBySlug(slug);
  if (!entry) notFound();

  const articleBody = withoutTrailingSources(entry.body);
  const headings = extractHeadings(articleBody);
  const related = getRelatedEntries(entry, 3);
  const meta = categoryMeta[entry.category];

  return (
    <article>
      <header className="detail-header">
        <div className="page-shell">
          <nav className="detail-breadcrumb" aria-label="현재 위치">
            <Link href="/explore">아카이브</Link><span>/</span>
            <Link href={`/explore?category=${entry.category}`}>{meta.label}</Link>
          </nav>
          <div className="detail-title-grid">
            <div>
              <p className="eyebrow">{meta.label} · {entry.era}</p>
              <h1>{entry.name}</h1>
              <p className="detail-name-en">{entry.nameEn}{entry.lifespan ? ` · ${entry.lifespan}` : ""}</p>
            </div>
            <div className="self-end">
              <p className="detail-thesis">{entry.summary}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {entry.tags.slice(0, 5).map((tag) => <span className="detail-tag" key={tag}>{tag}</span>)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="page-shell">
        <figure className="detail-figure">
          <div className="detail-image-wrap">
            <HistoryImage
              src={entry.image}
              alt={entry.imageAlt || `${entry.name} 관련 역사 이미지`}
              className="h-full w-full object-cover"
              sizes="(max-width: 768px) 100vw, 1280px"
              preload
            />
          </div>
          <figcaption>
            <span>{entry.imageCredit} · 웹 표시를 위해 리사이즈·크롭</span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <a href={imageLicenseUrl(entry.imageLicense)} target="_blank" rel="noreferrer">
                {entry.imageLicense} <ArrowUpRight size={12} />
              </a>
              <a href={entry.imageSource} target="_blank" rel="noreferrer">
                Commons 원본 <ArrowUpRight size={12} />
              </a>
            </span>
          </figcaption>
        </figure>
      </div>

      <div className="detail-content page-shell">
        <aside className="detail-aside">
          <div className="detail-aside-inner">
            <p className="aside-title">이 글에서</p>
            <nav aria-label="글 목차">
              {headings.map((heading) => <a key={heading.id} href={`#${heading.id}`}>{heading.title}</a>)}
              <a href="#sources">출처와 더 읽기</a>
            </nav>
            <div className="aside-note">
              <Gamepad2 size={17} strokeWidth={1.6} />
              <p><strong>게임과 역사는 다릅니다.</strong><br />게임 규칙은 역사적 사실을 선택하고 압축한 표현입니다.</p>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <section className="quick-context" aria-label="빠른 정보">
            <div><Clock3 size={18} /><span>읽는 시간</span><strong>약 {entry.readingMinutes}분</strong></div>
            <div><BookOpenText size={18} /><span>역사 시대</span><strong>{entry.era}</strong></div>
            <div><MapPin size={18} /><span>{entry.civilization ? "연결 문명" : "지역"}</span><strong>{entry.civilization || entry.region || "세계사"}</strong></div>
          </section>

          {entry.quote ? (
            <blockquote className="editorial-quote">
              <span>“</span><p>{entry.quote}</p>
            </blockquote>
          ) : null}

          <MarkdownArticle markdown={articleBody} />

          <section id="sources" className="sources-panel">
            <p className="eyebrow">Sources & further reading</p>
            <h2>출처와 더 읽기</h2>
            <p>본문은 아래 자료를 바탕으로 직접 요약·교차 확인했습니다. 링크는 새 창에서 열립니다.</p>
            <ol>
              {entry.sources.map((source, index) => (
                <li key={`${source.url}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}<ArrowUpRight size={14} />
                  </a>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {related.length ? (
        <section className="related-section">
          <div className="page-shell">
            <Reveal>
              <p className="eyebrow">Continue exploring</p>
              <h2 className="section-title mt-4">이 이야기에서<br />한 걸음 더.</h2>
            </Reveal>
            <div className="mt-12 grid gap-x-6 gap-y-14 md:grid-cols-3">
              {related.map((item, index) => (
                <Reveal key={item.slug} delay={index * 0.07}>
                  <p className="mb-4 text-xs font-semibold text-cobalt">{relationReason(entry, item)}</p>
                  <EntryCard entry={item} />
                </Reveal>
              ))}
            </div>
            <Link href="/explore" className="secondary-button mt-14 gap-2">
              <ArrowLeft size={16} /> 아카이브로 돌아가기
            </Link>
          </div>
        </section>
      ) : null}
    </article>
  );
}
