'use client';
import { bookHref, episodeHref } from '@/lib/links';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowDownUp, BookOpen, ChevronRight, Clock3 } from 'lucide-react';
import type { BookInfo } from '@/lib/types';
import { Cover } from './cover';
import { ContinueReading } from './continue-reading';

export function BookDetail({ book }: { book: BookInfo }) {
  const [ascending, setAscending] = useState(true);
  const [finalOnly, setFinalOnly] = useState(false);
  const episodes = book.episodes.filter(e => !finalOnly || e.status==='final');
  if (!ascending) episodes.reverse();
  const totalMinutes = book.episodes.reduce((sum,e)=>sum+e.minutes,0);
  return <div className="shell">
    <header className="topbar"><Link className="flex items-center gap-2 text-sm" href="/"><ArrowLeft size={20}/> 내 서재</Link><Link href="/" className="brand text-xl"><BookOpen size={22}/>책갈피</Link></header>
    <main className="page-main">
      <section className="feature-book"><Cover title={book.title}/><div className="feature-copy"><p className="eyebrow mb-3">MY ORIGINAL NOVEL</p><h1 className="feature-title">{book.title}</h1><p className="text-sm muted mt-3">{book.author}</p><div className="flex flex-wrap gap-2 mt-5"><span className="pill">{book.genre}</span><span className="pill">성장 장편</span></div><p className="text-sm muted mt-5 flex flex-wrap gap-3"><span>총 {book.episodes.length}화</span><span className="inline-flex items-center gap-1"><Clock3 size={14}/>{totalMinutes}분</span></p></div></section>
      <div className="flex gap-3 mt-5"><ContinueReading book={book}/><a className="secondary" href="#episodes">회차 목록</a></div>
      <section className="mt-9"><h2 className="section-heading mb-4">작품 소개</h2><p className="text-base leading-8 whitespace-pre-line text-[#58615b]">{book.description}</p><div className="flex flex-wrap gap-2 mt-5">{book.tags.map(tag=><span key={tag} className="rounded-full bg-[#f2f5f3] px-3 py-2 text-sm text-[#64776a]">#{tag}</span>)}</div></section>
      <section className="mt-10 scroll-mt-6" id="episodes"><div className="flex justify-between items-center mb-4"><h2 className="section-heading">전체 회차 <span className="text-brand">{book.episodes.length}</span></h2><button className="secondary !min-h-10 !border-0 !px-0" onClick={()=>setAscending(!ascending)}><ArrowDownUp size={16}/>{ascending?'첫 화부터':'최신순'}</button></div><label className="flex gap-2 items-center text-sm muted pb-4 border-b border-[#e8ebe9]"><input type="checkbox" checked={finalOnly} onChange={e=>setFinalOnly(e.target.checked)} className="size-4 accent-[#087f5b]"/>확정본만 보기</label>
        {episodes.length ? episodes.map(e=><Link key={e.id} href={episodeHref(book.id,e.id)} className="episode-row"><span className="episode-number">{String(e.number).padStart(2,'0')}</span><div className="flex-1"><p className="font-semibold text-base">{e.title}</p><p className="text-xs muted mt-2">{new Date(e.updatedAt).toLocaleDateString('ko-KR',{ timeZone:'Asia/Seoul' })} · 약 {e.minutes}분</p></div><span className={`pill ${e.status==='draft'?'draft-pill':''}`}>{e.status==='draft'?'초안':'확정'}</span><ChevronRight size={17} className="text-gray-400"/></Link>):<div className="empty mt-5">{finalOnly?'아직 확정된 회차가 없어요. 필터를 해제하면 초안을 읽을 수 있어요.':'아직 읽을 수 있는 회차가 없어요.'}</div>}
        <p className="mt-5 text-xs muted leading-6">초안은 퇴고 중인 원고입니다. 같은 회차의 확정본이 생기면 확정본으로 보여 드려요.</p>
      </section>
    </main>
  </div>;
}
