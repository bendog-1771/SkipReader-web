import type { AppSettings, Book, Chapter, TocItem, Bookmark, Notebook, ReaderNote, ReadingPosition, VocabItem } from "../shared/types";
export type Data = {
 settings: AppSettings; books: Book[]; chapters: Chapter[]; tocItems: TocItem[];
 positions: ReadingPosition[]; chapterPositions: ReadingPosition[];
 bookmarks: Bookmark[]; notebooks: Notebook[]; vocab: VocabItem[]; notes: ReaderNote[];
};
