import { z } from 'zod';

export const documentIdSchema = z.uuid();
export const progressSchema = z
  .object({
    section: z.string().max(100).nullable(),
    ratio: z.number().min(0).max(1),
  })
  .strict();
export const highlightSchema = z
  .object({
    startOffset: z.number().int().min(0).max(100_000_000),
    endOffset: z.number().int().min(1).max(100_000_000),
    quote: z.string().min(1).max(10_000),
  })
  .strict()
  .refine(
    (value) =>
      value.endOffset > value.startOffset &&
      value.endOffset - value.startOffset === value.quote.length,
  );

export type ReadingPosition = z.infer<typeof progressSchema>;
export type HighlightInput = z.infer<typeof highlightSchema>;
export type SavedHighlight = HighlightInput & { id: string };
export type ReaderDocument = {
  id: string;
  title: string;
  status: string;
  pages: number | null;
  sources: { id: string; kind: string; url: string | null }[];
  progress: ReadingPosition | null;
  highlights: SavedHighlight[];
};
