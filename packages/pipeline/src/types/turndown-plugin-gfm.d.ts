// `turndown-plugin-gfm` không kèm kiểu và cũng không có gói `@types` trên registry, nên khai báo
// phần API mà dự án dùng. Xem `markdownFromHtml` trong `../read/html-article.ts`.

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}
