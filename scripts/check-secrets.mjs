import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
export function findings(name, text) {
  const problems=[];
  if (/(^|\/)\.env(\.|$)/.test(name) && name!=='.env.example') problems.push('environment file');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) problems.push('private key');
  if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(text)) problems.push('provider secret');
  if (/\b(?:ghp_|github_pat_|sb_secret_)[A-Za-z0-9_]{20,}/.test(text)) problems.push('access token');
  if (/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/.test(text)) problems.push('JWT');
  if (/(?:postgres(?:ql)?):\/\/[^\s:]+:[^\s@]+@(?!127\.0\.0\.1|localhost)/i.test(text)) problems.push('remote DB credential');
  if (/^\s*(?:OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*\S+/m.test(text)) problems.push('assigned secret');
  return problems;
}
if (process.argv[1]?.endsWith('check-secrets.mjs')) {
  const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const errors=[];
  for (const name of new Set(files)) {
    if (!fs.existsSync(name) || !fs.statSync(name).isFile()) continue;
    const b=fs.readFileSync(name);
    if (b.includes(0)) continue;
    for (const rule of findings(name,b.toString('utf8'))) errors.push(name+': '+rule);
  }
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
  else console.log('PASS: secret patterns and environment-file policy (working tree)');
}

