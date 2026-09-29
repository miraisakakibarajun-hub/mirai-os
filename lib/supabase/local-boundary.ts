// Phase 4-A authorizes only this isolated synthetic-data project.
export function requireLocalSupabase(value: string | undefined, environment = 'local'): string {
  if (!value) throw new Error('Phase 3-A: ローカルSupabase接続先が必要です。');
  const url = new URL(value);
  const local = environment === 'local' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const staging = environment === 'staging' && url.origin === 'https://jtjbjzlfmfuuecpxfsgd.supabase.co';
  if ((!local && !staging) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('許可された検証環境以外には接続できません。');
  }
  return url.origin;
}

