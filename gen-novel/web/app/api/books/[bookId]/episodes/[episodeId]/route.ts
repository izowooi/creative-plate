import { getBooks } from '@/lib/catalog';
export const dynamic = 'force-static';
export function generateStaticParams() {return getBooks().flatMap(b=>b.episodes.map(e=>({bookId:b.id,episodeId:e.id})));}
export async function GET(_request:Request,{params}:{params:Promise<{bookId:string;episodeId:string}>}) {
  const {bookId,episodeId}=await params;
  const episode=getBooks().find(b=>b.id===bookId)?.episodes.find(e=>e.id===episodeId);
  return episode?Response.json(episode):Response.json({error:'회차 없음'},{status:404});
}
