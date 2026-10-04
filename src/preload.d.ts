import type { LearningExportFormat } from "./shared/learningExport";
import type { AppSettings, Bookmark, Book, Chapter, DictionaryResult, ImportResult, Notebook, ReaderNote, ReadingPosition, TocItem, VocabItem } from "./shared/types";

declare global {
  interface Window {
    readerAPI: {
      books: {
        import(): Promise<ImportResult | null>;
        list(): Promise<Book[]>;
        open(bookId: string, options?: { touchLastOpened?: boolean }): Promise<{ book: Book; chapters: Chapter[]; tocItems: TocItem[]; position: ReadingPosition | null; chapterPositions: ReadingPosition[]; bookmarks: Bookmark[] }>;
        chapterHtml(chapterId: string): Promise<string>;
        chapterText(chapterId: string): Promise<string>;
        savePosition(position: ReadingPosition): Promise<ReadingPosition>;
        savePositionSync(position: ReadingPosition): ReadingPosition | null;
        addBookmark(bookmark: Omit<Bookmark, "id" | "createdAt">): Promise<Bookmark>;
        deleteBookmark(id: string): Promise<void>;
        delete(bookId: string): Promise<void>;
        associateDeletedContent(oldBookId: string, newBookId: string): Promise<{ notes: number; vocabItems: number; bookmarks: number }>;
        dismissAssociation(oldBookId: string): Promise<void>;
        relocate(bookId: string): Promise<Book | null>;
        rename(bookId: string, title: string): Promise<Book>;
        exportCover(bookId: string): Promise<string | null>;
        exportNotes(bookId: string, mode: "ideas" | "highlights"): Promise<string | null>;
      };
      settings: {
        get(): Promise<AppSettings>;
        set(settings: AppSettings): Promise<AppSettings>;
        importBackground(): Promise<string | null>;
      };
      secrets: {
        set(service: string, value: string): Promise<void>;
        has(service: string): Promise<boolean>;
      };
      vocab: {
        list(): Promise<{ notebooks: Notebook[]; items: VocabItem[] }>;
        addNotebook(name: string): Promise<Notebook>;
        renameNotebook(id: string, name: string): Promise<Notebook>;
        deleteNotebook(id: string): Promise<void>;
        addItem(item: Omit<VocabItem, "id" | "createdAt">): Promise<VocabItem>;
        deleteItem(id: string): Promise<void>;
        exportTxt(notebookId: string): Promise<string | null>;
        exportCsv(notebookId: string): Promise<string | null>;
        exportItems(items: VocabItem[], format: LearningExportFormat, defaultName?: string): Promise<string | null>;
      };
      notes: {
        list(bookId: string): Promise<ReaderNote[]>;
        listAll(): Promise<ReaderNote[]>;
        add(note: Omit<ReaderNote, "id" | "createdAt">): Promise<ReaderNote>;
        update(id: string, patch: Partial<Pick<ReaderNote, "noteText" | "lineStyle" | "color">>): Promise<ReaderNote>;
        delete(id: string): Promise<void>;
        exportItems(notes: ReaderNote[], bookTitles: Record<string, string>, format?: LearningExportFormat, defaultName?: string): Promise<string | null>;
      };
      dictionary: {
        lookup(term: string): Promise<DictionaryResult>;
        lookupWithSource(term: string, source: "free" | "bing" | "baidu" | "custom"): Promise<DictionaryResult>;
        lookupBingBasic(term: string): Promise<DictionaryResult>;
        openOfficial(url: string): Promise<void>;
        browserShow(url: string, bounds: { x: number; y: number; width: number; height: number }): Promise<{ loading: boolean; canGoBack: boolean; canGoForward: boolean; visible: boolean; url: string }>;
        browserSetBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<{ loading: boolean; canGoBack: boolean; canGoForward: boolean; visible: boolean; url: string }>;
        browserHide(): Promise<{ loading: boolean; canGoBack: boolean; canGoForward: boolean; visible: boolean; url: string }>;
        browserControl(action: "back" | "forward" | "reload"): Promise<{ loading: boolean; canGoBack: boolean; canGoForward: boolean; visible: boolean; url: string }>;
        onBrowserState(callback: (state: { loading: boolean; canGoBack: boolean; canGoForward: boolean; visible: boolean; url: string }) => void): () => void;
      };
      ai: {
        ask(question: string, context: string): Promise<string>;
      };
      tts: {
        edgeSpeak(text: string, rate: number, voice: string): Promise<{ available: boolean; audioBase64?: string; error?: string }>;
      };
      backup: {
        export(): Promise<string | null>;
        import(): Promise<{ filePath?: string; safetyBackupPath?: string; books: number; chapters: number; tocItems: number; notebooks: number; vocabItems: number; notes: number; bookmarks: number } | null>;
      };
      logs: {
        export(): Promise<string | null>;
      };
      window: {
        toggleMaximize(): Promise<boolean>;
      };
    };
  }

}

export {};
