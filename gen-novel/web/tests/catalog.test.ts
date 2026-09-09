import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCatalog } from '../lib/catalog';
import type { BookMeta } from '../lib/types';

const meta: BookMeta={id:'test',title:'검증 작품',author:'테스트',genre:'판타지',tags:[],description:'',quote:'',source:'local',includeDrafts:true};
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'novel-reader-'));
  fs.mkdirSync(path.join(root,'local'));
  const put=(name:string,text:string)=> { const file=path.join(root,'local',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text); };
  const draft=(run:string,n:number,day:string,body:string)=> {
    put(`runs/${run}/manifest.json`,JSON.stringify({episode:n,created_at:`2026-09-${day}T00:00:00Z`}));
    put(`runs/${run}/draft.md`,body);
  };
  return {root,put,draft,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('real repository chapter loads without interview or lore in the reader payload',()=> {
  const books=loadCatalog(path.resolve(process.cwd(),'..'),[{...meta,id:'embers'}]);
  assert.equal(books[0].episodes[0].title,'불을 끄는 순서');
  assert.equal(books[0].episodes[0].status,'draft');
  assert.ok(books[0].episodes[0].body.includes('이번에는 탄 맛이 나지 않았다.'));
  assert.ok(!JSON.stringify(books).includes('작가 인터뷰'));
});
test('latest written revision selected, placeholders skipped, ordered by episode number',()=> {
  const f=fixture();try {
    f.draft('first',1,'01','# 1화. 이전\n\n이전 원고');
    f.draft('revision',1,'02','# 1화. 최신\n\n최신 원고');
    f.draft('empty',1,'03','[작성 필요]');
    f.draft('third',3,'01','# 3화. 세 번째\n\n본문');
    f.put('journal/secret-not-for-reader.md','인터뷰만의 문장');
    const book=loadCatalog(f.root,[meta])[0];
    assert.deepEqual(book.episodes.map(e=>e.number),[1,3]);
    assert.equal(book.episodes[0].title,'최신');
    assert.equal(book.episodes[0].id,'ep-0001');
    assert.ok(!JSON.stringify(book).includes('인터뷰만의 문장'));
  } finally {f.close();}
});
test('final takes precedence over a newer draft and verifies its manuscript digest',()=> {
  const f=fixture();try {
    const body='# 1화. 확정\n\n확정 원고';
    f.put('final/000001/manuscript.md',body);
    f.put('final/000001/release.json',JSON.stringify({episode:1,approved_at:'2026-09-01T00:00:00Z',hashes:{'manuscript.md':createHash('sha256').update(body).digest('hex')}}));
    f.draft('new',1,'03','# 1화. 새 초안\n\n새 내용');
    assert.equal(loadCatalog(f.root,[meta])[0].episodes[0].status,'final');
    f.put('final/000001/manuscript.md','변경된 원고');
    assert.throws(()=>loadCatalog(f.root,[meta]),/해시/);
  } finally {f.close();}
});
test('draft publication is explicit and an empty library is allowed',()=> {
  const f=fixture();try {
    f.draft('first',1,'01','# 1화. 제목\n\n원고');
    assert.equal(loadCatalog(f.root,[{...meta,includeDrafts:false}])[0].episodes.length,0);
    assert.deepEqual(loadCatalog(f.root,[]),[]);
  } finally {f.close();}
});
test('invalid metadata and directory escapes fail closed',()=> {
  const f=fixture();try {
    assert.throws(()=>loadCatalog(f.root,[{...meta,source:'../outside'}]),/프로젝트 밖/);
    assert.throws(()=>loadCatalog(f.root,[meta,meta]),/중복/);
    f.draft('first',-1,'01','내용');
    assert.throws(()=>loadCatalog(f.root,[meta]),/회차 번호/);
  } finally {f.close();}
});
test('a symlinked manuscript outside its book is refused',()=> {
  const f=fixture();try {
    f.draft('first',1,'01','원고');
    const outside=path.join(f.root,'outside.md');
    fs.writeFileSync(outside,'not a manuscript');
    fs.unlinkSync(path.join(f.root,'local/runs/first/draft.md'));
    fs.symlinkSync(outside,path.join(f.root,'local/runs/first/draft.md'));
    assert.throws(()=>loadCatalog(f.root,[meta]),/폴더 밖/);
  } finally {f.close();}
});
