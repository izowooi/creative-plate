'use client';
import { bookHref, episodeHref } from '@/lib/links';
import Link from 'next/link';
import { useState } from 'react';
import { BookOpen, LibraryBig, ChevronRight, ArrowUpRight } from 'lucide-react';
import type { BookInfo } from '@/lib/types';
import { Cover } from './cover';
import { ContinueReading } from './continue-reading';

export function Library({ books }: { books: BookInfo[] }) {
  const [tab, setTab] = useState('all');
  const feature = books.find(b => b.episodes.length);
  const shown = books.filter(b => tab !== 'final' || b.episodes.some(e => e.status === 'final'));
  return <div className="shell">
    <header className="topbar"><Link href="/" className="brand"><BookOpen size={25} strokeWidth={2.5} />책갈피<span className="ml-2 text-xs font-normal tracking-normal text-gray-400">나의 웹소설</span></Link><span className="text-sm muted">MY LIBRARY</span></header>
    <main className="page-main" id="main">
      <div className="mb-6 flex items-end justify-between"><div><p className="eyebrow mb-2">YOUR NEXT CHAPTER</p><h1 className="section-heading">이야기가 기다리는 곳</h1></div><span className="text-sm muted">{books.length}개 작품</span></div>
      {feature && <section className="feature-book" aria-label="추천 읽기"><Cover title={feature.title} /><div className="feature-copy"><div className="flex flex-wrap gap-2 mb-3"><span className="pill">{feature.genre}</span><span className="pill draft-pill">집필 중</span></div><h2 className="feature-title">{feature.title}</h2><p className="mt-2 text-sm muted">{feature.author}</p><p className="feature-description text-base mt-5 leading-7 text-[#56665b]">{feature.quote}</p><p className="mt-4 mb-5 text-sm muted">총 {feature.episodes.length}화 · {feature.episodes[0].minutes}분의 첫 이야기</p><Link className="primary" href={episodeHref(feature.id,feature.episodes[0].id)}>첫 화 읽기 <ArrowUpRight size={18} /></Link></div></section>}
      {feature && <ContinueReading book={feature} compact/>}
      <section className="mt-10" aria-label="내 서재"><div className="mb-3 flex items-center justify-between"><h2 className="section-heading">내 서재</h2><span className="text-sm muted">직접 써 내려가는 이야기</span></div><div className="tabs"><button aria-pressed={tab==='all'} onClick={()=>setTab('all')}>전체 작품</button><button aria-pressed={tab==='final'} onClick={()=>setTab('final')}>확정본이 있는 작품</button></div>
        {shown.length ? shown.map(book=><Link key={book.id} className="flex items-center gap-5 py-6 border-b border-[#e8ebe9]" href={bookHref(book.id)}><Cover small title={book.title} /><div className="flex-1 min-w-0"><p className="text-xs text-brand mb-2 font-semibold">{book.genre} · 총 {book.episodes.length}화</p><h3 className="font-bold text-lg tracking-tight">{book.title}</h3><p className="text-sm muted mt-1">{book.author}</p><div className="flex flex-wrap gap-1.5 mt-3">{book.tags.slice(0,3).map(t=><span key={t} className="text-xs text-[#77857b]">#{t}</span>)}</div></div><ChevronRight size={20} className="text-gray-400" /></Link>):<div className="empty mt-6">아직 확정된 회차가 없어요.<br />전체 작품에서 집필 중인 초안을 읽어 보세요.</div>}
      </section><p className="text-center text-xs muted mt-10">한 문장씩 쌓이는, 나만의 세계.</p>
    </main><nav className="bottom-nav" aria-label="주 메뉴"><Link className="active" href="/"><LibraryBig size={21} />서재</Link>{feature && <Link href={bookHref(feature.id)}><BookOpen size={21} />작품 · 회차</Link>}</nav>
  </div>;
}
