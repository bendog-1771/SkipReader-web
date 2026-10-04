export type ThemeName = "paper" | "night" | "sepia" | "forest" | "blue" | "dusk";

export interface YujingSettings {
  enabled: boolean;
  scene: "wind" | "ocean" | "train" | "orbit";
  mood: "dawn" | "day" | "dusk" | "night";
  speed: number;
  intensity: number;
  paused: boolean;
  blend: "art" | "mix";
  source: "highlights" | "chapter" | "manual";
  manualQuotes: string[];
  soundStrength: number;
}

export interface AppSettings {
  yujing?: YujingSettings;
  theme: ThemeName;
  uiFontSize: number;
  readerFontSize: number;
  readerFontFamily: string;
  lineHeight: number;
  margin: number;
  dictionary: {
    enabled?: boolean;
    webApiUrl?: string;
    supplementEnglish?: boolean;
    hover: boolean;
    click: boolean;
    doubleClick: boolean;
    selection: boolean;
    source: "free" | "bing" | "custom" | "baidu" | "ecdict";
    customApiUrl: string;
    customApiKeyService: string;
    baiduAppId: string;
    baiduApiKeyService: string;
    definitionOrder: "english-first" | "chinese-first";
    autoSingularLookup: boolean;
    showVerbBaseForm: boolean;
    pronunciationSource: "free" | "bing" | "baidu" | "custom";
    defaultWebSource: "cambridge" | "bing" | "oxford" | "collins";
  };
  ai: {
    enabled: boolean;
    baseUrl: string;
    model: string;
    keyService: string;
    retentionDays: 0 | 1 | 3 | 7 | 30 | -1;
    historyRounds: number;
    useBaiduForTranslation: boolean;
  };
  tts: {
    provider: "edge" | "webspeech";
    rate: number;
    voice: string;
    autoScroll: boolean;
  };
  library: {
    activeShelfId: string;
    shelves: Array<{ id: string; name: string; createdAt: string }>;
    bookShelfMap: Record<string, string[]>;
    favoriteBookIds: string[];
    pinnedBookIds: string[];
    showReadingStats: boolean;
    bookViewMode: "grid" | "compact";
    sortMode: "recent" | "title" | "author" | "imported";
  };
  backgrounds: {
    appPath: string;
    readerPath: string;
    appPositionX: number;
    appPositionY: number;
    readerPositionX: number;
    readerPositionY: number;
    appScale: number;
    readerScale: number;
    appOpacity: number;
    readerOpacity: number;
  };
  onboarding: {
    helpShown: boolean;
  };
  vocabulary: { lastNotebookId: string; bookDefaults: Record<string, string> };
  confirmMinorDeletes: boolean;
  shortcuts: Record<string, string>;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  filePath: string;
  fileType: string;
  coverPath?: string;
  importedAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  missing: boolean;
  contentKey?: string;
  deletedAt?: string;
  associatedBookId?: string;
  associationDismissedAt?: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  href?: string;
  orderIndex: number;
  plainText: string;
  htmlPath?: string;
  wordCount: number;
  children?: Chapter[];
}

export type TocItemKind = "part" | "chapter" | "section" | "frontmatter" | "backmatter";

export interface TocItem {
  id: string;
  bookId: string;
  chapterId?: string;
  title: string;
  href?: string;
  orderIndex: number;
  level: number;
  parentId?: string;
  kind: TocItemKind;
  children?: TocItem[];
}

export interface ReadingPosition {
  bookId: string;
  chapterId?: string;
  paragraphIndex?: number;
  charOffset?: number;
  absoluteOffset?: number;
  scrollOffset: number;
  progress: number;
  updatedAt: string;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId?: string;
  title: string;
  excerpt: string;
  scrollOffset: number;
  absoluteOffset?: number;
  paragraphIndex?: number;
  charOffset?: number;
  createdAt: string;
}

export interface Notebook {
  id: string;
  name: string;
  createdAt: string;
}

export interface VocabItem {
  id: string;
  notebookId: string;
  bookId?: string;
  bookTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  word: string;
  phrase?: string;
  phonetic?: string;
  englishDef?: string;
  definitionSource?: string;
  attributions?: Array<{ label: string; url: string }>;
  chineseDef?: string;
  example?: string;
  sourceSentence?: string;
  paragraphIndex?: number;
  startOffset?: number;
  endOffset?: number;
  createdAt: string;
}

export interface ReaderNote {
  id: string;
  bookId: string;
  bookTitle?: string;
  chapterId: string;
  chapterTitle: string;
  selectedText: string;
  noteText?: string;
  lineStyle: "solid" | "wavy";
  color: string;
  paragraphIndex?: number;
  startOffset?: number;
  endOffset?: number;
  createdAt: string;
}

export interface DictionaryResult {
  term: string;
  baseForm?: string;
  phonetic: string;
  englishDefinitions: string[];
  chineseDefinition: string;
  examples: string[];
  audio?: string;
  audioUs?: string;
  audioUk?: string;
  source: string;
  englishSource?: string;
  attributions?: Array<{ label: string; url: string }>;
  links: Array<{ label: string; url: string }>;
  related?: {
    synonyms?: Array<{ pos: string; words: string[] }>;
    antonyms?: Array<{ pos: string; words: string[] }>;
  };
}

export interface ImportResult {
  book: Book;
  chapters: Chapter[];
  tocItems?: TocItem[];
  associationCandidate?: BookAssociationCandidate;
}

export interface BookAssociationCandidate {
  oldBookId: string;
  oldTitle: string;
  oldAuthor?: string;
  deletedAt?: string;
  notes: number;
  vocabItems: number;
  bookmarks: number;
}

export interface AppSnapshot {
  settings: AppSettings;
  books: Book[];
  notebooks: Notebook[];
  vocab: VocabItem[];
}
