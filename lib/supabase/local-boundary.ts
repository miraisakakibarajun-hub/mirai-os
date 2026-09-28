// Phase 3-A is local/synthetic only; hosted access needs a separate approval.
export function requireLocalSupabase(value: string | undefined): string {
  if (!value) throw new Error('Phase 3-A: ローカルSupabase接続先が必要です。');
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Phase 3-A: クラウドDBへの接続は禁止されています。');
  }
  return url.origin;
}

