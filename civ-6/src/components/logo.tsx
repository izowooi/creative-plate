import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="더 턴 홈">
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-ink text-paper transition-transform duration-300 group-hover:rotate-3">
        <span className="absolute h-[2px] w-4 rounded-full bg-current" />
        <span className="absolute h-4 w-[2px] translate-y-1 rounded-full bg-current" />
        <span className="absolute top-[7px] size-2 rounded-full bg-cobalt ring-2 ring-ink" />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
        THE TURN
      </span>
    </Link>
  );
}
