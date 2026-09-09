'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import { localRead, parsePosition, positionKey, type ReadingPosition } from '@/lib/reading-state';
import type { BookInfo } from '@/lib/types';

export function ContinueReading({ book, compact = false }: { book: BookInfo; compact?: boolean }) {
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  useEffect(() => { setPosition(parsePosition(localRead(positionKey(book.id)))); }, [book.id]);
  const episode = book.episodes.find(e => e.id === position?.episodeId) ?? book.episodes[0];
  if (!episode || (compact && !position)) return null;
  if (compact) return <Link href={`/books/${book.id}/read/${episode.id}/`} className="mt-5 flex items-center gap-3 rounded-xl border border-[#dce9e0] bg-[#f7faf8] px-5 py-4"><History size={19} className="text-brand shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">이어서 읽기 <span className="ml-2 text-brand">{Math.round(position?.progress ?? 0)}%</span></p><p className="text-sm muted truncate mt-1">{episode.number}화. {episode.title}</p></div><ArrowRight size={18} /></Link>;
  return <Link className="primary flex-1" href={`/books/${book.id}/read/${episode.id}/`}>{position ? '이어서 읽기' : '첫 화 읽기'}<ArrowRight size={18}/></Link>;
}
