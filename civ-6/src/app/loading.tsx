export default function Loading() {
  return (
    <div className="page-shell py-24" aria-label="콘텐츠 불러오는 중">
      <div className="h-3 w-28 animate-pulse rounded-full bg-black/10" />
      <div className="mt-6 h-20 max-w-3xl animate-pulse rounded-2xl bg-black/10" />
      <div className="mt-12 aspect-[16/7] animate-pulse rounded-[30px] bg-black/10" />
    </div>
  );
}
