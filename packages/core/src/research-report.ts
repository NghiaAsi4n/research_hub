import type { ResearchState } from './research';

export const MIN_RESEARCH_SOURCES = 5;
export const RESEARCH_REFUSAL = 'Không đủ bằng chứng để kết luận.';

const PARTIAL_REASONS: Record<string, string> = {
  turn_budget: 'đã hết thời gian của lượt chạy',
  session_budget: 'đã hết thời hạn phiên research',
  unit_budget: 'đã chạm hạn mức',
  step_limit: 'đã chạm giới hạn bước của lượt chạy',
};

function sourceLink(title: string, rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return title;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    return title;
  }
  const href = url.href.replaceAll('(', '%28').replaceAll(')', '%29');
  const safeTitle = title.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
  return `[${safeTitle}](${href})`;
}

function quoteExcerpt(excerpt: string): string {
  return excerpt
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line.trim()}`)
    .join('\n');
}

function sanitizeConclusion(markdown: string): string {
  return markdown
    .replace(/<[^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .trim();
}

export function renderResearchReport(
  state: ResearchState,
  options: { conclusion?: string; partialReason?: string } = {},
): string {
  const sources = state.sources.filter((source) => source.read && source.excerpt?.trim());
  const candidate = sanitizeConclusion(options.conclusion ?? state.notes.join('\n'));
  const enoughEvidence = sources.length >= MIN_RESEARCH_SOURCES && candidate.length > 0;
  const lines = [
    '# Báo cáo nghiên cứu',
    '',
    '## Kết luận',
    '',
    enoughEvidence ? candidate : RESEARCH_REFUSAL,
    '',
    '## Bằng chứng',
    '',
  ];

  if (sources.length === 0) {
    lines.push('Chưa có nguồn nào được đọc thành công.');
  } else {
    sources.forEach((source, index) => {
      lines.push(
        `### [${index + 1}] ${sourceLink(source.title, source.url)}`,
        '',
        quoteExcerpt(source.excerpt ?? ''),
        '',
      );
    });
  }

  lines.push('## Nguồn', '');
  if (sources.length === 0) {
    lines.push('Chưa có nguồn.');
  } else {
    sources.forEach((source, index) => {
      lines.push(`${index + 1}. ${sourceLink(source.title, source.url)}`);
    });
  }

  if (options.partialReason) {
    const reason = PARTIAL_REASONS[options.partialReason] ?? 'run đã dừng trước khi hoàn tất';
    lines.push('', '## Trạng thái', '', `Báo cáo một phần: ${reason}.`);
  }

  return lines.join('\n').trim();
}
