import { notFound } from 'next/navigation';
import { getBooks, bookInfo } from '@/lib/catalog';
import { Reader } from '@/components/reader';

export const dynamicParams = false;
export function generateStaticParams() {
  return getBooks().flatMap(b=>b.episodes.map(e=>({bookId:b.id,episodeId:e.id})));
}
export async function generateMetadata({ params }: { params:Promise<{bookId:string;episodeId:string}> }) {
  const {bookId,episodeId}=await params;
  const book=getBooks().find(b=>b.id===bookId);
  const episode=book?.episodes.find(e=>e.id===episodeId);
  return {title:episode?`${episode.number}화. ${episode.title} · ${book?.title}`:'회차를 찾을 수 없어요'};
}
export default async function Page({ params }: {params:Promise<{bookId:string;episodeId:string}>}) {
  const {bookId,episodeId}=await params;
  const book=getBooks().find(b=>b.id===bookId);
  const episode=book?.episodes.find(e=>e.id===episodeId);
  if (!book || !episode) notFound();
  return <Reader key={`${book.id}:${episode.id}`} book={bookInfo(book)} episode={episode}/>;
}
