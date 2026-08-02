"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { categoryMeta, categoryValues, type Category, type Entry } from "@/lib/content";
import { EntryCard } from "@/components/entry-card";
import { trapDialogFocus } from "@/lib/dialog-focus";

type SortMode = "editorial" | "name" | "era";
type EraLens = "고대·고전" | "중세" | "르네상스·근세" | "산업·근대" | "여러 시대";

const eraLensOrder: EraLens[] = ["고대·고전", "중세", "르네상스·근세", "산업·근대", "여러 시대"];

function eraLens(value: string): EraLens {
  if (value.includes("~현대")) return "여러 시대";
  if (/산업|근대|낭만주의|고전주의/.test(value)) return "산업·근대";
  if (/르네상스|근세|에도|과학혁명/.test(value)) return "르네상스·근세";
  if (/중세|헤이안|가마쿠라/.test(value)) return "중세";
  if (/고대|고전|로마|헬레니즘|삼국|전국|진 시대|청동기/.test(value)) return "고대·고전";
  return "여러 시대";
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

export function ExploreBrowser({
  entries,
  initialQuery = "",
  initialCategory = "",
  initialEra = "",
  initialSort = "editorial",
}: {
  entries: Entry[];
  initialQuery?: string;
  initialCategory?: string;
  initialEra?: string;
  initialSort?: string;
}) {
  const filterDialogRef = useRef<HTMLDialogElement>(null);
  const safeCategory = categoryValues.includes(initialCategory as Category)
    ? (initialCategory as Category)
    : "";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<Category | "">(safeCategory);
  const safeEra = eraLensOrder.includes(initialEra as EraLens) ? initialEra : "";
  const [era, setEra] = useState(safeEra);
  const [sort, setSort] = useState<SortMode>(
    ["editorial", "name", "era"].includes(initialSort) ? (initialSort as SortMode) : "editorial",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pagination, setPagination] = useState({ key: "", count: 12 });
  const filterKey = `${query}\u0000${category}\u0000${era}\u0000${sort}`;
  const visibleCount = pagination.key === filterKey ? pagination.count : 12;

  const eras = useMemo(
    () => eraLensOrder.map((label) => ({ label, count: entries.filter((entry) => eraLens(entry.era) === label).length })),
    [entries],
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        categoryValues.map((value) => [value, entries.filter((entry) => entry.category === value).length]),
      ) as Record<Category, number>,
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = normalize(query);
    const result = entries.filter((entry) => {
      const haystack = normalize(
        [
          entry.name,
          entry.nameEn,
          entry.summary,
          entry.civilization,
          entry.region,
          entry.tags.join(" "),
        ].join(" "),
      );
      return (!needle || haystack.includes(needle)) &&
        (!category || entry.category === category) &&
        (!era || eraLens(entry.era) === era);
    });

    return result.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ko");
      if (sort === "era") {
        return eraLensOrder.indexOf(eraLens(a.era)) - eraLensOrder.indexOf(eraLens(b.era)) ||
          a.name.localeCompare(b.name, "ko");
      }
      return Number(b.featured) - Number(a.featured);
    });
  }, [category, entries, era, query, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      if (era) params.set("era", era);
      if (sort !== "editorial") params.set("sort", sort);
      const next = params.size ? `/explore?${params.toString()}` : "/explore";
      window.history.replaceState(null, "", next);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [category, era, query, sort]);

  useEffect(() => {
    const dialog = filterDialogRef.current;
    if (!dialog) return;

    if (filtersOpen) {
      if (!dialog.open) dialog.showModal();
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>("[data-filter-autofocus]")?.focus());
      return () => {
        document.body.style.overflow = previousOverflow;
        if (dialog.open) dialog.close();
      };
    }

    if (dialog.open) dialog.close();
  }, [filtersOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setFiltersOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function clearFilters() {
    setQuery("");
    setCategory("");
    setEra("");
    setSort("editorial");
  }

  const hasFilters = Boolean(query || category || era || sort !== "editorial");

  const filterContent = (
    <>
      <div className="filter-heading">
        <span className="inline-flex items-center gap-2"><SlidersHorizontal size={16} /> 필터</span>
        {hasFilters ? <button onClick={clearFilters}>초기화</button> : null}
      </div>

      <fieldset className="filter-group">
        <legend>유형</legend>
        <button aria-pressed={!category} className={!category ? "is-active" : ""} onClick={() => setCategory("")}>
          <span>전체</span><span>{entries.length}</span>
        </button>
        {categoryValues.map((value) => (
          <button
            key={value}
            aria-pressed={category === value}
            className={category === value ? "is-active" : ""}
            onClick={() => setCategory(value)}
          >
            <span>{categoryMeta[value].label}</span><span>{counts[value]}</span>
          </button>
        ))}
      </fieldset>

      <fieldset className="filter-group">
        <legend>역사 시대</legend>
        <button aria-pressed={!era} className={!era ? "is-active" : ""} onClick={() => setEra("")}>
          <span>모든 시대</span>{!era ? <Check size={14} /> : null}
        </button>
        {eras.map(({ label, count }) => (
          <button key={label} aria-pressed={era === label} className={era === label ? "is-active" : ""} onClick={() => setEra(label)}>
            <span>{label}</span><span>{era === label ? <Check size={14} /> : count}</span>
          </button>
        ))}
      </fieldset>
    </>
  );

  return (
    <div>
      <div className="explore-search-wrap">
        <Search size={22} strokeWidth={1.7} aria-hidden="true" />
        <label htmlFor="archive-search" className="sr-only">아카이브 검색</label>
        <input
          id="archive-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름, 시대, 문명 또는 키워드"
          autoComplete="off"
        />
        {query ? (
          <button className="search-clear" onClick={() => setQuery("")} aria-label="검색어 지우기">
            <X size={18} />
          </button>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-b border-line pb-5">
        <p className="text-sm text-muted" aria-live="polite">
          <strong className="font-semibold text-ink">{filtered.length}</strong>개의 이야기
        </p>
        <div className="flex items-center gap-2">
          <button className="mobile-filter-trigger" onClick={() => setFiltersOpen(true)}>
            <Filter size={16} /> 필터 {category || era ? <span className="filter-dot" /> : null}
          </button>
          <label className="sr-only" htmlFor="archive-sort">정렬</label>
          <select id="archive-sort" className="sort-select" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            <option value="editorial">에디터 추천순</option>
            <option value="name">이름순</option>
            <option value="era">시대순</option>
          </select>
        </div>
      </div>

      <div className="explore-layout">
        <aside className="filter-sidebar" aria-label="탐색 필터">{filterContent}</aside>
        <section aria-label="검색 결과">
          {filtered.length ? (
            <>
              <div className="grid gap-x-6 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.slice(0, visibleCount).map((entry) => (
                  <EntryCard
                    key={entry.slug}
                    entry={entry}
                    sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw"
                  />
                ))}
              </div>
              {visibleCount < filtered.length ? (
                <div className="mt-16 flex justify-center border-t border-line pt-10">
                  <button
                    className="secondary-button"
                    onClick={() => setPagination({ key: filterKey, count: visibleCount + 12 })}
                  >
                    더 보기 · {filtered.length - visibleCount}개 남음
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <span className="grid size-12 place-items-center rounded-full bg-ink text-white"><Search size={20} /></span>
              <h2>아직 이 조합의 이야기는 없습니다.</h2>
              <p>검색어를 줄이거나 다른 시대와 유형을 선택해 보세요.</p>
              <button className="secondary-button mt-6" onClick={clearFilters}>모든 이야기 보기</button>
            </div>
          )}
        </section>
      </div>

      <dialog
        ref={filterDialogRef}
        className="filter-sheet"
        aria-label="필터 선택"
        onClose={() => setFiltersOpen(false)}
        onKeyDown={trapDialogFocus}
        onClick={(event) => {
          if (event.target === event.currentTarget) setFiltersOpen(false);
        }}
      >
          <div className="filter-sheet-panel">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <strong className="text-lg tracking-[-0.03em]">이야기 좁혀보기</strong>
              <button data-filter-autofocus className="icon-button" onClick={() => setFiltersOpen(false)} aria-label="필터 닫기"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto py-2">{filterContent}</div>
            <button className="primary-button w-full" onClick={() => setFiltersOpen(false)}>
              {filtered.length}개의 이야기 보기
            </button>
          </div>
      </dialog>
    </div>
  );
}
