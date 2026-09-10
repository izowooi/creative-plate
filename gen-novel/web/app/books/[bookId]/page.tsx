import { notFound } from 'next/navigation';
import { getBooks } from '@/lib/catalog';
import { Suspense } from 'react';
import { RemoteLibrary, Loading } from '@/components/remote-library';

export const dynamicParams = false;
export function generateStaticParams() { return getBooks().map(b=>({bookId:b.id})); }
export async function generateMetadata({ params }: { params: Promise<{bookId:string}> }) {
  const { bookId } = await params;
  const book = getBooks().find(b=>b.id===bookId);
  return { title: book?.title ?? '작품을 찾을 수 없어요' };
}
export default async function Page({ params }: {params:Promise<{bookId:string}>}) {
  const { bookId } = await params;
  const book = getBooks().find(b=>b.id===bookId);
  if (!book) notFound();
  return <Suspense fallback={<Loading/>}><RemoteLibrary mode="book" fixedBook={bookId}/></Suspense>;
}
