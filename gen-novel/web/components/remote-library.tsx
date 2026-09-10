'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { BookInfo, Episode } from '@/lib/types';
import { Library } from './library';
import { BookDetail } from './book-detail';
import { Reader } from './reader';

async function read<T>(url:string,signal:AbortSignal):Promise<T> {
  const r=await fetch(url,{signal,cache:'no-store'});
  if(!r.ok) throw new Error(r.status===404?'회차를 찾을 수 없어요.':'이야기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  return r.json();
}
export function Loading() {return <div className="shell grid place-content-center text-center gap-3" role="status"><p className="brand justify-center text-brand">책갈피</p><p className="muted text-sm">이야기를 불러오는 중이에요.</p></div>;}
export function RemoteLibrary({mode='library',fixedBook,fixedEpisode}:{mode?:'library'|'book'|'reader';fixedBook?:string;fixedEpisode?:string}) {
  const params=useSearchParams();
  const bookId=fixedBook??params.get(mode==='book'?'id':'book');
  const episodeId=fixedEpisode??params.get('episode');
  const requestKey=`${mode}:${bookId}:${episodeId}`;
  const [result,setResult]=useState<{books:BookInfo[];episode?:Episode;requestKey:string}|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=> {
    const controller=new AbortController();
    setResult(null);setError('');
    const load=async()=> {
      if(mode!=='library'&&(!bookId||!/^[a-z0-9-]+$/.test(bookId))) throw new Error('작품을 선택해 주세요.');
      if(mode==='reader'&&(!episodeId||!/^ep-[0-9]+$/.test(episodeId))) throw new Error('회차를 선택해 주세요.');
      const [books,episode]=await Promise.all([
        read<BookInfo[]>('/api/catalog.json',controller.signal),
        mode==='reader'?read<Episode>(`/api/books/${bookId}/episodes/${episodeId}`,controller.signal):Promise.resolve(undefined),
      ]);
      if(mode!=='library'&&!books.some(b=>b.id===bookId)) throw new Error('작품을 찾을 수 없어요.');
      if(!controller.signal.aborted) setResult({books,episode,requestKey});
    };
    load().catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'읽기 오류');});
    return ()=>controller.abort();
  },[mode,bookId,episodeId,retry,requestKey]);
  useEffect(()=>{
    const book=result?.books.find(b=>b.id===bookId);
    document.title=result?.episode?`${result.episode.title} · ${book?.title} · 책갈피`:book?`${book.title} · 책갈피`:'책갈피 · 나의 웹소설 서재';
  },[result,bookId]);
  if(error) return <main className="shell grid place-content-center gap-5 text-center px-6"><h1 className="text-xl font-semibold">{error}</h1><button className="primary" onClick={()=>setRetry(retry+1)}>다시 불러오기</button><Link href="/" className="secondary">서재로</Link></main>;
  if(!result||result.requestKey!==requestKey) return <Loading/>;
  if(mode==='library') return <Library books={result.books}/>;
  const book=result.books.find(b=>b.id===bookId)!;
  return mode==='reader'&&result.episode?<Reader key={`${book.id}:${result.episode.id}`} book={book} episode={result.episode}/>:<BookDetail book={book}/>;
}
