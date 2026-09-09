import Link from 'next/link';
export default function NotFound() {
  return <main className="min-h-dvh flex flex-col items-center justify-center gap-5 px-6 text-center"><p className="eyebrow">PAGE NOT FOUND</p><h1 className="text-2xl font-bold">이 이야기를 찾을 수 없어요.</h1><p className="muted">서재에서 작품과 회차를 다시 선택해 주세요.</p><Link className="primary" href="/">서재로 돌아가기</Link></main>;
}
