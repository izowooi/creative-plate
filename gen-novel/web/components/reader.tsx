'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Markdown from 'react-markdown';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, List, Settings2, X, Minus, Plus, Eye, Check } from 'lucide-react';
import type { BookInfo, Episode } from '@/lib/types';
import { defaultPreferences, localRead, localWrite, parsePosition, parsePreferences, positionKey, preferenceKey, type Preferences } from '@/lib/reading-state';

export function Reader({ book, episode }: { book: BookInfo; episode: Episode }) {
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  const [progress, setProgress] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [storageOk, setStorageOk] = useState(true);
  const [ready, setReady] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDialogElement>(null);
  const restoreRef = useRef(0);
  const mounted = useRef(false);
  const prefsRef = useRef(prefs);
  const index=book.episodes.findIndex(e=>e.id===episode.id);
  const previous=book.episodes[index-1];
  const next=book.episodes[index+1];
  const href=(id:string)=>`/books/${book.id}/read/${id}/`;

  useEffect(()=> {
    const saved=parsePosition(localRead(positionKey(book.id)));
    restoreRef.current=saved?.episodeId===episode.id?saved.paragraph:0;
    setPrefs(parsePreferences(localRead(preferenceKey)));
    setReady(true);
  },[book.id,episode.id]);

  useEffect(()=> { prefsRef.current=prefs; },[prefs]);

  useEffect(()=> {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>;
    let frame=0;
    const paragraphs=()=>Array.from(articleRef.current?.querySelectorAll<HTMLElement>('p,hr,h2,h3,blockquote')??[]);
    const save=()=> {
      // Passive unmount cleanup may run after React detaches the article ref.
      // Do not overwrite a real bookmark with coordinates from an empty page.
      if (!mounted.current || !articleRef.current) return;
      const nodes=paragraphs();
      let current=0;
      for (let i=0;i<nodes.length;i++) { if(nodes[i].getBoundingClientRect().top<=140) current=i; else break; }
      const top=articleRef.current?.offsetTop??0;
      const distance=Math.max(1,(articleRef.current?.offsetHeight??0)-window.innerHeight+100);
      const percent=Math.min(100,Math.max(0,((window.scrollY-top)/distance)*100));
      setProgress(percent);
      const ok=localWrite(positionKey(book.id),{episodeId:episode.id,paragraph:current,progress:percent,updatedAt:Date.now()});
      setStorageOk(ok);
    };
    frame=requestAnimationFrame(()=> {
      const node=paragraphs()[restoreRef.current];
      if (restoreRef.current>0 && node) window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-95,behavior:'instant'});
      mounted.current=true;
      save();
    });
    const onScroll=()=> { clearTimeout(timer); timer=setTimeout(save,120); };
    const onVisibility=()=> { if(document.visibilityState==='hidden') save(); };
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('pagehide',save);
    document.addEventListener('visibilitychange',onVisibility);
    return ()=> { save(); mounted.current=false; clearTimeout(timer); cancelAnimationFrame(frame); window.removeEventListener('scroll',onScroll); window.removeEventListener('pagehide',save); document.removeEventListener('visibilitychange',onVisibility); };
  },[ready,book.id,episode.id]);

  function change(update: Partial<Preferences>) {
    const value={...prefsRef.current,...update};
    prefsRef.current=value; setPrefs(value);
    setStorageOk(localWrite(preferenceKey,value));
  }

  // React Markdown escapes HTML; only article content is rendered, never arbitrary MDX.
  const body=episode.body.replace(/^\*\s*$/gm,'---');
  const style={ '--reading-size':`${prefs.size}px`, '--leading':prefs.leading,
    fontFamily:prefs.font==='serif'?"'Iowan Old Style', 'Batang', 'Noto Serif KR', serif":undefined } as CSSProperties;

  return <div className="reader" data-theme={prefs.theme}>
    <header className={`reader-header ${chrome?'':'hidden-chrome'}`}><div className="reader-header-inner"><Link href={`/books/${book.id}/`} className="icon-button" aria-label="작품으로 돌아가기"><ArrowLeft size={21}/></Link><Link href={`/books/${book.id}/`} className="truncate text-sm flex-1 font-semibold">{book.title}</Link><button className="icon-button" aria-label="읽기 설정" onClick={()=>settingsRef.current?.showModal()}><Settings2 size={20}/></button></div><div className="reader-progress" role="progressbar" aria-label="읽은 비율" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:`${progress}%`}}/></div></header>
    <main className="reading-content">
      <div className="mb-10"><div className="flex items-center gap-2 mb-5"><span className="text-sm" style={{color:'var(--reader-muted)'}}>EPISODE {String(episode.number).padStart(2,'0')}</span><span className={`pill ${episode.status==='draft'?'draft-pill':''}`}>{episode.status==='draft'?'초안':'확정본'}</span></div><h1 className="text-[1.7rem] font-bold tracking-tight leading-snug">{episode.title}</h1><p className="text-sm mt-4" style={{color:'var(--reader-muted)'}}>약 {episode.minutes}분 · {episode.characters.toLocaleString('ko-KR')}자</p></div>
      <div className="prose-novel" ref={articleRef} style={style}><Markdown skipHtml components={{img:()=>null,a:({children})=><span>{children}</span>}}>{body}</Markdown></div>
      <div className="text-center mt-16 mb-8"><span style={{color:'var(--reader-muted)'}} className="text-sm">{episode.number}화 끝</span><div className="mt-6">{next?<Link className="primary" href={href(next.id)}>다음 화 읽기<ArrowRight size={18}/></Link>:<><p className="text-base font-semibold mb-2">준비된 이야기를 모두 읽었어요.</p><p className="text-sm mb-6" style={{color:'var(--reader-muted)'}}>다음 이야기가 쌓이면 이곳에서 만나요.</p><Link className="secondary !bg-transparent" href={`/books/${book.id}/`}>회차 목록으로</Link></>}</div></div>
      {!storageOk && <p role="status" className="text-sm text-center mt-6" style={{color:'var(--reader-muted)'}}>이 브라우저에서는 읽던 위치를 저장할 수 없어요. 저장 공간 설정을 확인해 주세요.</p>}
    </main>
    <button className="icon-button fixed right-4 bottom-24 z-10 shadow-sm" style={{background:'var(--paper)',border:'1px solid var(--reader-line)'}} onClick={()=>setChrome(!chrome)} aria-label={chrome?'읽기 도구 숨기기':'읽기 도구 보이기'} aria-pressed={!chrome}><Eye size={19}/></button>
    <footer className={`reader-controls ${chrome?'':'hidden-chrome'}`}><div className="reader-controls-inner">{previous?<Link href={href(previous.id)}><ChevronLeft size={17}/>이전화</Link>:<button disabled><ChevronLeft size={17}/>이전화</button>}<button onClick={()=>listRef.current?.showModal()}><List size={18}/>목록 <span className="text-xs ml-1" style={{color:'var(--reader-muted)'}}>{Math.round(progress)}%</span></button>{next?<Link href={href(next.id)}>다음화<ChevronRight size={17}/></Link>:<button disabled>다음화<ChevronRight size={17}/></button>}</div></footer>
    <dialog ref={settingsRef} onClick={e=>{if(e.target===e.currentTarget) settingsRef.current?.close();}} aria-labelledby="settings-title"><div className="flex justify-between items-center mb-7"><h2 id="settings-title" className="font-bold text-lg">읽기 설정</h2><button autoFocus className="icon-button" onClick={()=>settingsRef.current?.close()} aria-label="설정 닫기"><X size={20}/></button></div>
      <fieldset className="mb-7"><legend className="settings-label mb-3">화면 배경</legend><div className="grid grid-cols-3 gap-2">{(['light','sepia','dark'] as const).map((theme,i)=><button key={theme} className="setting-choice" aria-pressed={prefs.theme===theme} onClick={()=>change({theme})}>{['밝게','종이','어둡게'][i]}{prefs.theme===theme && <Check size={13} className="inline ml-1"/>}</button>)}</div></fieldset>
      <fieldset className="mb-7"><legend className="settings-label mb-3">글꼴</legend><div className="grid grid-cols-2 gap-2"><button className="setting-choice" aria-pressed={prefs.font==='sans'} onClick={()=>change({font:'sans'})}>고딕</button><button className="setting-choice font-serif" aria-pressed={prefs.font==='serif'} onClick={()=>change({font:'serif'})}>명조</button></div></fieldset>
      <div className="mb-7"><p className="settings-label mb-3">글자 크기</p><div className="flex items-center justify-between rounded-lg border p-1" style={{borderColor:'var(--reader-line)'}}><button className="icon-button" disabled={prefs.size<=16} aria-label="글자 작게" onClick={()=>change({size:Math.max(16,prefs.size-1)})}><Minus size={18}/></button><output className="text-lg font-semibold" aria-live="polite">{prefs.size}</output><button className="icon-button" disabled={prefs.size>=28} aria-label="글자 크게" onClick={()=>change({size:Math.min(28,prefs.size+1)})}><Plus size={18}/></button></div></div>
      <fieldset className="mb-6"><legend className="settings-label mb-3">줄 간격</legend><div className="grid grid-cols-3 gap-2">{[1.65,1.95,2.3].map((leading,i)=><button key={leading} className="setting-choice" aria-pressed={prefs.leading===leading} onClick={()=>change({leading})}>{['좁게','보통','넓게'][i]}</button>)}</div></fieldset><p className="text-xs text-center" style={{color:'var(--reader-muted)'}}>설정과 읽던 위치는 이 기기에 저장돼요.</p>
    </dialog>
    <dialog ref={listRef} onClick={e=>{if(e.target===e.currentTarget) listRef.current?.close();}} aria-labelledby="list-title"><div className="flex justify-between items-center mb-4"><h2 id="list-title" className="font-bold text-lg">회차 목록</h2><button autoFocus className="icon-button" aria-label="목록 닫기" onClick={()=>listRef.current?.close()}><X size={20}/></button></div><div className="max-h-[60dvh] overflow-y-auto">{book.episodes.map(e=><Link key={e.id} href={href(e.id)} onClick={()=>listRef.current?.close()} aria-current={e.id===episode.id?'page':undefined} className="flex gap-3 py-4 border-b text-sm" style={{borderColor:'var(--reader-line)',color:e.id===episode.id?'var(--brand)':undefined}}><span>{e.number}화</span><span className="flex-1">{e.title}</span>{e.id===episode.id&&<Check size={17}/>}</Link>)}</div></dialog>
  </div>;
}
