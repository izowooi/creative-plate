// One-time credential setup. Never prints or writes the plaintext token to disk.
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const token=randomBytes(32).toString('hex');
execFileSync('gh',['secret','set','GN_SYNC_TOKEN','--repo','izowooi/creative-plate'],{input:token,stdio:['pipe','pipe','pipe']});
console.log(createHash('sha256').update(token).digest('hex'));
