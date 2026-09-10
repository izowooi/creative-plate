import { notFound } from 'next/navigation';
import { getBooks } from '@/lib/catalog';
import { Suspense } from 'react';
import { RemoteLibrary, Loading } from '@/components/remote-library';

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
  return <Suspense fallback={<Loading/>}><RemoteLibrary mode="reader" fixedBook={bookId} fixedEpisode={episodeId}/></Suspense>;
}
