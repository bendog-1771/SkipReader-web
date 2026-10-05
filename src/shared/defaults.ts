import type { AppSettings, YujingSettings } from "./types";

export const DEFAULT_YUJING: YujingSettings = { enabled: false, scene: "ocean", mood: "day", speed: .7, intensity: .85, paused: false, blend: "art", source: "highlights", manualQuotes: [], soundStrength: 1.8, readerOpacity: .78, planetCount: 24, matchTheme: false, chromeOpacity: .34, bottlesEnabled: true };

export const DEFAULT_SETTINGS: AppSettings = {
  yujing: DEFAULT_YUJING,
  theme: "paper",
  uiFontSize: 14,
  readerFontSize: 18,
  readerFontFamily: "Georgia, 'Times New Roman', 'Noto Serif', serif",
  lineHeight: 1.75,
  margin: 52,
  dictionary: {
    enabled: true,
    hover: false,
    click: true,
    doubleClick: false,
    selection: false,
    source: "bing",
    customApiUrl: "",
    customApiKeyService: "dictionary-custom",
    baiduAppId: "",
    baiduApiKeyService: "dictionary-baidu",
    definitionOrder: "chinese-first",
    autoSingularLookup: true,
    showVerbBaseForm: false,
    pronunciationSource: "free",
    defaultWebSource: "cambridge"
  },
  ai: {
    enabled: false,
    baseUrl: "https://api.openai.com",
    model: "gpt-4.1-mini",
    keyService: "openai-compatible",
    retentionDays: 7,
    historyRounds: 6,
    useBaiduForTranslation: false
  },
  tts: {
    provider: "edge",
    rate: 0.95,
    voice: "en-US-JennyNeural",
    autoScroll: false
  },
  library: {
    activeShelfId: "all",
    shelves: [],
    bookShelfMap: {},
    favoriteBookIds: [],
    pinnedBookIds: [],
    showReadingStats: true,
    bookViewMode: "grid",
    sortMode: "recent"
  },
  backgrounds: {
    appPath: "",
    readerPath: "",
    appPositionX: 50,
    appPositionY: 50,
    readerPositionX: 50,
    readerPositionY: 50,
    appScale: 100,
    readerScale: 100,
    appOpacity: 70,
    readerOpacity: 45
  },
  onboarding: {
    helpShown: false
  },
  vocabulary: { lastNotebookId: "", bookDefaults: {} },
  confirmMinorDeletes: true,
  shortcuts: {
    previousChapter: "Alt+ArrowLeft",
    nextChapter: "Alt+ArrowRight",
    previousPage: "Alt+ArrowUp",
    nextPage: "Alt+ArrowDown",
    lookup: "Ctrl+D",
    addVocab: "Ctrl+Shift+V",
    speak: "Space",
    speakFromSelection: "Ctrl+Alt+S",
    search: "Ctrl+F",
    toggleTheme: "Ctrl+Shift+T",
    addBookmark: "Ctrl+B"
  }
};

export const READER_FONTS = [
  { label: "Georgia 经典衬线", value: "Georgia, 'Times New Roman', 'Noto Serif', serif" },
  { label: "Times New Roman 纸书感", value: "'Times New Roman', Times, 'Noto Serif', serif" },
  { label: "Segoe UI 清爽无衬线", value: "'Segoe UI', Arial, 'Microsoft YaHei', sans-serif" },
  { label: "Arial 高兼容", value: "Arial, Helvetica, 'Microsoft YaHei', sans-serif" },
  { label: "Verdana 大字距", value: "Verdana, Geneva, 'Microsoft YaHei', sans-serif" },
  { label: "Cambria 长文阅读", value: "Cambria, Georgia, 'Times New Roman', serif" },
  { label: "Palatino 柔和衬线", value: "'Palatino Linotype', Palatino, Georgia, serif" }
];

export const SHORTCUTS = [
  { id: "previousChapter", keys: "Alt+ArrowLeft", action: "上一章" },
  { id: "nextChapter", keys: "Alt+ArrowRight", action: "下一章" },
  { id: "previousPage", keys: "Alt+ArrowUp", action: "上一页" },
  { id: "nextPage", keys: "Alt+ArrowDown", action: "下一页" },
  { id: "lookup", keys: "Ctrl+D", action: "查词" },
  { id: "addVocab", keys: "Ctrl+Shift+V", action: "添加生词" },
  { id: "speak", keys: "Space", action: "朗读/暂停" },
  { id: "speakFromSelection", keys: "Ctrl+Alt+S", action: "从选中处朗读" },
  { id: "search", keys: "Ctrl+F", action: "全文搜索" },
  { id: "toggleTheme", keys: "Ctrl+Shift+T", action: "切换主题" },
  { id: "addBookmark", keys: "Ctrl+B", action: "添加书签" }
];
