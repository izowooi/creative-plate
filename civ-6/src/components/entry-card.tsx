import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { entryTypeLabel, type EntryPreview } from "@/lib/content";
import { HistoryImage } from "@/components/history-image";
import { entryAccent } from "@/lib/presentation";

type CardEntry = Pick<
  EntryPreview,
  | "slug"
  | "name"
  | "nameEn"
  | "category"
  | "subcategory"
  | "cityRoles"
  | "era"
  | "lifespan"
  | "image"
  | "imageAlt"
  | "imageCredit"
  | "imageLicense"
  | "summary"
  | "accent"
> & {
  greatWork?: {
    creatorId: string;
    creatorRef?: { slug: string; name: string; nameEn: string };
    creationLabel?: string;
    creation?: { label: string };
  };
};

export function EntryCard({
  entry,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 33vw",
}: {
  entry: CardEntry;
  priority?: boolean;
  sizes?: string;
}) {
  const greatWork = entry.category === "great-works" ? entry.greatWork : undefined;
  const creatorName = greatWork?.creatorRef?.name;
  const creationLabel = greatWork?.creationLabel ?? greatWork?.creation?.label;
  const contextLine = greatWork
    ? [creationLabel, creatorName].filter(Boolean).join(" · ")
    : `${entry.era}${entry.lifespan ? ` · ${entry.lifespan}` : ""}`;

  return (
    <article
      className="entry-card group"
      style={{ "--entry-accent": entryAccent(entry) } as React.CSSProperties}
    >
      <Link href={`/archive/${entry.slug}`} className="block">
        <div className="entry-card-image">
          <HistoryImage
            src={entry.image ?? ""}
            alt={entry.imageAlt || `${entry.name} 관련 자료 이미지`}
            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.025]"
            sizes={sizes}
          />
          <span className="entry-category">{entryTypeLabel(entry)}</span>
          {priority ? <span className="entry-index">EDITOR&apos;S PICK</span> : null}
          {entry.image && entry.imageCredit && entry.imageLicense ? (
            <span className="entry-card-credit">{entry.imageCredit} · {entry.imageLicense}</span>
          ) : null}
        </div>
        <div className="pt-5">
          <div className="mb-3 flex items-center justify-between gap-4 text-xs font-medium text-soft">
            <span className="min-w-0 truncate">{contextLine || entry.era}</span>
            <ArrowUpRight className="entry-arrow" size={17} aria-hidden="true" />
          </div>
          <h3 className="entry-card-title text-balance text-[1.65rem] font-semibold leading-[1.18] tracking-[-0.04em] text-ink">
            {entry.name}
          </h3>
          <p className="entry-card-name-en mt-1 text-sm text-muted">{entry.nameEn}</p>
          <p className="mt-4 line-clamp-3 text-[15px] leading-6 text-muted">{entry.summary}</p>
        </div>
      </Link>
    </article>
  );
}
