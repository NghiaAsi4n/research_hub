// Nhận diện chuỗi giống khoá bí mật trước khi ghi log, export hoặc run_steps (Giai đoạn 5, T4).
//
// Chỉ trả loại khoá, không trả giá trị: thông báo lỗi và log không được làm lộ chính khoá đó.

export type SecretKind =
  | 'openai_key'
  | 'google_api_key'
  | 'github_token'
  | 'slack_token'
  | 'telegram_bot_token'
  | 'aws_access_key'
  | 'database_url_with_password';

const PATTERNS: { kind: SecretKind; pattern: RegExp }[] = [
  { kind: 'openai_key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { kind: 'google_api_key', pattern: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { kind: 'github_token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { kind: 'slack_token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'telegram_bot_token', pattern: /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g },
  { kind: 'aws_access_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'database_url_with_password', pattern: /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/g },
];

export function findSecretKinds(text: string): SecretKind[] {
  const found: SecretKind[] = [];
  for (const { kind, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text) && !found.includes(kind)) found.push(kind);
  }
  return found;
}

export function containsSecret(text: string): boolean {
  return findSecretKinds(text).length > 0;
}

export function assertNoSecrets(text: string, context: string): void {
  const kinds = findSecretKinds(text);
  if (kinds.length > 0) {
    throw new Error(`${context} chứa khoá bí mật (${kinds.join(', ')}); không ghi tiếp.`);
  }
}

export function redactSecrets(text: string): string {
  let result = text;
  for (const { kind, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, `[redacted:${kind}]`);
  }
  return result;
}
