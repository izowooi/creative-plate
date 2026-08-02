import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { entryTypeLabel, type Entry } from "@/lib/content";
import { HistoryImage } from "@/components/history-image";
import { entryAccent } from "@/lib/presentation";

export function EntryCard({
  entry,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 33vw",
}: {
  entry: Entry;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <article
      className="entry-card group"
      style={{ "--entry-accent": entryAccent(entry) } as React.CSSProperties}
    >
      <Link href={`/archive/${entry.slug}`} className="block">
        <div className="entry-card-image">
          <HistoryImage
            src={entry.image}
            alt={entry.imageAlt || `${entry.name} 관련 역사 이미지`}
            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.025]"
            sizes={sizes}
          />
          <span className="entry-category">{entryTypeLabel(entry)}</span>
          {priority ? <span className="entry-index">EDITOR&apos;S PICK</span> : null}
          <span className="entry-card-credit">{entry.imageCredit} · {entry.imageLicense}</span>
        </div>
        <div className="pt-5">
          <div className="mb-3 flex items-center justify-between gap-4 text-xs font-medium text-soft">
            <span>{entry.era}{entry.lifespan ? ` · ${entry.lifespan}` : ""}</span>
            <ArrowUpRight className="entry-arrow" size={17} aria-hidden="true" />
          </div>
          <h3 className="text-balance text-[1.65rem] font-semibold leading-[1.18] tracking-[-0.04em] text-ink">
            {entry.name}
          </h3>
          <p className="mt-1 text-sm text-muted">{entry.nameEn}</p>
          <p className="mt-4 line-clamp-3 text-[15px] leading-6 text-muted">{entry.summary}</p>
        </div>
      </Link>
    </article>
  );
}
