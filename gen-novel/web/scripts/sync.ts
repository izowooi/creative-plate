import { execFileSync } from 'node:child_process';
import { getBooks } from '../lib/catalog';

async function main() {
  const books=getBooks();
  const revision=Number(process.env.GITHUB_RUN_NUMBER);
  const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(process.argv.includes('--json')) { console.log(JSON.stringify({books,commit}));return; }
  const url=process.env.GN_SUPABASE_URL;
  const key=process.env.GN_SUPABASE_ANON_KEY;
  const token=process.env.GN_SYNC_TOKEN;
  if(!url||!key||!token||!Number.isSafeInteger(revision)||revision<1) throw new Error('동기화 환경 설정이 필요합니다. GitHub Actions의 sync workflow를 실행하세요.');
  const endpoint=new URL('/rest/v1/rpc/gn_import_catalog',url);
  if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.supabase.co')) throw new Error('올바르지 않은 Supabase URL');
  const response=await fetch(endpoint,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
    body:JSON.stringify({p_payload:{books,commit,revision},p_token:token}),signal:AbortSignal.timeout(60000)});
  if(!response.ok) throw new Error(`DB 동기화 실패: HTTP ${response.status}. Supabase 로그를 확인하세요.`);
  const result=await response.json();
  if(!['applied','already_applied'].includes(result.status)) throw new Error('잘못된 동기화 응답');
  console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'동기화 실패');process.exitCode=1;});
