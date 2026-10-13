import { describe, expect, it } from 'vitest';
import { articleFromHtml, MIN_ARTICLE_CHARS } from './html-article';

// Trang bài viết tĩnh: có tiêu đề, danh sách, bảng, link tương đối, kèm menu và quảng cáo để kiểm
// tra phần nhiễu bị bỏ.
const staticArticle = `<!doctype html>
<html lang="vi">
  <head><title>Hợp đồng mẫu 2026</title></head>
  <body>
    <nav><a href="/">Trang chủ</a> <a href="/lien-he">Liên hệ</a></nav>
    <div class="advertisement">Mua ngay kẻo lỡ</div>
    <article>
      <h1>Hợp đồng mẫu 2026</h1>
      <p>
        Điều 1. Bên A giao cho Bên B phần mềm theo danh mục kèm theo. Bên B thanh toán đúng hạn và
        chịu trách nhiệm bảo mật dữ liệu nhận được trong suốt thời gian thực hiện hợp đồng. Hai bên
        thống nhất mọi thay đổi phải lập thành phụ lục có chữ ký của cả hai bên trước khi áp dụng.
      </p>
      <h2>Danh mục bàn giao</h2>
      <ul>
        <li>Mã nguồn và tài liệu kỹ thuật</li>
        <li>Biên bản kiểm thử nghiệm thu</li>
      </ul>
      <table>
        <thead><tr><th>Khoản</th><th>Giá trị</th></tr></thead>
        <tbody><tr><td>Thanh toán lần một</td><td>50%</td></tr></tbody>
      </table>
      <p>Xem thêm <a href="/phu-luc">phụ lục bảo mật</a> trước khi ký.</p>
    </article>
    <footer>Bản quyền 2026 của tạp chí luật</footer>
  </body>
</html>`;

// Trang của một ứng dụng một trang: nội dung do JavaScript dựng, HTML nhận về gần như rỗng.
const javascriptPage = `<!doctype html>
<html lang="vi">
  <head><title>Ứng dụng đọc</title></head>
  <body>
    <div id="root"></div>
    <script>document.getElementById('root').innerHTML = '<article>nội dung do js dựng</article>';</script>
  </body>
</html>`;

describe('articleFromHtml', () => {
  it('giữ tiêu đề, danh sách, bảng và link tuyệt đối trong bản Markdown', () => {
    const article = articleFromHtml(staticArticle, { url: 'https://example.com/bai-viet' });
    expect(article.kind).toBe('ok');
    if (article.kind !== 'ok') {
      return;
    }

    expect(article.title).toBe('Hợp đồng mẫu 2026');
    // Readability gộp thẻ h1 trùng với tiêu đề vào `title`, nên tiêu đề nằm ở `article.title`
    // chứ không còn dòng `# ...` trong Markdown; các cấp tiêu đề còn lại vẫn được giữ.
    expect(article.markdown).toContain('## Danh mục bàn giao');
    expect(article.markdown).toMatch(/^-\s+Mã nguồn và tài liệu kỹ thuật$/m);
    expect(article.markdown).toContain('| Khoản | Giá trị |');
    // Link tương đối phải trỏ về đúng trang gốc, không để lại `/phu-luc`.
    expect(article.markdown).toContain('https://example.com/phu-luc');
    expect(article.textLength).toBeGreaterThan(MIN_ARTICLE_CHARS);
  });

  it('bỏ menu, quảng cáo và chân trang', () => {
    const article = articleFromHtml(staticArticle, { url: 'https://example.com/bai-viet' });
    expect(article.kind).toBe('ok');
    if (article.kind !== 'ok') {
      return;
    }
    expect(article.markdown).not.toContain('Mua ngay kẻo lỡ');
    expect(article.markdown).not.toContain('Bản quyền 2026 của tạp chí luật');
  });

  it('đánh dấu unreadable cho trang chỉ render bằng JavaScript', () => {
    const article = articleFromHtml(javascriptPage, { url: 'https://example.com/app' });
    expect(article.kind).toBe('unreadable');
    if (article.kind === 'unreadable') {
      expect(['no_article_content', 'content_requires_javascript', 'empty_markdown']).toContain(
        article.reason,
      );
    }
  });

  it('đánh dấu unreadable cho HTML rỗng', () => {
    expect(articleFromHtml('   ')).toEqual({ kind: 'unreadable', reason: 'empty_html' });
  });
});
