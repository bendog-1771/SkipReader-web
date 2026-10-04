import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SETTINGS, READER_FONTS, SHORTCUTS } from "../../shared/defaults";
import type { AppSettings, Book, Bookmark, Chapter, DictionaryResult, Notebook, ReaderNote, ReadingPosition, TocItem, VocabItem } from "../../shared/types";
import "../shared/styles/app.css";
import { EXPORT_STYLES, learningExportName, exportExtension, type LearningExportFormat } from "../../shared/learningExport";
import { ProtectionPanel } from "../../web/ProtectionPanel";
import { Yujing } from "../../web/yujing/Yujing";

const WEB = typeof window !== "undefined" && Boolean((window as any).eReadWeb);
const WEB_HIGHLIGHTS = WEB && typeof (window as any).Highlight === "function" && Boolean((CSS as any).highlights);

type LookupOrigin = { context: string; range: { start: number; end: number } | null };
type ExportRequest = { kind: "vocab"; items: VocabItem[]; name: string } | { kind: "notes"; items: ReaderNote[]; name: string };
type PendingVocab = Omit<VocabItem, "id" | "createdAt" | "notebookId">;

type SideTab = "toc" | "bookmarks" | "dictionary" | "vocab" | "notes" | "ai" | "settings";
type DictionaryPanelTab = "definition" | "web";
type LibraryTab = "all" | "favorites" | "vocab" | "notes";
type AiMessage = { role: "user" | "assistant"; text: string; createdAt: string };
type AiContextMode = "selection" | "paragraph" | "chapter";
type SettingCategory = "library" | "appearance" | "dictionary" | "ai" | "tts" | "shortcuts" | "backup";
type TtsSegment = { text: string; chapterIndex: number; startOffset: number; endOffset: number };
type ReaderAnchor = { chapterId: string; paragraphIndex: number; charOffset: number; scrollOffset?: number; absoluteOffset?: number };
type ChapterPage = { startBlock: number; endBlock: number; startOffset: number; endOffset: number; textLength: number };
type DictionaryBrowserState = { loading: boolean; canGoBack: boolean; canGoForward: boolean; visible: boolean; url: string };
type InfoModal = "help" | "about" | null;
type ConfirmDialog = { title: string; message: string; danger?: boolean; onConfirm: () => void; onCancel?: () => void };
type PromptDialog = { title: string; label: string; value: string; confirmText?: string; onConfirm: (value: string) => void; onCancel?: () => void };
type BackgroundEditor = { target: "app" | "reader"; path: string; x: number; y: number; scale: number; opacity: number };

const PAGE_TEXT_TARGET = 6500;
const PAGE_TEXT_MIN = 4200;
const PAGE_HARD_BLOCK_TARGET = 5200;
const POSITION_SAVE_DEBOUNCE_MS = 2200;
const POSITION_SAVE_FALLBACK_MS = 30000;
const FLOAT_WIDTH = 420;
const FLOAT_INITIAL_HEIGHT = 360;
const FLOAT_TITLEBAR_HEIGHT = 56;
const NOTE_COLORS = ["#f2c94c", "#6fcf97", "#56ccf2", "#eb5757", "#bb6bd9"];
const NOTE_COLOR_NAMES: Record<string, string> = {
  "#f2c94c": "黄色",
  "#6fcf97": "绿色",
  "#56ccf2": "蓝色",
  "#eb5757": "红色",
  "#bb6bd9": "紫色"
};
const INVARIANT_S_WORDS = new Set(["news", "series", "species", "means", "deer", "sheep", "fish", "economics", "physics", "mathematics", "politics"]);
const SETTING_CATEGORIES: Array<{ id: SettingCategory; label: string }> = [
  { id: "library", label: "主界面" },
  { id: "appearance", label: "阅读外观" },
  { id: "dictionary", label: "查词" },
  { id: "ai", label: "AI" },
  { id: "tts", label: "朗读" },
  { id: "shortcuts", label: "快捷键" },
  { id: "backup", label: "备份与日志" }
];

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [expandedTocIds, setExpandedTocIds] = useState<string[]>([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterHtml, setChapterHtml] = useState("");
  const chapterHtmlOwner = useRef("");
  const [chapterLoadTick, setChapterLoadTick] = useState(0);
  const [chapterPageIndex, setChapterPageIndex] = useState(0);
  const [chapterPositions, setChapterPositions] = useState<Record<string, ReadingPosition>>({});
  const chapterPositionsRef = useRef<Record<string, ReadingPosition>>({});
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<ReaderNote[]>([]);
  const [allNotes, setAllNotes] = useState<ReaderNote[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [activeNotebook, setActiveNotebook] = useState("");
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null);
  const [exportFormat, setExportFormat] = useState<LearningExportFormat>("html");
  const [exportBusy, setExportBusy] = useState(false);
  const [pendingVocab, setPendingVocab] = useState<PendingVocab | null>(null);
  const [saveNotebookId, setSaveNotebookId] = useState("");
  const [newNotebookName, setNewNotebookName] = useState("");
  const [rememberBookNotebook, setRememberBookNotebook] = useState(false);
  const [vocabSaveBusy, setVocabSaveBusy] = useState(false);
  const vocabSaveInFlight = useRef(false);
  const dictionaryOrigin = useRef<PendingVocab | null>(null);
  const collectionScroll = useRef<Partial<Record<LibraryTab, number>>>({});
  const collectionGridRef = useRef<HTMLDivElement | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>("toc");
  const [viewMode, setViewMode] = useState<"library" | "reader">("library");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("all");
  const [libraryNavigationOpen, setLibraryNavigationOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [readerSideCollapsed, setReaderSideCollapsed] = useState(WEB && matchMedia("(max-width: 860px)").matches);
  const [dictionaryFloatOpen, setDictionaryFloatOpen] = useState(false);
  const [dictionaryFloatPoint, setDictionaryFloatPoint] = useState({ x: 0, y: 0 });
  const [dictionaryDragging, setDictionaryDragging] = useState(false);
  const [vocabMultiSelect, setVocabMultiSelect] = useState(false);
  const [notesMultiSelect, setNotesMultiSelect] = useState(false);
  const [vocabNotebookFilter, setVocabNotebookFilter] = useState("all");
  const [vocabBookFilter, setVocabBookFilter] = useState("all");
  const [vocabChapterFilter, setVocabChapterFilter] = useState("all");
  const [noteBookFilter, setMainNoteBookFilter] = useState("all");
  const [mainNoteChapterFilter, setMainNoteChapterFilter] = useState("all");
  const [mainNoteStyleFilter, setMainNoteStyleFilter] = useState<"all" | "solid" | "wavy">("all");
  const [mainNoteColorFilter, setMainNoteColorFilter] = useState("all");
  const [mainNoteIdeaOnly, setMainNoteIdeaOnly] = useState(false);
  const [noteIdeaOnly, setNoteIdeaOnly] = useState(false);
  const [librarySettingsOpen, setLibrarySettingsOpen] = useState(false);
  const [settingCategory, setSettingCategory] = useState<SettingCategory>("library");
  const [editingNote, setEditingNote] = useState<ReaderNote | null>(null);
  const [viewingNote, setViewingNote] = useState<ReaderNote | null>(null);
  const [editingIdea, setEditingIdea] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [promptDialog, setPromptDialog] = useState<PromptDialog | null>(null);
  const [backgroundEditor, setBackgroundEditor] = useState<BackgroundEditor | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModal>(null);
  const [openSelectId, setOpenSelectId] = useState("");
  const [selectedVocabIds, setSelectedVocabIds] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [selectedContext, setSelectedContext] = useState("");
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryResult | null>(null);
  const [dictionaryEnhancing, setDictionaryEnhancing] = useState(false);
  const [dictionaryPanelTab, setDictionaryPanelTab] = useState<DictionaryPanelTab>("definition");
  const [dictionaryWebUrl, setDictionaryWebUrl] = useState("");
  const [dictionaryWebState, setDictionaryWebState] = useState<DictionaryBrowserState>({ loading: false, canGoBack: false, canGoForward: false, visible: false, url: "" });
  const [dictionaryHistory, setDictionaryHistory] = useState<string[]>([]);
  const [dictionaryHistoryIndex, setDictionaryHistoryIndex] = useState(-1);
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState("");
  const [ttsState, setTtsState] = useState<"" | "loading" | "speaking" | "paused">("");
  const [ttsMenuOpen, setTtsMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [appShellSize, setAppShellSize] = useState({ width: 16, height: 9 });
  const [search, setSearch] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLog, setAiLog] = useState<AiMessage[]>([]);
  const [aiContextMode, setAiContextMode] = useState<AiContextMode>("selection");
  const [aiContextMenuOpen, setAiContextMenuOpen] = useState(false);
  const [aiDeleteMenu, setAiDeleteMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [noteStyleFilter, setNoteStyleFilter] = useState<"all" | "solid" | "wavy">("all");
  const [noteColorFilter, setNoteColorFilter] = useState("all");
  const [noteChapterFilter, setNoteChapterFilter] = useState("all");
  const [noteDraftColor, setNoteDraftColor] = useState(NOTE_COLORS[0]);
  const [ideaTargetId, setIdeaTargetId] = useState("");
  const [ideaDraft, setIdeaDraft] = useState("");
  const [renamingNotebookId, setRenamingNotebookId] = useState("");
  const [notebookDraftName, setNotebookDraftName] = useState("");
  const [creatingShelf, setCreatingShelf] = useState(false);
  const [shelfDraftName, setShelfDraftName] = useState("");
  const [renamingShelfId, setRenamingShelfId] = useState("");
  const [shelfMenu, setShelfMenu] = useState<{ shelfId: string; x: number; y: number } | null>(null);
  const [bookMenu, setBookMenu] = useState<{ bookId: string; x: number; y: number } | null>(null);
  const [exportMenuBookId, setExportMenuBookId] = useState("");
  const [shelfPickerBookId, setShelfPickerBookId] = useState("");
  const [notebookMenu, setNotebookMenu] = useState<{ notebookId: string; x: number; y: number } | null>(null);
  const [ttsPointer, setTtsPointer] = useState<TtsSegment | null>(null);
  const contextCloseTimer = useRef<number | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const vocabPanelRef = useRef<HTMLDivElement | null>(null);
  const aiChatLogRef = useRef<HTMLDivElement | null>(null);
  const dictionaryWebFrameRef = useRef<HTMLDivElement | null>(null);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const ideaDraftRef = useRef<HTMLTextAreaElement | null>(null);
  const editingIdeaRef = useRef<HTMLTextAreaElement | null>(null);
  const vocabScrollTop = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const savePositionTimer = useRef<number | null>(null);
  const positionFallbackTimer = useRef<number | null>(null);
  const readingPositionDirty = useRef(false);
  const pendingPositionToSave = useRef<ReadingPosition | null>(null);
  const savePositionInFlight = useRef<Promise<void> | null>(null);
  const lastSavedPositionSignature = useRef("");
  const restoreReleaseTimer = useRef<number | null>(null);
  const suppressPositionSave = useRef(false);
  const pendingAnchorRestore = useRef<ReaderAnchor | null>(null);
  const pendingLocateScroll = useRef(false);
  const pendingPageTopScroll = useRef(false);
  const locateSerial = useRef(0);
  const temporaryLocateActive = useRef(false);
  const chapterRequestSerial = useRef(0);
  const hoverLookupTimer = useRef<number | null>(null);
  const lookupSerial = useRef(0);
  const dictionaryCache = useRef(new Map<string, DictionaryResult>());
  const dictionaryDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const ttsQueueRef = useRef<TtsSegment[]>([]);
  const pendingWebSpeech = useRef<{ segment: TtsSegment; runId: number } | null>(null);
  const ttsQueueIndexRef = useRef(0);
  const ttsRunIdRef = useRef(0);
  const ttsEdgeCache = useRef(new Map<string, Promise<string | null>>());
  const aiLogSaveReadyKey = useRef("");

  const currentChapter = chapters[chapterIndex];
  useLayoutEffect(() => {
    if (viewMode === "library" && collectionGridRef.current) {
      collectionGridRef.current.scrollTop = collectionScroll.current[libraryTab] || 0;
    }
  }, [viewMode, libraryTab]);
  const collectionNotebookId = (activeBook && notebooks.some((item) => item.id === settings.vocabulary.bookDefaults[activeBook.id])
    ? settings.vocabulary.bookDefaults[activeBook.id] : activeNotebook) || "";
  const displayTocItems = useMemo(() => normalizeTocItemsForDisplay(tocItems.length ? tocItems : buildTocFromChapters(chapters[0]?.bookId || "", chapters)), [tocItems, chapters]);
  const contextText = currentChapter?.plainText || "";
  const aiLogStorageKey = activeBook && currentChapter ? aiLogKey(activeBook.id, currentChapter.id) : "";
  const sentences = useMemo(() => splitSentences(contextText), [contextText]);
  const chapterPages = useMemo(() => buildChapterPages(chapterHtml), [chapterHtml]);
  const safePageIndex = Math.min(chapterPageIndex, Math.max(0, chapterPages.length - 1));
  const searchMatches = useMemo(() => findSearchMatchesInHtml(chapterHtml, search), [chapterHtml, search]);
  const searchCount = searchMatches.length;
  const activeSearchRange = searchMatches[searchMatchIndex] || null;
  const savedDictionaryItem = useMemo(
    () => dictionary ? vocab.find((item) => item.notebookId === collectionNotebookId && item.word.toLowerCase() === dictionary.term.toLowerCase()) : undefined,
    [dictionary, vocab, collectionNotebookId]
  );
  const dictionarySaved = Boolean(savedDictionaryItem);
  const selectionKind = selectedText && isSimpleWord(selectedText) ? "word" : selectedText ? "text" : "none";
  const selectedMark = useMemo(() => findSelectedMark(notes, currentChapter?.id, selectedText, selectedRange), [notes, currentChapter?.id, selectedText, selectedRange]);
  const activeMarkColor = selectedMark?.color || noteDraftColor;
  const filteredNotes = useMemo(
    () => notes.filter((note) =>
      (noteChapterFilter === "all" || note.chapterId === noteChapterFilter) &&
      (noteStyleFilter === "all" || note.lineStyle === noteStyleFilter) &&
      (noteColorFilter === "all" || note.color === noteColorFilter) &&
      (!noteIdeaOnly || Boolean(note.noteText?.trim()))
    ),
    [notes, noteChapterFilter, noteStyleFilter, noteColorFilter, noteIdeaOnly]
  );
  const libraryShelves = settings.library.shelves;
  const activeShelf = settings.library.activeShelfId;
  const filteredBooks = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    const favorites = new Set(settings.library.favoriteBookIds);
    const pinned = new Set(settings.library.pinnedBookIds);
    const shelfMap = settings.library.bookShelfMap;
    return books
      .filter((book) => {
        if (libraryTab === "favorites" && !favorites.has(book.id)) return false;
        if ((libraryTab === "all" || libraryTab === "favorites") && activeShelf !== "all" && !(shelfMap[book.id] || []).includes(activeShelf)) return false;
        if (!query) return true;
        return `${book.title} ${book.author || ""} ${book.fileType}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const pinDelta = Number(pinned.has(b.id)) - Number(pinned.has(a.id));
        if (pinDelta) return pinDelta;
        switch (settings.library.sortMode) {
          case "title": return a.title.localeCompare(b.title);
          case "author": return (a.author || "").localeCompare(b.author || "") || a.title.localeCompare(b.title);
          case "imported": return String(b.importedAt).localeCompare(String(a.importedAt));
          default: return String(b.lastOpenedAt || b.importedAt).localeCompare(String(a.lastOpenedAt || a.importedAt));
        }
      });
  }, [books, librarySearch, libraryTab, activeShelf, settings.library]);
  const mainVocab = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    return vocab.filter((item) =>
      (vocabNotebookFilter === "all" || item.notebookId === vocabNotebookFilter) &&
      (vocabBookFilter === "all" || item.bookId === vocabBookFilter) &&
      (vocabChapterFilter === "all" || item.chapterId === vocabChapterFilter) &&
      (!query || item.word.toLowerCase().includes(query))
    );
  }, [vocab, vocabNotebookFilter, vocabBookFilter, vocabChapterFilter, librarySearch]);
  const mainNotes = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    return allNotes.filter((note) =>
      (noteBookFilter === "all" || note.bookId === noteBookFilter) &&
      (mainNoteChapterFilter === "all" || note.chapterId === mainNoteChapterFilter) &&
      (mainNoteStyleFilter === "all" || note.lineStyle === mainNoteStyleFilter) &&
      (mainNoteColorFilter === "all" || note.color === mainNoteColorFilter) &&
      (!mainNoteIdeaOnly || Boolean(note.noteText?.trim())) &&
      (!query || `${note.selectedText} ${note.noteText || ""} ${note.chapterTitle}`.toLowerCase().includes(query))
    );
  }, [allNotes, noteBookFilter, mainNoteChapterFilter, mainNoteStyleFilter, mainNoteColorFilter, mainNoteIdeaOnly, librarySearch]);
  const vocabChapterOptions = useMemo(() => (
    vocabBookFilter === "all" ? [] : uniqueOptions(vocab.filter((item) => item.bookId === vocabBookFilter && item.chapterId), (item) => item.chapterId || "", (item) => item.chapterTitle || "未命名章节")
  ), [vocab, vocabBookFilter]);
  const noteChapterOptions = useMemo(() => (
    noteBookFilter === "all" ? [] : uniqueOptions(allNotes.filter((note) => note.bookId === noteBookFilter), (note) => note.chapterId, (note) => note.chapterTitle || "未命名章节")
  ), [allNotes, noteBookFilter]);
  useEffect(() => {
    boot();
  }, []);

  useEffect(() => {
    if (!WEB) return;
    const narrow = matchMedia("(max-width: 860px)");
    const collapse = () => { if (narrow.matches) setReaderSideCollapsed(true); };
    narrow.addEventListener("change", collapse);
    return () => narrow.removeEventListener("change", collapse);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--ui-font-size", `${settings.uiFontSize}px`);
    document.documentElement.style.setProperty("--reader-font-size", `${settings.readerFontSize}px`);
    document.documentElement.style.setProperty("--reader-font-family", settings.readerFontFamily);
    document.documentElement.style.setProperty("--reader-line-height", String(settings.lineHeight));
    document.documentElement.style.setProperty("--reader-margin", `${settings.margin}px`);
  }, [settings]);

  useEffect(() => {
    aiLogSaveReadyKey.current = "";
    setAiLog(trimAiLogRounds(loadAiLog(aiLogStorageKey, settings.ai.retentionDays), settings.ai.historyRounds));
  }, [aiLogStorageKey, settings.ai.retentionDays, settings.ai.historyRounds]);

  useEffect(() => {
    if (aiLogStorageKey && aiLogSaveReadyKey.current !== aiLogStorageKey) {
      aiLogSaveReadyKey.current = aiLogStorageKey;
      return;
    }
    pruneAllAiLogs(settings.ai.retentionDays);
    saveAiLog(aiLogStorageKey, aiLog, settings.ai.retentionDays);
  }, [aiLog, aiLogStorageKey, settings.ai.retentionDays]);

  useEffect(() => {
    if (viewMode === "library") setDictionaryFloatOpen(false);
  }, [viewMode]);

  useEffect(() => {
    const element = appShellRef.current;
    if (!element) return;
    const syncSize = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      setAppShellSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(element);
    window.addEventListener("resize", syncSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, [viewMode, readerSideCollapsed]);

  useEffect(() => {
    if (!currentChapter) return;
    const ancestors = tocAncestorIdsForChapter(displayTocItems, currentChapter.id);
    if (!ancestors.length) return;
    setExpandedTocIds((ids) => mergeIds(ids, ancestors));
  }, [displayTocItems, currentChapter?.id]);

  useEffect(() => {
    ++lookupSerial.current;
    dictionaryOrigin.current = null;
    setDictionary(null);
    setDictionaryEnhancing(false);
    setDictionaryPanelTab("definition");
    setDictionaryWebUrl("");
  }, [settings.dictionary.source, settings.dictionary.customApiUrl, settings.dictionary.baiduAppId, currentChapter?.id, viewMode]);

  useEffect(() => {
    function flushNow() {
      saveCurrentReadingPositionSync(true);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flushNow();
    }
    window.addEventListener("beforeunload", flushNow);
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("blur", flushNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushNow);
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("blur", flushNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeBook?.id, currentChapter?.id, chapterHtml, chapterPageIndex, chapterPages.length]);

  useEffect(() => {
    if (positionFallbackTimer.current) window.clearInterval(positionFallbackTimer.current);
    positionFallbackTimer.current = window.setInterval(() => {
      if (readingPositionDirty.current || pendingPositionToSave.current) void flushCurrentReadingPosition();
    }, POSITION_SAVE_FALLBACK_MS);
    return () => {
      if (positionFallbackTimer.current) {
        window.clearInterval(positionFallbackTimer.current);
        positionFallbackTimer.current = null;
      }
    };
  }, [activeBook?.id, currentChapter?.id, chapterHtml, chapterPageIndex, chapterPages.length]);

  useEffect(() => {
    if (!readerSideCollapsed && dictionaryFloatOpen) {
      setDictionaryFloatOpen(false);
      setSideTab("dictionary");
    }
  }, [readerSideCollapsed, dictionaryFloatOpen]);

  useEffect(() => {
    setLibrarySearch("");
  }, [libraryTab]);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!dictionaryDragRef.current) return;
      setDictionaryFloatPoint(clampFloatPoint(event.clientX - dictionaryDragRef.current.offsetX, event.clientY - dictionaryDragRef.current.offsetY, "drag"));
    }
    function onUp() {
      dictionaryDragRef.current = null;
      setDictionaryDragging(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => window.readerAPI.dictionary.onBrowserState((state) => setDictionaryWebState(state)), []);

  useEffect(() => {
    const active = sideTab === "dictionary" && dictionaryPanelTab === "web" && Boolean(dictionaryWebUrl) && !readerSideCollapsed && viewMode === "reader" && !exportRequest && !pendingVocab;
    if (!active) {
      window.readerAPI.dictionary.browserHide().then(setDictionaryWebState).catch(() => undefined);
      return;
    }
    let disposed = false;
    const bounds = () => {
      const rect = dictionaryWebFrameRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      };
    };
    const syncBounds = () => {
      const next = bounds();
      if (!next || disposed) return;
      window.readerAPI.dictionary.browserSetBounds(next).catch(() => undefined);
    };
    const showBrowser = async () => {
      const next = bounds();
      if (!next || disposed) return;
      const state = await window.readerAPI.dictionary.browserShow(dictionaryWebUrl, next);
      if (!disposed) setDictionaryWebState(state);
    };
    showBrowser();
    const frame = dictionaryWebFrameRef.current;
    const observer = frame ? new ResizeObserver(syncBounds) : null;
    if (frame) observer?.observe(frame);
    window.addEventListener("resize", syncBounds);
    const timer = window.setInterval(syncBounds, 350);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.clearInterval(timer);
      window.readerAPI.dictionary.browserHide().catch(() => undefined);
    };
  }, [dictionaryPanelTab, dictionaryWebUrl, readerSideCollapsed, sideTab, viewMode, exportRequest, pendingVocab]);

  useEffect(() => {
    if (!ttsPointer || ttsPointer.chapterIndex !== chapterIndex) return;
    if (!settings.tts.autoScroll) return;
    const targetPage = pageIndexForOffset(chapterPages, ttsPointer.startOffset);
    if (chapterPageIndex !== targetPage) {
      setChapterPageIndex(targetPage);
      return;
    }
    window.setTimeout(() => {
      const reader = readerRef.current;
      const range = WEB_HIGHLIGHTS && reader ? textTargetForPlainOffset(reader, ttsPointer.startOffset) : null;
      const target = reader?.querySelector(".tts-current");
      if (range) scrollRangeIntoReaderView(range, true);
      else if (target) scrollElementIntoReaderView(target as HTMLElement, true);
    }, 90);
  }, [ttsPointer, chapterIndex, chapterHtml, chapterPageIndex, chapterPages, settings.tts.autoScroll]);

  useEffect(() => {
    if (!WEB || !chapterHtml) return;
    const pending = pendingWebSpeech.current;
    if (!pending || pending.runId !== ttsRunIdRef.current) return;
    if (settings.tts.autoScroll && pending.segment.chapterIndex !== chapterIndex) return;
    if (settings.tts.autoScroll && chapterHtmlOwner.current !== chapters[pending.segment.chapterIndex]?.id) return;
    const frame = requestAnimationFrame(() => {
      if (pending !== pendingWebSpeech.current || pending.runId !== ttsRunIdRef.current) return;
      pendingWebSpeech.current = null;
      speakSegmentWithWebSpeech(pending.segment, pending.runId);
    });
    return () => cancelAnimationFrame(frame);
  }, [ttsPointer, chapterHtml, chapterIndex, chapterPageIndex, settings.tts.autoScroll]);

  useEffect(() => {
    if (!WEB || !selectedRange) return;
    const onResize = () => {
      if (!temporaryLocateActive.current) return;
      requestAnimationFrame(() => {
        const reader = readerRef.current;
        const range = reader ? textTargetForPlainOffset(reader, selectedRange.start) : null;
        if (range) scrollRangeIntoReaderView(range, true);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [selectedRange]);

  useEffect(() => {
    if (vocabBookFilter === "all") setVocabChapterFilter("all");
  }, [vocabBookFilter]);

  useEffect(() => {
    if (noteBookFilter === "all") setMainNoteChapterFilter("all");
  }, [noteBookFilter]);

  useEffect(() => {
    if (chapterPageIndex !== safePageIndex) setChapterPageIndex(safePageIndex);
  }, [chapterPageIndex, safePageIndex]);

  useEffect(() => {
    if (!currentChapter) return;
    suppressPositionSave.current = true;
    cancelPositionSaveTimer();
    if (!pendingLocateScroll.current) clearReaderSelection();
    setTranslation("");
    setSentenceIndex(0);
    if (!pendingAnchorRestore.current || pendingAnchorRestore.current.chapterId !== currentChapter.id) {
      pendingAnchorRestore.current = { chapterId: currentChapter.id, paragraphIndex: 0, charOffset: 0, scrollOffset: 0 };
    }
    setChapterHtml("");
    const requestId = ++chapterRequestSerial.current;
    const restoring = pendingAnchorRestore.current?.chapterId === currentChapter.id && ((pendingAnchorRestore.current.paragraphIndex || 0) > 0 || (pendingAnchorRestore.current.absoluteOffset || 0) > 0 || (pendingAnchorRestore.current.scrollOffset || 0) > 0);
    setLoading(restoring ? "加载中..." : "正在加载章节...");
    window.readerAPI.books.chapterHtml(currentChapter.id)
      .then((html) => {
        if (requestId === chapterRequestSerial.current) { chapterHtmlOwner.current = currentChapter.id; setChapterHtml(html); }
      })
      .catch((error) => pushNotice(error.message || String(error)))
      .finally(() => {
        if (requestId === chapterRequestSerial.current) setLoading("");
      });
  }, [currentChapter?.id, chapterLoadTick]);

  useEffect(() => {
    const pending = pendingAnchorRestore.current;
    if (!currentChapter || !pending || pending.chapterId !== currentChapter.id || !chapterHtml) return;
    if (WEB && chapterHtmlOwner.current !== currentChapter.id) return;
    const targetPage = pageIndexForAnchor(chapterPages, pending);
    if (chapterPageIndex !== targetPage) {
      setChapterPageIndex(targetPage);
      return;
    }
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (pendingAnchorRestore.current !== pending) return;
        scrollToReaderAnchor(pending);
        pendingAnchorRestore.current = null;
        schedulePositionSaveRelease(260);
      });
    });
    return () => { cancelAnimationFrame(outerFrame); cancelAnimationFrame(innerFrame); };
  }, [chapterHtml, currentChapter?.id, chapterPageIndex, chapterPages]);

  useEffect(() => {
    if (!pendingLocateScroll.current || !chapterHtml) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const reader = readerRef.current;
        const range = WEB_HIGHLIGHTS && reader && selectedRange ? textTargetForPlainOffset(reader, selectedRange.start) : null;
        const target = reader?.querySelector(".reader-selection") || reader?.querySelector(".reader-note");
        if (range) scrollRangeIntoReaderView(range, true);
        else if (target) scrollElementIntoReaderView(target as HTMLElement, true);
        pendingLocateScroll.current = false;
        schedulePositionSaveRelease(900);
      });
    });
  }, [chapterHtml, selectedRange, selectedText, chapterPageIndex]);

  useEffect(() => {
    setSearchMatchIndex(0);
  }, [search, currentChapter?.id]);

  useEffect(() => {
    if (searchMatchIndex >= searchMatches.length) setSearchMatchIndex(Math.max(0, searchMatches.length - 1));
  }, [searchMatchIndex, searchMatches.length]);

  useEffect(() => {
    if (!activeSearchRange || !chapterHtml || pendingAnchorRestore.current) return;
    const targetPage = pageIndexForOffset(chapterPages, activeSearchRange.start);
    if (chapterPageIndex !== targetPage) {
      setChapterPageIndex(targetPage);
      return;
    }
    requestAnimationFrame(() => {
      const reader = readerRef.current;
      const range = WEB_HIGHLIGHTS && reader ? textTargetForPlainOffset(reader, activeSearchRange.start) : null;
      const active = reader?.querySelector(".active-search");
      if (range) scrollRangeIntoReaderView(range, true);
      else if (active) scrollElementIntoReaderView(active as HTMLElement, true);
      queueCurrentReadingPositionSave(900);
    });
  }, [activeSearchRange, chapterHtml, chapterPageIndex, chapterPages]);

  useEffect(() => {
    if (!pendingPageTopScroll.current || pendingAnchorRestore.current || pendingLocateScroll.current) return;
    requestAnimationFrame(() => {
      readerRef.current?.scrollTo({ top: 0 });
      pendingPageTopScroll.current = false;
      queueCurrentReadingPositionSave(900);
    });
  }, [chapterPageIndex, chapterHtml]);

  useEffect(() => {
    if (sideTab !== "vocab") return;
    requestAnimationFrame(() => {
      if (vocabPanelRef.current) vocabPanelRef.current.scrollTop = vocabScrollTop.current;
    });
  }, [sideTab, activeNotebook]);

  useEffect(() => {
    if (sideTab !== "ai") return;
    requestAnimationFrame(() => {
      const log = aiChatLogRef.current;
      if (log) log.scrollTop = log.scrollHeight;
    });
  }, [sideTab, aiLog.length, aiLog[aiLog.length - 1]?.text]);

  useEffect(() => {
    if (!ideaTargetId) return;
    requestAnimationFrame(() => {
      const input = ideaDraftRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }, [ideaTargetId]);

  useEffect(() => {
    if (!editingNote) return;
    requestAnimationFrame(() => {
      const input = editingIdeaRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }, [editingNote?.id]);

  useEffect(() => {
    function closeContextMenus(event?: MouseEvent | KeyboardEvent) {
      const target = event?.target as HTMLElement | null;
      if (target?.closest?.(".export-menu-wrap, .note-color-filter, .tts-menu-wrap, .custom-select")) return;
      setBookMenu(null);
      setNotebookMenu(null);
      setAiDeleteMenu(null);
      setShelfMenu(null);
      setShelfPickerBookId("");


      setTtsMenuOpen(false);
      setOpenSelectId("");
    }
    window.addEventListener("click", closeContextMenus);
    window.addEventListener("keydown", closeContextMenus);
    return () => {
      window.removeEventListener("click", closeContextMenus);
      window.removeEventListener("keydown", closeContextMenus);
    };
  }, []);

  function closeFloatingMenus() {
    setBookMenu(null);
    setShelfMenu(null);
    setNotebookMenu(null);
    setAiDeleteMenu(null);
    setShelfPickerBookId("");
    setExportMenuBookId("");


    setTtsMenuOpen(false);
    setOpenSelectId("");
  }

  function scheduleContextClose() {
    if (contextCloseTimer.current) window.clearTimeout(contextCloseTimer.current);
    contextCloseTimer.current = window.setTimeout(closeFloatingMenus, 120);
  }

  function keepContextOpen() {
    if (contextCloseTimer.current) {
      window.clearTimeout(contextCloseTimer.current);
      contextCloseTimer.current = null;
    }
  }

  function askConfirm(title: string, message: string, danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      setConfirmDialog({
        title,
        message: message.replace(/。/g, ""),
        danger,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        }
      });
    });
  }

  function askPrompt(title: string, label: string, value = "", confirmText = "确认"): Promise<string | null> {
    return new Promise((resolve) => {
      setPromptDialog({
        title,
        label,
        value,
        confirmText,
        onConfirm: (next) => {
          setPromptDialog(null);
          resolve(next);
        },
        onCancel: () => {
          setPromptDialog(null);
          resolve(null);
        }
      });
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (document.querySelector(".modal-backdrop")) return;
      if ((event.target as HTMLElement | null)?.closest?.(".capture")) return;
      if (isTypingTarget(event.target)) return;
      if (shortcutMatches(event, settings.shortcuts.previousChapter)) {
        event.preventDefault();
        previousChapter();
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.nextChapter)) {
        event.preventDefault();
        nextChapter();
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.previousPage)) {
        event.preventDefault();
        previousReaderPage();
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.nextPage)) {
        event.preventDefault();
        nextReaderPage();
        return;
      }
      if ((!WEB || settings.dictionary.enabled) && shortcutMatches(event, settings.shortcuts.lookup)) {
        event.preventDefault();
        lookup(selectedText, false, true, selectedRange ? { context: selectedContext, range: selectedRange } : undefined);
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.addVocab)) {
        event.preventDefault();
        saveVocabItem();
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.speak)) {
        event.preventDefault();
        if (ttsState === "speaking" || ttsState === "loading" || ttsState === "paused") pauseTts();
        else speak(selectedText || sentenceAt(sentences, sentenceIndex));
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.speakFromSelection)) {
        event.preventDefault();
        speakFromSelection();
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.search)) {
        event.preventDefault();
        document.getElementById("chapterSearch")?.focus();
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.toggleTheme)) {
        event.preventDefault();
        cycleTheme();
        return;
      }
      if (shortcutMatches(event, settings.shortcuts.addBookmark)) {
        event.preventDefault();
        addBookmark();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedText, selectedContext, selectedRange, activeBook, activeNotebook, collectionNotebookId, vocab, notebooks, pendingVocab, chapterIndex, chapterPageIndex, chapterPages.length, safePageIndex, chapters, settings, dictionary, sentences, sentenceIndex, ttsState]);

  async function boot() {
    const [savedSettings, bookList, vocabData, noteData] = await Promise.all([
      window.readerAPI.settings.get(),
      window.readerAPI.books.list(),
      window.readerAPI.vocab.list(),
      window.readerAPI.notes.listAll()
    ]);
    if (!savedSettings.onboarding?.helpShown) {
      const nextSettings = { ...savedSettings, onboarding: { ...savedSettings.onboarding, helpShown: true } };
      setSettings(nextSettings);
      window.readerAPI.settings.set(nextSettings).catch(() => undefined);
      setInfoModal("help");
    } else {
      setSettings(savedSettings);
    }
    setBooks(bookList);
    setNotebooks(vocabData.notebooks);
    setVocab(vocabData.items);
    setAllNotes(noteData);
    setActiveNotebook(preferredNotebookId(savedSettings, vocabData.notebooks));
    pruneAllAiLogs(savedSettings.ai.retentionDays);
  }

  useEffect(() => {
    if (!WEB) return;
    const update = async () => {
      const [vocabData, noteData] = await Promise.all([window.readerAPI.vocab.list(), window.readerAPI.notes.listAll()]);
      setNotebooks(vocabData.notebooks); setVocab(vocabData.items); setAllNotes(noteData);
      if (activeBook) { setNotes(await window.readerAPI.notes.list(activeBook.id)); const opened = await window.readerAPI.books.open(activeBook.id, { touchLastOpened: false }); setBookmarks(opened.bookmarks); }
    };
    const listener = () => { void update().catch(error => pushNotice(error.message)); };
    window.addEventListener("skipreader-data-updated", listener);
    return () => window.removeEventListener("skipreader-data-updated", listener);
  }, [activeBook?.id]);

  async function importBook() {
    try {
      setLoading("正在导入并解析书籍...");
      const result = await window.readerAPI.books.import();
      if (!result) return;
      await refreshBooks();
      if (WEB) { setLibraryTab("all"); setLibrarySearch(""); updateLibrary({ activeShelfId: "all" }); }
      setViewMode("library");
      setLoading("");
      const candidate = result.associationCandidate;
      if (!candidate) {
        pushNotice(`已导入“${result.book.title}”`);
        return;
      }
      const approved = await askConfirm(
        "发现可关联的旧内容",
        `这本书像是之前删除过的“${candidate.oldTitle}”；是否把旧的 ${candidate.notes} 条笔记、${candidate.vocabItems} 个生词和 ${candidate.bookmarks} 个书签关联到新导入的书？确认后这批旧内容不会再询问，也不会再关联到其他重复导入的书`
      );
      if (!approved) {
        await window.readerAPI.books.dismissAssociation(candidate.oldBookId);
        pushNotice(`已导入“${result.book.title}”；旧内容未关联，之后不会为这批旧内容重复询问`);
        return;
      }
      setLoading("正在关联旧内容...");
      const summary = await window.readerAPI.books.associateDeletedContent(candidate.oldBookId, result.book.id);
      const [bookList, vocabData, noteData] = await Promise.all([
        window.readerAPI.books.list(),
        window.readerAPI.vocab.list(),
        window.readerAPI.notes.listAll()
      ]);
      setBooks(bookList);
      setNotebooks(vocabData.notebooks);
      setVocab(vocabData.items);
      setAllNotes(noteData);
      pushNotice(`已导入“${result.book.title}”，并关联 ${summary.notes} 条笔记、${summary.vocabItems} 个生词和 ${summary.bookmarks} 个书签`);
    } catch (error: any) {
      pushNotice(error.message || String(error));
    } finally {
      setLoading("");
    }
  }

  async function refreshBooks() {
    setBooks(await window.readerAPI.books.list());
  }

  async function importBackup() {
    try {
      await flushCurrentReadingPosition(true);
      setLoading("正在导入备份...");
      const summary = await window.readerAPI.backup.import();
      if (!summary) return;
      await boot();
      setViewMode("library");
      setActiveBook(null);
      pushNotice(`备份导入完成：${summary.books} 本书、${summary.vocabItems} 条生词、${summary.notes} 条笔记；导入前已自动保存安全快照`);
    } catch (error: any) {
      pushNotice(error.message || String(error));
    } finally {
      setLoading("");
    }
  }

  async function openBook(bookId: string, options: { restorePosition?: boolean; touchLastOpened?: boolean; suppressProgressSave?: boolean } = {}) {
    if (viewMode === "library" && collectionGridRef.current) {
      collectionScroll.current[libraryTab] = collectionGridRef.current.scrollTop;
    }
    try {
      setLoading("正在打开书籍...");
      if (!options.suppressProgressSave) {
        await flushCurrentReadingPosition();
        temporaryLocateActive.current = false;
      }
      const restorePosition = options.restorePosition !== false;
      beginReaderRestore(null, Boolean(options.suppressProgressSave || restorePosition));
      const [opened, bookNotes] = await Promise.all([
        window.readerAPI.books.open(bookId, { touchLastOpened: options.touchLastOpened }),
        window.readerAPI.notes.list(bookId)
      ]);
      setActiveNotebook(preferredNotebookId(settings, notebooks, bookId));
      setActiveBook(opened.book);
      setViewMode("reader");
      if (WEB && matchMedia("(max-width: 860px)").matches) setReaderSideCollapsed(true);
      setChapters(opened.chapters);
      setTocItems(opened.tocItems || buildTocFromChapters(opened.book.id, opened.chapters));
      chapterPositionsRef.current = Object.fromEntries(opened.chapterPositions.map((position) => [position.chapterId || "", position]).filter(([chapterId]) => Boolean(chapterId)));
      setChapterPositions(chapterPositionsRef.current);
      setBookmarks(opened.bookmarks);
      setNotes(bookNotes);
      const index = restorePosition ? Math.max(0, opened.chapters.findIndex((item) => item.id === opened.position?.chapterId)) : 0;
      const position = restorePosition ? opened.position : null;
      const chapterId = opened.chapters[index]?.id;
      beginReaderRestore(chapterId ? positionToAnchor(chapterId, position) : null, Boolean(chapterId));
      setChapterIndex(index);
      setChapterLoadTick((tick) => tick + 1);
      return opened;
    } catch (error: any) {
      if (options.suppressProgressSave) suppressPositionSave.current = false;
      pushNotice(error.message || String(error));
      await refreshBooks();
      return null;
    } finally {
      setLoading("");
    }
  }

  async function nextChapter() {
    await goToAdjacentChapter(1);
  }

  async function previousChapter() {
    await goToAdjacentChapter(-1);
  }

  async function goToAdjacentChapter(direction: 1 | -1) {
    await flushCurrentReadingPosition();
    const next = Math.max(0, Math.min(chapters.length - 1, chapterIndex + direction));
    if (next === chapterIndex) {
      pushNotice(direction > 0 ? "已经是最后一章" : "已经是第一章");
      return;
    }
    goToChapterStart(next);
  }

  function goToChapterStart(index: number) {
    const chapter = chapters[index];
    if (!chapter) return;
    if (WEB && chapterPositionsRef.current[chapter.id]) {
      beginReaderRestore(positionToAnchor(chapter.id, chapterPositionsRef.current[chapter.id]), true);
      setChapterIndex(index);
      clearReaderSelection();
      setChapterLoadTick(tick => tick + 1);
      return;
    }
    beginReaderRestore({ chapterId: chapter.id, paragraphIndex: 0, charOffset: 0, scrollOffset: 0, absoluteOffset: 0 }, true);
    setChapterPageIndex(0);
    setChapterIndex(index);
    setChapterLoadTick((tick) => tick + 1);
  }

  async function goToChapter(index: number, restorePosition = true) {
    await flushCurrentReadingPosition();
    if (restorePosition) prepareChapterRestore(index);
    else {
      const chapter = chapters[index];
      beginReaderRestore(chapter ? { chapterId: chapter.id, paragraphIndex: 0, charOffset: 0, scrollOffset: 0 } : null, Boolean(chapter));
    }
    setChapterIndex(index);
    setChapterLoadTick((tick) => tick + 1);
  }

  function toggleTocItem(itemId: string) {
    setExpandedTocIds((ids) => ids.includes(itemId) ? ids.filter((id) => id !== itemId) : [...ids, itemId]);
  }

  async function goToTocItem(item: TocItem) {
    const index = resolveTocTargetIndex(item, chapters);
    if (index >= 0) {
      await flushCurrentReadingPosition();
      goToChapterStart(index);
      if (item.children?.length) setExpandedTocIds((ids) => ids.includes(item.id) ? ids : [...ids, item.id]);
      return;
    }
    if (item.children?.length) {
      toggleTocItem(item.id);
      return;
    }
    pushNotice("这个目录项没有可跳转的正文位置");
  }

  async function goToReaderPage(index: number) {
    const next = Math.max(0, Math.min(chapterPages.length - 1, index));
    if (next === safePageIndex) return;
    await flushCurrentReadingPosition();
    pendingPageTopScroll.current = true;
    setChapterPageIndex(next);
    clearReaderSelection();
  }

  function nextReaderPage() {
    if (safePageIndex < chapterPages.length - 1) {
      void goToReaderPage(safePageIndex + 1);
      return;
    }
    void nextChapter();
  }

  function previousReaderPage() {
    if (safePageIndex > 0) {
      void goToReaderPage(safePageIndex - 1);
      return;
    }
    if (chapterIndex > 0) {
      void goToPreviousChapterEnd();
      return;
    }
    pushNotice("已经是第一页");
  }

  async function goToPreviousChapterEnd() {
    if (WEB) { await goToAdjacentChapter(-1); return; }
    await flushCurrentReadingPosition();
    const previous = chapters[chapterIndex - 1];
    if (!previous) return;
    beginReaderRestore({
      chapterId: previous.id,
      paragraphIndex: Number.MAX_SAFE_INTEGER,
      charOffset: 0,
      absoluteOffset: Number.MAX_SAFE_INTEGER,
      scrollOffset: Number.MAX_SAFE_INTEGER
    }, true);
    setChapterPageIndex(Number.MAX_SAFE_INTEGER);
    setChapterIndex(chapterIndex - 1);
    clearReaderSelection();
    setChapterLoadTick((tick) => tick + 1);
  }

  function jumpSearchMatch(delta: 1 | -1) {
    if (!searchMatches.length) return;
    void flushCurrentReadingPosition();
    setSearchMatchIndex((index) => (index + delta + searchMatches.length) % searchMatches.length);
  }

  function prepareChapterRestore(index: number) {
    const chapter = chapters[index];
    if (!chapter) return;
    beginReaderRestore(positionToAnchor(chapter.id, (WEB ? chapterPositionsRef.current : chapterPositions)[chapter.id]), true);
  }

  function onReaderScroll() {
    if (!activeBook || !currentChapter || !readerRef.current) return;
    if (suppressPositionSave.current || pendingAnchorRestore.current) return;
    if (temporaryLocateActive.current) temporaryLocateActive.current = false;
    queueCurrentReadingPositionSave(POSITION_SAVE_DEBOUNCE_MS);
  }

  function buildCurrentReadingPosition(force = false): ReadingPosition | null {
    if (!activeBook || !currentChapter || !readerRef.current || (!force && (suppressPositionSave.current || pendingAnchorRestore.current))) return null;
    if (WEB && (!chapterHtml || chapterHtmlOwner.current !== currentChapter.id || pendingAnchorRestore.current || pendingLocateScroll.current)) return null;
    if (temporaryLocateActive.current) {
      if (!force) temporaryLocateActive.current = false;
      return null;
    }
    const element = readerRef.current;
    const max = Math.max(1, element.scrollHeight - element.clientHeight);
    const anchor = currentReaderAnchor(element);
    const pageCount = Math.max(1, chapterPages.length);
    const position: ReadingPosition = {
      bookId: activeBook.id,
      chapterId: currentChapter.id,
      paragraphIndex: anchor.paragraphIndex,
      charOffset: anchor.charOffset,
      absoluteOffset: anchor.absoluteOffset,
      scrollOffset: Math.round(element.scrollTop),
      progress: Math.min(1, (chapterPageIndex + Math.min(1, element.scrollTop / max)) / pageCount),
      updatedAt: new Date().toISOString()
    };
    return position;
  }

  function rememberReadingPosition(position: ReadingPosition): void {
    if (!position.chapterId) return;
    chapterPositionsRef.current = { ...chapterPositionsRef.current, [position.chapterId]: position };
    setChapterPositions((positions) => ({ ...positions, [position.chapterId || ""]: position }));
  }

  function queueCurrentReadingPositionSave(delayMs = POSITION_SAVE_DEBOUNCE_MS): ReadingPosition | null {
    const position = buildCurrentReadingPosition(false);
    if (!position) return null;
    rememberReadingPosition(position);
    pendingPositionToSave.current = position;
    readingPositionDirty.current = true;
    if (savePositionTimer.current) window.clearTimeout(savePositionTimer.current);
    savePositionTimer.current = window.setTimeout(() => {
      savePositionTimer.current = null;
      void flushQueuedReadingPosition();
    }, delayMs);
    return position;
  }

  function saveCurrentReadingPosition(force = false): ReadingPosition | null {
    const position = buildCurrentReadingPosition(force);
    if (!position) return null;
    void persistReadingPosition(position, true);
    return position;
  }

  function saveCurrentReadingPositionSync(force = false): ReadingPosition | null {
    cancelPositionSaveTimer();
    const position = buildCurrentReadingPosition(force);
    if (!position) return null;
    rememberReadingPosition(position);
    pendingPositionToSave.current = null;
    readingPositionDirty.current = false;
    const signature = readingPositionSignature(position);
    const saved = window.readerAPI.books.savePositionSync(position);
    if (saved) {
      lastSavedPositionSignature.current = signature;
      return saved;
    }
    pendingPositionToSave.current = position;
    readingPositionDirty.current = true;
    return position;
  }

  async function flushCurrentReadingPosition(force = false): Promise<void> {
    cancelPositionSaveTimer();
    const position = buildCurrentReadingPosition(force);
    if (position) {
      await persistReadingPosition(position, true);
      return;
    }
    await flushQueuedReadingPosition();
  }

  async function flushQueuedReadingPosition(): Promise<void> {
    const pending = pendingPositionToSave.current;
    if (!pending) return;
    await persistReadingPosition(pending, true);
  }

  function persistReadingPosition(position: ReadingPosition, immediate = false): Promise<void> {
    rememberReadingPosition(position);
    pendingPositionToSave.current = position;
    readingPositionDirty.current = false;
    if (immediate) cancelPositionSaveTimer();

    const activeRequest = savePositionInFlight.current;
    if (activeRequest) return activeRequest.then(() => drainPositionSaveQueue());
    return drainPositionSaveQueue();
  }

  function drainPositionSaveQueue(): Promise<void> {
    if (savePositionInFlight.current) return savePositionInFlight.current;
    const position = pendingPositionToSave.current;
    if (!position) return Promise.resolve();
    const signature = readingPositionSignature(position);
    pendingPositionToSave.current = null;
    if (signature === lastSavedPositionSignature.current) return Promise.resolve();
    let failed = false;
    const request = window.readerAPI.books.savePosition(position)
      .then(() => {
        lastSavedPositionSignature.current = signature;
      })
      .catch(() => {
        failed = true;
        if (!pendingPositionToSave.current) pendingPositionToSave.current = position;
        readingPositionDirty.current = true;
      })
      .finally(() => {
        savePositionInFlight.current = null;
        if (!failed && pendingPositionToSave.current) void drainPositionSaveQueue();
      });
    savePositionInFlight.current = request;
    return request;
  }

  async function returnToLibrary() {
    if (temporaryLocateActive.current) {
      cancelPositionSaveTimer();
      temporaryLocateActive.current = false;
      suppressPositionSave.current = false;
      pendingLocateScroll.current = false;
    } else {
      await flushCurrentReadingPosition(true);
    }
    setViewMode("library");
  }

  function beginReaderRestore(anchor: ReaderAnchor | null, suppress = true) {
    cancelPositionSaveTimer();
    if (restoreReleaseTimer.current) {
      window.clearTimeout(restoreReleaseTimer.current);
      restoreReleaseTimer.current = null;
    }
    suppressPositionSave.current = suppress;
    pendingAnchorRestore.current = anchor;
  }

  function cancelPositionSaveTimer() {
    if (savePositionTimer.current) {
      window.clearTimeout(savePositionTimer.current);
      savePositionTimer.current = null;
    }
  }

  function schedulePositionSaveRelease(delayMs: number) {
    if (restoreReleaseTimer.current) window.clearTimeout(restoreReleaseTimer.current);
    restoreReleaseTimer.current = window.setTimeout(() => {
      if (!pendingAnchorRestore.current && !pendingLocateScroll.current) suppressPositionSave.current = false;
      restoreReleaseTimer.current = null;
    }, delayMs);
  }

  function handleSelection(event: React.MouseEvent<HTMLDivElement>) {
    if (!(event.target as HTMLElement | null)?.closest?.(".reader-content")) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const rawText = selection.toString();
    const text = rawText.trim().replace(/\s+/g, " ");
    const clean = text;
    if (!clean) return;
    setSelectedText(clean);
    const details = selectionDetails(selection, rawText, clean, readerRef.current);
    setSelectedContext(details.context);
    setSelectedRange(details.range);
    moveDictionaryFloatNear(event.clientX, event.clientY, details.rect);
    if (clean && settings.dictionary.selection && !readerSideCollapsed) lookup(clean, false, true, details);
  }

  function wordInfoAtPoint(event: React.MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.(".reader-content")) return { word: "", context: "", range: null as { start: number; end: number } | null, rect: null as DOMRect | null };
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return { word: "", context: "", range: null as { start: number; end: number } | null, rect: null as DOMRect | null };
    const text = range.startContainer.textContent || "";
    let start = range.startOffset;
    let end = range.startOffset;
    while (start > 0 && /[A-Za-z'-]/.test(text[start - 1])) start -= 1;
    while (end < text.length && /[A-Za-z'-]/.test(text[end])) end += 1;
    const word = text.slice(start, end);
    if (!word || !pointInsideTextRange(range.startContainer, start, end, event.clientX, event.clientY)) {
      return { word: "", context: "", range: null as { start: number; end: number } | null, rect: null as DOMRect | null };
    }
    const wordRange = document.createRange();
    wordRange.setStart(range.startContainer, start);
    wordRange.setEnd(range.startContainer, end);
    const rect = firstUsableRect(wordRange);
    wordRange.detach();
    const absoluteStart = plainOffsetFromTextNode(range.startContainer, start);
    const absoluteEnd = plainOffsetFromTextNode(range.startContainer, end);
    return {
      word,
      context: contextForDomRange(range.startContainer, start, range.startContainer, end),
      range: absoluteStart !== null && absoluteEnd !== null ? { start: absoluteStart, end: absoluteEnd } : null,
      rect
    };
  }

  function lookupWordAtPoint(event: React.MouseEvent, quiet = true) {
    const info = wordInfoAtPoint(event);
    if (!info.word) return;
    setSelectedText(info.word);
    setSelectedContext(info.context);
    setSelectedRange(info.range);
    moveDictionaryFloatNear(event.clientX, event.clientY, info.rect);
    lookup(info.word, quiet, true, info);
  }

  function moveDictionaryFloatNear(clientX: number, clientY: number, anchorRect?: DOMRect | null) {
    setDictionaryFloatPoint(smartFloatPoint(clientX, clientY, anchorRect));
  }

  async function lookup(term = selectedText, quiet = false, recordHistory = true, origin?: LookupOrigin) {
    if (WEB && !settings.dictionary.enabled) return;
    const clean = settings.dictionary.autoSingularLookup ? singularizeLookupTerm(term.trim()) : term.trim();
    if (!clean) return;
    const serial = ++lookupSerial.current;
    // Bind source information to this lookup, never to a later selection or chapter
    dictionaryOrigin.current = origin && activeBook && currentChapter ? {
      word: clean, phrase: term.trim(), bookId: activeBook.id, bookTitle: activeBook.title,
      chapterId: currentChapter.id, chapterTitle: currentChapter.title,
      sourceSentence: origin.context, startOffset: origin.range?.start, endOffset: origin.range?.end,
      paragraphIndex: origin.range ? paragraphIndexForHtmlOffset(chapterHtml, origin.range.start) ?? undefined : undefined
    } : null;
    setDictionary(null);
    if (readerSideCollapsed) {
      setDictionaryFloatOpen(true);
    } else if (!quiet) {
      setSideTab("dictionary");
    }
    const cacheKey = dictionaryLookupCacheKey(settings, clean);
    const cached = dictionaryCache.current.get(cacheKey);
    if (cached) {
      setDictionary(cached);
      setDictionaryEnhancing(false);
      setDictionaryPanelTab("definition");
      setDictionaryWebUrl("");
      if (recordHistory) recordDictionaryHistory(clean);
      return;
    }
    setTranslation("");
    setDictionaryEnhancing(false);
    setDictionaryPanelTab("definition");
    setDictionaryWebUrl("");
    try {
      if (!quiet) setLoading("正在查词...");
      if (settings.dictionary.source === "bing" && !WEB) {
        let basic: DictionaryResult | null = null;
        try {
          basic = await window.readerAPI.dictionary.lookupBingBasic(clean);
        } catch {
          basic = null;
        }
        if (serial !== lookupSerial.current) return;
        if (basic && (basic.chineseDefinition || basic.englishDefinitions.length || basic.phonetic)) {
          setDictionary(basic);
          setDictionaryPanelTab("definition");
          setLoading("");
          if (recordHistory) recordDictionaryHistory(clean);
          setDictionaryEnhancing(true);
          window.readerAPI.dictionary.lookup(clean)
            .then((enhanced) => {
              if (serial !== lookupSerial.current) return;
              const merged = mergeDictionaryEnhancement(basic, enhanced);
              dictionaryCache.current.set(cacheKey, merged);
              setDictionary(merged);
            })
            .catch((error: any) => {
              if (serial === lookupSerial.current) pushNotice(error.message || String(error));
            })
            .finally(() => {
              if (serial === lookupSerial.current) setDictionaryEnhancing(false);
            });
          return;
        }
      }
      const result = await window.readerAPI.dictionary.lookup(clean);
      if (serial !== lookupSerial.current) return;
      dictionaryCache.current.set(cacheKey, result);
      setDictionary(result);
      setDictionaryPanelTab("definition");
      if (recordHistory) recordDictionaryHistory(clean);
    } catch (error: any) {
      if (serial !== lookupSerial.current) return;
      setDictionaryEnhancing(false);
      pushNotice(error.message || String(error));
    } finally {
      if (serial === lookupSerial.current && !dictionaryEnhancing) setLoading("");
    }
  }

  function recordDictionaryHistory(term: string) {
    setDictionaryHistory((history) => {
      const next = [term, ...history.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 10);
      setDictionaryHistoryIndex(0);
      return next;
    });
  }

  function jumpDictionaryHistory(delta: 1 | -1) {
    if (!dictionaryHistory.length) return;
    const next = dictionaryHistoryIndex + delta;
    if (next < 0 || next >= dictionaryHistory.length) return;
    setDictionaryHistoryIndex(next);
    setSelectedText(dictionaryHistory[next]);
    lookup(dictionaryHistory[next], false, false);
  }

  function showDictionaryWeb() {
    if (WEB) { if (dictionary) openDictionaryWeb(preferredDictionaryWebUrl(dictionary, "bing")); return; }
    if (!dictionaryWebUrl && dictionary) setDictionaryWebUrl(preferredDictionaryWebUrl(dictionary, settings.dictionary.defaultWebSource));
    setDictionaryPanelTab("web");
  }

  function openDictionaryWeb(url: string) {
    if (WEB) { void window.readerAPI.dictionary.openOfficial(url); return; }
    if (!isAllowedDictionaryWebUrl(url)) {
      window.readerAPI.dictionary.openOfficial(url);
      return;
    }
    setDictionaryWebUrl(url);
    setDictionaryPanelTab("web");
    setSideTab("dictionary");
    if (readerSideCollapsed) {
      setDictionary(null);
      setDictionaryFloatOpen(true);
    }
    setReaderSideCollapsed(false);
  }

  function controlDictionaryWeb(action: "back" | "forward" | "reload") {
    window.readerAPI.dictionary.browserControl(action).then(setDictionaryWebState).catch(() => undefined);
  }

  async function toggleDictionaryVocab(overrideWord?: string) {
    if (vocabSaveInFlight.current || pendingVocab) return;
    const word = (overrideWord || dictionary?.term || "").trim();
    if (!word) return;
    const notebookId = collectionNotebookId || preferredNotebookId(settings, notebooks, activeBook?.id);
    const existing = vocab.find((item) => item.notebookId === notebookId && item.word.toLowerCase() === word.toLowerCase());
    if (existing) {
      try {
        await window.readerAPI.vocab.deleteItem(existing.id);
        setVocab((items) => items.filter((item) => item.id !== existing.id));
        pushNotice("已取消收藏");
      } catch (error: any) { pushNotice(error.message || String(error)); }
      return;
    }
    const input: PendingVocab = {
      ...dictionaryOrigin.current, word,
      phonetic: dictionary?.phonetic,
      englishDef: dictionary?.englishDefinitions.join("\n"),
      chineseDef: dictionary?.chineseDefinition,
      definitionSource: dictionary?.source,
      attributions: dictionary?.attributions,
      example: dictionaryOrigin.current?.sourceSentence || dictionary?.examples[0]
    };
    const bookDefault = activeBook && settings.vocabulary.bookDefaults[activeBook.id];
    if (bookDefault && notebooks.some((notebook) => notebook.id === bookDefault)) {
      await addVocabToNotebook(input, bookDefault, false);
    } else {
      setPendingVocab(input);
      setSaveNotebookId(notebookId);
      setNewNotebookName("");
      setRememberBookNotebook(false);
    }
  }

  async function addVocabToNotebook(input: PendingVocab, notebookId: string, remember: boolean) {
    if (vocabSaveInFlight.current) return;
    vocabSaveInFlight.current = true;
    setVocabSaveBusy(true);
    try {
      let targetId = notebookId;
      if (!targetId) {
        if (!newNotebookName.trim()) { pushNotice("请输入生词本名称"); return; }
        const notebook = await window.readerAPI.vocab.addNotebook(newNotebookName.trim());
        setNotebooks((items) => items.some((entry) => entry.id === notebook.id) ? items : [...items, notebook]);
        targetId = notebook.id;
        setSaveNotebookId(targetId);
      }
      const item = await window.readerAPI.vocab.addItem({ ...input, notebookId: targetId });
      setVocab((items) => [item, ...items.filter((entry) => entry.id !== item.id)]);
      setActiveNotebook(targetId);
      const bookId = activeBook?.id;
      await saveSettings({ ...settings, vocabulary: {
        lastNotebookId: targetId,
        bookDefaults: remember && bookId ? { ...settings.vocabulary.bookDefaults, [bookId]: targetId } : settings.vocabulary.bookDefaults
      } });
      setPendingVocab(null);
      pushNotice("已收藏到生词本");
    } catch (error: any) { pushNotice(error.message || String(error)); }
    finally { vocabSaveInFlight.current = false; setVocabSaveBusy(false); }
  }

  async function setBookNotebookDefault(notebookId: string) {
    if (!activeBook) return;
    const bookDefaults = { ...settings.vocabulary.bookDefaults };
    if (notebookId) bookDefaults[activeBook.id] = notebookId;
    else delete bookDefaults[activeBook.id];
    await saveSettings({ ...settings, vocabulary: { ...settings.vocabulary, bookDefaults } });
    if (notebookId) setActiveNotebook(notebookId);
  }

  async function saveVocabItem() {
    await toggleDictionaryVocab();
  }

  function beginVocabFromSelection() {
    if (!selectedText.trim() || !activeBook || !currentChapter) return;
    setPendingVocab({ word: selectedText.trim(), bookId: activeBook.id, bookTitle: activeBook.title, chapterId: currentChapter.id, chapterTitle: currentChapter.title, sourceSentence: selectedContext, startOffset: selectedRange?.start, endOffset: selectedRange?.end });
    setSaveNotebookId(preferredNotebookId(settings, notebooks, activeBook.id));
    setNewNotebookName(""); setRememberBookNotebook(false);
  }

  async function addBookmark() {
    if (!activeBook || !currentChapter || !readerRef.current) return;
    await flushCurrentReadingPosition();
    const anchor = currentReaderAnchor(readerRef.current);
    const bookmark = await window.readerAPI.books.addBookmark({
      bookId: activeBook.id,
      chapterId: currentChapter.id,
      title: currentChapter.title,
        excerpt: selectedText || sentenceAt(sentences, sentenceIndex).slice(0, 160),
      scrollOffset: Math.round(readerRef.current.scrollTop),
      ...(WEB ? { absoluteOffset: selectedRange?.start ?? anchor.absoluteOffset, paragraphIndex: anchor.paragraphIndex, charOffset: anchor.charOffset } : {})
    });
    setBookmarks((items) => [bookmark, ...items]);
    pushNotice("书签添加成功");
  }

  async function addSelectionMark(lineStyle: "solid" | "wavy", color: string, noteText = "", options: { forceWholeSelection?: boolean } = {}): Promise<ReaderNote | null> {
    if (!activeBook || !currentChapter || !selectedText.trim()) {
      pushNotice("请先在阅读区选中内容");
      return null;
    }
    const contained = notesContainedInSelection(notes, currentChapter.id, selectedRange);
    const exact = exactNoteForSelection(notes, currentChapter.id, selectedText, selectedRange);
    const inheritNoteText = noteText || contained.map((note) => note.noteText?.trim()).find(Boolean) || "";
    if (exact && !options.forceWholeSelection) {
      const updated = await window.readerAPI.notes.update(exact.id, { lineStyle, color, noteText: noteText || exact.noteText || "" });
      setNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
      setAllNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
      pushNotice(noteText ? "想法已保存" : "划线已更新");
      return updated;
    }
    if (contained.length && options.forceWholeSelection) {
      await Promise.all(contained.map((note) => window.readerAPI.notes.delete(note.id)));
      setNotes((items) => items.filter((item) => !contained.some((note) => note.id === item.id)));
      setAllNotes((items) => items.filter((item) => !contained.some((note) => note.id === item.id)));
    }
    const note = await window.readerAPI.notes.add({
      bookId: activeBook.id,
      chapterId: currentChapter.id,
      chapterTitle: currentChapter.title || `第 ${chapterIndex + 1} 章`,
      selectedText,
      noteText: inheritNoteText,
      lineStyle,
      color,
      paragraphIndex: typeof selectedRange?.start === "number" ? paragraphIndexForOffset(contextText, selectedRange.start) : undefined,
      startOffset: selectedRange?.start,
      endOffset: selectedRange?.end
    });
    setNotes((items) => [note, ...items]);
    setAllNotes((items) => [note, ...items]);
    pushNotice(inheritNoteText ? "想法已保存" : "已划线");
    return note;
  }

  async function toggleSelectionMark(lineStyle: "solid" | "wavy") {
    const exact = exactNoteForSelection(notes, currentChapter?.id, selectedText, selectedRange);
    if (exact?.lineStyle === lineStyle) {
      await removeNote(exact.id, false);
      return;
    }
    await addSelectionMark(lineStyle, selectedMark?.color || noteDraftColor, selectedMark?.noteText || "", { forceWholeSelection: true });
  }

  async function chooseMarkColor(color: string) {
    setNoteDraftColor(color);
    if (!selectedMark) return;
    const updated = await window.readerAPI.notes.update(selectedMark.id, { color });
    setNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
    setAllNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
    pushNotice("划线颜色已更新");
  }

  async function writeIdea() {
    if (!selectedText.trim()) {
      pushNotice("请先在阅读区选中内容");
      return;
    }
    const target = selectedMark;
    setIdeaTargetId(target?.id || "__pending_selection__");
    setIdeaDraft(target?.noteText || "");
  }

  async function saveIdea() {
    if (!ideaTargetId) return;
    if (ideaTargetId === "__pending_selection__") {
      const created = await addSelectionMark("solid", noteDraftColor, ideaDraft.trim(), { forceWholeSelection: true });
      if (!created) return;
      setIdeaTargetId("");
      setIdeaDraft("");
      return;
    }
    const updated = await window.readerAPI.notes.update(ideaTargetId, { noteText: ideaDraft.trim() });
    setNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
    setAllNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
    setIdeaTargetId("");
    setIdeaDraft("");
    pushNotice(updated.noteText ? "想法已保存" : "想法已清空");
  }

  async function deleteBookmark(id: string) {
    if (settings.confirmMinorDeletes && !(await askConfirm("删除书签", "确定删除这个书签吗？", true))) return;
    await window.readerAPI.books.deleteBookmark(id);
    setBookmarks((items) => items.filter((item) => item.id !== id));
  }

  async function deleteNote(id: string) {
    if (settings.confirmMinorDeletes && !(await askConfirm("删除笔记", "确定删除这条笔记吗？", true))) return;
    await removeNote(id, true);
  }

  async function removeNote(id: string, toast = true) {
    await window.readerAPI.notes.delete(id);
    setNotes((items) => items.filter((item) => item.id !== id));
    setAllNotes((items) => items.filter((item) => item.id !== id));
    if (ideaTargetId === id) {
      setIdeaTargetId("");
      setIdeaDraft("");
    }
    if (toast) pushNotice("笔记已删除");
    else pushNotice("已取消划线");
  }

  async function deleteVocab(id: string) {
    const item = vocab.find((entry) => entry.id === id);
    if (settings.confirmMinorDeletes && !(await askConfirm("删除生词", `确定删除“${item?.word || "这个生词"}”吗？`, true))) return;
    await window.readerAPI.vocab.deleteItem(id);
    setVocab((items) => items.filter((item) => item.id !== id));
  }

  async function deleteNotebook(id: string) {
    const notebook = notebooks.find((item) => item.id === id);
    if (!notebook) return;

    if (!(await askConfirm("删除生词本", `确定删除“${notebook.name}”吗？其中的生词也会被删除`, true))) return;
    try {
      await window.readerAPI.vocab.deleteNotebook(id);
      const bookDefaults = Object.fromEntries(Object.entries(settings.vocabulary.bookDefaults).filter(([, value]) => value !== id));
      await saveSettings({ ...settings, vocabulary: { bookDefaults, lastNotebookId: settings.vocabulary.lastNotebookId === id ? "" : settings.vocabulary.lastNotebookId } });
      setNotebooks((items) => items.filter((item) => item.id !== id));
      setVocab((items) => items.filter((item) => item.notebookId !== id));
      if (activeNotebook === id) {
        const next = notebooks.find((item) => item.id !== id)?.id || "";
        setActiveNotebook(next);
      }
      pushNotice("生词本已删除");
    } catch (error: any) {
      pushNotice(error.message || String(error));
    }
  }

  async function deleteBook(bookId: string) {
    const book = books.find((item) => item.id === bookId);
    if (!(await askConfirm("删除书籍", `确定从书库移除“${book?.title || "这本书"}”吗？笔记、生词和书签会保留；重新导入同一本书时，可以选择把旧内容关联回来`, true))) return;
    await window.readerAPI.books.delete(bookId);
    await refreshBooks();
    if (activeBook?.id === bookId) {
      setActiveBook(null);
      setChapters([]);
      setTocItems([]);
      setChapterHtml("");
      setNotes([]);
    }
    pushNotice("书籍已从书库移除，旧内容已保留");
  }

  async function relocateBook(bookId: string) {
    const book = await window.readerAPI.books.relocate(bookId);
    if (book) {
      await refreshBooks();
      pushNotice("书籍文件已重新定位");
    }
  }

  function updateLibrary(patch: Partial<AppSettings["library"]>) {
    saveSettings({ ...settings, library: { ...settings.library, ...patch } });
  }

  function toggleBookFavorite(bookId: string) {
    const ids = new Set(settings.library.favoriteBookIds);
    ids.has(bookId) ? ids.delete(bookId) : ids.add(bookId);
    updateLibrary({ favoriteBookIds: Array.from(ids) });
  }

  function toggleBookPinned(bookId: string) {
    const ids = new Set(settings.library.pinnedBookIds);
    ids.has(bookId) ? ids.delete(bookId) : ids.add(bookId);
    updateLibrary({ pinnedBookIds: Array.from(ids) });
  }

  function beginCreateShelf() {
    setCreatingShelf(true);
    setShelfDraftName(nextShelfName(libraryShelves));
    setRenamingShelfId("");
  }

  function commitCreateShelf() {
    const name = shelfDraftName.trim();
    if (!name) {
      setCreatingShelf(false);
      return;
    }
    const shelf = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    updateLibrary({ shelves: [...libraryShelves, shelf], activeShelfId: shelf.id });
    setLibraryTab("all");
    setCreatingShelf(false);
    setShelfDraftName("");
    pushNotice("书架已新建");
  }

  function beginRenameShelf(shelfId: string) {
    const shelf = libraryShelves.find((item) => item.id === shelfId);
    if (!shelf) return;
    setRenamingShelfId(shelfId);
    setShelfDraftName(shelf.name);
    setShelfMenu(null);
    setCreatingShelf(false);
  }

  function commitRenameShelf(shelfId: string) {
    const clean = shelfDraftName.trim();
    const current = libraryShelves.find((item) => item.id === shelfId);
    setRenamingShelfId("");
    setShelfDraftName("");
    if (!current || !clean || clean === current.name) return;
    updateLibrary({ shelves: libraryShelves.map((item) => item.id === shelfId ? { ...item, name: clean } : item) });
    pushNotice("书架已重命名");
  }

  async function deleteShelf(shelfId: string) {
    const shelf = libraryShelves.find((item) => item.id === shelfId);
    if (!shelf) return;
    if (!(await askConfirm("删除书架", `确定删除书架“${shelf.name}”吗？书籍不会被删除`, true))) return;
    const bookShelfMap = Object.fromEntries(
      Object.entries(settings.library.bookShelfMap)
        .map(([bookId, ids]) => [bookId, ids.filter((id) => id !== shelfId)])
        .filter(([, ids]) => ids.length)
    );
    updateLibrary({
      shelves: libraryShelves.filter((item) => item.id !== shelfId),
      activeShelfId: activeShelf === shelfId ? "all" : activeShelf,
      bookShelfMap
    });
    setShelfMenu(null);
    pushNotice("书架已删除");
  }

  function moveShelfToFront(shelfId: string) {
    const shelf = libraryShelves.find((item) => item.id === shelfId);
    if (!shelf) return;
    updateLibrary({ shelves: [shelf, ...libraryShelves.filter((item) => item.id !== shelfId)] });
    setShelfMenu(null);
    pushNotice("书架已放在前面");
  }

  function selectShelf(shelfId: string) {
    setLibraryTab("all");
    setLibrarySearch("");
    updateLibrary({ activeShelfId: shelfId });
  }

  function toggleBookShelf(bookId: string, shelfId: string) {
    const current = new Set(settings.library.bookShelfMap[bookId] || []);
    const removing = current.has(shelfId);
    removing ? current.delete(shelfId) : current.add(shelfId);
    const bookShelfMap = { ...settings.library.bookShelfMap, [bookId]: Array.from(current) };
    if (!bookShelfMap[bookId].length) delete bookShelfMap[bookId];
    updateLibrary({ bookShelfMap });
    pushNotice(removing ? "已从书架移除" : "已加入书架");
  }

  async function createShelfForBook(bookId: string) {
    const name = (await askPrompt("新建书架", "书架名称", nextShelfName(libraryShelves), "新建"))?.trim();
    if (!name) return;
    const shelf = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    const current = new Set(settings.library.bookShelfMap[bookId] || []);
    current.add(shelf.id);
    updateLibrary({
      shelves: [...libraryShelves, shelf],
      activeShelfId: shelf.id,
      bookShelfMap: { ...settings.library.bookShelfMap, [bookId]: Array.from(current) }
    });
    setLibraryTab("all");
    pushNotice("书架已新建，书籍已加入");
  }

  async function renameBook(bookId: string) {
    const book = books.find((item) => item.id === bookId);
    const title = (await askPrompt("重命名书籍", "书名", book?.title || "", "保存"))?.trim();
    if (!title || title === book?.title) return;
    const renamed = await window.readerAPI.books.rename(bookId, title);
    setBooks((items) => items.map((item) => item.id === bookId ? renamed : item));
    if (activeBook?.id === bookId) setActiveBook(renamed);
    pushNotice("书籍已重命名");
  }

  async function exportBook(bookId: string, mode: "cover" | "ideas" | "highlights") {
    setBookMenu(null);
    setExportMenuBookId("");
    if (mode === "cover") {
      const file = await window.readerAPI.books.exportCover(bookId);
      if (file) pushNotice("封面已导出");
      return;
    }
    const items = allNotes.filter((note) => note.bookId === bookId && (mode === "highlights" || note.noteText?.trim()));
    requestExport({ kind: "notes", items, name: learningExportName([mode === "ideas" ? "想法" : "划线", bookTitleById(books, bookId, items[0]?.bookTitle), "全部章节", mode === "ideas" ? "仅有想法" : "全部笔记"]) });
  }

  async function deleteSelectedVocab() {
    if (!selectedVocabIds.length) return;
    if (settings.confirmMinorDeletes && !(await askConfirm("删除选中生词", `确定删除选中的 ${selectedVocabIds.length} 个生词吗？`, true))) return;
    await Promise.all(selectedVocabIds.map((id) => window.readerAPI.vocab.deleteItem(id)));
    setVocab((items) => items.filter((item) => !selectedVocabIds.includes(item.id)));
    setSelectedVocabIds([]);
    pushNotice("选中生词已删除");
  }

  async function deleteSelectedNotes() {
    if (!selectedNoteIds.length) return;
    if (settings.confirmMinorDeletes && !(await askConfirm("删除选中笔记", `确定删除选中的 ${selectedNoteIds.length} 条笔记吗？`, true))) return;
    await Promise.all(selectedNoteIds.map((id) => window.readerAPI.notes.delete(id)));
    setNotes((items) => items.filter((item) => !selectedNoteIds.includes(item.id)));
    setAllNotes((items) => items.filter((item) => !selectedNoteIds.includes(item.id)));
    setSelectedNoteIds([]);
    pushNotice("选中笔记已删除");
  }

  function requestExport(request: ExportRequest) {
    if (!request.items.length) { pushNotice("没有可导出的内容，请检查筛选和勾选项"); return; }
    setExportFormat("html");
    setExportRequest(request);
  }

  function exportMainVocab() {
    const items = vocabMultiSelect ? mainVocab.filter((item) => selectedVocabIds.includes(item.id)) : mainVocab;
    requestExport({ kind: "vocab", items, name: learningExportName([
      "生词", vocabNotebookFilter === "all" ? "全部生词本" : notebooks.find((item) => item.id === vocabNotebookFilter)?.name || "生词本",
      vocabBookFilter === "all" ? "全部书籍" : bookTitleById(books, vocabBookFilter, items[0]?.bookTitle),
      vocabChapterFilter === "all" ? "全部章节" : vocabChapterOptions.find((item) => item.value === vocabChapterFilter)?.label || "章节",
      librarySearch.trim() ? "搜索-" + librarySearch.trim() : "", vocabMultiSelect ? "已选" + items.length + "条" : ""
    ]) });
  }

  function exportMainNotes() {
    const items = notesMultiSelect ? mainNotes.filter((item) => selectedNoteIds.includes(item.id)) : mainNotes;
    requestExport({ kind: "notes", items, name: learningExportName([
      "笔记", noteBookFilter === "all" ? "全部书籍" : bookTitleById(books, noteBookFilter, items[0]?.bookTitle),
      mainNoteChapterFilter === "all" ? "全部章节" : noteChapterOptions.find((item) => item.value === mainNoteChapterFilter)?.label || "章节",
      mainNoteStyleFilter === "all" ? "全部线型" : mainNoteStyleFilter === "wavy" ? "波浪线" : "直线",
      mainNoteColorFilter === "all" ? "全部颜色" : NOTE_COLOR_NAMES[mainNoteColorFilter] || mainNoteColorFilter,
      mainNoteIdeaOnly ? "仅有想法" : "全部笔记", librarySearch.trim() ? "搜索-" + librarySearch.trim() : "",
      notesMultiSelect ? "已选" + items.length + "条" : ""
    ]) });
  }

  function exportReaderNotes() {
    requestExport({ kind: "notes", items: filteredNotes, name: learningExportName([
      "笔记", activeBook?.title || "书籍", noteChapterFilter === "all" ? "全部章节" : chapters.find((item) => item.id === noteChapterFilter)?.title || "章节",
      noteStyleFilter === "all" ? "全部线型" : noteStyleFilter === "wavy" ? "波浪线" : "直线",
      noteColorFilter === "all" ? "全部颜色" : NOTE_COLOR_NAMES[noteColorFilter] || noteColorFilter,
      noteIdeaOnly ? "仅有想法" : "全部笔记"
    ]) });
  }

  async function confirmLearningExport() {
    if (!exportRequest || exportBusy) return;
    setExportBusy(true);
    try {
      const name = exportRequest.name + "_" + (EXPORT_STYLES.find((item) => item.value === exportFormat)?.label.split(" · ")[0] || exportFormat);
      const file = exportRequest.kind === "vocab"
        ? await window.readerAPI.vocab.exportItems(exportRequest.items, exportFormat, name)
        : await window.readerAPI.notes.exportItems(exportRequest.items, Object.fromEntries(books.map((book) => [book.id, book.title])), exportFormat, name);
      if (file) { setExportRequest(null); pushNotice("已导出"); }
    } catch (error: any) { pushNotice(error.message || String(error)); }
    finally { setExportBusy(false); }
  }

  async function locateVocab(item: VocabItem) {
    const serial = ++locateSerial.current;
    const sourceWord = item.phrase || item.word;
    const sourceSentence = (item.sourceSentence || item.example || "").trim();
    if (!item.bookId || !item.chapterId) {
      pushNotice("无法定位到原文");
      return;
    }
    await flushCurrentReadingPosition();
    temporaryLocateActive.current = true;
    suppressPositionSave.current = true;
    pendingLocateScroll.current = true;
    const [chapterText, targetHtml] = await Promise.all([
      window.readerAPI.books.chapterText(item.chapterId),
      window.readerAPI.books.chapterHtml(item.chapterId)
    ]);
    if (serial !== locateSerial.current) return;
    const htmlSourceRange = sourceSentence ? findTextRangeInHtml(targetHtml, sourceSentence) : null;
    const sourceRange = sourceSentence ? findTextRange(chapterText, sourceSentence) : null;
    const savedRange = typeof item.startOffset === "number" && typeof item.endOffset === "number"
      ? { start: item.startOffset, end: item.endOffset }
      : null;
    const wordRange = (savedRange && htmlRangeLooksLike(targetHtml, savedRange, sourceWord) ? savedRange : null)
      || (htmlSourceRange ? findWordRangeInHtml(targetHtml, sourceWord, htmlSourceRange) : null)
      || (sourceRange ? findWordRange(chapterText, sourceRange, sourceWord) : null);
    if (!wordRange) {
      pendingLocateScroll.current = false;
      temporaryLocateActive.current = false;
      schedulePositionSaveRelease(0);
      pushNotice("无法定位到原文");
      return;
    }
    const paragraphIndex = paragraphIndexForHtmlOffset(targetHtml, wordRange.start) ?? item.paragraphIndex ?? paragraphIndexForOffset(chapterText, wordRange.start);
    beginReaderRestore({ chapterId: item.chapterId, paragraphIndex, charOffset: 0, absoluteOffset: wordRange.start, scrollOffset: 0 }, true);
    const opened = await openBook(item.bookId, { restorePosition: false, touchLastOpened: false, suppressProgressSave: true });
    if (serial !== locateSerial.current) return;
    const index = opened ? opened.chapters.findIndex((chapter) => chapter.id === item.chapterId) : -1;
    if (!opened || index < 0) {
      suppressPositionSave.current = false;
      pendingLocateScroll.current = false;
      temporaryLocateActive.current = false;
      pushNotice("无法定位到原文");
      return;
    }
    beginReaderRestore({ chapterId: item.chapterId, paragraphIndex, charOffset: 0, absoluteOffset: wordRange.start, scrollOffset: 0 }, true);
    setChapterIndex(index);
    setSelectedText(sourceWord);
    setSelectedContext(sourceSentence);
    setSelectedRange(wordRange);
    setReaderSideCollapsed(true);
    pendingLocateScroll.current = true;
    setChapterLoadTick((tick) => tick + 1);
  }

  async function locateNoteFromLibrary(note: ReaderNote) {
    const serial = ++locateSerial.current;
    await flushCurrentReadingPosition();
    temporaryLocateActive.current = true;
    suppressPositionSave.current = true;
    pendingLocateScroll.current = true;
    const [targetChapterText, targetHtml] = await Promise.all([
      window.readerAPI.books.chapterText(note.chapterId),
      window.readerAPI.books.chapterHtml(note.chapterId)
    ]);
    if (serial !== locateSerial.current) return;
    const noteRange = note.startOffset !== undefined && note.endOffset !== undefined && htmlRangeLooksLike(targetHtml, { start: note.startOffset, end: note.endOffset }, note.selectedText)
      ? { start: note.startOffset, end: note.endOffset }
      : findTextRangeInHtml(targetHtml, note.selectedText);
    const paragraphIndex = noteRange
      ? paragraphIndexForHtmlOffset(targetHtml, noteRange.start) ?? note.paragraphIndex ?? paragraphIndexForOffset(targetChapterText, noteRange.start)
      : note.paragraphIndex ?? (typeof note.startOffset === "number" ? paragraphIndexForOffset(targetChapterText, note.startOffset) : 0);
    beginReaderRestore({
      chapterId: note.chapterId,
      paragraphIndex,
      charOffset: 0,
      absoluteOffset: noteRange?.start ?? note.startOffset,
      scrollOffset: 0
    }, true);
    const opened = await openBook(note.bookId, { restorePosition: false, touchLastOpened: false, suppressProgressSave: true });
    if (serial !== locateSerial.current) return;
    const index = opened ? opened.chapters.findIndex((chapter) => chapter.id === note.chapterId) : -1;
    if (!opened || index < 0) {
      suppressPositionSave.current = false;
      pendingLocateScroll.current = false;
      temporaryLocateActive.current = false;
      pushNotice("无法定位到原文");
      return;
    }
    beginReaderRestore({
      chapterId: note.chapterId,
      paragraphIndex,
      charOffset: 0,
      absoluteOffset: noteRange?.start ?? note.startOffset,
      scrollOffset: 0
    }, true);
    setChapterIndex(index);
    setSelectedText(note.selectedText);
    setSelectedRange(noteRange);
    setViewMode("reader");
    pendingLocateScroll.current = true;
    setChapterLoadTick((tick) => tick + 1);
  }

  function beginEditNote(note: ReaderNote) {
    setEditingNote(note);
    setEditingIdea(note.noteText || "");
  }

  async function confirmEditNote() {
    if (!editingNote) return;
    const updated = await window.readerAPI.notes.update(editingNote.id, { noteText: editingIdea.trim() });
    setNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
    setAllNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
    setEditingNote(null);
    setEditingIdea("");
    pushNotice("想法已更新");
  }

  async function jumpToBookmark(bookmark: Bookmark) {
    const index = chapters.findIndex((chapter) => chapter.id === bookmark.chapterId);
    if (index >= 0) {
      await flushCurrentReadingPosition();
      const chapter = chapters[index];
      if (WEB && typeof bookmark.absoluteOffset === "number") {
        beginReaderRestore({ chapterId: chapter.id, absoluteOffset: bookmark.absoluteOffset, paragraphIndex: bookmark.paragraphIndex || 0, charOffset: bookmark.charOffset || 0, scrollOffset: bookmark.scrollOffset }, true);
        pendingLocateScroll.current = false;
        clearReaderSelection();
        setChapterIndex(index);
        setChapterLoadTick(tick => tick + 1);
        if (matchMedia("(max-width: 860px)").matches) setReaderSideCollapsed(true);
        return;
      }
      let anchor: ReaderAnchor | null = chapter ? { chapterId: chapter.id, paragraphIndex: 0, charOffset: 0, scrollOffset: bookmark.scrollOffset } : null;
      let range: { start: number; end: number } | null = null;
      if (chapter && bookmark.excerpt?.trim()) {
        try {
          const html = chapter.id === currentChapter?.id && chapterHtml ? chapterHtml : await window.readerAPI.books.chapterHtml(chapter.id);
          range = findTextRangeInHtml(html, bookmark.excerpt);
          if (range) {
            const paragraphIndex = paragraphIndexForHtmlOffset(html, range.start) ?? 0;
            anchor = { chapterId: chapter.id, paragraphIndex, charOffset: 0, absoluteOffset: range.start, scrollOffset: bookmark.scrollOffset };
          }
        } catch {
          range = null;
        }
      }
      beginReaderRestore(anchor, true);
      setChapterIndex(index);
      if (range && bookmark.excerpt) {
        setSelectedText(bookmark.excerpt);
        setSelectedRange(range);
        pendingLocateScroll.current = true;
      } else {
        clearReaderSelection();
      }
      setChapterLoadTick((tick) => tick + 1);
    }
  }

  async function jumpToNote(note: ReaderNote) {
    if (WEB) { await locateNoteFromLibrary(note); return; }
    await flushCurrentReadingPosition();
    const index = chapters.findIndex((chapter) => chapter.id === note.chapterId);
    if (index >= 0) setChapterIndex(index);
    setSelectedText(note.selectedText);
    setSelectedRange(note.startOffset !== undefined && note.endOffset !== undefined ? { start: note.startOffset, end: note.endOffset } : null);
    requestAnimationFrame(() => {
      const reader = readerRef.current;
      const target = reader?.querySelector(".reader-selection") || reader?.querySelector(".reader-note");
      if (target) scrollElementIntoReaderView(target as HTMLElement, true);
    });
  }

  function handleReaderClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (anchor) {
      event.preventDefault();
      void jumpToChapterHref(anchor.getAttribute("href") || "");
      return;
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    if (ideaTargetId) return;
    if (settings.dictionary.click) {
      const info = wordInfoAtPoint(event);
      if (info.word) {
        setSelectedText(info.word);
        setSelectedContext(info.context);
        setSelectedRange(info.range);
        moveDictionaryFloatNear(event.clientX, event.clientY);
        lookup(info.word, false, true, info);
      } else {
        clearReaderSelection();
      }
    } else if (!(event.target as HTMLElement | null)?.closest?.(".reader-note")) {
      clearReaderSelection();
    }
  }

  async function jumpToChapterHref(href: string) {
    if (!href || !currentChapter) return;
    const target = normalizeReaderHref(currentChapter.href || "", href);
    const index = chapters.findIndex((chapter) => stripFragment(chapter.href || "") === stripFragment(target));
    if (index >= 0) {
      await flushCurrentReadingPosition();
      const chapter = chapters[index];
      beginReaderRestore(chapter ? { chapterId: chapter.id, paragraphIndex: 0, charOffset: 0, scrollOffset: 0 } : null, true);
      setChapterIndex(index);
      setChapterLoadTick((tick) => tick + 1);
    } else {
      pushNotice("这个链接指向书籍目录或附录页面，当前未作为正文章节打开");
    }
  }

  async function createNotebookLikeDesktop() {
    const baseName = nextNotebookName(notebooks);
    const notebook = await window.readerAPI.vocab.addNotebook(baseName);
    setNotebooks((items) => [...items, notebook]);
    setActiveNotebook(notebook.id);
    setRenamingNotebookId(notebook.id);
    setNotebookDraftName(notebook.name);
    pushNotice("生词本已新建");
  }

  async function commitNotebookRename(id: string) {
    const clean = notebookDraftName.trim();
    const current = notebooks.find((item) => item.id === id);
    setRenamingNotebookId("");
    if (!current || !clean || clean === current.name) return;
    try {
      const notebook = await window.readerAPI.vocab.renameNotebook(id, clean);
      setNotebooks((items) => items.map((item) => item.id === notebook.id ? notebook : item));
      pushNotice("生词本已重命名");
    } catch (error: any) {
      pushNotice(error.message || String(error));
    }
  }

  function openVocabInDictionary(item: VocabItem) {
    if (WEB && !settings.dictionary.enabled) { void locateVocab(item); return; }
    if (vocabPanelRef.current) vocabScrollTop.current = vocabPanelRef.current.scrollTop;
    setSelectedText(item.word);
    setSelectedRange(null);
    setSelectedContext(item.sourceSentence || "");
    setSideTab("dictionary");
    lookup(item.word, false);
    dictionaryOrigin.current = { ...item };
  }

  async function saveSettings(next: AppSettings) {
    setSettings(next);
    const saved = await window.readerAPI.settings.set(next);
    setSettings(saved);
    if (WEB && !saved.dictionary.enabled) {
      lookupSerial.current++; setDictionary(null); setDictionaryEnhancing(false); setDictionaryFloatOpen(false);
      if (sideTab === "dictionary") setSideTab("toc");
    }
  }

  async function resetSettings(category: SettingCategory = "library") {
    const confirmed = await askConfirm(
      "恢复默认设置",
      "将只恢复当前设置分类下的选项；书籍、书架、生词、笔记、书签和已加密保存的 API Key 不会被删除",
      true
    );
    if (!confirmed) return;
    const next = resetSettingsCategory(settings, category);
    await saveSettings(next);
    pushNotice("设置已恢复默认");
  }

  async function chooseBackground(target: "app" | "reader") {
    const file = await window.readerAPI.settings.importBackground();
    if (!file) return;
    setBackgroundEditor({
      target,
      path: file,
      x: target === "app" ? settings.backgrounds.appPositionX : settings.backgrounds.readerPositionX,
      y: target === "app" ? settings.backgrounds.appPositionY : settings.backgrounds.readerPositionY,
      scale: target === "app" ? settings.backgrounds.appScale : settings.backgrounds.readerScale,
      opacity: target === "app" ? settings.backgrounds.appOpacity ?? DEFAULT_SETTINGS.backgrounds.appOpacity : settings.backgrounds.readerOpacity ?? DEFAULT_SETTINGS.backgrounds.readerOpacity
    });
  }

  function editCurrentBackground(target: "app" | "reader") {
    const path = target === "app" ? settings.backgrounds.appPath : settings.backgrounds.readerPath;
    if (!path) return;
    setBackgroundEditor({
      target,
      path,
      x: target === "app" ? settings.backgrounds.appPositionX : settings.backgrounds.readerPositionX,
      y: target === "app" ? settings.backgrounds.appPositionY : settings.backgrounds.readerPositionY,
      scale: target === "app" ? settings.backgrounds.appScale : settings.backgrounds.readerScale,
      opacity: target === "app" ? settings.backgrounds.appOpacity ?? DEFAULT_SETTINGS.backgrounds.appOpacity : settings.backgrounds.readerOpacity ?? DEFAULT_SETTINGS.backgrounds.readerOpacity
    });
  }

  function applyBackgroundEditor() {
    if (!backgroundEditor) return;
    const nextBackgrounds = backgroundEditor.target === "app"
      ? {
          ...settings.backgrounds,
          appPath: backgroundEditor.path,
          appPositionX: backgroundEditor.x,
          appPositionY: backgroundEditor.y,
          appScale: backgroundEditor.scale,
          appOpacity: backgroundEditor.opacity
        }
      : {
          ...settings.backgrounds,
          readerPath: backgroundEditor.path,
          readerPositionX: backgroundEditor.x,
          readerPositionY: backgroundEditor.y,
          readerScale: backgroundEditor.scale,
          readerOpacity: backgroundEditor.opacity
        };
    saveSettings({ ...settings, backgrounds: nextBackgrounds });
    setBackgroundEditor(null);
  }

  async function saveSecret(service: string, value: string) {
    if (!value.trim()) {
      pushNotice("API Key 为空，未保存");
      return;
    }
    try {
      await window.readerAPI.secrets.set(service, value.trim());
      pushNotice("API Key 已加密保存");
    } catch (error: any) {
      pushNotice(error.message || String(error));
    }
  }

  async function askAi() {
    if (!aiQuestion.trim()) return;
    const question = aiQuestion.trim();
    let contextMode = aiContextMode;
    if (contextMode !== "chapter" && asksForLargeContext(question)) {
      const confirmed = await askConfirm("需要较多上下文", "此操作需要读取较多内容，预计消耗较多 token，是否继续？");
      if (confirmed) contextMode = "chapter";
      else contextMode = "selection";
    }
    setAiQuestion("");
    setAiContextMenuOpen(false);
    const now = new Date().toISOString();
    setAiLog((log) => trimAiLogRounds([...log, { role: "user", text: question, createdAt: now }, { role: "assistant", text: "正在思考...", createdAt: now }], settings.ai.historyRounds));
    try {
      const answer = await window.readerAPI.ai.ask(question, buildAiReadingContext(activeBook, currentChapter, selectedText, contextText, selectedRange, contextMode, aiLog, settings.ai.historyRounds));
      setAiLog((log) => trimAiLogRounds([...log.slice(0, -1), { role: "assistant", text: answer, createdAt: new Date().toISOString() }], settings.ai.historyRounds));
    } catch (error: any) {
      setAiLog((log) => trimAiLogRounds([...log.slice(0, -1), { role: "assistant", text: error.message || String(error), createdAt: new Date().toISOString() }], settings.ai.historyRounds));
    }
  }

  function deleteAiPair(index: number) {
    setAiLog((log) => log.filter((_, current) => current !== index && current !== index + 1));
    setAiDeleteMenu(null);
  }

  async function translateSelection() {
    const text = selectedText || currentSentence();
    if (!text.trim()) {
      pushNotice("请先选中要翻译的句子");
      return;
    }
    if (readerSideCollapsed) {
      if (!selectedText) moveDictionaryFloatNear(window.innerWidth / 2, window.innerHeight / 2);
      setDictionaryFloatOpen(true);
    } else {
      setSideTab("dictionary");
    }
    if (!isSimpleWord(text)) setDictionary(null);
    setDictionaryPanelTab("definition");
    setTranslation("正在翻译...");
    if (settings.ai.useBaiduForTranslation) {
      try {
        const result = await window.readerAPI.dictionary.lookupWithSource(text, "baidu");
        const translated = usefulTranslationFromDictionaryResult(result);
        if (translated) {
          setTranslation(translated);
          return;
        }
      } catch {
        // Fall through to AI or dictionary fallback.
      }
    }
    if (settings.ai.enabled) {
      try {
        const answer = await window.readerAPI.ai.ask("请将这段英文自然翻译成中文，并简要说明难点", text);
        setTranslation(answer);
        return;
      } catch {
        // Fall through to the configured dictionary as a final fallback.
      }
    }
    try {
      const result = await window.readerAPI.dictionary.lookup(text);
      const translated = usefulTranslationFromDictionaryResult(result);
      if (translated) {
        setTranslation(translated);
        return;
      }
    } catch {
      // Report the combined failure below.
    }
    setTranslation("");
    pushNotice("当前无法翻译，请检查百度翻译、AI 或词典配置");
  }

  async function speak(text: string) {
    const content = text.trim();
    if (!content) return;
    const offset = selectedText && content === selectedText && selectedRange ? selectedRange.start : Math.max(0, (currentChapter?.plainText || "").indexOf(content));
    if (WEB) {
      const range = selectedRange && content === selectedText ? selectedRange : findTextRangeInHtml(chapterHtml, content);
      startTtsQueue(range ? makeWebTtsSegments(chapterHtml, chapterIndex, range.start).filter(segment => segment.startOffset < range.end).map(segment => ({ ...segment, text: htmlTextForRawRange(chapterHtml, { start: segment.startOffset, end: Math.min(segment.endOffset, range.end) }), endOffset: Math.min(segment.endOffset, range.end) })) : makeTtsSegments(content, chapterIndex, offset));
      return;
    }
    startTtsQueue(makeTtsSegments(content, chapterIndex, offset));
  }

  function speakFromBookStart() {
    setTtsMenuOpen(false);
    if (WEB) { void startWebTtsFrom(0); return; }
    startTtsQueue(buildTtsQueue(chapterIndex, 0, true));
  }

  function speakFromSelection() {
    setTtsMenuOpen(false);
    if (WEB) { void startWebTtsFrom(selectedRange?.start ?? currentReaderAnchor(readerRef.current!).absoluteOffset ?? 0); return; }
    const chapterText = currentChapter?.plainText || "";
    const selected = selectedText.trim();
    const offset = selectedRange?.start ?? (selected ? chapterText.indexOf(selected) : 0);
    startTtsQueue(buildTtsQueue(chapterIndex, Math.max(0, offset), true));
  }

  async function startWebTtsFrom(offset: number) {
    const requestId = ++ttsRunIdRef.current;
    const firstChapter = chapterIndex;
    setTtsState("loading");
    try {
      const segments: TtsSegment[] = [];
      for (let index = firstChapter; index < chapters.length; index++) {
        const html = index === firstChapter && chapterHtml ? chapterHtml : await window.readerAPI.books.chapterHtml(chapters[index].id);
        if (requestId !== ttsRunIdRef.current) return;
        segments.push(...makeWebTtsSegments(html, index, index === firstChapter ? offset : 0));
      }
      if (requestId === ttsRunIdRef.current) startTtsQueue(segments);
    } catch (error: any) { if (requestId === ttsRunIdRef.current) { stopTts(); pushNotice(error.message || "无法加载朗读正文"); } }
  }

  function speakFromCurrentPosition() {
    setTtsMenuOpen(false);
    if (readerRef.current) void startWebTtsFrom(currentReaderAnchor(readerRef.current).absoluteOffset ?? 0);
  }

  function buildTtsQueue(startChapterIndex: number, startOffset: number, currentChapterOnly = false): TtsSegment[] {
    return chapters.flatMap((chapter, index) => {
      if (index < startChapterIndex) return [];
      if (currentChapterOnly && index !== startChapterIndex) return [];
      const offset = index === startChapterIndex ? startOffset : 0;
      return makeTtsSegments(chapter.plainText.slice(offset), index, offset);
    });
  }

  function startTtsQueue(segments: TtsSegment[]) {
    if (!segments.length) {
      pushNotice("没有可朗读的文本");
      return;
    }
    ttsRunIdRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis.cancel();
    ttsQueueRef.current = segments;
    ttsQueueIndexRef.current = 0;
    setTtsState("loading");
    playNextTtsSegment(ttsRunIdRef.current);
  }

  function stopTts() {
    ttsRunIdRef.current += 1;
    ttsQueueRef.current = [];
    ttsQueueIndexRef.current = 0;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis.cancel();
    setTtsPointer(null);
    pendingWebSpeech.current = null;
    setTtsState("");
    setTtsMenuOpen(false);
  }

  function playNextTtsSegment(runId: number) {
    if (runId !== ttsRunIdRef.current) return;
    const segment = ttsQueueRef.current[ttsQueueIndexRef.current];
    if (!segment) {
      audioRef.current = null;
      setTtsState("");
      setTtsPointer(null);
      return;
    }
    if (settings.tts.autoScroll && segment.chapterIndex !== chapterIndex) {
      void flushCurrentReadingPosition();
      const chapter = chapters[segment.chapterIndex];
      if (chapter) {
        beginReaderRestore({
          chapterId: chapter.id,
          paragraphIndex: paragraphIndexForOffset(chapter.plainText, segment.startOffset),
          charOffset: localCharOffsetForParagraph(chapter.plainText, paragraphIndexForOffset(chapter.plainText, segment.startOffset), segment.startOffset),
          absoluteOffset: segment.startOffset,
          scrollOffset: 0
        }, true);
      }
      setChapterIndex(segment.chapterIndex);
      setChapterLoadTick((tick) => tick + 1);
    } else if (settings.tts.autoScroll && segment.chapterIndex === chapterIndex) {
      setChapterPageIndex(pageIndexForOffset(chapterPages, segment.startOffset));
      queueCurrentReadingPositionSave(900);
    }
    setTtsPointer(segment);
    if (WEB) { pendingWebSpeech.current = { segment, runId }; return; }
    if (settings.tts.provider === "edge") {
      playEdgeTtsSegment(segment, runId);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = "en-US";
    utterance.rate = settings.tts.rate;
    configureWebVoice(utterance, settings.tts.voice);
    utterance.onstart = () => runId === ttsRunIdRef.current && setTtsState("speaking");
    utterance.onpause = () => runId === ttsRunIdRef.current && setTtsState("paused");
    utterance.onresume = () => runId === ttsRunIdRef.current && setTtsState("speaking");
    utterance.onend = () => {
      if (runId !== ttsRunIdRef.current) return;
      ttsQueueIndexRef.current += 1;
      window.setTimeout(() => playNextTtsSegment(runId), 40);
    };
    utterance.onerror = () => {
      if (runId !== ttsRunIdRef.current) return;
      ttsQueueIndexRef.current += 1;
      window.setTimeout(() => playNextTtsSegment(runId), 40);
    };
    window.speechSynthesis.speak(utterance);
  }

  async function playEdgeTtsSegment(segment: TtsSegment, runId: number) {
    try {
      setTtsState((state) => state || "loading");
      const audioBase64 = await edgeAudioForSegment(segment);
      if (runId !== ttsRunIdRef.current) return;
      if (audioBase64) {
        prefetchNextEdgeSegment();
        const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
        audioRef.current?.pause();
        audioRef.current = audio;
        audio.onplay = () => runId === ttsRunIdRef.current && setTtsState("speaking");
        audio.onpause = () => {
          if (runId === ttsRunIdRef.current && !audio.ended) setTtsState("paused");
        };
        audio.onended = () => {
          if (runId !== ttsRunIdRef.current) return;
          ttsQueueIndexRef.current += 1;
          window.setTimeout(() => playNextTtsSegment(runId), 40);
        };
        audio.onerror = () => {
          if (runId !== ttsRunIdRef.current) return;
          speakSegmentWithWebSpeech(segment, runId);
        };
        await audio.play();
        return;
      }
      speakSegmentWithWebSpeech(segment, runId);
    } catch {
      if (runId === ttsRunIdRef.current) speakSegmentWithWebSpeech(segment, runId);
    }
  }

  function edgeAudioForSegment(segment: TtsSegment): Promise<string | null> {
    const voice = settings.tts.voice || "en-US-JennyNeural";
    const key = `${voice}|${settings.tts.rate}|${segment.text}`;
    const cached = ttsEdgeCache.current.get(key);
    if (cached) return cached;
    const request = window.readerAPI.tts.edgeSpeak(segment.text, settings.tts.rate, voice)
      .then((result) => result.available && result.audioBase64 ? result.audioBase64 : null)
      .catch(() => null);
    ttsEdgeCache.current.set(key, request);
    return request;
  }

  function prefetchNextEdgeSegment() {
    const next = ttsQueueRef.current[ttsQueueIndexRef.current + 1];
    if (next) edgeAudioForSegment(next);
  }

  function speakSegmentWithWebSpeech(segment: TtsSegment, runId: number) {
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = "en-US";
    utterance.rate = settings.tts.rate;
    configureWebVoice(utterance, settings.tts.voice);
    utterance.onstart = () => runId === ttsRunIdRef.current && setTtsState("speaking");
    utterance.onpause = () => runId === ttsRunIdRef.current && setTtsState("paused");
    utterance.onresume = () => runId === ttsRunIdRef.current && setTtsState("speaking");
    utterance.onend = () => {
      if (runId !== ttsRunIdRef.current) return;
      ttsQueueIndexRef.current += 1;
      window.setTimeout(() => playNextTtsSegment(runId), 40);
    };
    utterance.onerror = () => {
      if (runId !== ttsRunIdRef.current) return;
      ttsQueueIndexRef.current += 1;
      window.setTimeout(() => playNextTtsSegment(runId), 40);
    };
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis.speak(utterance);
  }

  async function speakDictionaryPronunciation(result: DictionaryResult, audioUrl?: string) {
    await speakTermPronunciation(result.term, arguments.length > 1 ? audioUrl : result.audio);
  }

  async function speakVocabPronunciation(item: VocabItem) {
    const source = settings.dictionary.pronunciationSource || "free";
    try {
      const result = await window.readerAPI.dictionary.lookupWithSource(item.word, source);
      await speakTermPronunciation(item.word, result.audio);
    } catch {
      speakWithWebSpeech(item.word);
    }
  }

  async function speakTermPronunciation(term: string, audioUrl?: string) {
    const content = term.trim();
    if (!content) return;
    ttsRunIdRef.current += 1;
    const runId = ttsRunIdRef.current;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis.cancel();
    ttsQueueRef.current = [];
    ttsQueueIndexRef.current = 0;
    setTtsPointer(null);
    if (audioUrl) {
      setTtsState("loading");
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onplay = () => runId === ttsRunIdRef.current && setTtsState("speaking");
      audio.onpause = () => {
        if (runId === ttsRunIdRef.current && !audio.ended) setTtsState("paused");
      };
      audio.onended = () => runId === ttsRunIdRef.current && setTtsState("");
      audio.onerror = () => {
        if (runId !== ttsRunIdRef.current) return;
        setTtsState("");
        speakTermPronunciation(content);
      };
      await audio.play().catch(() => speakTermPronunciation(content));
      return;
    }
    if (settings.tts.provider === "edge") {
      setTtsState("loading");
      const result = await window.readerAPI.tts.edgeSpeak(content, settings.tts.rate, settings.tts.voice || "en-US-JennyNeural").catch(() => null);
      if (runId !== ttsRunIdRef.current) return;
      if (result?.available && result.audioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${result.audioBase64}`);
        audioRef.current = audio;
        audio.onplay = () => runId === ttsRunIdRef.current && setTtsState("speaking");
        audio.onpause = () => {
          if (runId === ttsRunIdRef.current && !audio.ended) setTtsState("paused");
        };
        audio.onended = () => runId === ttsRunIdRef.current && setTtsState("");
        audio.onerror = () => runId === ttsRunIdRef.current && speakWithWebSpeech(content);
        await audio.play().catch(() => speakWithWebSpeech(content));
        return;
      }
    }
    speakWithWebSpeech(content);
  }

  function speakWithWebSpeech(text: string) {
    const content = text.trim();
    if (!content) return;
    ttsRunIdRef.current += 1;
    ttsQueueRef.current = [];
    ttsQueueIndexRef.current = 0;
    setTtsPointer(null);
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "en-US";
    utterance.rate = settings.tts.rate;
    configureWebVoice(utterance, settings.tts.voice);
    utterance.onstart = () => setTtsState("speaking");
    utterance.onpause = () => setTtsState("paused");
    utterance.onresume = () => setTtsState("speaking");
    utterance.onend = () => setTtsState("");
    utterance.onerror = () => setTtsState("");
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function pauseTts() {
    if (audioRef.current) {
      if (audioRef.current.paused) audioRef.current.play().then(() => setTtsState("speaking"));
      else {
        audioRef.current.pause();
        setTtsState("paused");
      }
      return;
    }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setTtsState("speaking");
    } else if (ttsState === "speaking" || ttsState === "loading") {
      window.speechSynthesis.pause();
      setTtsState("paused");
    } else if (ttsState) {
      speakCurrentSentence();
    }
  }

  function jumpTtsSentence(delta: 1 | -1) {
    const queue = ttsQueueRef.current;
    if (!queue.length) {
      speakCurrentSentence(sentenceIndex + delta);
      return;
    }
    const nextIndex = Math.max(0, Math.min(queue.length - 1, ttsQueueIndexRef.current + delta));
    ttsRunIdRef.current += 1;
    ttsQueueIndexRef.current = nextIndex;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis.cancel();
    setTtsState("loading");
    playNextTtsSegment(ttsRunIdRef.current);
  }

  function returnToTtsPosition() {
    const segment = ttsPointer;
    const chapter = segment ? chapters[segment.chapterIndex] : null;
    if (!segment || !chapter) return;
    void flushCurrentReadingPosition();
    beginReaderRestore({
      chapterId: chapter.id,
      paragraphIndex: paragraphIndexForOffset(chapter.plainText, segment.startOffset),
      charOffset: localCharOffsetForParagraph(chapter.plainText, paragraphIndexForOffset(chapter.plainText, segment.startOffset), segment.startOffset),
      absoluteOffset: segment.startOffset,
      scrollOffset: 0
    }, true);
    setChapterIndex(segment.chapterIndex);
    setChapterPageIndex(pageIndexForOffset(chapterPages, segment.startOffset));
    setChapterLoadTick((tick) => tick + 1);
  }

  function speakCurrentSentence(nextIndex = sentenceIndex) {
    if (WEB) { speakFromCurrentPosition(); return; }
    const safeIndex = Math.max(0, Math.min(sentences.length - 1, nextIndex));
    setSentenceIndex(safeIndex);
    const chapterText = currentChapter?.plainText || "";
    const sentence = sentenceMatches(chapterText)[safeIndex];
    startTtsQueue(sentence ? makeTtsSegments(chapterText.slice(sentence.start), chapterIndex, sentence.start) : makeTtsSegments(sentenceAt(sentences, safeIndex), chapterIndex, 0));
  }

  function currentSentence() {
    return selectedText || sentenceAt(sentences, sentenceIndex) || sentenceFromText(contextText);
  }

  function cycleTheme() {
    const themes: AppSettings["theme"][] = ["paper", "night", "sepia", "forest", "blue", "dusk"];
    saveSettings({ ...settings, theme: themes[(themes.indexOf(settings.theme) + 1) % themes.length] });
  }

  function pushNotice(message: string) {
    setNotice(message.replace(/。/g, ""));
    window.setTimeout(() => setNotice(""), 5000);
  }

  function clearReaderSelection() {
    setSelectedText("");
    setSelectedContext("");
    setSelectedRange(null);
    setDictionaryFloatOpen(false);
    setTranslation("");
    if (!WEB) window.getSelection()?.removeAllRanges();
  }

  const filteredVocab = vocab.filter((item) => item.notebookId === activeNotebook);
  const appBackground = viewMode === "reader" ? settings.backgrounds.readerPath : settings.backgrounds.appPath;
  const appBackgroundPosition = viewMode === "reader"
    ? `${settings.backgrounds.readerPositionX}% ${settings.backgrounds.readerPositionY}%`
    : `${settings.backgrounds.appPositionX}% ${settings.backgrounds.appPositionY}%`;
  const appBackgroundSize = viewMode === "reader" ? `${settings.backgrounds.readerScale}% auto` : `${settings.backgrounds.appScale}% auto`;
  const appBackgroundOpacity = viewMode === "reader"
    ? settings.backgrounds.readerOpacity ?? DEFAULT_SETTINGS.backgrounds.readerOpacity
    : settings.backgrounds.appOpacity ?? DEFAULT_SETTINGS.backgrounds.appOpacity;
  const ttsActive = ttsState === "loading" || ttsState === "speaking" || ttsState === "paused";
  const allMainVocabSelected = mainVocab.length > 0 && mainVocab.every((item) => selectedVocabIds.includes(item.id));
  const allMainNotesSelected = mainNotes.length > 0 && mainNotes.every((note) => selectedNoteIds.includes(note.id));

  return (
    <div
      ref={appShellRef}
      className={`app-shell ${appBackground ? "has-custom-background" : ""} ${WEB && settings.yujing?.enabled ? "yj-enabled" : ""} ${viewMode === "library" ? "library-mode" : "reader-mode"} ${readerSideCollapsed ? "side-collapsed" : ""}`}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest?.(".library-book, .notebook-pill, .context-menu, .context-delete, .chat")) {
          setBookMenu(null);
          setNotebookMenu(null);
          setAiDeleteMenu(null);
        }
      }}
    >
      {WEB && <Yujing settings={settings.yujing} save={yujing => { void saveSettings({ ...settings, yujing }); }} view={viewMode} book={activeBook} chapterText={contextText} chapterTitle={currentChapter?.title} notes={allNotes} vocab={libraryTab === "vocab" ? mainVocab : vocab} notebooks={notebooks} selectedText={selectedText} capture={() => addSelectionMark("solid", noteDraftColor)} home={() => { void returnToLibrary(); setLibraryTab("all"); }} pageKey={`${activeBook?.id || ""}:${currentChapter?.id || ""}:${safePageIndex}`} />}
      {appBackground && (!WEB || !settings.yujing?.enabled || settings.yujing.blend === "mix") && (
        <div
          className="app-background-layer"
          style={{
            backgroundImage: `url("${toFileUrl(appBackground)}")`,
            backgroundPosition: appBackgroundPosition,
            backgroundSize: appBackgroundSize,
            opacity: appBackgroundOpacity / 100
          }}
        />
      )}
      {viewMode === "library" ? (
        <>
          <aside className={`library-sidebar ${libraryNavigationOpen ? "mobile-expanded" : ""}`}>
            <div className="brand">{WEB ? <img className="brand-icon" src="./icon.svg" alt="" /> : <span>e</span>}<div><strong>{WEB ? "SkipReader" : "eRead"}</strong><small>{WEB ? "一跃 · 让阅读向前一步" : "Read English with ease"}</small></div></div>
            <nav className="library-nav" aria-label="书库分区">
              <button aria-label="全部书籍" aria-current={libraryTab === "all" ? "page" : undefined} className={libraryTab === "all" ? "active" : ""} onClick={() => { if (WEB && libraryTab !== "all") setLibrarySearch(""); setLibraryTab("all"); updateLibrary({ activeShelfId: "all" }); }}><span aria-hidden="true">📚</span><b>全部书籍</b></button>
              <button aria-label="我的收藏" aria-current={libraryTab === "favorites" ? "page" : undefined} className={libraryTab === "favorites" ? "active" : ""} onClick={() => { if (WEB && libraryTab !== "favorites") setLibrarySearch(""); setLibraryTab("favorites"); updateLibrary({ activeShelfId: "all" }); }}><span aria-hidden="true">★</span><b>我的收藏</b></button>
              <button aria-label="我的生词" aria-current={libraryTab === "vocab" ? "page" : undefined} className={libraryTab === "vocab" ? "active" : ""} onClick={() => { if (WEB && libraryTab !== "vocab") setLibrarySearch(""); setLibraryTab("vocab"); }}><span aria-hidden="true">Aa</span><b>我的生词</b></button>
              <button aria-label="我的笔记" aria-current={libraryTab === "notes" ? "page" : undefined} className={libraryTab === "notes" ? "active" : ""} onClick={() => { if (WEB && libraryTab !== "notes") setLibrarySearch(""); setLibraryTab("notes"); }}><span aria-hidden="true">✎</span><b>我的笔记</b></button>
            </nav>
            {WEB && <button className="mobile-library-toggle" aria-expanded={libraryNavigationOpen} onClick={() => setLibraryNavigationOpen(value => !value)}>{libraryNavigationOpen ? "收起书架与统计 ▴" : "书架与统计 ▾"}</button>}
            <div className="shelf-header"><span>我的书架</span><button onClick={beginCreateShelf} title="新建书架">＋</button></div>
            <div className="shelf-list">
              {creatingShelf && (
                <input
                  className="shelf-name-input"
                  value={shelfDraftName}
                  autoFocus
                  onChange={(event) => setShelfDraftName(event.target.value)}
                  onBlur={commitCreateShelf}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitCreateShelf();
                    if (event.key === "Escape") {
                      setCreatingShelf(false);
                      setShelfDraftName("");
                    }
                  }}
                />
              )}
              {libraryShelves.map((shelf) => (
                renamingShelfId === shelf.id ? (
                  <input
                    key={shelf.id}
                    className="shelf-name-input"
                    value={shelfDraftName}
                    autoFocus
                    onChange={(event) => setShelfDraftName(event.target.value)}
                    onBlur={() => commitRenameShelf(shelf.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRenameShelf(shelf.id);
                      if (event.key === "Escape") {
                        setRenamingShelfId("");
                        setShelfDraftName("");
                      }
                    }}
                  />
                ) : (
                  <button
                    key={shelf.id}
                    className={activeShelf === shelf.id && libraryTab === "all" ? "active" : ""}
                    onClick={() => selectShelf(shelf.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      keepContextOpen();
                      setShelfMenu({ shelfId: shelf.id, x: event.clientX, y: event.clientY });
                    }}
                    onDoubleClick={() => beginRenameShelf(shelf.id)}
                    title="双击或右键重命名"
                  >
                    {shelf.name}
                  </button>
                )
              ))}
              {libraryShelves.length === 0 && <p className="shelf-empty">还没有书架</p>}
            </div>
            {settings.library.showReadingStats && (
              <div className="reading-stats">
                <strong>阅读统计</strong>
                <span>{books.length} 本书</span>
                <span>{vocab.length} 个生词</span>
                <span>{allNotes.length} 条笔记</span>
              </div>
            )}
          </aside>
          <main className="library-main">
            <header className="library-topbar">
              <div className="library-left-tools">
                <input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder={libraryTab === "vocab" ? "搜索生词" : libraryTab === "notes" ? "搜索笔记" : "搜索我的书籍"} />
                <button title="设置" onClick={() => setLibrarySettingsOpen(true)}>⚙</button>
                {(libraryTab === "all" || libraryTab === "favorites") && <button title="排序" onClick={() => updateLibrary({ sortMode: nextSortMode(settings.library.sortMode) })}>⇅ {sortModeLabel(settings.library.sortMode)}</button>}
              </div>
              <button className="primary import-button" disabled={Boolean(loading)} onClick={importBook}>导入书籍</button>
            </header>
            {libraryTab === "all" || libraryTab === "favorites" ? (
              <section className={`library-books ${settings.library.bookViewMode}`}>
                {filteredBooks.length === 0 && <Empty title={WEB ? librarySearch.trim() ? "没有找到匹配的书籍" : activeShelf !== "all" ? "这个书架还没有书" : libraryTab === "favorites" ? "还没有收藏的书籍" : "这里还没有书" : undefined} text={!WEB ? activeShelf !== "all" ? "这里还没有书" : libraryTab === "favorites" ? "这里还没有收藏" : "这里还没有书；导入 EPUB、TXT、Markdown 或 DOCX 后会出现在这里" : librarySearch.trim() ? "试试其他书名或作者，也可以清除搜索。" : activeShelf !== "all" ? "点击书籍的「管理」，选择「加入书架」即可整理书库。" : libraryTab === "favorites" ? "点击书籍的「管理」，选择「加入收藏」，喜欢的书就会出现在这里。" : "导入 EPUB、TXT、Markdown 或 DOCX，开始阅读。书籍与笔记会自动保存在当前浏览器。"} actionLabel={WEB ? librarySearch.trim() ? "清除搜索" : activeShelf === "all" && libraryTab === "all" ? "选择第一本书" : "查看全部书籍" : undefined} onAction={() => { if (librarySearch.trim()) setLibrarySearch(""); else if (activeShelf === "all" && libraryTab === "all") void importBook(); else { setLibraryTab("all"); void updateLibrary({ activeShelfId: "all" }); } }} />}
                {filteredBooks.map((book) => (
                  <div
                    key={book.id}
                    className={`library-book ${settings.library.favoriteBookIds.includes(book.id) ? "favorite" : ""}`}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      keepContextOpen();
                      setBookMenu({ bookId: book.id, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <button onClick={() => openBook(book.id)}>
                      <span className="cover-frame">
                        <BookCover book={book} />
                        {settings.library.favoriteBookIds.includes(book.id) && <span className="favorite-badge" title="已收藏">★</span>}
                      </span>
                      <strong title={book.title}>{book.title}</strong>
                      <small>{book.missing ? "文件丢失" : book.author || book.fileType.toUpperCase()}</small>
                    </button>
                    {book.missing && <button className="relocate-button" onClick={() => relocateBook(book.id)}>重新定位</button>}
                    {WEB && <button className="book-actions-button" aria-label={`管理《${book.title}》`} onClick={(event) => { event.stopPropagation(); keepContextOpen(); const rect = event.currentTarget.getBoundingClientRect(); setBookMenu({ bookId: book.id, x: Math.max(8, Math.min(rect.left, window.innerWidth - 170)), y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 310)) }); }}>管理</button>}
                  </div>
                ))}
              </section>
            ) : libraryTab === "vocab" ? (
              <section className="collection-page">
                <div className="collection-toolbar">
                  {WEB && <div className="collection-heading"><h1>我的生词</h1><span>{mainVocab.length} 个生词</span></div>}
                  <CustomSelect id="vocabNotebook" value={vocabNotebookFilter} options={[{ value: "all", label: "全部生词本" }, ...notebooks.map((notebook) => ({ value: notebook.id, label: notebook.name }))]} openId={openSelectId} setOpenId={setOpenSelectId} onChange={setVocabNotebookFilter} />
                  <CustomSelect id="vocabBook" value={vocabBookFilter} options={[{ value: "all", label: "全部书籍" }, ...books.map((book) => ({ value: book.id, label: book.title }))]} openId={openSelectId} setOpenId={setOpenSelectId} onChange={(value) => { setVocabBookFilter(value); setVocabChapterFilter("all"); }} />
                  <CustomSelect id="vocabChapter" value={vocabChapterFilter} options={[{ value: "all", label: "全部章节" }, ...vocabChapterOptions]} openId={openSelectId} setOpenId={setOpenSelectId} onChange={setVocabChapterFilter} />
                  <span className="collection-actions">
                    {vocabMultiSelect ? <button className="text-danger text-action" onClick={deleteSelectedVocab}>删除</button> : <button className="text-danger text-action invisible-action" aria-hidden="true" tabIndex={-1}>删除</button>}
                    <button onClick={exportMainVocab}>导出</button>
                    {vocabMultiSelect && <button disabled={!mainVocab.length} onClick={() => setSelectedVocabIds(allMainVocabSelected ? [] : mainVocab.map((item) => item.id))}>{allMainVocabSelected ? "不选" : "全选"}</button>}
                    <button onClick={() => { setVocabMultiSelect((value) => !value); setSelectedVocabIds([]); }}>{vocabMultiSelect ? "取消" : "多选"}</button>
                  </span>
                </div>
                <div className="collection-grid" ref={collectionGridRef}>
                  {mainVocab.length === 0 && <Empty title={WEB ? vocab.length ? "没有符合条件的生词" : "还没有收藏生词" : undefined} text={WEB ? vocab.length ? "调整筛选条件，或清除筛选以查看全部生词。" : "阅读时选中单词，点击「收藏生词」，就能在这里集中复习和导出。" : "暂无生词"} actionLabel={WEB && vocab.length ? "清除筛选" : undefined} onAction={() => { setLibrarySearch(""); setVocabNotebookFilter("all"); setVocabBookFilter("all"); setVocabChapterFilter("all"); }} />}
                  {mainVocab.map((item) => (
                    <div className="collection-card vocab-summary" key={item.id}>
                      {vocabMultiSelect && <input type="checkbox" checked={selectedVocabIds.includes(item.id)} onChange={(event) => setSelectedVocabIds(toggleId(selectedVocabIds, item.id, event.target.checked))} />}
                      <small className="card-source">{sourceLabel(item)}</small>
                      <strong>{item.word}</strong>
                      <span className="vocab-phonetic-line">
                        <small>{item.phonetic || "暂无发音"}</small>
                        <button className="icon-button speaker-button inline-speaker" onClick={() => speakVocabPronunciation(item)} title="发音" aria-label="发音">🔊</button>
                      </span>
                      <p className="vocab-definition-text">{formatVocabDefinitionText(item.chineseDef || item.englishDef || "暂无释义", Boolean(item.chineseDef))}</p>
                      {item.sourceSentence && <blockquote>{item.sourceSentence}</blockquote>}
                      <button className="card-icon locate-icon" title="定位到原文" onClick={(event) => { event.preventDefault(); locateVocab(item); }}>⌕</button>
                      <button className="card-icon delete-icon" title="删除" onClick={(event) => { event.preventDefault(); deleteVocab(item.id); }}><span className="trash-icon" /></button>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="collection-page">
                <div className="collection-toolbar">
                  {WEB && <div className="collection-heading"><h1>我的笔记</h1><span>{mainNotes.length} 条笔记{mainNotes.length !== allNotes.length ? ` / 共 ${allNotes.length} 条` : ""}</span></div>}
                  <CustomSelect id="noteBook" value={noteBookFilter} options={[{ value: "all", label: "全部书籍" }, ...books.map((book) => ({ value: book.id, label: book.title }))]} openId={openSelectId} setOpenId={setOpenSelectId} onChange={(value) => { setMainNoteBookFilter(value); setMainNoteChapterFilter("all"); }} />
                  <CustomSelect id="noteChapter" value={mainNoteChapterFilter} options={[{ value: "all", label: "全部章节" }, ...noteChapterOptions]} openId={openSelectId} setOpenId={setOpenSelectId} onChange={setMainNoteChapterFilter} />
                  <CustomSelect id="noteStyle" value={mainNoteStyleFilter} options={[{ value: "all", label: "全部线型" }, { value: "solid", label: "直线" }, { value: "wavy", label: "波浪线" }]} openId={openSelectId} setOpenId={setOpenSelectId} onChange={(value) => setMainNoteStyleFilter(value as typeof mainNoteStyleFilter)} />
                  <CustomSelect id="noteColor" value={mainNoteColorFilter} options={[{ value: "all", label: "全部颜色" }, ...NOTE_COLORS.map((color) => ({ value: color, label: <><span className="color-dot" style={{ background: color }} />{NOTE_COLOR_NAMES[color]}</> }))]} openId={openSelectId} setOpenId={setOpenSelectId} onChange={setMainNoteColorFilter} />
                  <label className="compact-check"><input type="checkbox" checked={mainNoteIdeaOnly} onChange={(event) => setMainNoteIdeaOnly(event.target.checked)} /> 仅有想法</label>
                  <span className="collection-actions">
                    {notesMultiSelect ? <button className="text-danger text-action" onClick={deleteSelectedNotes}>删除</button> : <button className="text-danger text-action invisible-action" aria-hidden="true" tabIndex={-1}>删除</button>}
                    <button onClick={exportMainNotes}>导出</button>
                    {notesMultiSelect && <button disabled={!mainNotes.length} onClick={() => setSelectedNoteIds(allMainNotesSelected ? [] : mainNotes.map((note) => note.id))}>{allMainNotesSelected ? "不选" : "全选"}</button>}
                    <button onClick={() => { setNotesMultiSelect((value) => !value); setSelectedNoteIds([]); }}>{notesMultiSelect ? "取消" : "多选"}</button>
                  </span>
                </div>
                <div className="collection-grid" ref={collectionGridRef}>
                  {mainNotes.length === 0 && <Empty title={WEB ? allNotes.length ? "没有符合条件的笔记" : "还没有笔记" : undefined} text={WEB ? allNotes.length ? "调整书籍、章节、线型或颜色筛选，也可以一键查看全部笔记。" : "阅读时选中文字，添加直线、波浪线或写下想法。这里会汇集所有书籍的笔记，支持编辑、定位和导出。" : "暂无笔记"} actionLabel={WEB && allNotes.length ? "清除筛选" : undefined} onAction={() => { setLibrarySearch(""); setMainNoteBookFilter("all"); setMainNoteChapterFilter("all"); setMainNoteStyleFilter("all"); setMainNoteColorFilter("all"); setMainNoteIdeaOnly(false); }} />}
                  {mainNotes.map((note) => (
                    <div className="collection-card note-summary" key={note.id}>
                      {notesMultiSelect && <input type="checkbox" checked={selectedNoteIds.includes(note.id)} onChange={(event) => setSelectedNoteIds(toggleId(selectedNoteIds, note.id, event.target.checked))} />}
                      <small className="card-source">{bookTitleById(books, note.bookId, note.bookTitle)} · {note.chapterTitle}</small>
                      <NoteLineSample note={note} />
                      <NoteTextPreview text={note.selectedText} className="plain-note-text" onMore={() => setViewingNote(note)} />
                      {note.noteText && <p>{note.noteText}</p>}
                      <button className="card-icon locate-icon" title="定位到原文" onClick={(event) => { event.preventDefault(); locateNoteFromLibrary(note); }}>⌕</button>
                      <button className="card-icon edit-icon" title="编辑" onClick={(event) => { event.preventDefault(); beginEditNote(note); }}>✎</button>
                      <button className="card-icon delete-icon" title="删除" onClick={(event) => { event.preventDefault(); deleteNote(note.id); }}><span className="trash-icon" /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {(libraryTab === "all" || libraryTab === "favorites") && <div className="view-switch">
              <button title="封面视图" aria-label="封面视图" className={settings.library.bookViewMode === "grid" ? "active" : ""} onClick={() => updateLibrary({ bookViewMode: "grid" })}>▦</button>
              <button title="列表视图" aria-label="列表视图" className={settings.library.bookViewMode === "compact" ? "active" : ""} onClick={() => updateLibrary({ bookViewMode: "compact" })}>☰</button>
            </div>}
          </main>
        </>
      ) : (
        <main className="main-area reader-main">
          <header className="topbar">
            <button onClick={returnToLibrary}>← 书库</button>
            <div>
              <strong>{activeBook?.title || "请选择或导入书籍"}</strong>
              <small>{currentChapter ? `${currentChapter.title} · ${chapterIndex + 1}/${chapters.length} · ${safePageIndex + 1}/${Math.max(1, chapterPages.length)} 页` : "EPUB / TXT / Markdown / DOCX"}</small>
            </div>
            <div className="toolbar">
              <button onClick={previousReaderPage} title="上一页">上一页</button>
              <button onClick={nextReaderPage} title="下一页">下一页</button>
              {WEB && settings.yujing?.enabled && settings.yujing.scene === "wind" && <button className="yj-capture" disabled={!selectedText.trim()} onMouseDown={event => event.preventDefault()} onClick={() => { void addSelectionMark("solid", noteDraftColor).then(note => { if (note) void saveSettings({ ...settings, yujing: { ...settings.yujing!, source: "highlights" } }); }).catch(error => pushNotice(String(error))); }}>选句入风</button>}
              <button onClick={() => addBookmark()}>+书签</button>
              <span className="tts-menu-wrap">
                <button className={ttsActive ? "speaking" : ""} onClick={() => setTtsMenuOpen((open) => !open)}>{ttsActive ? "朗读中" : "朗读"}</button>
                {ttsMenuOpen && <div className="tts-menu">{WEB && <button onClick={speakFromCurrentPosition}>从阅读位置朗读</button>}<button onClick={speakFromBookStart}>{WEB ? "从本章开头朗读" : "从头开始朗读"}</button><button onClick={speakFromSelection} disabled={WEB && !selectedText}>从选中部分开始朗读</button>{ttsActive && <><span className="menu-separator" /><button className="text-danger" onClick={stopTts}>结束朗读</button></>}</div>}
              </span>
              {!WEB && <><button className={ttsState === "paused" ? "speaking" : ""} disabled={!ttsActive} onClick={pauseTts}>{ttsState === "paused" ? "播放" : "暂停"}</button>
              <button onClick={() => jumpTtsSentence(-1)}>上一句</button>
              <button onClick={() => jumpTtsSentence(1)}>下一句</button>
              {ttsPointer && <button onClick={returnToTtsPosition}>回到朗读位置</button>}</>}
              <button onClick={() => setReaderSideCollapsed((value) => !value)}>{readerSideCollapsed ? "展开功能栏" : "收起功能栏"}</button>
            </div>
          </header>

          <div className={`work-grid ${sideTab === "dictionary" && dictionaryPanelTab === "web" ? "dictionary-web-layout" : ""}`}>
          <section className="reader-wrap">
            <div className="reader-tools">
              <input id="chapterSearch" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") jumpSearchMatch(event.shiftKey ? -1 : 1); }} placeholder="搜索当前章节" />
              {search.trim() && (
                <span className="search-controls">
                  <span className="search-count">{searchCount ? `${searchMatchIndex + 1}/${searchCount} 处匹配` : "无匹配"}</span>
                  <button disabled={!searchCount} onClick={() => jumpSearchMatch(-1)} title="上一处">↑</button>
                  <button disabled={!searchCount} onClick={() => jumpSearchMatch(1)} title="下一处">↓</button>
                </span>
              )}
              {loading && <span className="loading">{loading}</span>}
              {WEB && ttsActive && <div className="tts-player" role="region" aria-label="朗读控制">
                <div className="tts-caption"><strong>{ttsState === "loading" ? "正在准备朗读" : ttsState === "paused" ? "朗读已暂停" : "正在朗读"}</strong><small>{ttsPointer ? `${ttsQueueIndexRef.current + 1} / ${ttsQueueRef.current.length} 句 · ${chapters[ttsPointer.chapterIndex]?.title || ""}` : "加载正文"}</small><span title={ttsPointer?.text}>{ttsPointer?.text}</span></div>
                <div className="tts-player-controls">
                  <button aria-label="上一句" onClick={() => jumpTtsSentence(-1)} disabled={!ttsPointer || ttsQueueIndexRef.current === 0}>‹</button>
                  <button className="primary" onClick={pauseTts} disabled={!ttsPointer}>{ttsState === "paused" ? "继续" : "暂停"}</button>
                  <button aria-label="下一句" onClick={() => jumpTtsSentence(1)} disabled={!ttsPointer || ttsQueueIndexRef.current >= ttsQueueRef.current.length - 1}>›</button>
                  <button onClick={stopTts}>停止</button>
                  <button onClick={returnToTtsPosition} disabled={!ttsPointer}>回到朗读处</button>
                  <label className="tts-follow"><input type="checkbox" checked={settings.tts.autoScroll} onChange={event => saveSettings({ ...settings, tts: { ...settings.tts, autoScroll: event.target.checked } })} />跟随正文</label>
                  <label className="tts-rate">速度<select aria-label="朗读速度" value={settings.tts.rate} onChange={event => saveSettings({ ...settings, tts: { ...settings.tts, rate: Number(event.target.value) } })}>{Array.from(new Set([.75, .95, 1, 1.25, 1.5, settings.tts.rate])).sort((a, b) => a - b).map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
                </div>
              </div>}
            </div>
            <div
              ref={readerRef}
              className="reader-scroll"
              onScroll={onReaderScroll}
              onMouseUp={handleSelection}
              onClick={handleReaderClick}
              onDoubleClick={(event) => settings.dictionary.doubleClick && lookupWordAtPoint(event, false)}
              onMouseMove={(event) => {
                if (!settings.dictionary.hover) return;
                if (hoverLookupTimer.current) window.clearTimeout(hoverLookupTimer.current);
                const info = wordInfoAtPoint(event);
                const { word, context } = info;
                hoverLookupTimer.current = window.setTimeout(() => {
                  if (word && word !== dictionary?.term) {
                    setSelectedContext(context);
                    setSelectedRange(info.range);
                    setSelectedText(word);
                    moveDictionaryFloatNear(event.clientX, event.clientY);
                    lookup(word, true, true, info);
                  }
                }, 260);
              }}
            >
              {!activeBook && <Empty title="从书架开始阅读" text="导入后书籍会保存在书架里，重启应用也能继续阅读" />}
              {activeBook && (
                <ChapterRenderer
                  html={chapterHtml}
                  search={search}
                  activeSearchRange={activeSearchRange}
                  selectedText={selectedText}
                  selectedRange={selectedRange}
                  ttsRange={ttsPointer && ttsPointer.chapterIndex === chapterIndex ? { start: ttsPointer.startOffset, end: ttsPointer.endOffset } : null}
                  notes={notes.filter((note) => note.chapterId === currentChapter?.id)}
                  pages={chapterPages}
                  pageIndex={safePageIndex}
                  chapterTitle={currentChapter?.title || "未命名章节"}
                  hasNext={chapterIndex < chapters.length - 1}
                  onPreviousPage={previousReaderPage}
                  onNextPage={nextReaderPage}
                  onNextChapter={nextChapter}
                />
              )}
            </div>
            {selectedText && (
              <div className="selection-bar">
                <span>{selectedText.slice(0, 36)}</span>
                {WEB && settings.dictionary.enabled && <button onClick={() => lookup(selectedText, false, true, { context: selectedContext, range: selectedRange })}>查词</button>}
                {!WEB && selectionKind === "text" && <button onClick={translateSelection}>翻译</button>}
                {WEB && <button onClick={beginVocabFromSelection}>收藏生词</button>}
                <button onClick={() => speak(selectedText)}>朗读</button>
                <button onClick={() => navigator.clipboard.writeText(selectedText).then(() => pushNotice("已复制"))}>复制</button>
                <button className={selectedMark?.lineStyle === "solid" ? "active-tool" : ""} onClick={() => toggleSelectionMark("solid")}>直线</button>
                <button className={selectedMark?.lineStyle === "wavy" ? "active-tool" : ""} onClick={() => toggleSelectionMark("wavy")}>波浪</button>
                <div className="note-swatches">
                  {NOTE_COLORS.map((color) => <button key={color} className={`swatch ${activeMarkColor === color ? "active" : ""}`} style={{ background: color }} title={NOTE_COLOR_NAMES[color]} onClick={() => chooseMarkColor(color)} />)}
                </div>
                <button onClick={writeIdea}>写想法</button>
                {WEB && <button className="selection-close" title="取消选区" aria-label="取消选区" onClick={() => { window.getSelection()?.removeAllRanges(); setSelectedText(""); setSelectedContext(""); setSelectedRange(null); }}>×</button>}
              </div>
            )}
            {ideaTargetId && (
              <div className="idea-popover">
                <textarea ref={ideaDraftRef} value={ideaDraft} onChange={(event) => setIdeaDraft(event.target.value)} placeholder="写下这处划线的想法" />
                <div className="inline-row">
                  <button className="primary" onClick={saveIdea}>保存</button>
                  <button onClick={() => { setIdeaTargetId(""); setIdeaDraft(""); }}>取消</button>
                </div>
              </div>
            )}
          </section>

          <div className="side-edge-hotzone">
            <button
              className="side-edge-toggle"
              title={readerSideCollapsed ? "展开功能栏" : "收起功能栏"}
              onClick={() => setReaderSideCollapsed((value) => !value)}
              aria-label={readerSideCollapsed ? "展开功能栏" : "收起功能栏"}
            >
              {readerSideCollapsed ? "‹" : "›"}
            </button>
          </div>

          <aside className="side-panel">
            <nav className="tabs">
              {(["toc", "bookmarks", "dictionary", "ai", "vocab", "notes", "settings"] as SideTab[]).filter(tab => !WEB || (tab !== "ai" && (tab !== "dictionary" || settings.dictionary.enabled))).map((tab) => (
                <button key={tab} className={sideTab === tab ? "active" : ""} onClick={() => setSideTab(tab)}>{tabLabel(tab)}</button>
              ))}
            </nav>
            {sideTab === "toc" && (
              <Panel title="目录">
                {renderTocItems(displayTocItems, chapters, chapterIndex, expandedTocIds, toggleTocItem, goToTocItem)}
              </Panel>
            )}
            {sideTab === "bookmarks" && (
              <Panel title="书签">
                {bookmarks.length === 0 && <Empty text="暂无书签" />}
                {bookmarks.map((bookmark) => (
                  <div className="list-card" key={bookmark.id}>
                    <button onClick={() => jumpToBookmark(bookmark)}>{bookmark.title}<small>{bookmark.excerpt}</small></button>
                    <button onClick={() => deleteBookmark(bookmark.id)}>删除</button>
                  </div>
                ))}
              </Panel>
            )}
            {sideTab === "dictionary" && (
              <Panel
                title="查词"
                titleExtra={
                  <div className="dictionary-title-extra">
                    {dictionary && <span className="dictionary-source-badge">{dictionarySourceNote(dictionary.source)}</span>}
                    {dictionaryEnhancing && <span className="dictionary-enhance-badge">增强中...</span>}
                    <span className="dict-history-tools">
                      <button disabled={!dictionaryHistory.length || dictionaryHistoryIndex >= dictionaryHistory.length - 1} onClick={() => jumpDictionaryHistory(1)} title="上一个查询"><span>‹</span></button>
                      <button disabled={!dictionaryHistory.length || dictionaryHistoryIndex <= 0} onClick={() => jumpDictionaryHistory(-1)} title="下一个查询"><span>›</span></button>
                    </span>
                  </div>
                }
                className="dictionary-panel"
              >
                <div className="dictionary-search-row">
                  <input value={selectedText} onChange={(event) => { setSelectedText(event.target.value); setSelectedRange(null); setSelectedContext(""); }} onKeyDown={(event) => { if (event.key === "Enter") lookup(selectedText); }} placeholder="输入单词或短语" />
                  <button className="primary" onClick={() => lookup(selectedText)}>查询</button>
                </div>
                <div className="dictionary-subtabs">
                  <button className={dictionaryPanelTab === "definition" ? "active" : ""} onClick={() => setDictionaryPanelTab("definition")}>释义</button>
                  <button className={dictionaryPanelTab === "web" ? "active" : ""} onClick={showDictionaryWeb} disabled={!dictionary && !dictionaryWebUrl}>{WEB ? "打开必应词典" : "网页"}</button>
                </div>
                {dictionaryPanelTab === "definition" && (
                  <>
                    {translation && <div className="translation-card"><strong>句子翻译</strong><p>{translation}</p></div>}
                    {!dictionary && <Empty text="选中文本、单击或双击单词即可查词" />}
                    {dictionary && <DictionaryView result={dictionary} saved={dictionarySaved} definitionOrder={settings.dictionary.definitionOrder} onSave={saveVocabItem} onSpeak={speakDictionaryPronunciation} onOpenOfficial={openDictionaryWeb} />}
                  </>
                )}
                {dictionaryPanelTab === "web" && (
                  <DictionaryWebPanel
                    url={dictionaryWebUrl}
                    loading={dictionaryWebState.loading}
                    canGoBack={dictionaryWebState.canGoBack}
                    canGoForward={dictionaryWebState.canGoForward}
                    frameRef={dictionaryWebFrameRef}
                    onBack={() => controlDictionaryWeb("back")}
                    onForward={() => controlDictionaryWeb("forward")}
                    onReload={() => controlDictionaryWeb("reload")}
                    onOpenExternal={() => dictionaryWebUrl && window.readerAPI.dictionary.openOfficial(dictionaryWebUrl)}
                  />
                )}
              </Panel>
            )}
            {sideTab === "vocab" && (
              <Panel title="生词本" titleExtra={<button onClick={() => requestExport({ kind: "vocab", items: filteredVocab, name: learningExportName(["生词", notebooks.find((item) => item.id === activeNotebook)?.name || "生词本", "全部书籍", "全部章节"]) })}>导出</button>} panelRef={vocabPanelRef} onScroll={() => {
                if (vocabPanelRef.current) vocabScrollTop.current = vocabPanelRef.current.scrollTop;
              }}>
                <div className="notebook-strip">
                  {notebooks.map((notebook) => (
                    renamingNotebookId === notebook.id ? (
                      <input
                        key={notebook.id}
                        className="notebook-name-input"
                        value={notebookDraftName}
                        autoFocus
                        onChange={(event) => setNotebookDraftName(event.target.value)}
                        onBlur={() => commitNotebookRename(notebook.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitNotebookRename(notebook.id);
                          if (event.key === "Escape") setRenamingNotebookId("");
                        }}
                      />
                    ) : (
                      <button
                        key={notebook.id}
                        className={`notebook-pill ${activeNotebook === notebook.id ? "active" : ""}`}
                        onContextMenu={(event) => {
                          event.preventDefault();

                          keepContextOpen();
                          setNotebookMenu({ notebookId: notebook.id, x: event.clientX, y: event.clientY });
                        }}
                        onClick={() => {
                          if (activeNotebook === notebook.id) {
                            setRenamingNotebookId(notebook.id);
                            setNotebookDraftName(notebook.name);
                          } else {
                            setActiveNotebook(notebook.id);
                          }
                        }}
                        onDoubleClick={() => {
                          setActiveNotebook(notebook.id);
                          setRenamingNotebookId(notebook.id);
                          setNotebookDraftName(notebook.name);
                        }}
                        title="双击重命名"
                      >
                        {notebook.name}
                      </button>
                    )
                  ))}
                  <button className="notebook-add" onClick={createNotebookLikeDesktop}>新建</button>
                </div>
                <label className="notebook-default-control">本书收藏目标
                  <select value={settings.vocabulary.bookDefaults[activeBook?.id || ""] || ""} onChange={(event) => setBookNotebookDefault(event.target.value)}>
                    <option value="">每次收藏时选择</option>
                    {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}
                  </select>
                </label>
                {filteredVocab.length === 0 && <Empty text="这个生词本还是空的" />}
                {filteredVocab.map((item) => (
                  <div className="list-card vocab-card" key={item.id}>
                    <button className="vocab-open" onClick={() => openVocabInDictionary(item)}>
                      <strong>{item.word}</strong>
                      <small>{sourceLabel(item)}</small>
                      <small className="vocab-definition-text">{formatVocabDefinitionText(item.chineseDef || item.englishDef || "点击查看详细释义", Boolean(item.chineseDef))}</small>
                      {item.sourceSentence && <blockquote>{item.sourceSentence}</blockquote>}
                    </button>
                    <button onClick={() => deleteVocab(item.id)}>删除</button>
                  </div>
                ))}
              </Panel>
            )}
            {sideTab === "notes" && (
              <Panel title="笔记本" titleExtra={<button onClick={exportReaderNotes}>导出</button>}>
                {!activeBook && <Empty text="打开一本书后，这里会显示这本书的划线和笔记" />}
                {activeBook && (
                  <>
                    <div className="inline-row">
                      <select className="chapter-filter" value={noteChapterFilter} onChange={(event) => setNoteChapterFilter(event.target.value)}>
                        <option value="all">全部章节</option>
                        {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title || `Chapter ${chapter.orderIndex + 1}`}</option>)}
                      </select>
                      <select value={noteStyleFilter} onChange={(event) => setNoteStyleFilter(event.target.value as typeof noteStyleFilter)}>
                        <option value="all">全部线型</option>
                        <option value="solid">直线</option>
                        <option value="wavy">波浪线</option>
                      </select>
                      <select value={noteColorFilter} onChange={(event) => setNoteColorFilter(event.target.value)}>
                        <option value="all">全部颜色</option>
                        {NOTE_COLORS.map((color) => <option key={color} value={color}>{NOTE_COLOR_NAMES[color]}</option>)}
                      </select>
                      <label className="compact-check"><input type="checkbox" checked={noteIdeaOnly} onChange={(event) => setNoteIdeaOnly(event.target.checked)} /> 仅有想法的笔记</label>
                    </div>
                    {filteredNotes.length === 0 && <Empty text="这本书还没有笔记；选中文本后可以划线或记录想法" />}
                    {filteredNotes.map((note) => (
                      <div className="list-card note-card" key={note.id}>
                        <div className="note-card-body">
                          <small>{note.chapterTitle}</small>
                          <NoteLineSample note={note} />
                          <NoteTextPreview text={note.selectedText} className="side-note-text" onMore={() => setViewingNote(note)} />
                          {note.noteText && <p>{note.noteText}</p>}
                        </div>
                        <button className="card-icon locate-icon" title="定位到原文" onClick={() => locateNoteFromLibrary(note)}>⌕</button>
                        <button className="card-icon edit-icon" title="编辑" onClick={() => beginEditNote(note)}>✎</button>
                        <button className="card-icon delete-icon" title="删除" onClick={() => deleteNote(note.id)}><span className="trash-icon" /></button>
                      </div>
                    ))}
                  </>
                )}
              </Panel>
            )}
            {sideTab === "ai" && (
              <Panel
                title="AI 助手"
                titleExtra={<span className="ai-title-actions">{settings.ai.enabled && currentChapter && <span className="ai-context-note">当前章节对话：{currentChapter.title || "未命名章节"}</span>}<button onClick={() => setAiLog([])}>新对话</button></span>}
                className="ai-panel"
              >
                {!settings.ai.enabled && <Empty text="AI 未启用；请在设置中填写并保存 API Key" />}
                <div className="chat-log" ref={aiChatLogRef}>{aiLog.map((item, index) => <div className={`chat ${item.role}`} key={index} onContextMenu={(event) => {
                  if (item.role !== "user") return;
                  event.preventDefault();
                  keepContextOpen();
                  setAiDeleteMenu({ index, x: event.clientX, y: event.clientY });
                }}>{formatAiMessage(item.text)}</div>)}</div>
                <div className="ai-compose">
                  <textarea value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder="针对当前章节、选中文本或英语学习提问" />
                  <div className="ai-submit-column">
                    <AiContextPicker value={aiContextMode} open={aiContextMenuOpen} onToggle={() => setAiContextMenuOpen((open) => !open)} onChange={(value) => { setAiContextMode(value); setAiContextMenuOpen(false); }} />
                    <button className="primary send-button" disabled={!settings.ai.enabled} onClick={askAi}>发送</button>
                  </div>
                </div>
              </Panel>
            )}
            {sideTab === "settings" && (
              <SettingsPanel settings={settings} saveSettings={saveSettings} saveSecret={saveSecret} chooseBackground={chooseBackground} editCurrentBackground={editCurrentBackground} onImportBackup={importBackup} onShowInfo={setInfoModal} />
            )}
          </aside>
        </div>
        </main>
      )}

      {dictionaryFloatOpen && (dictionary || translation) && (
        <div className={`dictionary-float ${dictionaryDragging ? "dragging" : ""}`} style={floatStyle(dictionaryFloatPoint)}>
          <div
            className="float-titlebar"
            onMouseDown={(event) => {
              const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
              dictionaryDragRef.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
              setDictionaryDragging(true);
            }}
          >
            <strong>{dictionary ? "查词" : "翻译"}{dictionary ? <span className="dictionary-source-badge float-source-badge">{dictionarySourceNote(dictionary.source)}</span> : null}{dictionaryEnhancing && <span className="dictionary-enhance-badge float-enhance-badge">增强中...</span>}</strong>
            <button className="float-close" onMouseDown={(event) => event.stopPropagation()} onClick={clearReaderSelection}>×</button>
          </div>
          <div className="float-body">
            {translation && <div className="translation-card"><strong>句子翻译</strong><p>{translation}</p></div>}
            {dictionary && <DictionaryView result={dictionary} saved={dictionarySaved} definitionOrder={settings.dictionary.definitionOrder} onSave={saveVocabItem} onSpeak={speakDictionaryPronunciation} onOpenOfficial={openDictionaryWeb} />}
          </div>
        </div>
      )}
      {librarySettingsOpen && (
        <div className="modal-backdrop" onClick={() => setLibrarySettingsOpen(false)}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-titlebar">
              <strong>设置</strong>
              <button className="float-close" onClick={() => setLibrarySettingsOpen(false)}>×</button>
            </div>
            <div className="settings-layout">
              <nav className="settings-categories">
                {SETTING_CATEGORIES.filter(item => !WEB || item.id !== "ai").map((item) => <button key={item.id} className={settingCategory === item.id ? "active" : ""} onClick={() => setSettingCategory(item.id)}>{item.label}</button>)}
              </nav>
              <SettingsPanel settings={settings} saveSettings={saveSettings} saveSecret={saveSecret} category={settingCategory} chooseBackground={chooseBackground} editCurrentBackground={editCurrentBackground} onResetSettings={resetSettings} onShowInfo={setInfoModal} />
            </div>
          </div>
        </div>
      )}
      {infoModal && <InfoModalView type={infoModal} onClose={() => setInfoModal(null)} />}
      {editingNote && (
        <div className="modal-backdrop">
          <div className="idea-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-titlebar">
              <strong>编辑想法</strong>
              <button className="float-close" onClick={() => setEditingNote(null)}>×</button>
            </div>
            <blockquote>{editingNote.selectedText}</blockquote>
            <textarea ref={editingIdeaRef} value={editingIdea} onChange={(event) => setEditingIdea(event.target.value)} />
            <div className="modal-actions">
              <button className="primary" onClick={confirmEditNote}>确认</button>
              <button onClick={() => setEditingNote(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {viewingNote && (
        <div className="modal-backdrop">
          <div className="idea-editor-modal long-note-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-titlebar">
              <strong>划线全文</strong>
              <button className="float-close" onClick={() => setViewingNote(null)}>×</button>
            </div>
            <blockquote>{viewingNote.selectedText}</blockquote>
            {viewingNote.noteText ? <p className="long-note-idea">{viewingNote.noteText}</p> : <p className="muted-note long-note-idea">暂无想法</p>}
            <div className="modal-actions">
              <button className="primary" onClick={() => { beginEditNote(viewingNote); setViewingNote(null); }}>编辑想法</button>
              <button onClick={() => setViewingNote(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {exportRequest && (
        <div className="modal-backdrop">
          <div className="idea-editor-modal learning-export-modal" role="dialog" aria-modal="true" aria-label="导出样式">
            <div className="modal-titlebar"><strong>导出{exportRequest.kind === "vocab" ? "生词" : "笔记"} · {exportRequest.items.length} 条</strong><button className="float-close" disabled={exportBusy} onClick={() => setExportRequest(null)}>×</button></div>
            <div className="export-style-options">
              {EXPORT_STYLES.filter((style) => exportRequest.kind === "vocab" || style.value !== "words").map((style) => (
                <label key={style.value} className={exportFormat === style.value ? "export-style selected" : "export-style"}>
                  <input type="radio" name="exportStyle" checked={exportFormat === style.value} disabled={exportBusy} onChange={() => setExportFormat(style.value)} />
                  <span><strong>{style.label}</strong><small>{style.description}</small></span>
                </label>
              ))}
            </div>
            <p className="export-filename">文件名：{exportRequest.name}_{EXPORT_STYLES.find((style) => style.value === exportFormat)?.label.split(" · ")[0]}.{exportExtension(exportFormat)}</p>
            <div className="modal-actions"><button disabled={exportBusy} className="primary" onClick={confirmLearningExport}>{exportBusy ? "正在导出…" : WEB ? "下载文件" : "选择保存位置"}</button><button disabled={exportBusy} onClick={() => setExportRequest(null)}>取消</button></div>
          </div>
        </div>
      )}
      {pendingVocab && (
        <div className="modal-backdrop">
          <div className="idea-editor-modal notebook-picker-modal" role="dialog" aria-modal="true" aria-label="选择生词本">
            <div className="modal-titlebar"><strong>收藏 {pendingVocab.word}</strong><button className="float-close" disabled={vocabSaveBusy} onClick={() => setPendingVocab(null)}>×</button></div>
            <label>加入生词本<select value={saveNotebookId} disabled={vocabSaveBusy} onChange={(event) => setSaveNotebookId(event.target.value)}>
              {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}
              <option value="">新建生词本</option>
            </select></label>
            {!saveNotebookId && <input autoFocus placeholder="生词本名称" maxLength={80} disabled={vocabSaveBusy} value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} />}
            {pendingVocab.sourceSentence && <blockquote>{pendingVocab.sourceSentence}</blockquote>}
            {activeBook && <label className="compact-check"><input type="checkbox" checked={rememberBookNotebook} disabled={vocabSaveBusy} onChange={(event) => setRememberBookNotebook(event.target.checked)} /> 设为《{activeBook.title}》的默认生词本</label>}
            <small>下次会优先选中上次使用的生词本，可在阅读侧栏更改本书收藏目标</small>
            <div className="modal-actions"><button className="primary" disabled={vocabSaveBusy || (!saveNotebookId && !newNotebookName.trim())} onClick={() => addVocabToNotebook(pendingVocab, saveNotebookId, rememberBookNotebook)}>{vocabSaveBusy ? "正在收藏…" : "收藏"}</button><button disabled={vocabSaveBusy} onClick={() => setPendingVocab(null)}>取消</button></div>
          </div>
        </div>
      )}
      {confirmDialog && <ConfirmModal dialog={confirmDialog} />}
      {promptDialog && <PromptModal dialog={promptDialog} setDialog={setPromptDialog} />}
      {backgroundEditor && (
        <div className="modal-backdrop" onClick={() => setBackgroundEditor(null)}>
          <div className="background-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-titlebar">
              <strong>{backgroundEditor.target === "app" ? "调整主界面背景" : "调整书籍背景"}</strong>
              <button className="float-close" onClick={() => setBackgroundEditor(null)}>×</button>
            </div>
            <div
              className="background-preview"
              style={{
                aspectRatio: `${appShellSize.width} / ${appShellSize.height}`
              }}
            >
              <span
                className="background-preview-image"
                style={{
                  backgroundImage: `url("${toFileUrl(backgroundEditor.path)}")`,
                  backgroundPosition: `${backgroundEditor.x}% ${backgroundEditor.y}%`,
                  backgroundSize: `${backgroundEditor.scale}% auto`,
                  opacity: backgroundEditor.opacity / 100
                }}
              />
              <div className={`background-preview-layout ${backgroundEditor.target === "reader" ? "preview-reader" : "preview-library"}`}>
                {backgroundEditor.target === "reader" ? (
                  <>
                    <span className="preview-topbar" />
                    <span className="preview-reader-page" />
                    <span className="preview-side-panel" />
                  </>
                ) : (
                  <>
                    <span className="preview-library-sidebar" />
                    <span className="preview-library-main" />
                  </>
                )}
              </div>
            </div>
            <div className="background-editor-controls">
              <label>水平位置 {backgroundEditor.x}%<input type="range" min="0" max="100" value={backgroundEditor.x} onChange={(event) => setBackgroundEditor({ ...backgroundEditor, x: Number(event.target.value) })} /></label>
              <label>垂直位置 {backgroundEditor.y}%<input type="range" min="0" max="100" value={backgroundEditor.y} onChange={(event) => setBackgroundEditor({ ...backgroundEditor, y: Number(event.target.value) })} /></label>
              <label>缩放 {backgroundEditor.scale}%<input type="range" min="80" max="180" value={backgroundEditor.scale} onChange={(event) => setBackgroundEditor({ ...backgroundEditor, scale: Number(event.target.value) })} /></label>
              <label>背景强度 {backgroundEditor.opacity}%<input type="range" min="0" max="100" value={backgroundEditor.opacity} onChange={(event) => setBackgroundEditor({ ...backgroundEditor, opacity: Number(event.target.value) })} /></label>
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={applyBackgroundEditor}>确认</button>
              <button onClick={() => setBackgroundEditor(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {bookMenu && (
        <div className="context-menu book-context" style={{ left: bookMenu.x, top: bookMenu.y }} onMouseEnter={keepContextOpen} onMouseLeave={scheduleContextClose} onClick={(event) => event.stopPropagation()}>
          <button onMouseEnter={() => { setShelfPickerBookId(""); setExportMenuBookId(""); }} onClick={() => { toggleBookFavorite(bookMenu.bookId); setBookMenu(null); }}>{settings.library.favoriteBookIds.includes(bookMenu.bookId) ? "取消收藏" : "加入收藏"}</button>
          <button onMouseEnter={() => { setShelfPickerBookId(bookMenu.bookId); setExportMenuBookId(""); }}>加入书架 ›</button>
          <button onMouseEnter={() => { setShelfPickerBookId(""); setExportMenuBookId(""); }} onClick={() => { toggleBookPinned(bookMenu.bookId); setBookMenu(null); }}>{settings.library.pinnedBookIds.includes(bookMenu.bookId) ? "取消顶置" : "顶置"}</button>
          <button className="text-danger" onMouseEnter={() => { setShelfPickerBookId(""); setExportMenuBookId(""); }} onClick={() => { const id = bookMenu.bookId; setBookMenu(null); deleteBook(id); }}>删除</button>
          <button onMouseEnter={() => { setShelfPickerBookId(""); setExportMenuBookId(""); }} onClick={() => { const id = bookMenu.bookId; setBookMenu(null); renameBook(id); }}>重命名</button>
          <button onMouseEnter={() => { setExportMenuBookId(bookMenu.bookId); setShelfPickerBookId(""); }}>导出 ›</button>
          {shelfPickerBookId === bookMenu.bookId && (
            <div className="context-submenu shelf-submenu" onMouseEnter={() => setShelfPickerBookId(bookMenu.bookId)} onMouseLeave={() => setShelfPickerBookId("")}>
              {libraryShelves.map((shelf) => {
                const active = (settings.library.bookShelfMap[bookMenu.bookId] || []).includes(shelf.id);
                return <button key={shelf.id} onClick={() => toggleBookShelf(bookMenu.bookId, shelf.id)}>{active ? "✓ " : ""}{shelf.name}</button>;
              })}
              {libraryShelves.length === 0 && <span className="submenu-empty">还没有书架</span>}
              <button onClick={() => { createShelfForBook(bookMenu.bookId); setBookMenu(null); }}>新建书架...</button>
            </div>
          )}
          {exportMenuBookId === bookMenu.bookId && (
            <div className="context-submenu" onMouseEnter={() => setExportMenuBookId(bookMenu.bookId)} onMouseLeave={() => setExportMenuBookId("")}>
              <button onClick={() => exportBook(bookMenu.bookId, "cover")}>导出封面</button>
              <button onClick={() => exportBook(bookMenu.bookId, "ideas")}>导出想法</button>
              <button onClick={() => exportBook(bookMenu.bookId, "highlights")}>导出划线</button>
            </div>
          )}
        </div>
      )}
      {shelfMenu && (
        <div className="context-menu shelf-context" style={{ left: shelfMenu.x, top: shelfMenu.y }} onMouseEnter={keepContextOpen} onMouseLeave={scheduleContextClose} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => beginRenameShelf(shelfMenu.shelfId)}>重命名</button>
          <button onClick={() => moveShelfToFront(shelfMenu.shelfId)}>放在前面</button>
          <button className="text-danger" onClick={() => deleteShelf(shelfMenu.shelfId)}>删除书架</button>
        </div>
      )}
      {notebookMenu && <button className="context-delete text-danger" style={{ left: notebookMenu.x, top: notebookMenu.y }} onMouseEnter={keepContextOpen} onMouseLeave={scheduleContextClose} onClick={(event) => { event.stopPropagation(); const id = notebookMenu.notebookId; setNotebookMenu(null); deleteNotebook(id); }}>删除</button>}
      {aiDeleteMenu && <button className="context-delete text-danger" style={{ left: aiDeleteMenu.x, top: aiDeleteMenu.y }} onMouseEnter={keepContextOpen} onMouseLeave={scheduleContextClose} onClick={(event) => { event.stopPropagation(); deleteAiPair(aiDeleteMenu.index); }}>删除这轮对话</button>}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function ChapterRenderer({
  html,
  search,
  activeSearchRange,
  selectedText,
  selectedRange,
  ttsRange,
  notes,
  pages,
  pageIndex,
  chapterTitle,
  hasNext,
  onPreviousPage,
  onNextPage,
  onNextChapter
}: {
  html: string;
  search: string;
  activeSearchRange: { start: number; end: number } | null;
  selectedText: string;
  selectedRange: { start: number; end: number } | null;
  ttsRange: { start: number; end: number } | null;
  notes: ReaderNote[];
  pages: ChapterPage[];
  pageIndex: number;
  chapterTitle: string;
  hasNext: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onNextChapter: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [noteLines, setNoteLines] = useState<Array<{ key: string; path: string; color: string }>>([]);
  const decoratedHtml = useMemo(() => WEB_HIGHLIGHTS ? html : applyReaderDecorations(html, search, activeSearchRange, WEB ? "" : selectedText, WEB ? null : selectedRange, notes, ttsRange), [html, search, activeSearchRange, selectedText, selectedRange, notes, ttsRange]);
  const annotatedHtml = useMemo(() => annotateReaderText(decoratedHtml), [decoratedHtml]);
  const blocks = useMemo(() => splitHtmlBlocks(annotatedHtml).flatMap(splitOversizedAnnotatedBlock), [annotatedHtml]);
  const page = pages[pageIndex] || pages[0] || { startBlock: 0, endBlock: blocks.length || 1, startOffset: 0, endOffset: 0, textLength: 0 };
  const shownBlocks = blocks.slice(page.startBlock, page.endBlock);
  const isLastPage = pageIndex >= pages.length - 1;
  useLayoutEffect(() => {
    if (!WEB_HIGHLIGHTS || !contentRef.current) return;
    const root = contentRef.current;
    const registry = (CSS as any).highlights;
    const names: string[] = [];
    const styles: string[] = [];
    function highlight(name: string, offsets: Array<{ start: number; end: number }>, style: string) {
      const ranges = offsets.flatMap(offset => {
        const start = textTargetForPlainOffset(root, offset.start), end = textTargetForPlainOffset(root, offset.end);
        if (!start || !end) return [];
        try { const range = document.createRange(); range.setStart(start.startContainer, start.startOffset); range.setEnd(end.startContainer, end.startOffset); return [range]; } catch { return []; }
      });
      const paint = new (window as any).Highlight(...ranges);
      paint.priority = name === "eread-speech" ? 30 : name === "eread-locate" ? 20 : name.includes("search") ? 15 : 1;
      names.push(name); registry.set(name, paint); styles.push(`::highlight(${name}) { ${style} }`);
    }
    const groups = new Map<string, { color: string; style: string; offsets: Array<{ start: number; end: number }> }>();
    for (const note of notes) {
      const offset = note.startOffset !== undefined && note.endOffset !== undefined ? { start: note.startOffset, end: note.endOffset } : findTextRangeInHtml(html, note.selectedText);
      if (!offset) continue;
      const color = /^#[0-9a-f]{6}$/i.test(note.color) ? note.color : "#f2c94c";
      const key = `${color}-${note.lineStyle}`;
      if (!groups.has(key)) groups.set(key, { color, style: note.lineStyle === "wavy" ? "wavy" : "solid", offsets: [] });
      groups.get(key)!.offsets.push(offset);
    }
    let index = 0;
    for (const group of groups.values()) highlight(`eread-note-${index++}`, group.offsets, "background-color:transparent;color:var(--text);text-decoration:none;");
    if (ttsRange) highlight("eread-speech", [ttsRange], "background-color:var(--speech-mark);color:var(--text);text-decoration:none;");
    if (search.trim()) {
      const text = htmlVisibleTextWithMap(html); const query = search.trim().toLowerCase(); const offsets: Array<{ start: number; end: number }> = [];
      let cursor = 0;
      while ((cursor = text.value.toLowerCase().indexOf(query, cursor)) >= 0) { offsets.push({ start: text.map[cursor], end: text.map[cursor + query.length] ?? text.map[text.map.length - 1] + 1 }); cursor += query.length; }
      highlight("eread-search", offsets, "background-color:var(--search-mark);color:var(--text);");
    }
    if (activeSearchRange) highlight("eread-search-active", [activeSearchRange], "background-color:var(--search-active-mark);color:var(--text);");
    if (selectedRange && window.getSelection()?.isCollapsed) highlight("eread-locate", [selectedRange], "background-color:var(--locate-mark);color:var(--text);");
    const sheet = document.createElement("style"); sheet.textContent = styles.join("\n"); document.head.append(sheet);
    return () => { names.forEach(name => registry.delete(name)); sheet.remove(); };
  }, [html, notes, search, activeSearchRange, ttsRange, selectedRange, pageIndex]);
  useLayoutEffect(() => {
    if (!WEB_HIGHLIGHTS || !contentRef.current) return;
    const root = contentRef.current;
    let frame = 0, disposed = false;
    const draw = () => {
      if (disposed) return;
      const origin = root.getBoundingClientRect();
      const lines: Array<{ key: string; path: string; color: string }> = [];
      for (const note of notes) {
        const offset = note.startOffset !== undefined && note.endOffset !== undefined ? { start: note.startOffset, end: note.endOffset } : findTextRangeInHtml(html, note.selectedText);
        if (!offset) continue;
        const from = textTargetForPlainOffset(root, offset.start), to = textTargetForPlainOffset(root, offset.end);
        if (!from || !to) continue;
        const range = document.createRange(); range.setStart(from.startContainer, from.startOffset); range.setEnd(to.startContainer, to.startOffset);
        const rects: Array<{ left: number; right: number; bottom: number }> = [];
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width < .5 || rect.height < 1) continue;
          const previous = rects.find(r => Math.abs(r.bottom - rect.bottom) < 1.5 && rect.left <= r.right + 2 && rect.right >= r.left - 2);
          if (previous) { previous.left = Math.min(previous.left, rect.left); previous.right = Math.max(previous.right, rect.right); }
          else rects.push({ left: rect.left, right: rect.right, bottom: rect.bottom });
        }
        rects.forEach((rect, index) => {
          const x = rect.left - origin.left, end = rect.right - origin.left, y = rect.bottom - origin.top + 3;
          let path = `M ${x} ${y}`;
          if (note.lineStyle === "wavy") {
            for (let at = x; at < end; at += 24) {
              const middle = Math.min(at + 12, end), last = Math.min(at + 24, end);
              path += ` Q ${at + (middle - at) / 2} ${y - 2.6} ${middle} ${y}`;
              if (last > middle) path += ` Q ${middle + (last - middle) / 2} ${y + 2.6} ${last} ${y}`;
            }
          } else path += ` L ${end} ${y}`;
          lines.push({ key: `${note.id}-${index}`, path, color: /^#[0-9a-f]{6}$/i.test(note.color) ? note.color : NOTE_COLORS[0] });
        });
      }
      setNoteLines(lines);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    draw();
    const resize = new ResizeObserver(schedule); resize.observe(root);
    const mutation = new MutationObserver(schedule); mutation.observe(root, { subtree: true, childList: true, characterData: true });
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); };
  }, [html, notes, pageIndex]);
  return (
    <article className="reader-content">
      <div className="reader-prose">
      <div className="reader-text" ref={contentRef}>
        {shownBlocks.map((block, index) => (
          <React.Fragment key={`${page.startBlock + index}-${block.slice(0, 16)}`}>
            <div data-reader-block="1" data-reader-paragraph={page.startBlock + index} dangerouslySetInnerHTML={{ __html: block }} />
          </React.Fragment>
        ))}
      </div>
      {WEB_HIGHLIGHTS && <svg className="reader-note-lines" aria-hidden="true" focusable="false">{noteLines.map(line => <path key={line.key} d={line.path} stroke={line.color} />)}</svg>}
      </div>
      <div className="page-nav">
        <button onClick={onPreviousPage}>上一页</button>
        <span>{chapterTitle} · 第 {pageIndex + 1} / {Math.max(1, pages.length)} 页</span>
        {isLastPage
          ? <button onClick={onNextChapter} disabled={!hasNext}>{hasNext ? "下一章" : "已到末章"}</button>
          : <button className="primary" onClick={onNextPage}>下一页</button>}
      </div>
    </article>
  );
}

function splitHtmlBlocks(html: string): string[] {
  return collectHtmlBlocks(html).flatMap((block) => unwrapReaderContainerBlock(block));
}

function collectHtmlBlocks(html: string): string[] {
  const blockPattern = /<(p|div|section|article|h[1-6]|blockquote|ul|ol|pre|table|figure)\b[\s\S]*?<\/\1>/gi;
  const blocks: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  const pushLooseText = (fragment: string) => {
    if (!fragment || (!plainTextFromHtml(fragment).trim() && !/<(?:img|svg|canvas|video|audio)\b/i.test(fragment))) return;
    blocks.push(`<p class="reader-loose-block">${fragment}</p>`);
  };
  while ((match = blockPattern.exec(html))) {
    pushLooseText(html.slice(cursor, match.index));
    blocks.push(match[0]);
    cursor = match.index + match[0].length;
  }
  pushLooseText(html.slice(cursor));
  return blocks.length ? blocks : [html];
}

function unwrapReaderContainerBlock(block: string, depth = 0): string[] {
  if (depth > 8 || isForcedPageBlock(block) || !/^<(?:div|section|article)\b/i.test(block)) return [block];
  const inner = innerHtmlOfOuterBlock(block);
  if (!inner || !/<(?:p|div|section|article|h[1-6]|blockquote|ul|ol|pre|table|figure)\b/i.test(inner)) return [block];
  const children = collectHtmlBlocks(inner).flatMap((child) => unwrapReaderContainerBlock(child, depth + 1));
  return children.length ? children : [block];
}

function innerHtmlOfOuterBlock(block: string): string {
  const openEnd = block.indexOf(">");
  const closeStart = block.lastIndexOf("</");
  if (openEnd < 0 || closeStart <= openEnd) return "";
  return block.slice(openEnd + 1, closeStart);
}

function buildChapterPages(html: string): ChapterPage[] {
  if (!html.trim()) return [{ startBlock: 0, endBlock: 1, startOffset: 0, endOffset: 0, textLength: 0 }];
  const blocks = splitHtmlBlocks(annotateReaderText(html)).flatMap(splitOversizedAnnotatedBlock);
  const infos = blocks.map((block, index) => ({ index, ...readerBlockInfo(block) }));
  const pages: ChapterPage[] = [];
  let startBlock = 0;
  let textLength = 0;
  let startOffset = infos[0]?.startOffset ?? 0;
  let endOffset = infos[0]?.endOffset ?? 0;
  for (const info of infos) {
    if (isForcedPageBlock(blocks[info.index])) {
      if (info.index > startBlock) pages.push({ startBlock, endBlock: info.index, startOffset, endOffset, textLength });
      pages.push({ startBlock: info.index, endBlock: info.index + 1, startOffset: info.startOffset, endOffset: info.endOffset, textLength: info.textLength });
      startBlock = info.index + 1;
      textLength = 0;
      startOffset = infos[startBlock]?.startOffset ?? info.endOffset;
      endOffset = startOffset;
      continue;
    }
    const nextLength = textLength + info.textLength;
    const canBreak = info.index > startBlock && textLength >= PAGE_TEXT_MIN && nextLength > PAGE_TEXT_TARGET;
    if (canBreak) {
      pages.push({ startBlock, endBlock: info.index, startOffset, endOffset, textLength });
      startBlock = info.index;
      textLength = 0;
      startOffset = info.startOffset;
    }
    textLength += info.textLength;
    endOffset = Math.max(endOffset, info.endOffset);
  }
  if (startBlock < blocks.length) pages.push({ startBlock, endBlock: blocks.length, startOffset, endOffset, textLength });
  return pages.length ? pages : [{ startBlock: 0, endBlock: blocks.length || 1, startOffset: 0, endOffset: 0, textLength: 0 }];
}

function isForcedPageBlock(block: string | undefined): boolean {
  return Boolean(block && /\bdata-reader-forced-page=["']1["']|\bclass=["'][^"']*\breader-forced-page\b/i.test(block));
}

function splitOversizedAnnotatedBlock(block: string): string[] {
  const text = normalizeReaderTextWhitespace(plainTextFromHtml(block));
  if (text.length <= PAGE_HARD_BLOCK_TARGET) return [block];
  return splitPlainBlock(text, firstReaderTextStart(block));
}

function firstReaderTextStart(block: string): number {
  const starts = Array.from(block.matchAll(/data-reader-text="1"\s+data-start="(\d+)"/g))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return starts.length ? Math.min(...starts) : 0;
}

function splitPlainBlock(text: string, baseOffset: number): string[] {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const remaining = text.length - cursor;
    if (remaining <= PAGE_HARD_BLOCK_TARGET * 1.18) {
      chunks.push(readerSplitBlock(text.slice(cursor), baseOffset + cursor));
      break;
    }
    const target = cursor + PAGE_HARD_BLOCK_TARGET;
    const windowText = text.slice(Math.max(cursor + Math.floor(PAGE_HARD_BLOCK_TARGET * 0.72), cursor), Math.min(text.length, target + 900));
    const natural = windowText.search(/[.!?。！？]\s+|[\r\n]+/);
    const cut = natural >= 0
      ? Math.max(cursor + 1, Math.max(cursor + Math.floor(PAGE_HARD_BLOCK_TARGET * 0.72), cursor) + natural + 1)
      : target;
    chunks.push(readerSplitBlock(text.slice(cursor, cut), baseOffset + cursor));
    cursor = cut;
  }
  return chunks.filter((item) => plainTextFromHtml(item).trim());
}

function readerSplitBlock(text: string, start: number): string {
  return `<p class="reader-split-block"><span data-reader-text="1" data-start="${start}">${escapeHtml(normalizeReaderTextWhitespace(text))}</span></p>`;
}

function normalizeReaderTextWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function readerBlockInfo(block: string): { startOffset: number; endOffset: number; textLength: number } {
  const spans = Array.from(block.matchAll(/data-reader-text="1"\s+data-start="(\d+)"[^>]*>([\s\S]*?)<\/span>/g));
  if (!spans.length) {
    const textLength = plainTextFromHtml(block).length;
    return { startOffset: 0, endOffset: 0, textLength };
  }
  let startOffset = Number.POSITIVE_INFINITY;
  let endOffset = 0;
  let textLength = 0;
  for (const match of spans) {
    const start = Number(match[1]);
    const text = plainTextFromHtml(match[2]);
    startOffset = Math.min(startOffset, start);
    endOffset = Math.max(endOffset, start + text.length);
    textLength += text.length;
  }
  return { startOffset: Number.isFinite(startOffset) ? startOffset : 0, endOffset, textLength };
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);|&#x?[0-9a-f]+;/gi, (entity) => decodeHtmlEntity(entity));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pageIndexForAnchor(pages: ChapterPage[], anchor: ReaderAnchor): number {
  if (typeof anchor.absoluteOffset === "number") return pageIndexForOffset(pages, anchor.absoluteOffset);
  const byBlock = pages.findIndex((page) => anchor.paragraphIndex >= page.startBlock && anchor.paragraphIndex < page.endBlock);
  if (byBlock >= 0) return byBlock;
  return anchor.scrollOffset ? Math.min(pages.length - 1, Math.max(0, Math.floor(anchor.scrollOffset / Math.max(1, PAGE_TEXT_TARGET)))) : 0;
}

function pageIndexForOffset(pages: ChapterPage[], offset: number): number {
  const index = pages.findIndex((page) => offset >= page.startOffset && offset <= Math.max(page.startOffset, page.endOffset));
  if (index >= 0) return index;
  const next = pages.findIndex((page) => offset < page.startOffset);
  return next >= 0 ? Math.max(0, next - 1) : Math.max(0, pages.length - 1);
}

function applyReaderDecorations(html: string, search: string, activeSearchRange: { start: number; end: number } | null, selectedText: string, selectedRange: { start: number; end: number } | null, notes: ReaderNote[], ttsRange: { start: number; end: number } | null) {
  let output = html;
  for (const note of notes) {
    const replacement = `<span class="reader-note ${note.lineStyle}" style="--note-color: ${note.color}; --wave-image: ${waveSvgDataUri(note.color)}; background-color: ${noteWash(note.color)}">$1</span>`;
    output = note.startOffset !== undefined && note.endOffset !== undefined
      ? wrapPlainRange(output, note.startOffset, note.endOffset, replacement)
      : wrapTextOutsideTags(output, note.selectedText, replacement);
  }
  if (ttsRange) output = wrapTtsRange(output, ttsRange.start, ttsRange.end);
  const inferredSelectedRange = selectedRange || (selectedText ? findTextRangeInHtml(html, selectedText) : null);
  if (inferredSelectedRange) output = wrapPlainRange(output, inferredSelectedRange.start, inferredSelectedRange.end, `<span class="reader-selection">$1</span>`);
  output = wrapSearchMatches(output, search, activeSearchRange);
  return output;
}

function annotateReaderText(html: string): string {
  let cursor = 0;
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;
      if (!part) return part;
      const start = cursor;
      cursor += part.length;
      if (!part.trim()) return part;
      const offsets = part.includes("&") ? [...htmlVisibleTextWithMap(part).map, part.length] : null;
      return `<span data-reader-text="1" data-start="${start}"${offsets ? ` data-offset-map="${offsets.join(",")}"` : ""}>${part}</span>`;
    })
    .join("");
}

function DictionaryView({ result, saved, definitionOrder, onSave, onSpeak, onOpenOfficial }: { result: DictionaryResult; saved: boolean; definitionOrder: AppSettings["dictionary"]["definitionOrder"]; onSave: () => void; onSpeak: (result: DictionaryResult, audioUrl?: string) => void; onOpenOfficial: (url: string) => void }) {
  const phonetics = parsePhonetics(result.phonetic);
  const chineseRows = parseDefinitionRows(result.chineseDefinition);
  const englishRows = result.englishDefinitions.flatMap(parseDefinitionRows);
  const isBingResult = result.source.includes("必应词典");
  const chineseTitle = isBingResult ? "必应中文释义" : "中文释义";
  const englishTitle = result.englishSource?.includes("必应") ? "必应英文释义" : isBingResult ? "免费英文释义" : "英文释义";
  const definitionSections = definitionOrder === "english-first"
    ? [
      { title: englishTitle, rows: englishRows, bulleted: true },
      { title: chineseTitle, rows: chineseRows, bulleted: false }
    ]
    : [
      { title: chineseTitle, rows: chineseRows, bulleted: false },
      { title: englishTitle, rows: englishRows, bulleted: true }
    ];
  return (
    <div className="dict-card">
      <div className="dict-title">
        <h2>{result.term}</h2>
        <button className={`star-button ${saved ? "saved" : ""}`} onClick={onSave} title={saved ? "已收藏" : "收藏到生词本"} aria-label="收藏到生词本">
          {saved ? "★" : "☆"}
        </button>
      </div>
      <div className="phonetic-stack">
        {phonetics.length ? phonetics.map((item, index) => (
          <div className="phonetic-row" key={`${item.label}-${item.value}`}>
            <strong>{item.label}:</strong>
            <span>{item.value}</span>
            <button className="icon-button speaker-button" onClick={() => onSpeak(result, phoneticAudio(result, item.kind))} title={`${item.label}发音`} aria-label={`${item.label}发音`}>🔊</button>
          </div>
        )) : (
          <div className="phonetic-row phonetic-audio-only">
            <button className="icon-button speaker-button" onClick={() => onSpeak(result)} title="发音" aria-label="发音">🔊</button>
          </div>
        )}
      </div>

      <div className="definition-list">
        {definitionSections.map((section) => section.rows.length > 0 && (
          <DefinitionSection key={section.title} title={section.title} rows={section.rows} bulleted={section.bulleted} />
        ))}
        {!englishRows.length && !chineseRows.length && <p className="definition-empty"><span />暂无可显示释义，请切换词典源或稍后再试</p>}
      </div>
      <RelatedWords related={result.related} />
      {result.examples.length > 0 && (
        <div className="example-list">
          <h3>双语例句</h3>
          {result.examples.map((item, index) => {
            const lines = item.split(/\n+/).map((line) => line.trim()).filter(Boolean);
            return (
              <blockquote key={index}>
                {lines.map((line, lineIndex) => <p key={lineIndex} className={lineIndex > 0 ? "example-translation" : ""}>{line}</p>)}
              </blockquote>
            );
          })}
        </div>
      )}
      <div className="official-links">{result.links.map((link) => <button key={link.url} onClick={() => onOpenOfficial(link.url)}>{link.label.replace(/官方页面/g, "官方")}</button>)}</div>
      {!!result.attributions?.length && <div className="dictionary-attributions">{result.attributions.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>}
    </div>
  );
}

function DefinitionSection({ title, rows, bulleted = false }: { title: string; rows: Array<{ pos: string; text: string }>; bulleted?: boolean }) {
  return (
    <section className={bulleted ? "definition-section bulleted" : "definition-section"}>
      <h3>{title}</h3>
      <div className="definition-rows">
        {rows.map((row, index) => (
          <p key={`${row.pos}-${row.text}-${index}`}>
            {bulleted ? <i className="definition-dot" /> : row.pos ? <strong>{row.pos}</strong> : <span />}
            <span>{row.text}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function RelatedWords({ related }: { related?: DictionaryResult["related"] }) {
  const groups = [
    { title: "同义词", rows: related?.synonyms || [] },
    { title: "反义词", rows: related?.antonyms || [] }
  ].filter((group) => group.rows.length);
  if (!groups.length) return null;
  return (
    <div className="related-word-list">
      {groups.map((group) => (
        <section className="related-word-section" key={group.title}>
          <h3>{group.title}</h3>
          {group.rows.map((row, index) => (
            <div className="related-word-row" key={`${group.title}-${row.pos}-${index}`}>
              {row.pos && <strong>{row.pos}</strong>}
              <span>{row.words.join("；")}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function dictionarySourceNote(source: string): string {
  return source
    .replace("必应词典 + 免费词典英文释义增强", "必应词典 + 免费词典")
    .replace("百度翻译大模型 + 免费词典增强", "百度翻译 + 免费词典")
    .replace("Free Dictionary API", "免费词典")
    .replace(/（.*?已回退.*?）/g, " / 已回退");
}

function usefulTranslationFromDictionaryResult(result: DictionaryResult): string {
  const text = [result.chineseDefinition, ...result.englishDefinitions].filter(Boolean).join("\n").trim();
  if (!text) return "";
  if (/暂无中文释义|可使用句子翻译|可通过自定义词典|phrase lookup|official dictionary links/i.test(text)) return "";
  return text;
}

function mergeDictionaryEnhancement(base: DictionaryResult, enhanced: DictionaryResult): DictionaryResult {
  const fallbackOnly = /免费词典（必应.*已回退/.test(enhanced.source);
  return {
    ...enhanced,
    term: enhanced.term || base.term,
    baseForm: enhanced.baseForm || base.baseForm,
    phonetic: enhanced.phonetic || base.phonetic,
    audio: enhanced.audio || base.audio,
    audioUs: enhanced.audioUs || base.audioUs,
    audioUk: enhanced.audioUk || base.audioUk,
    chineseDefinition: enhanced.chineseDefinition || base.chineseDefinition,
    englishDefinitions: enhanced.englishDefinitions.length ? enhanced.englishDefinitions : base.englishDefinitions,
    examples: enhanced.examples.length ? enhanced.examples : base.examples,
    related: enhanced.related || base.related,
    links: enhanced.links.length ? enhanced.links : base.links,
    source: fallbackOnly && base.chineseDefinition ? "必应词典 + 免费词典英文释义增强" : enhanced.source
  };
}

function parsePhonetics(phonetic: string): Array<{ label: string; value: string; order: number; kind: "us" | "uk" | "other" }> {
  const clean = phonetic.trim().replace(/\s+/g, " ").replace(/美\s+国/g, "美国").replace(/英\s+国/g, "英国");
  if (!clean) return [];
  if (!clean.replace(/(?:美国|英国|美式|英式|美音|英音|美|英|US|UK|American|British)\s*[:：]?/gi, "").trim()) return [];
  const labelPattern = /(美国|英国|美式|英式|美音|英音|美|英|US|UK|American|British)\s*[:：]?/gi;
  const labels = Array.from(clean.matchAll(labelPattern));
  if (!labels.length) return [{ label: "音标", value: clean, order: 3, kind: "other" }];

  const rows = labels.map((match, index) => {
    const label = phoneticLabel(match[1]);
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < labels.length ? labels[index + 1].index || clean.length : clean.length;
    return {
      label,
      value: clean.slice(start, end).trim(),
      order: label === "美国" ? 0 : label === "英国" ? 1 : 2,
      kind: label === "美国" ? "us" as const : label === "英国" ? "uk" as const : "other" as const
    };
  }).filter((row) => row.value);

  return rows.length ? rows.sort((a, b) => a.order - b.order) : [{ label: "音标", value: clean, order: 3, kind: "other" }];
}

function phoneticAudio(result: DictionaryResult, kind: "us" | "uk" | "other"): string | undefined {
  if (kind === "us") return result.audioUs || result.audio;
  if (kind === "uk") return result.audioUk;
  return result.audio;
}

function phoneticLabel(label: string): string {
  if (/美|美国|us|american/i.test(label)) return "美国";
  if (/英|英国|uk|british/i.test(label)) return "英国";
  return "音标";
}

function parseDefinitionRows(value: string): Array<{ pos: string; text: string }> {
  const rows: Array<{ pos: string; text: string }> = [];
  let pendingPos = "";
  for (const rawLine of value.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isPartOfSpeechLabel(line)) {
      pendingPos = normalizePartOfSpeech(line);
      continue;
    }
    const match = line.match(/^([a-z]{1,10}\.|[a-z]{1,10}:|网络)\s*(.+)$/i);
    if (match) {
      const pos = isPartOfSpeechLabel(match[1]) || match[1] === "网络" ? normalizePartOfSpeech(match[1]) : "";
      rows.push({ pos, text: match[2].trim() });
    } else {
      rows.push({ pos: pendingPos, text: line });
    }
    pendingPos = "";
  }
  return rows;
}

function normalizePartOfSpeech(value: string): string {
  const clean = value.trim().replace(/:$/, ".");
  return clean === "网络" ? clean : clean;
}

function isPartOfSpeechLabel(value: string): boolean {
  return /^(?:n|v|vt|vi|adj|adv|prep|pron|conj|interj|abbr|num|art)\.?$/i.test(value.trim().replace(/:$/, "."));
}

function dictionaryWebFixScript() {
  const host = window.location.hostname;
  document.documentElement.style.height = "auto";
  document.documentElement.style.minHeight = "100%";
  document.body.style.height = "auto";
  document.body.style.minHeight = "100%";
  document.body.style.overflowY = "auto";

  const hideSelectors = [
    "[id*='ad']",
    "[class*=' ad']",
    "[class^='ad']",
    ".am-default",
    ".amzn-native-container",
    "iframe[src*='ads']"
  ];
  for (const selector of hideSelectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const text = (element.textContent || "").trim();
      if (!text || element.offsetHeight > 120) element.style.display = "none";
    });
  }

  if (host === "dictionary.cambridge.org") {
    const style = document.createElement("style");
    style.textContent = `
      html, body { height: auto !important; min-height: 100% !important; overflow-y: auto !important; }
      body { padding-bottom: 24px !important; }
      .cdo-hdr, .cdo-search, .i-amphtml-layout-container, .hdib.lpt-2, .share, .pr.dictionary .cid, .dataset-selector, .xref, .browse, footer { display: none !important; }
      .page, .pr, .pr.dictionary, .di-body, .entry, .entry-body, .entry-body__el, .pos-body, .sense-body, .def-block { display: block !important; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; opacity: 1 !important; visibility: visible !important; }
      .pr.dictionary, .entry-body__el { margin-top: 10px !important; }
      .def-block, .sense-body { margin-bottom: 12px !important; }
    `;
    document.head.appendChild(style);
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(".entry-body__el, .entry, .pr.dictionary, .di-body");
      if (target) target.scrollIntoView({ block: "start" });
    }, 120);
  }
}

function DictionaryWebPanel({ url, loading, canGoBack, canGoForward, frameRef, onBack, onForward, onReload, onOpenExternal }: { url: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; frameRef: React.RefObject<HTMLDivElement>; onBack: () => void; onForward: () => void; onReload: () => void; onOpenExternal: () => void }) {
  const hostLabel = shortDictionaryHost(url) || "官方词典网页";
  return (
    <div className="dictionary-web-panel">
      <div className="dictionary-web-toolbar">
        <button onClick={onBack} disabled={!canGoBack} title="后退" aria-label="后退">‹</button>
        <button onClick={onForward} disabled={!canGoForward} title="前进" aria-label="前进">›</button>
        <button onClick={onReload} disabled={!url} title="刷新" aria-label="刷新">↻</button>
        <span>{hostLabel}{loading ? " · 打开中" : ""}</span>
        <button onClick={onOpenExternal} disabled={!url} title="在系统浏览器打开">外部打开</button>
      </div>
      {url ? (
        <div className="dictionary-browser-frame" ref={frameRef}>
          <span>{loading ? "正在连接词典网页..." : "词典网页已在此区域打开"}</span>
        </div>
      ) : (
        <Empty text="查词后可在这里打开官方词典网页" />
      )}
    </div>
  );
}

function AiContextPicker({ value, open, onToggle, onChange }: { value: AiContextMode; open: boolean; onToggle: () => void; onChange: (value: AiContextMode) => void }) {
  const options: Array<{ value: AiContextMode; short: string; label: string }> = [
    { value: "selection", short: "选中", label: "附加选中文本" },
    { value: "paragraph", short: "段落", label: "附加当前段落" },
    { value: "chapter", short: "章节", label: "附加全章节" }
  ];
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div className="ai-context-picker">
      <button className={open ? "ai-context-button active" : "ai-context-button"} onClick={onToggle} title={selected.label}>{selected.short}</button>
      {open && (
        <div className="ai-context-menu">
          {options.map((option) => (
            <button key={option.value} className={option.value === value ? "active" : ""} onClick={() => onChange(option.value)}>{option.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function BookCover({ book }: { book: Book }) {
  if (!book.coverPath) return <div className="cover-placeholder">{book.title.slice(0, 1).toUpperCase()}</div>;
  return <img className="book-cover" src={toFileUrl(book.coverPath)} alt={`${book.title} 封面`} />;
}

function SettingsPanel({
  settings,
  saveSettings,
  saveSecret,
  chooseBackground,
  editCurrentBackground,
  onResetSettings,
  onImportBackup,
  onShowInfo,
  category
}: {
  settings: AppSettings;
  saveSettings: (settings: AppSettings) => void;
  saveSecret: (service: string, value: string) => Promise<void>;
  chooseBackground: (target: "app" | "reader") => void;
  editCurrentBackground: (target: "app" | "reader") => void;
  onResetSettings?: (category: SettingCategory) => void;
  onImportBackup?: () => void;
  onShowInfo: (type: Exclude<InfoModal, null>) => void;
  category?: SettingCategory;
}) {
  const [aiKey, setAiKey] = useState("");
  const [dictionaryKey, setDictionaryKey] = useState("");
  const [aiKeySaved, setAiKeySaved] = useState(false);
  const [dictionaryKeySaved, setDictionaryKeySaved] = useState(false);
  const [baiduKeySaved, setBaiduKeySaved] = useState(false);
  const [ttsTestMessage, setTtsTestMessage] = useState("");
  const [webVoices, setWebVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!WEB || !window.speechSynthesis) return;
    const update = () => setWebVoices(window.speechSynthesis.getVoices());
    update(); window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  const dictionaryKeyService = settings.dictionary.source === "baidu" ? settings.dictionary.baiduApiKeyService : settings.dictionary.customApiKeyService;
  const baiduTranslationReady = Boolean(settings.dictionary.baiduAppId.trim() && baiduKeySaved);
  useEffect(() => {
    window.readerAPI.secrets.has(settings.ai.keyService).then(setAiKeySaved).catch(() => setAiKeySaved(false));
    window.readerAPI.secrets.has(dictionaryKeyService).then(setDictionaryKeySaved).catch(() => setDictionaryKeySaved(false));
    window.readerAPI.secrets.has(settings.dictionary.baiduApiKeyService).then(setBaiduKeySaved).catch(() => setBaiduKeySaved(false));
    setDictionaryKey("");
  }, [settings.ai.keyService, dictionaryKeyService, settings.dictionary.baiduApiKeyService]);
  const show = (id: SettingCategory) => (!WEB || id !== "ai") && (!category || category === id);
  return (
    <Panel title="设置">
      {show("library") && <>
        <h3>主界面</h3>
        <label>主题<select value={settings.theme} onChange={(event) => saveSettings({ ...settings, theme: event.target.value as AppSettings["theme"] })}>
          <option value="paper">白色</option><option value="night">夜晚</option><option value="sepia">暖色</option><option value="forest">森林</option><option value="blue">蓝色</option><option value="dusk">暮色</option>
        </select></label>
        <label><input type="checkbox" checked={settings.library.showReadingStats} onChange={(event) => saveSettings({ ...settings, library: { ...settings.library, showReadingStats: event.target.checked } })} /> 显示阅读统计</label>
        <div className="inline-row appearance-background-actions">
          <button onClick={() => chooseBackground("app")}>选背景</button>
          <button disabled={!settings.backgrounds.appPath} onClick={() => editCurrentBackground("app")}>调整</button>
          <button onClick={() => saveSettings({ ...settings, backgrounds: { ...settings.backgrounds, appPath: "" } })}>清除</button>
        </div>
      </>}
      {show("appearance") && <>
        <h3>阅读外观</h3>
        <div className="inline-row appearance-background-actions">
          <button onClick={() => chooseBackground("reader")}>选背景</button>
          <button disabled={!settings.backgrounds.readerPath} onClick={() => editCurrentBackground("reader")}>调整</button>
          <button onClick={() => saveSettings({ ...settings, backgrounds: { ...settings.backgrounds, readerPath: "" } })}>清除</button>
        </div>
        <label>UI 字体 {settings.uiFontSize}px<input type="range" min="12" max="20" value={settings.uiFontSize} onChange={(event) => saveSettings({ ...settings, uiFontSize: Number(event.target.value) })} /></label>
        <label>正文字体 {settings.readerFontSize}px<input type="range" min="15" max="34" value={settings.readerFontSize} onChange={(event) => saveSettings({ ...settings, readerFontSize: Number(event.target.value) })} /></label>
        <label>英文字体<select value={settings.readerFontFamily} onChange={(event) => saveSettings({ ...settings, readerFontFamily: event.target.value })}>{READER_FONTS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
        <label>行距 {settings.lineHeight}<input type="range" min="1.3" max="2.2" step="0.05" value={settings.lineHeight} onChange={(event) => saveSettings({ ...settings, lineHeight: Number(event.target.value) })} /></label>
        <label>页边距 {settings.margin}px<input type="range" min="24" max="110" value={settings.margin} onChange={(event) => saveSettings({ ...settings, margin: Number(event.target.value) })} /></label>
        <label><input type="checkbox" checked={settings.confirmMinorDeletes} onChange={(event) => saveSettings({ ...settings, confirmMinorDeletes: event.target.checked })} /> 删除书签、笔记、单个生词前询问</label>
        <p className="muted-note">书籍和生词本属于重要内容，删除时始终会询问，不能关闭</p>
      </>}
      {WEB && show("dictionary") && <>
        <h3>内置查词</h3>
        <label><input type="checkbox" checked={Boolean(settings.dictionary.enabled)} onChange={event => saveSettings({ ...settings, dictionary: { ...settings.dictionary, enabled: event.target.checked, hover: false, click: false, selection: false, doubleClick: event.target.checked }, shortcuts: { ...settings.shortcuts, lookup: event.target.checked ? DEFAULT_SETTINGS.shortcuts.lookup : "" } })} /> 启用内置查词</label>
        <p className="muted-note">默认关闭，可配合第三方浏览器插件阅读。开启后支持必应中英文释义、发音和收藏生词；查询只发送单词或简短词组，书籍与笔记保存在本地。在线服务需要联网。某些词条可能只有中文释义，可打开必应官网查看更多内容。</p>
        {settings.dictionary.enabled && <>
          <p className="muted-note">词典来源：必应词典。中文和英文释义均直接来自必应词条。</p>
          {(["doubleClick", "selection", "hover", "click"] as const).map((key, index) => <label key={key}><input type="checkbox" checked={settings.dictionary[key]} onChange={event => saveSettings({ ...settings, dictionary: { ...settings.dictionary, [key]: event.target.checked } })} />{["双击查词", "选中查词", "悬浮查词", "单击查词"][index]}</label>)}
          <label>释义显示顺序<select value={settings.dictionary.definitionOrder} onChange={event => saveSettings({ ...settings, dictionary: { ...settings.dictionary, definitionOrder: event.target.value as "chinese-first" | "english-first" } })}><option value="chinese-first">中文释义在上</option><option value="english-first">英文释义在上</option></select></label>
          <details><summary>查词服务连接</summary><p className="muted-note">普通读者无需注册后台账号。由网站维护者提供服务；更换服务时可填写新的 HTTPS 地址，留空使用网站默认服务。</p><label>服务地址<input value={settings.dictionary.webApiUrl || ""} placeholder="使用网站默认服务" onChange={event => saveSettings({ ...settings, dictionary: { ...settings.dictionary, webApiUrl: event.target.value } })} /></label></details>
        </>}
      </>}
      {!WEB && show("dictionary") && <>
        <h3>查词</h3>
        <label><input type="checkbox" checked={settings.dictionary.hover} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, hover: event.target.checked } })} /> 悬浮查词</label>
        <label><input type="checkbox" checked={settings.dictionary.click} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, click: event.target.checked } })} /> 单击查词</label>
        <label><input type="checkbox" checked={settings.dictionary.doubleClick} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, doubleClick: event.target.checked } })} /> 双击查词</label>
        <label><input type="checkbox" checked={settings.dictionary.selection} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, selection: event.target.checked } })} /> 选中查词</label>
        <label><input type="checkbox" checked={settings.dictionary.autoSingularLookup} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, autoSingularLookup: event.target.checked } })} /> 自动按单数查询</label>
        <label>释义显示顺序<select value={settings.dictionary.definitionOrder} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, definitionOrder: event.target.value as AppSettings["dictionary"]["definitionOrder"] } })}>
          <option value="chinese-first">中文释义在上</option>
          <option value="english-first">英文释义在上</option>
        </select></label>
        <label>词典来源<select value={settings.dictionary.source} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, source: event.target.value as AppSettings["dictionary"]["source"] } })}>
          <option value="bing">必应词典</option>
          <option value="free">免费词典</option>
          <option value="custom">自定义词典</option>
          <option value="baidu">百度翻译大模型</option>
        </select></label>
        <label>生词发音词典<select value={settings.dictionary.pronunciationSource || "free"} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, pronunciationSource: event.target.value as AppSettings["dictionary"]["pronunciationSource"] } })}>
          <option value="free">免费词典</option>
          <option value="bing">必应词典</option>
          <option value="baidu">百度翻译大模型</option>
          <option value="custom">自定义词典</option>
        </select></label>
        <label>默认网页词典<select value={settings.dictionary.defaultWebSource || "cambridge"} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, defaultWebSource: event.target.value as AppSettings["dictionary"]["defaultWebSource"] } })}>
          <option value="cambridge">剑桥词典</option>
          <option value="bing">必应词典</option>
          <option value="oxford">Oxford</option>
          <option value="collins">Collins</option>
        </select></label>
        {settings.dictionary.source === "bing" && <p className="muted-note">必应词典会抓取英汉释义和双语例句，并用免费词典补充英文释义；网络不稳定时会临时回退到免费词典</p>}
        {settings.dictionary.source === "free" && <p className="muted-note">免费词典无需配置；若网络或服务不稳定，可临时切换到必应词典、自定义词典或百度翻译大模型</p>}
        {settings.dictionary.source === "custom" && (
          <div className="settings-subcard">
            <p className="muted-note">普通自定义词典使用 GET 请求，并把查询文本替换到 URL 里的 <code>{"{term}"}</code>；如果接口不可用，会自动临时回退到免费词典</p>
            <label>API 地址<input value={settings.dictionary.customApiUrl} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, customApiUrl: event.target.value } })} placeholder="https://api.example.com?q={term}" /></label>
            <label>API Key<input type="password" value={dictionaryKey} onChange={(event) => setDictionaryKey(event.target.value)} placeholder={dictionaryKeySaved ? "已加密保存，重新填写可覆盖" : "未保存"} /></label>
            <button onClick={async () => { await saveSecret(dictionaryKeyService, dictionaryKey); setDictionaryKeySaved(await window.readerAPI.secrets.has(dictionaryKeyService)); setDictionaryKey(""); }}>加密保存自定义词典 Key</button>
          </div>
        )}
        {settings.dictionary.source === "baidu" && (
          <div className="settings-subcard">
            <p className="muted-note">百度翻译大模型使用官方文本翻译接口；英文词句会自动译成中文，中文内容会自动译成英文；英文单词会补充音标、英文释义和例句</p>
            <label>APPID<input value={settings.dictionary.baiduAppId} onChange={(event) => saveSettings({ ...settings, dictionary: { ...settings.dictionary, baiduAppId: event.target.value } })} placeholder="百度控制台中的 APPID" /></label>
            <label>API Key<input type="password" value={dictionaryKey} onChange={(event) => setDictionaryKey(event.target.value)} placeholder={dictionaryKeySaved ? "已加密保存，重新填写可覆盖" : "未保存"} /></label>
            <button onClick={async () => { await saveSecret(dictionaryKeyService, dictionaryKey); setDictionaryKeySaved(await window.readerAPI.secrets.has(dictionaryKeyService)); setBaiduKeySaved(await window.readerAPI.secrets.has(settings.dictionary.baiduApiKeyService)); setDictionaryKey(""); }}>加密保存百度 API Key</button>
          </div>
        )}
      </>}
      {show("ai") && <>
        <h3>AI</h3>
        <label><input type="checkbox" checked={settings.ai.enabled} onChange={(event) => saveSettings({ ...settings, ai: { ...settings.ai, enabled: event.target.checked } })} /> 启用 AI</label>
        <label className={baiduTranslationReady ? "" : "disabled-setting"}><input type="checkbox" checked={settings.ai.useBaiduForTranslation && baiduTranslationReady} disabled={!baiduTranslationReady} onChange={(event) => saveSettings({ ...settings, ai: { ...settings.ai, useBaiduForTranslation: event.target.checked } })} /> 启用百度翻译大模型用于句子翻译</label>
        <p className="muted-note">{baiduTranslationReady ? "开启后，阅读区选中句子点“翻译”时会优先调用百度翻译大模型；普通查词仍按查词来源设置执行" : "需先在查词设置中填写百度 APPID，并加密保存百度 API Key 后才可开启"}</p>
        <label>对话记录保留<select value={settings.ai.retentionDays} onChange={(event) => saveSettings({ ...settings, ai: { ...settings.ai, retentionDays: Number(event.target.value) as AppSettings["ai"]["retentionDays"] } })}>
          <option value={0}>不保留</option><option value={1}>1 天</option><option value={3}>3 天</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={-1}>一直保留</option>
        </select></label>
        <label>历史保留轮数 {settings.ai.historyRounds}<input type="range" min="1" max="20" value={settings.ai.historyRounds} onChange={(event) => saveSettings({ ...settings, ai: { ...settings.ai, historyRounds: Number(event.target.value) } })} /></label>
        <p className="muted-note">AI 对话会按“书籍 + 章节”分别保存；切换章节会打开该章节自己的会话</p>
        <label>Base URL<input value={settings.ai.baseUrl} onChange={(event) => saveSettings({ ...settings, ai: { ...settings.ai, baseUrl: event.target.value } })} /></label>
        <label>Model<input value={settings.ai.model} onChange={(event) => saveSettings({ ...settings, ai: { ...settings.ai, model: event.target.value } })} /></label>
        <label>API Key<input type="password" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder={aiKeySaved ? "已加密保存，重新填写可覆盖" : "未保存"} /></label>
        <button onClick={async () => { await saveSecret(settings.ai.keyService, aiKey); setAiKeySaved(await window.readerAPI.secrets.has(settings.ai.keyService)); setAiKey(""); }}>加密保存 AI Key</button>
        <p className="muted-note">{aiKeySaved ? "AI Key 已加密保存；输入框为空是为了不回显明文，不代表 Key 丢失" : "AI Key 尚未保存"}</p>
      </>}
      {show("tts") && <>
        <h3>朗读</h3>
        {WEB && <p className="muted-note">使用浏览器免费朗读，无需 API Key。可用声音和离线能力取决于浏览器与系统语音。</p>}
        {WEB && <label>声音<select value={webVoices.some(voice => voice.voiceURI === settings.tts.voice) ? settings.tts.voice : ""} onChange={event => saveSettings({ ...settings, tts: { ...settings.tts, voice: event.target.value } })}><option value="">自动选择英语声音</option>{webVoices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}{voice.localService ? " · 系统语音" : ""}</option>)}</select></label>}
        {!WEB && <>
        <p className="muted-note">长篇朗读会按句子分段排队；选择 edge-tts 优先时，每段会优先用 edge 合成，失败时自动回退到系统朗读</p>
        <label>朗读 Provider<select value={settings.tts.provider} onChange={(event) => saveSettings({ ...settings, tts: { ...settings.tts, provider: event.target.value as "edge" | "webspeech" } })}><option value="edge">edge-tts 优先</option><option value="webspeech">Web Speech</option></select></label>
        <label>声音<select value={settings.tts.voice || "en-US-JennyNeural"} onChange={(event) => saveSettings({ ...settings, tts: { ...settings.tts, voice: event.target.value } })}>
          <option value="en-US-JennyNeural">Jenny · 美式女声</option><option value="en-US-AriaNeural">Aria · 美式女声</option><option value="en-US-GuyNeural">Guy · 美式男声</option><option value="en-GB-SoniaNeural">Sonia · 英式女声</option><option value="en-GB-RyanNeural">Ryan · 英式男声</option>
        </select></label>
        </>}
        <label>语速 {settings.tts.rate}<input type="range" min="0.5" max="1.8" step="0.05" value={settings.tts.rate} onChange={(event) => saveSettings({ ...settings, tts: { ...settings.tts, rate: Number(event.target.value) } })} /></label>
        <label><input type="checkbox" checked={settings.tts.autoScroll} onChange={(event) => saveSettings({ ...settings, tts: { ...settings.tts, autoScroll: event.target.checked } })} /> 朗读时自动滚动</label>
        {!WEB && <div className="inline-row"><button onClick={async () => { setTtsTestMessage("正在测试 edge-tts..."); try { const result = await window.readerAPI.tts.edgeSpeak("This is an Edge TTS test.", settings.tts.rate, settings.tts.voice || "en-US-JennyNeural"); setTtsTestMessage(result.available ? "edge-tts 可用" : result.error || "edge-tts 不可用"); } catch (error: any) { setTtsTestMessage(error.message || String(error)); } }}>测试 edge-tts</button></div>}
        {ttsTestMessage && <p className="muted-note">{ttsTestMessage}</p>}
      </>}
      {show("shortcuts") && <>
        <h3>快捷键</h3>
        <p className="muted-note">点击快捷键框后，直接按下新的组合键即可保存</p>
        {SHORTCUTS.filter(item => !WEB || item.id !== "lookup").map((item) => <ShortcutEditor key={item.id} label={item.action} value={settings.shortcuts[item.id] || item.keys} onChange={(shortcut) => saveSettings({ ...settings, shortcuts: { ...settings.shortcuts, [item.id]: shortcut || item.keys } })} />)}
      </>}
      {show("backup") && <>
        <h3>备份与日志</h3>
        {WEB && <><p className="muted-note">书籍保存在当前浏览器。完整备份包含书籍和学习记录；登录恢复卡用于连接云账号，两者请分别保存。也支持导入旧版 eRead 的完整备份。</p><ProtectionPanel /></>}
        <div className="inline-row"><button onClick={() => window.readerAPI.backup.export()}>导出备份</button><button onClick={onImportBackup || (() => window.readerAPI.backup.import())}>导入备份</button><button onClick={() => window.readerAPI.logs.export()}>导出日志</button></div>
      </>}
      <div className="settings-footer-actions">
        {onResetSettings && <button className="text-danger" onClick={() => onResetSettings(category || "library")}>恢复默认设置</button>}
        <button onClick={() => onShowInfo("help")}>帮助</button>
        <button onClick={() => onShowInfo("about")}>关于</button>
      </div>
    </Panel>
  );
}

const APP_VERSION = WEB ? "0.4.0" : "0.3.0";

const HELP_SECTIONS = [
  {
    title: "开始使用",
    paragraphs: [
      "eRead 是一款面向英语阅读与学习的本地桌面阅读器，支持导入 EPUB、TXT、Markdown 和 DOCX 文件；你可以在书库中管理书籍，在阅读时进行查词、翻译、划线、写想法、收藏生词、添加书签、朗读和 AI 辅助提问",
      "首次使用时，点击主界面右上方的“导入书籍”，选择本机文件；导入完成后，书籍会出现在书库中；点击书籍封面或标题即可打开阅读"
    ]
  },
  {
    title: "书库管理",
    paragraphs: [
      "书库支持全部书籍、收藏、生词和笔记几个入口",
      "你可以右键书籍进行收藏、加入书架、顶置、重命名、导出封面、导出笔记或删除书籍；删除书籍只会从书库移除书籍本身，相关生词、笔记和书签会保留；之后重新导入同一本书时，eRead 会询问是否把旧内容关联到新书；确认后，原来的生词、笔记和书签会尽量恢复跳转能力",
      "书架用于整理书籍；你可以新建书架，将书籍加入不同书架，也可以重命名或删除书架；删除书架不会删除书籍"
    ]
  },
  {
    title: "阅读与分页",
    paragraphs: [
      "阅读页面按章节和页显示；顶部和底部均可使用“上一页 / 下一页”翻页；到达一章的最后一页后，继续下一页会进入下一章；在章节第一页点上一页，会回到上一章末页",
      "目录可以快速跳转到对应章节；书签、生词和笔记中的定位按钮可以跳回原文位置；由于不同格式电子书的章节结构可能不同，重新导入后的跳转会优先按章节标题匹配，匹配不到时按章节顺序尝试定位",
      "可以在设置中查看和自定义有关功能的快捷键"
    ]
  },
  {
    title: "阅读进度",
    paragraphs: [
      "eRead 会自动保存阅读位置；普通滚动和翻页会延迟保存，以避免频繁写入；切换章节、退出阅读器、关闭窗口、系统锁屏或应用进入后台时，会立即保存当前位置",
      "阅读位置会优先使用正文字符位置定位，其次使用段落和滚动位置辅助恢复；这样即使窗口大小、字体、页边距或分页发生变化，也能尽量回到接近上次阅读的位置",
      "建议及时添加书签，保证阅读进度得到良好保存"
    ]
  },
  {
    title: "查词与翻译",
    paragraphs: [
      "默认情况下，单击英文单词会打开查词结果；你也可以在设置中启用或关闭悬浮查词、单击查词、双击查词和选中查词",
      "翻译句子请接入 AI 或支持该功能的词典等工具，选中后点击翻译按钮进行句子翻译；AI 和百度翻译大模型同时启用时，会优先使用百度翻译大模型；如果百度翻译不可用，会继续尝试 AI",
      "词典来源可以在设置中选择；部分词典或翻译服务需要联网；联网查询时，所查询的词、句子或必要上下文可能会发送给对应服务；请不要在联网功能中输入敏感或不希望外传的内容"
    ]
  },
  {
    title: "生词本",
    paragraphs: [
      "查词后可以将单词收藏到生词本；生词会记录单词、释义、例句、来源书籍和章节；点击生词卡片上的定位按钮，可以尝试跳回原文；收藏时可选择生词本，并为每本书设置默认收藏目标；历史默认生词本可以正常重命名或删除",
      "你可以按生词本、书籍或章节筛选，导出时选择精排卡片 HTML、复习讲义 TXT、Markdown 或 CSV；词书导入样式单独提供一行一个单词的 TXT，文件名会包含当前筛选项"
    ]
  },
  {
    title: "划线、笔记与想法",
    paragraphs: [
      "在阅读区选中文字后，可以添加划线或写想法；划线支持不同颜色和线型；所有笔记会集中显示在“我的笔记”中，并支持按书籍、章节、线型、颜色和是否有想法筛选",
      "笔记可以编辑、删除、导出，也可以定位回原文；删除单条笔记只删除该笔记本身，不会影响书籍文件"
    ]
  },
  {
    title: "AI 辅助",
    paragraphs: [
      "启用 AI 后，你可以针对选中文本、当前段落或当前章节提问；AI 对话按“书籍 + 章节”保存，切换章节后会进入该章节自己的会话记录",
      "AI 功能需要你自行配置兼容的 API 服务和 API Key；使用 AI 时，提问内容和所选上下文会发送给你配置的服务；AI 生成内容可能不准确、不完整或带有误导性，请自行判断，不应作为法律、医疗、投资、学术诚信或其他专业决策的唯一依据"
    ]
  },
  {
    title: "朗读",
    paragraphs: [
      "朗读功能支持从头开始、从选中部分开始、从当前句附近开始，也可以暂停、继续、上一句、下一句；你可以在设置中调整朗读声音、语速，以及是否朗读时自动滚动",
      "部分朗读方式可能依赖系统语音或在线语音服务，实际可用性取决于系统环境和网络状态"
    ]
  },
  {
    title: "外观与背景",
    paragraphs: [
      "设置中可以切换主题、调整 UI 字体、正文字体、英文字体、行距和页边距",
      "主界面和阅读界面都支持自定义背景；选择背景后，可以调整水平位置、垂直位置、缩放和背景强度；预览会尽量按实际界面比例显示，帮助你调整到合适的位置和透明度；阅读界面的背景强度建议不要过高，以免影响正文可读性"
    ]
  },
  {
    title: "备份与恢复",
    paragraphs: [
      "eRead 的书籍记录、阅读进度、生词、笔记、书签和设置默认保存在本机应用数据目录；建议在版本升级、迁移电脑或批量整理数据前，先在“备份与日志”中导出备份",
      "导入备份前，eRead 会尝试生成安全快照；即便如此，仍建议你保留重要书籍文件和备份文件的独立副本"
    ]
  },
  {
    title: "常见问题",
    paragraphs: [
      "如果书籍显示“文件丢失”，说明原文件路径可能被移动或删除；你可以使用“重新定位”选择新的文件位置",
      "如果笔记或生词无法定位到原文，可能是因为书籍内容被重新排版、重新导入版本不同、章节标题变化，或原句文本发生变化；可以重新导入同一本书并选择关联旧内容，系统会尝试恢复定位",
      "如果在线查词、AI 或朗读失败，请检查网络、API Key、服务地址和系统语音环境"
    ]
  }
];

const ABOUT_SECTIONS = [
  {
    title: "eRead",
    paragraphs: [
      "eRead 是一款面向英语阅读学习的本地桌面阅读器，提供书籍阅读、查词、翻译、生词本、划线笔记、书签、朗读和 AI 辅助等功能",
      `当前版本：v${APP_VERSION}`,
      "开发者：Bendog",
      "目前适用平台：Windows"
    ]
  },
  {
    title: "本地数据",
    paragraphs: [
      "eRead 默认将书籍记录、阅读进度、生词、笔记、书签、设置和日志保存在本机；除非你主动使用在线词典、在线翻译、AI 或其他联网功能，eRead 不会主动上传你的书籍文件或学习数据",
      "请注意，本地数据仍可能因系统故障、磁盘损坏、误删、软件异常或版本迁移失败而丢失；请定期导出备份，并自行保存重要书籍和学习资料的副本"
    ]
  },
  {
    title: "联网功能",
    paragraphs: [
      "当你使用在线查词、翻译、AI 辅助或部分朗读功能时，相关词语、句子、选中文本、章节上下文或请求参数可能会发送给对应的第三方服务；第三方服务的数据处理规则、可用性、准确性和安全性由对应服务方负责",
      "请不要在联网功能中输入身份证号、银行卡号、账号密码、商业秘密、未公开作品、敏感个人信息或其他不希望发送给第三方的内容"
    ]
  },
  {
    title: "AI 与词典结果",
    paragraphs: [
      "eRead 中的词典、翻译、朗读和 AI 输出仅用于阅读辅助和语言学习参考；相关结果可能存在错误、遗漏、延迟、偏差或不适用于具体语境的情况",
      "AI 输出不构成法律、医疗、心理、投资、财务、学术评价或其他专业建议；你应自行判断和核实重要内容，并在必要时咨询具备资质的专业人士"
    ]
  },
  {
    title: "版权与内容责任",
    paragraphs: [
      "你应确保自己导入、阅读、摘录、导出或分享的书籍、文本、笔记和其他内容来源合法，并遵守适用的著作权、出版、网络传播和数据合规要求",
      "eRead 仅提供本地阅读和学习管理工具，不提供盗版书籍下载、破解、传播或版权规避功能；因用户导入、复制、导出、传播或使用第三方内容而产生的版权争议或法律责任，由用户自行承担"
    ]
  },
  {
    title: "免责声明",
    paragraphs: [
      "在法律允许的范围内，eRead 按“现状”提供，不承诺完全无错误、不中断、始终兼容所有文件格式，或满足所有特定用途；由于软件使用、数据丢失、第三方服务异常、网络问题、用户操作、系统环境或内容来源问题造成的损失，开发者不承担超出适用法律强制规定范围的责任"
    ]
  },
  {
    title: "隐私与安全建议",
    paragraphs: [
      "建议你定期备份数据，谨慎配置第三方 API Key，不在共享电脑上保存敏感内容；若你计划向他人分发 eRead，请一并提供本说明，并提醒使用者阅读后再使用"
    ]
  },
  {
    title: "反馈",
    paragraphs: [
      "如果你在使用中遇到问题，或希望改进功能、兼容性和文档，可以向开发者反馈；反馈问题时，建议说明系统版本、eRead 版本、书籍格式、复现步骤和是否使用了联网功能；联系方式：2633078347@qq.com"
    ]
  }
];

function InfoModalView({ type, onClose }: { type: Exclude<InfoModal, null>; onClose: () => void }) {
  const isHelp = type === "help";
  const sections = WEB ? isHelp ? [
    { title: "导入与保存", paragraphs: ["支持 EPUB、TXT、Markdown 和 DOCX。导入的书籍保存在当前浏览器，不上传云端。自动文件备份在你授权的电脑文件夹中保存完整书库，仅在应用打开时运行。", "可选云账号会加密同步笔记、生词、书签和进度。其他设备粘贴登录码或导入登录恢复卡即可合并记录；导入同一本书后可定位原文。云端保留最近 10 个有学习内容修改的历史版本。登录恢复卡不是完整书库备份，请分别保存。", "书卡上的“管理”可收藏、重命名、加入书架或删除书籍。切换章节前会保存位置，再次进入该章节时恢复到上次读到的地方。"] },
    { title: "查词与生词本", paragraphs: ["正文使用普通网页文本，可以结合第三方浏览器插件辅助学习。请在扩展管理中允许插件访问本网站。插件是否支持独立应用窗口取决于浏览器与插件本身。", "内置查词默认关闭，可在设置中开启。支持必应中文和英文释义。部分词条可能没有英文释义，可以打开必应官网查看更多内容。查询只发送词语，不发送整本书、笔记或原文上下文。可从释义卡片收藏到生词本，保留释义来源；关闭查词后仍可手动收藏和编辑生词。"] },
    { title: "划线与笔记", paragraphs: ["选中文本后添加直线或波浪线、调整颜色、写想法。我的笔记中可按书籍、章节、线型筛选，编辑或定位到原文。生词和笔记均可导出为 HTML、TXT、Markdown 或 CSV。导出和分享时请遵守原文与词典内容的许可。"] },
    { title: "朗读", paragraphs: ["可从当前阅读位置、本章开头或选区开始。朗读控制条提供暂停、继续、停止、上一句、下一句、语速和跟随正文；“回到朗读处”可以返回当前句子。", "朗读使用浏览器和系统语音，无需付费接口。声音种类、实际发音和离线能力取决于浏览器及操作系统。"] },
    { title: "安装与离线阅读", paragraphs: ["在 Edge 或 Chrome 中使用应用安装菜单，或页面中的安装入口，创建桌面快捷方式并在独立窗口打开。请使用安装了学习插件的同一浏览器配置。", "首次打开完成后可离线阅读已导入的书籍、整理笔记和生词。在线词典仍需联网；更新版本前请保存正在编辑的内容。"] }
  ] : [
    { title: "SkipReader · 一跃", paragraphs: ["原 eRead 网页版，免费阅读与学习工具，提供书库、书签、朗读、可选查词、生词本、划线笔记、自动文件备份和可选加密学习记录同步。问题反馈：2633078347@qq.com。"] },
    { title: "第三方内容与来源", paragraphs: ["SkipReader 不提供书籍下载。请使用有权阅读的资料，分享摘录和导出文件时遵守著作权及相关许可。第三方浏览器插件由用户自行安装，eRead 与这些插件及词典服务没有隶属或授权合作关系。", "在线释义来自必应词典。释义页显示来源和许可链接，收藏与导出保留这些信息。内容权利归对应权利人，使用时须遵守服务条款及词条许可；释义可用性和准确性依赖第三方服务。"] },
    { title: "隐私与数据", paragraphs: ["导入的书籍、笔记、生词和阅读进度不上传查词后台。查词只发送词语，网络服务会处理请求所需的连接信息。查词后台不设置查询日志。", "云同步默认关闭。启用后，学习记录通过浏览器 AES-GCM 加密再传到 Cloudflare；后台保存加密记录、账号验证摘要、版本和时间，不接收解密钥匙或整本书。登录码能读取并解密自己的云记录，请勿分享。可退出登录或永久删除云端账号，退出不删除本地资料。", "清除网站数据会删除本地书库和记住的登录状态。恢复卡丢失后无法找回加密数据。免费服务有容量与请求限制，不能替代独立文件备份。浏览器朗读及第三方插件的数据处理规则由对应服务决定。"] }
  ] : isHelp ? HELP_SECTIONS : ABOUT_SECTIONS;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-titlebar">
          <strong>{WEB ? isHelp ? "SkipReader 使用指南" : "关于 SkipReader · 一跃" : isHelp ? "eRead 使用指南" : "关于 eRead"}</strong>
          <button className="float-close" onClick={onClose}>×</button>
        </div>
        <div className="info-content">
          {sections.map((section, index) => (
            <section className="info-section" key={section.title}>
              <h3>{isHelp ? `${index + 1}. ${section.title}` : section.title}</h3>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          {WEB && !isHelp && <p><a href={new URL("./third-party-notices.txt", location.href).href} target="_blank" rel="noopener noreferrer">开源组件与许可声明</a></p>}
        </div>
      </div>
    </div>
  );
}

function ShortcutEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [capturing, setCapturing] = useState(false);
  return (
    <div className="shortcut">
      <span>{label}</span>
      <button
        className={capturing ? "capture active" : "capture"}
        onClick={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={(event) => {
          if (!capturing) return;
          event.preventDefault();
          const shortcut = eventToShortcut(event.nativeEvent);
          if (!shortcut) return;
          onChange(shortcut);
          setCapturing(false);
        }}
      >
        <kbd>{capturing ? "请按键..." : value}</kbd>
      </button>
    </div>
  );
}

function Panel({ title, titleExtra, children, panelRef, onScroll, className = "" }: { title: string; titleExtra?: React.ReactNode; children: React.ReactNode; panelRef?: React.RefObject<HTMLDivElement>; onScroll?: () => void; className?: string }) {
  return <div className={`panel ${className}`} ref={panelRef} onScroll={onScroll}><div className="panel-title"><h2>{title}</h2>{titleExtra}</div>{children}</div>;
}

function Empty({ title, text, actionLabel, onAction }: { title?: string; text: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="empty">{title && <h2>{title}</h2>}<p>{text}</p>{actionLabel && <button className="primary" onClick={onAction}>{actionLabel}</button>}</div>;
}

function NoteLineSample({ note }: { note: ReaderNote }) {
  return <span className={`note-line-sample ${note.lineStyle}`} style={{ "--note-color": note.color, "--wave-image": waveSvgDataUri(note.color) } as React.CSSProperties} aria-hidden="true" />;
}

function NoteTextPreview({ text, className, onMore }: { text: string; className: string; onMore: () => void }) {
  const long = text.length > 550;
  const preview = long ? `${text.slice(0, 550).trimEnd()}...` : text;
  return <span className={className}>{preview}{long && <button className="more-link" onClick={(event) => { event.stopPropagation(); onMore(); }}>更多</button>}</span>;
}

function formatVocabDefinitionText(value: string, splitByChineseLabels: boolean): string {
  const clean = value.trim();
  if (!clean || !splitByChineseLabels) return clean;
  return clean
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.replace(/\s+((?:n|v|vt|vi|adj|adv|prep|pron|conj|interj|abbr|num|art)[.:]?\s+|网络\s+)/gi, "\n$1").split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function CustomSelect({
  id,
  value,
  options,
  openId,
  setOpenId,
  onChange
}: {
  id: string;
  value: string;
  options: Array<{ value: string; label: React.ReactNode }>;
  openId: string;
  setOpenId: (id: string) => void;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value) || options[0];
  const open = openId === id;
  return (
    <span className="custom-select">
      <button className={open ? "select-like active" : "select-like"} onClick={() => setOpenId(open ? "" : id)}>
        <span>{selected?.label}</span>
      </button>
      {open && (
        <div className="theme-menu custom-select-menu">
          {options.map((option) => (
            <button key={option.value} className={option.value === value ? "active" : ""} onClick={() => { onChange(option.value); setOpenId(""); }}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function ConfirmModal({ dialog }: { dialog: ConfirmDialog }) {
  return (
    <div className="modal-backdrop dialog-backdrop" onClick={dialog.onCancel}>
      <div className="app-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-titlebar">
          <strong>{dialog.title}</strong>
          <button className="float-close" onClick={dialog.onCancel}>×</button>
        </div>
        <p>{dialog.message}</p>
        <div className="modal-actions">
          <button className={dialog.danger ? "danger-button" : "primary"} onClick={dialog.onConfirm}>确认</button>
          <button onClick={dialog.onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}

function PromptModal({ dialog, setDialog }: { dialog: PromptDialog; setDialog: (dialog: PromptDialog | null) => void }) {
  return (
    <div className="modal-backdrop dialog-backdrop" onClick={dialog.onCancel}>
      <div className="app-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-titlebar">
          <strong>{dialog.title}</strong>
          <button className="float-close" onClick={dialog.onCancel}>×</button>
        </div>
        <label>{dialog.label}<input value={dialog.value} autoFocus onChange={(event) => setDialog({ ...dialog, value: event.target.value })} onKeyDown={(event) => {
          if (event.key === "Enter") dialog.onConfirm(dialog.value.trim());
          if (event.key === "Escape") dialog.onCancel?.();
        }} /></label>
        <div className="modal-actions">
          <button className="primary" onClick={() => dialog.onConfirm(dialog.value.trim())}>{dialog.confirmText || "确认"}</button>
          <button onClick={dialog.onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}

function tabLabel(tab: SideTab) {
  return ({ toc: "目录", bookmarks: "书签", dictionary: "查词", vocab: "生词", notes: "笔记", ai: "AI", settings: "设置" } as Record<SideTab, string>)[tab];
}

function renderTocItems(
  tocItems: TocItem[],
  chapters: Chapter[],
  activeIndex: number,
  expandedIds: string[],
  toggleItem: (itemId: string) => void,
  goToItem: (item: TocItem) => void
): React.ReactNode {
  if (!tocItems.length) return <Empty text="暂无目录" />;
  const expanded = new Set(expandedIds);
  const render = (item: TocItem, depth: number): React.ReactNode => {
    const children = item.children || [];
    const hasChildren = children.length > 0;
    const isExpanded = hasChildren && expanded.has(item.id);
    const directIndex = item.chapterId ? chapters.findIndex((chapter) => chapter.id === item.chapterId) : -1;
    const targetIndex = resolveTocTargetIndex(item, chapters);
    const childActive = tocContainsChapterIndex(item, activeIndex, chapters);
    const active = directIndex === activeIndex || (item.kind === "part" && targetIndex === activeIndex);
    return (
      <div key={item.id} className={`toc-tree-node toc-kind-${item.kind} ${hasChildren ? "toc-has-children" : ""} ${childActive ? "toc-contains-active" : ""}`}>
        <div className="toc-row" style={{ paddingLeft: 6 + depth * 18 }}>
          <button
            className={`toc-item ${active ? "active" : ""} ${targetIndex < 0 ? "toc-static" : ""}`}
            onClick={() => goToItem(item)}
            title={item.title || (targetIndex >= 0 ? `第 ${targetIndex + 1} 章` : "未命名目录")}
          >
            <span className="toc-title">{item.title || (targetIndex >= 0 ? `第 ${targetIndex + 1} 章` : "未命名目录")}</span>
          </button>
          {hasChildren && (
            <button
              className={`toc-toggle ${isExpanded ? "expanded" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                toggleItem(item.id);
              }}
              title={isExpanded ? "收起章节" : "展开章节"}
              aria-label={isExpanded ? `收起 ${item.title}` : `展开 ${item.title}`}
            >
              ›
            </button>
          )}
        </div>
        {hasChildren && isExpanded && <div className="toc-children">{children.map((child) => render(child, depth + 1))}</div>}
      </div>
    );
  };
  return <div className="toc-tree">{tocItems.map((item) => render(item, 0))}</div>;
}

function buildTocFromChapters(bookId: string, chapters: Chapter[]): TocItem[] {
  return chapters.map((chapter) => ({
    id: `toc-${chapter.id}`,
    bookId,
    chapterId: chapter.id,
    title: chapter.title || `第 ${chapter.orderIndex + 1} 章`,
    href: chapter.href,
    orderIndex: chapter.orderIndex,
    level: 0,
    kind: tocKindFromTitle(chapter.title || "")
  }));
}

function tocKindFromTitle(title: string): TocItem["kind"] {
  const clean = title.trim();
  if (/^(?:part|book)\b/i.test(clean) || /^第[一二三四五六七八九十百千万\d]+[部卷篇]\b/.test(clean)) return "part";
  if (/^(?:cover page|cover|title page|half title|copyright|dedication|preface|foreword|introduction|contents?|table of contents|封面|目录|前言|序言|献词|版权)(?:\b|[:.\-—]|$)/i.test(clean)) return "frontmatter";
  if (/^(?:epilogue|afterword|about the author|about (?:the )?authors?|appendix|appendices|acknowledg(?:e)?ments|notes?|endnotes?|glossary|bibliography|references|index|后记|作者简介|关于作者|附录|致谢|注释|术语表|参考文献|索引)(?:\b|[:.\-—]|$)/i.test(clean)) return "backmatter";
  if (/^(?:prologue|序章|楔子)(?:\b|[:.\-—]|$)/i.test(clean)) return "chapter";
  return "chapter";
}

function normalizeTocItemsForDisplay(items: TocItem[]): TocItem[] {
  const cloned = cloneTocItems(items);
  if (tocHasChildren(cloned) || !cloned.some((item) => item.kind === "part")) return cloned;
  const roots: TocItem[] = [];
  let currentPart: TocItem | undefined;
  for (const item of cloned) {
    if (item.kind === "part") {
      currentPart = { ...item, children: [] };
      roots.push(currentPart);
      continue;
    }
    if (item.kind === "frontmatter" || item.kind === "backmatter") {
      currentPart = undefined;
      roots.push(item);
      continue;
    }
    if (currentPart) {
      currentPart.children = [...(currentPart.children || []), { ...item, parentId: currentPart.id, level: Math.max(1, currentPart.level + 1) }];
      continue;
    }
    roots.push(item);
  }
  return roots;
}

function cloneTocItems(items: TocItem[]): TocItem[] {
  return items.map((item) => ({ ...item, children: item.children?.length ? cloneTocItems(item.children) : [] }));
}

function tocHasChildren(items: TocItem[]): boolean {
  return items.some((item) => Boolean(item.children?.length) || tocHasChildren(item.children || []));
}

function resolveTocTargetIndex(item: TocItem, chapters: Chapter[]): number {
  const directIndex = item.chapterId ? chapters.findIndex((chapter) => chapter.id === item.chapterId) : -1;
  const hrefIndex = findChapterIndexByHref(item.href, chapters);
  const firstChildIndex = firstReadableTocChildIndex(item, chapters);
  if (item.kind === "part" && item.children?.length) {
    if (directIndex >= 0 && item.href && sameReaderHref(chapters[directIndex]?.href, item.href)) return directIndex;
    if (hrefIndex >= 0) return hrefIndex;
    return firstChildIndex >= 0 ? firstChildIndex : directIndex;
  }
  if (directIndex >= 0) return directIndex;
  if (hrefIndex >= 0) return hrefIndex;
  return firstChildIndex;
}

function firstReadableTocChildIndex(item: TocItem, chapters: Chapter[]): number {
  for (const child of item.children || []) {
    const directIndex = child.chapterId ? chapters.findIndex((chapter) => chapter.id === child.chapterId) : -1;
    if (directIndex >= 0) return directIndex;
    const hrefIndex = findChapterIndexByHref(child.href, chapters);
    if (hrefIndex >= 0) return hrefIndex;
    const nested = firstReadableTocChildIndex(child, chapters);
    if (nested >= 0) return nested;
  }
  return -1;
}

function findChapterIndexByHref(href: string | undefined, chapters: Chapter[]): number {
  if (!href) return -1;
  const exact = chapters.findIndex((chapter) => sameReaderHref(chapter.href, href));
  if (exact >= 0) return exact;
  const targetBase = normalizeComparableHref(stripFragment(href));
  if (!targetBase) return -1;
  return chapters.findIndex((chapter) => normalizeComparableHref(stripFragment(chapter.href || "")) === targetBase);
}

function sameReaderHref(left: string | undefined, right: string | undefined): boolean {
  return normalizeComparableHref(left || "") === normalizeComparableHref(right || "");
}

function normalizeComparableHref(href: string): string {
  const normalized = href.replace(/\\/g, "/").replace(/^\.\//, "");
  try {
    return decodeURIComponent(normalized).toLowerCase();
  } catch {
    return normalized.replace(/%20/gi, " ").toLowerCase();
  }
}

function tocContainsChapterIndex(item: TocItem, index: number, chapters: Chapter[]): boolean {
  return (item.children || []).some((child) => {
    const childIndex = child.chapterId ? chapters.findIndex((chapter) => chapter.id === child.chapterId) : -1;
    return childIndex === index || tocContainsChapterIndex(child, index, chapters);
  });
}

function tocAncestorIdsForChapter(items: TocItem[], chapterId: string): string[] {
  for (const item of items) {
    const childPath = tocAncestorIdsForChapter(item.children || [], chapterId);
    if (childPath.length) return [item.id, ...childPath];
    if ((item.children || []).some((child) => child.chapterId === chapterId)) return [item.id];
  }
  return [];
}

function mergeIds(existing: string[], incoming: string[]): string[] {
  const merged = new Set(existing);
  for (const id of incoming) merged.add(id);
  return Array.from(merged);
}

function nextSortMode(mode: AppSettings["library"]["sortMode"]): AppSettings["library"]["sortMode"] {
  return ({ recent: "title", title: "author", author: "imported", imported: "recent" } as const)[mode];
}

function sortModeLabel(mode: AppSettings["library"]["sortMode"]): string {
  return ({ recent: "最近", title: "书名", author: "作者", imported: "导入" } as const)[mode];
}

function toggleId(ids: string[], id: string, checked: boolean): string[] {
  const next = new Set(ids);
  checked ? next.add(id) : next.delete(id);
  return Array.from(next);
}

function uniqueOptions<T>(items: T[], valueOf: (item: T) => string, labelOf: (item: T) => string): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const output: Array<{ value: string; label: string }> = [];
  for (const item of items) {
    const value = valueOf(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push({ value, label: labelOf(item) });
  }
  return output;
}

function floatStyle(point: { x: number; y: number }): React.CSSProperties {
  const pointInView = clampFloatPoint(point.x, point.y, "drag");
  return { left: pointInView.x, top: pointInView.y, right: "auto", bottom: "auto" };
}

function smartFloatPoint(clientX: number, clientY: number, anchorRect?: DOMRect | null): { x: number; y: number } {
  const margin = 18;
  const width = Math.min(FLOAT_WIDTH, Math.max(280, window.innerWidth - 56));
  const height = Math.min(FLOAT_INITIAL_HEIGHT, Math.max(220, window.innerHeight - 56));
  const anchor = anchorRect && anchorRect.width > 0 && anchorRect.height > 0
    ? anchorRect
    : new DOMRect(clientX, clientY, 1, 1);
  const candidates = [
    { x: anchor.right + margin, y: anchor.top - 8 },
    { x: anchor.left - width - margin, y: anchor.top - 8 },
    { x: anchor.left, y: anchor.bottom + margin },
    { x: anchor.left, y: anchor.top - height - margin },
    { x: clientX + margin, y: clientY + margin }
  ];
  const viewport = { left: margin, top: margin, right: window.innerWidth - margin, bottom: window.innerHeight - margin };
  const best = candidates
    .map((point) => {
      const clamped = clampFloatPoint(point.x, point.y, "initial");
      const rect = { left: clamped.x, top: clamped.y, right: clamped.x + width, bottom: clamped.y + height };
      const overlapX = Math.max(0, Math.min(rect.right, anchor.right) - Math.max(rect.left, anchor.left));
      const overlapY = Math.max(0, Math.min(rect.bottom, anchor.bottom) - Math.max(rect.top, anchor.top));
      const overflow = Math.max(0, viewport.left - rect.left) + Math.max(0, rect.right - viewport.right) + Math.max(0, viewport.top - rect.top) + Math.max(0, rect.bottom - viewport.bottom);
      return { point: clamped, score: overlapX * overlapY * 10 + overflow };
    })
    .sort((a, b) => a.score - b.score)[0];
  return best?.point || clampFloatPoint(clientX + margin, clientY + margin, "initial");
}

function clampFloatPoint(x: number, y: number, mode: "initial" | "drag" = "initial"): { x: number; y: number } {
  const width = Math.min(FLOAT_WIDTH, Math.max(280, window.innerWidth - 56));
  const height = mode === "drag"
    ? FLOAT_TITLEBAR_HEIGHT
    : Math.min(FLOAT_INITIAL_HEIGHT, Math.max(220, window.innerHeight - 56));
  const margin = mode === "drag" ? 8 : 18;
  return {
    x: Math.min(Math.max(x, margin), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(y, margin), Math.max(margin, window.innerHeight - height - margin))
  };
}

function positionToAnchor(chapterId: string, position?: ReadingPosition | null): ReaderAnchor {
  return {
    chapterId,
    paragraphIndex: Math.max(0, position?.paragraphIndex ?? 0),
    charOffset: Math.max(0, position?.charOffset ?? 0),
    absoluteOffset: typeof position?.absoluteOffset === "number" ? Math.max(0, position.absoluteOffset) : undefined,
    scrollOffset: position?.scrollOffset || 0
  };
}

function readingPositionSignature(position: ReadingPosition): string {
  return [
    position.bookId,
    position.chapterId || "",
    position.paragraphIndex ?? "",
    position.charOffset ?? "",
    position.absoluteOffset ?? "",
    position.scrollOffset,
    Number(position.progress || 0).toFixed(6)
  ].join("|");
}

function currentReaderAnchor(reader: HTMLElement): { paragraphIndex: number; charOffset: number; absoluteOffset?: number } {
  const blocks = Array.from(reader.querySelectorAll<HTMLElement>("[data-reader-block='1']"));
  const readerTop = reader.getBoundingClientRect().top;
  const probeY = readerTop + Math.min(96, Math.max(34, reader.clientHeight * 0.18));
  const block = blocks.find((item) => item.getBoundingClientRect().bottom >= probeY) || blocks[0];
  const paragraphIndex = Number(block?.dataset.readerParagraph || 0);
  const first = block ? firstBlockPlainOffset(block) : null;
  let charOffset = 0;
  let absoluteOffset = first ?? undefined;
  const range = document.caretRangeFromPoint?.(reader.getBoundingClientRect().left + 28, probeY);
  if (range?.startContainer && block?.contains(range.startContainer)) {
    const absolute = plainOffsetFromTextNode(range.startContainer, range.startOffset);
    if (absolute !== null) {
      absoluteOffset = Math.max(0, absolute);
      if (first !== null) charOffset = Math.max(0, absolute - first);
    }
  }
  return { paragraphIndex, charOffset, absoluteOffset };
}

function scrollToReaderAnchor(anchor: ReaderAnchor): void {
  const reader = document.querySelector<HTMLElement>(".reader-scroll");
  if (!reader) return;
  if (typeof anchor.absoluteOffset === "number") {
    const target = textTargetForPlainOffset(reader, anchor.absoluteOffset);
    if (target) {
      scrollRangeIntoReaderView(target, false);
      return;
    }
  }
  const block = document.querySelector<HTMLElement>(`.reader-content [data-reader-paragraph="${anchor.paragraphIndex}"]`);
  if (block) {
    const blockStart = firstBlockPlainOffset(block);
    const target = blockStart !== null ? textTargetForPlainOffset(block, blockStart + anchor.charOffset) : null;
    if (target) scrollRangeIntoReaderView(target, false);
    else scrollElementIntoReaderView(block, false);
    return;
  }
  reader.scrollTop = anchor.scrollOffset || 0;
}

function textTargetForPlainOffset(root: ParentNode, offset: number): Range | null {
  const spans = Array.from(root.querySelectorAll<HTMLElement>("[data-reader-text][data-start]"));
  for (const span of spans) {
    const start = Number(span.dataset.start || 0);
    const text = span.textContent || "";
    const offsets = span.dataset.offsetMap?.split(",").map(Number);
    const end = start + (offsets?.[text.length] ?? text.length);
    if (offset < start || offset > end) continue;
    let visibleOffset = offsets ? offsets.findIndex(value => value >= offset - start) : offset - start;
    if (visibleOffset < 0) visibleOffset = text.length;
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length || 0;
      if (visibleOffset <= length) { const range = document.createRange(); range.setStart(node, visibleOffset); range.collapse(true); return range; }
      visibleOffset -= length;
    }
  }
  return null;
}

function firstTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  return walker.nextNode() ? walker.currentNode as Text : null;
}

function scrollRangeIntoReaderView(range: Range, centered: boolean): void {
  const reader = document.querySelector<HTMLElement>(".reader-scroll");
  if (!reader) return;
  const rect = range.getBoundingClientRect();
  const readerRect = reader.getBoundingClientRect();
  const offset = centered ? reader.clientHeight * 0.42 : 28;
  reader.scrollTop = Math.max(0, reader.scrollTop + rect.top - readerRect.top - offset);
}

function scrollElementIntoReaderView(element: HTMLElement, centered: boolean): void {
  const reader = document.querySelector<HTMLElement>(".reader-scroll");
  if (!reader) return;
  const rect = element.getBoundingClientRect();
  const readerRect = reader.getBoundingClientRect();
  const offset = centered ? (reader.clientHeight - rect.height) / 2 : 28;
  reader.scrollTop = Math.max(0, reader.scrollTop + rect.top - readerRect.top - offset);
}

function firstBlockPlainOffset(block: HTMLElement): number | null {
  const first = block.querySelector<HTMLElement>("[data-reader-text][data-start]");
  return first?.dataset.start ? Number(first.dataset.start) : null;
}

function bookTitleById(books: Book[], bookId: string, fallback?: string): string {
  return books.find((book) => book.id === bookId)?.title || fallback || "已删除书籍";
}

function settingsWithPreservedLibrary(defaults: AppSettings, current: AppSettings): AppSettings {
  return {
    ...defaults,
    library: {
      ...defaults.library,
      shelves: current.library.shelves,
      bookShelfMap: current.library.bookShelfMap,
      favoriteBookIds: current.library.favoriteBookIds,
      pinnedBookIds: current.library.pinnedBookIds,
      activeShelfId: current.library.activeShelfId
    }
  };
}

function resetSettingsCategory(current: AppSettings, category: SettingCategory): AppSettings {
  switch (category) {
    case "library":
      return { ...current, theme: DEFAULT_SETTINGS.theme, library: { ...current.library, showReadingStats: DEFAULT_SETTINGS.library.showReadingStats, bookViewMode: DEFAULT_SETTINGS.library.bookViewMode, sortMode: DEFAULT_SETTINGS.library.sortMode }, backgrounds: { ...current.backgrounds, appPath: "", appPositionX: 50, appPositionY: 50, appScale: 100, appOpacity: DEFAULT_SETTINGS.backgrounds.appOpacity } };
    case "appearance":
      return { ...current, uiFontSize: DEFAULT_SETTINGS.uiFontSize, readerFontSize: DEFAULT_SETTINGS.readerFontSize, readerFontFamily: DEFAULT_SETTINGS.readerFontFamily, lineHeight: DEFAULT_SETTINGS.lineHeight, margin: DEFAULT_SETTINGS.margin, confirmMinorDeletes: DEFAULT_SETTINGS.confirmMinorDeletes, backgrounds: { ...current.backgrounds, readerPath: "", readerPositionX: 50, readerPositionY: 50, readerScale: 100, readerOpacity: DEFAULT_SETTINGS.backgrounds.readerOpacity } };
    case "dictionary":
      return { ...current, dictionary: DEFAULT_SETTINGS.dictionary };
    case "ai":
      return { ...current, ai: DEFAULT_SETTINGS.ai };
    case "tts":
      return { ...current, tts: DEFAULT_SETTINGS.tts };
    case "shortcuts":
      return { ...current, shortcuts: DEFAULT_SETTINGS.shortcuts };
    case "backup":
      return current;
    default:
      return current;
  }
}

function dictionaryLookupCacheKey(settings: AppSettings, term: string): string {
  const source = settings.dictionary.source === "baidu"
    ? `baidu:${settings.dictionary.baiduAppId}`
    : settings.dictionary.source === "custom"
    ? `custom:${settings.dictionary.customApiUrl}`
    : settings.dictionary.source === "bing"
    ? "bing"
    : "free";
  const singular = settings.dictionary.autoSingularLookup ? "singular-on" : "singular-off";
  const baseForm = settings.dictionary.showVerbBaseForm ? "base-on" : "base-off";
  return `${source}:${singular}:${baseForm}:${settings.dictionary.webApiUrl || ""}:${settings.dictionary.supplementEnglish !== false}:${term.trim().toLowerCase()}`;
}

function preferredDictionaryWebUrl(result: DictionaryResult, source: AppSettings["dictionary"]["defaultWebSource"] = "cambridge"): string {
  const patterns: Record<AppSettings["dictionary"]["defaultWebSource"], string> = {
    cambridge: "dictionary.cambridge.org",
    bing: "cn.bing.com",
    oxford: "oxfordlearnersdictionaries.com",
    collins: "collinsdictionary.com"
  };
  return result.links.find((link) => link.url.includes(patterns[source]))?.url
    || result.links.find((link) => link.url.includes("dictionary.cambridge.org"))?.url
    || result.links[0]?.url
    || "";
}

function isAllowedDictionaryWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return [
      "cn.bing.com",
      "www.bing.com",
      "dictionary.cambridge.org",
      "www.oxfordlearnersdictionaries.com",
      "www.collinsdictionary.com"
    ].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function shortDictionaryHost(url: string): string {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "cn.bing.com") return "必应词典";
    if (host === "dictionary.cambridge.org") return "剑桥词典";
    if (host === "oxfordlearnersdictionaries.com") return "Oxford";
    if (host === "collinsdictionary.com") return "Collins";
    return host;
  } catch {
    return "";
  }
}

function buildAiReadingContext(book: Book | null, chapter: Chapter | undefined, selected: string, chapterText: string, selectedRange: { start: number; end: number } | null, mode: AiContextMode, history: AiMessage[] = [], rounds = 6): string {
  const lines = [
    "你正在辅助用户阅读英文书籍；请默认理解下面的阅读上下文，并在回答中结合当前书籍和章节",
    `书名：${book?.title || "未打开书籍"}`,
    `作者：${book?.author || "未知"}`,
    `当前章节：${chapter?.title || "未知章节"}`
  ];
  const recent = trimAiLogRounds(history.filter((item) => item.text !== "正在思考..."), rounds);
  if (recent.length) {
    lines.push("最近对话：");
    for (const item of recent) lines.push(`${item.role === "user" ? "用户" : "助手"}：${item.text.slice(0, 900)}`);
  }
  if (mode === "selection" && selected.trim()) lines.push(`用户当前选中内容：${selected.trim()}`);
  if (mode === "paragraph") {
    if (selected.trim()) lines.push(`用户当前选中内容：${selected.trim()}`);
    lines.push(`选中内容所在段落：${paragraphAroundRange(chapterText, selectedRange, selected) || selected.trim() || "无可用段落"}`);
  }
  if (mode === "chapter") {
    const excerpt = chapterText.length > 12000 ? `${chapterText.slice(0, 12000)}\n...[章节正文已截断]` : chapterText;
    lines.push("当前章节正文：", excerpt || "无正文内容");
  }
  return lines.join("\n");
}

function paragraphAroundRange(text: string, range: { start: number; end: number } | null, selected = ""): string {
  if (!text.trim()) return "";
  let activeRange = range;
  if (!activeRange && selected.trim()) {
    const index = text.indexOf(selected.trim());
    if (index >= 0) activeRange = { start: index, end: index + selected.trim().length };
  }
  if (!activeRange) return "";
  const beforeDouble = text.lastIndexOf("\n\n", activeRange.start);
  const afterDouble = text.indexOf("\n\n", activeRange.end);
  const beforeSingle = text.lastIndexOf("\n", activeRange.start);
  const afterSingle = text.indexOf("\n", activeRange.end);
  let start = beforeDouble >= 0 ? beforeDouble + 2 : beforeSingle >= 0 ? beforeSingle + 1 : 0;
  let end = afterDouble >= 0 ? afterDouble : afterSingle >= 0 ? afterSingle : text.length;
  if (end - start > 2200) {
    start = Math.max(0, activeRange.start - 900);
    end = Math.min(text.length, activeRange.end + 900);
  }
  return text.slice(start, end).trim();
}

function asksForLargeContext(question: string): boolean {
  return /(总结本章|分析这一章|概括全文|总结全文|总结这一章|概括本章|分析本章)/.test(question);
}

function trimAiLogRounds(log: AiMessage[], rounds: number): AiMessage[] {
  const max = Math.max(1, Math.min(20, rounds || 6)) * 2;
  return log.slice(Math.max(0, log.length - max));
}

function aiLogKey(bookId: string, chapterId: string): string {
  return `eRead.aiLog.${bookId}.${chapterId}`;
}

function loadAiLog(storageKey: string, retentionDays: AppSettings["ai"]["retentionDays"]): AiMessage[] {
  if (!storageKey || retentionDays === 0) return [];
  try {
    return pruneAiLog(JSON.parse(localStorage.getItem(storageKey) || "[]"), retentionDays);
  } catch {
    return [];
  }
}

function saveAiLog(storageKey: string, log: AiMessage[], retentionDays: AppSettings["ai"]["retentionDays"]): void {
  if (!storageKey) return;
  const pruned = pruneAiLog(log, retentionDays);
  if (!pruned.length || retentionDays === 0) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, JSON.stringify(pruned));
}

function pruneAllAiLogs(retentionDays: AppSettings["ai"]["retentionDays"]): void {
  localStorage.removeItem("eRead.aiLog");
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("eRead.aiLog.")) keys.push(key);
  }
  for (const key of keys) {
    const pruned = loadAiLog(key, retentionDays);
    if (!pruned.length || retentionDays === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(pruned));
  }
}

function pruneAiLog(log: AiMessage[], retentionDays: AppSettings["ai"]["retentionDays"]): AiMessage[] {
  if (retentionDays === -1) return log;
  if (retentionDays === 0) return [];
  const minTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return log.filter((item) => new Date(item.createdAt || 0).getTime() >= minTime);
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element?.tagName || "");
}

function splitSentences(text: string): string[] {
  return sentenceMatches(text).map((match) => match.text);
}

function makeTtsSegments(text: string, chapterIndex: number, baseOffset = 0): TtsSegment[] {
  const segments: TtsSegment[] = [];
  for (const match of sentenceMatches(text)) {
    segments.push({ text: match.text, chapterIndex, startOffset: baseOffset + match.start, endOffset: baseOffset + match.end });
  }
  if (!segments.length && text.trim()) {
    const leading = text.match(/^\s*/)?.[0].length || 0;
    const trailing = text.match(/\s*$/)?.[0].length || 0;
    segments.push({ text: text.trim(), chapterIndex, startOffset: baseOffset + leading, endOffset: baseOffset + text.length - trailing });
  }
  return segments;
}

function makeWebTtsSegments(html: string, chapterIndex: number, startOffset = 0): TtsSegment[] {
  const segments: TtsSegment[] = [];
  for (const block of splitHtmlBlocks(annotateReaderText(html))) {
    const doc = new DOMParser().parseFromString(block, "text/html");
    let text = "";
    const starts: number[] = [], ends: number[] = [];
    for (const span of Array.from(doc.querySelectorAll<HTMLElement>("[data-reader-text]"))) {
      const value = span.textContent || "", start = Number(span.dataset.start || 0), offsets = span.dataset.offsetMap?.split(",").map(Number);
      for (let index = 0; index < value.length; index++) { text += value[index]; starts.push(start + (offsets?.[index] ?? index)); ends.push(start + (offsets?.[index + 1] ?? index + 1)); }
    }
    const from = starts.findIndex(offset => offset >= startOffset);
    if (from < 0) continue;
    for (const sentence of sentenceMatches(text.slice(from))) {
      const start = from + sentence.start, end = from + sentence.end;
      segments.push({ text: sentence.text, chapterIndex, startOffset: starts[start], endOffset: ends[end - 1] });
    }
  }
  return segments;
}

function sentenceMatches(text: string): Array<{ text: string; start: number; end: number }> {
  const protectedText = protectSentencePeriods(text);
  const pattern = /\S[\s\S]*?(?:[.!?。！？]+["”']*|$)(?=\s|$)/g;
  const matches: Array<{ text: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(protectedText)) !== null) {
    const raw = text.slice(match.index, match.index + match[0].length);
    const leading = raw.match(/^\s*/)?.[0].length || 0;
    const trailing = raw.match(/\s*$/)?.[0].length || 0;
    const sentence = raw.trim();
    if (!sentence) continue;
    matches.push({ text: sentence, start: match.index + leading, end: match.index + raw.length - trailing });
  }
  return matches;
}

function protectSentencePeriods(text: string): string {
  const period = "\u2024";
  const protect = (value: string) => value.replace(/\./g, period);
  return text
    .replace(/\b(?:[A-Za-z]\.){2,}(?:[A-Za-z]\.)?/g, protect)
    .replace(/\b(?:Mr|Mrs|Ms|Msr|Dr|Prof|Sr|Jr|St|Mt|vs|etc|No|Fig|Dept|Univ|Inc|Ltd|Co|Corp|Ph)\./gi, protect)
    .replace(/\b(?:e\.g|i\.e|a\.m|p\.m|ph\.d)\./gi, protect)
    .replace(/\d\.\d/g, protect);
}

function sentenceAt(sentences: string[], index: number): string {
  if (!sentences.length) return "";
  return sentences[Math.max(0, Math.min(sentences.length - 1, index))] || "";
}

function sentenceFromText(text: string): string {
  return sentenceMatches(text)[0]?.text || "";
}

function sentenceAround(text: string, start: number, end: number): string {
  if (!text.trim()) return "";
  const matches = sentenceMatches(text).filter((match) => match.end > start && match.start < end);
  if (matches.length) return text.slice(matches[0].start, matches[matches.length - 1].end).replace(/\s+/g, " ").trim();
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function findTextRange(text: string, needle: string): { start: number; end: number } | null {
  const normalizedText = normalizeWithMap(text);
  const normalizedNeedle = normalizeWithMap(needle);
  if (!normalizedNeedle.value) return null;
  const index = normalizedText.value.toLowerCase().indexOf(normalizedNeedle.value.toLowerCase());
  if (index < 0) return null;
  const start = normalizedText.map[index] ?? 0;
  const end = (normalizedText.map[index + normalizedNeedle.value.length - 1] ?? start) + 1;
  return end > start ? { start, end } : null;
}

function findTextRangeInHtml(html: string, needle: string): { start: number; end: number } | null {
  const visible = htmlVisibleTextWithMap(html);
  const normalizedText = normalizeWithSourceMap(visible.value, visible.map);
  const normalizedNeedle = normalizeWithMap(needle);
  if (!normalizedNeedle.value) return null;
  const index = normalizedText.value.toLowerCase().indexOf(normalizedNeedle.value.toLowerCase());
  if (index < 0) return null;
  const start = normalizedText.map[index] ?? 0;
  const end = (normalizedText.map[index + normalizedNeedle.value.length - 1] ?? start) + 1;
  return end > start ? { start, end } : null;
}

function findSearchMatchesInHtml(html: string, search: string): Array<{ start: number; end: number }> {
  const clean = search.trim();
  if (!clean || !html.trim()) return [];
  const visible = htmlVisibleTextWithMap(html);
  const normalizedText = normalizeWithSourceMap(visible.value, visible.map);
  const normalizedNeedle = normalizeWithMap(clean);
  if (!normalizedNeedle.value) return [];
  const escaped = normalizedNeedle.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, "gi");
  const matches: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalizedText.value)) !== null) {
    const start = normalizedText.map[match.index] ?? 0;
    const end = (normalizedText.map[match.index + normalizedNeedle.value.length - 1] ?? start) + 1;
    if (end > start) matches.push({ start, end });
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return matches;
}

function findWordRange(text: string, range: { start: number; end: number }, word: string): { start: number; end: number } | null {
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return null;
  const sentence = text.slice(range.start, range.end);
  const match = new RegExp(`(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])`, "i").exec(sentence);
  if (!match) return null;
  const start = range.start + match.index + (match[1]?.length || 0);
  return { start, end: start + match[2].length };
}

function findWordRangeInHtml(html: string, word: string, nearRange: { start: number; end: number } | null): { start: number; end: number } | null {
  const clean = word.trim();
  if (!clean) return null;
  const visible = htmlVisibleTextWithMap(html);
  const normalized = normalizeWithSourceMap(visible.value, visible.map);
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])`, "gi");
  let fallback: { start: number; end: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized.value)) !== null) {
    const normalizedStart = match.index + (match[1]?.length || 0);
    const normalizedEnd = normalizedStart + match[2].length;
    const start = normalized.map[normalizedStart] ?? 0;
    const end = (normalized.map[normalizedEnd - 1] ?? start) + 1;
    const candidate = end > start ? { start, end } : null;
    if (!candidate) continue;
    if (!fallback) fallback = candidate;
    if (!nearRange || (candidate.start >= nearRange.start - 4 && candidate.end <= nearRange.end + 4)) return candidate;
  }
  return nearRange ? null : fallback;
}

function htmlRangeLooksLike(html: string, range: { start: number; end: number }, expected: string): boolean {
  const actual = htmlTextForRawRange(html, range).replace(/\s+/g, " ").trim().toLowerCase();
  const clean = expected.replace(/\s+/g, " ").trim().toLowerCase();
  return Boolean(actual && clean && (actual === clean || actual.includes(clean) || clean.includes(actual)));
}

function paragraphIndexForHtmlOffset(html: string, offset: number): number | null {
  const annotated = annotateReaderText(html);
  const blocks = splitHtmlBlocks(annotated);
  for (let index = 0; index < blocks.length; index += 1) {
    const starts = Array.from(blocks[index].matchAll(/data-start="(\d+)"/g)).map((match) => Number(match[1]));
    if (!starts.length) continue;
    const first = Math.min(...starts);
    const last = Math.max(...starts);
    if (offset >= first && offset <= last + 1) return index;
  }
  return null;
}

function paragraphIndexForOffset(text: string, offset: number): number {
  if (!text) return 0;
  const before = text.slice(0, Math.max(0, offset));
  const breaks = before.match(/\n\s*\n/g);
  return breaks?.length || 0;
}

function localCharOffsetForParagraph(text: string, paragraphIndex: number, absoluteOffset: number): number {
  if (paragraphIndex <= 0) return Math.max(0, absoluteOffset);
  let index = 0;
  let start = 0;
  const pattern = /\n\s*\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    index += 1;
    start = match.index + match[0].length;
    if (index >= paragraphIndex) break;
  }
  return Math.max(0, absoluteOffset - start);
}

function normalizeWithMap(text: string): { value: string; map: number[] } {
  return normalizeWithSourceMap(text, Array.from({ length: text.length }, (_, index) => index));
}

function normalizeWithSourceMap(text: string, sourceMap: number[]): { value: string; map: number[] } {
  let value = "";
  const map: number[] = [];
  let lastWasSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (lastWasSpace) continue;
      value += " ";
      map.push(sourceMap[index] ?? index);
      lastWasSpace = true;
      continue;
    }
    value += char;
    map.push(sourceMap[index] ?? index);
    lastWasSpace = false;
  }
  if (value.startsWith(" ")) {
    value = value.slice(1);
    map.shift();
  }
  if (value.endsWith(" ")) {
    value = value.slice(0, -1);
    map.pop();
  }
  return { value, map };
}

function htmlVisibleTextWithMap(html: string): { value: string; map: number[] } {
  let value = "";
  const map: number[] = [];
  let rawCursor = 0;
  for (const part of html.split(/(<[^>]+>)/g)) {
    if (!part) continue;
    if (part.startsWith("<")) continue;
    let index = 0;
    while (index < part.length) {
      if (part[index] === "&") {
        const entityEnd = part.indexOf(";", index + 1);
        if (entityEnd > index && entityEnd - index <= 12) {
          const decoded = decodeHtmlEntity(part.slice(index, entityEnd + 1));
          if (decoded) {
            for (const char of decoded.split("")) {
              value += char;
              map.push(rawCursor + index);
            }
            index = entityEnd + 1;
            continue;
          }
        }
      }
      value += part[index];
      map.push(rawCursor + index);
      index += 1;
    }
    rawCursor += part.length;
  }
  return { value, map };
}

function htmlTextForRawRange(html: string, range: { start: number; end: number }): string {
  const visible = htmlVisibleTextWithMap(html);
  return visible.value
    .split("")
    .filter((_char, index) => visible.map[index] >= range.start && visible.map[index] < range.end)
    .join("");
}

function decodeHtmlEntity(entity: string): string {
  const named: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&apos;": "'"
  };
  if (named[entity]) return named[entity];
  const numeric = entity.match(/^&#(x?[0-9a-f]+);$/i);
  if (!numeric) return "";
  const codePoint = numeric[1].toLowerCase().startsWith("x")
    ? Number.parseInt(numeric[1].slice(1), 16)
    : Number.parseInt(numeric[1], 10);
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
}

function contextForDomRange(startNode: Node, startOffset: number, endNode: Node, endOffset: number): string {
  const element = startNode.nodeType === Node.ELEMENT_NODE ? startNode as Element : startNode.parentElement;
  let block = element?.closest("p, li, blockquote, div, section, article");
  while (block && !block.contains(endNode)) block = block.parentElement;
  if (!block) return "";
  const prefix = document.createRange();
  prefix.selectNodeContents(block);
  prefix.setEnd(startNode, startOffset);
  const start = prefix.toString().length;
  prefix.setEnd(endNode, endOffset);
  const end = prefix.toString().length;
  const text = block.textContent || "";
  const selected = text.slice(start, end);
  const leading = selected.match(/^\s*/)?.[0].length || 0;
  const trailing = selected.match(/\s*$/)?.[0].length || 0;
  return sentenceAround(text, start + leading, end - trailing);
}

function selectionContext(selection: Selection | null, selectedText: string): string {
  if (!selection || !selectedText || !selection.rangeCount) return "";
  const range = selection.getRangeAt(0);
  return contextForDomRange(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
}

function selectionDetails(selection: Selection | null, rawText: string, selectedText: string, reader: HTMLElement | null): { context: string; range: { start: number; end: number } | null; rect: DOMRect | null } {
  const context = selectionContext(selection, selectedText);
  if (!selection || !selectedText || selection.rangeCount === 0 || !reader) return { context, range: null, rect: null };
  const content = reader.querySelector(".reader-content");
  if (!content) return { context, range: null, rect: null };
  const range = selection.getRangeAt(0);
  const rect = firstUsableRect(range);
  if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return { context, range: null, rect };
  const rawStart = plainOffsetOf(content, range.startContainer, range.startOffset);
  const rawEnd = plainOffsetOf(content, range.endContainer, range.endOffset);
  const leading = rawText.match(/^\s*/)?.[0].length || 0;
  const trailing = rawText.match(/\s*$/)?.[0].length || 0;
  const start = rawStart + leading;
  const end = rawEnd - trailing;
  return { context, range: end > start ? { start, end } : null, rect };
}

function firstUsableRect(range: Range): DOMRect | null {
  const rect = Array.from(range.getClientRects()).find((item) => item.width > 2 && item.height > 2);
  return rect || null;
}

function plainOffsetOf(root: Element, node: Node, offset: number): number {
  const markedOffset = plainOffsetFromTextNode(node, offset);
  if (markedOffset !== null) return markedOffset;
  if (node.nodeType === Node.ELEMENT_NODE) {
    const next = node.childNodes[offset];
    if (next) {
      const text = firstTextNode(next);
      const mapped = text ? plainOffsetFromTextNode(text, 0) : null;
      if (mapped !== null) return mapped;
    }
    const previous = node.childNodes[Math.max(0, offset - 1)];
    if (previous) {
      const walker = document.createTreeWalker(previous, NodeFilter.SHOW_TEXT);
      let last: Node | null = previous.nodeType === Node.TEXT_NODE ? previous : null;
      while (walker.nextNode()) last = walker.currentNode;
      const mapped = last ? plainOffsetFromTextNode(last, last.textContent?.length || 0) : null;
      if (mapped !== null) return mapped;
    }
  }
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(textNode) {
      const parent = textNode.parentElement;
      return parent?.closest("button, .next-chapter, .load-more") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current === node) return count + offset;
    count += current.textContent?.length || 0;
  }
  return count;
}

function plainOffsetFromTextNode(node: Node, offset: number): number | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const parent = element?.closest("[data-reader-text]") as HTMLElement | null;
  const start = parent?.dataset.start;
  if (start === undefined) return null;
  const offsets = parent?.dataset.offsetMap?.split(",").map(Number);
  const prefix = document.createRange(); prefix.selectNodeContents(parent!); prefix.setEnd(node, offset);
  const visibleOffset = prefix.toString().length;
  return Number(start) + (offsets?.[visibleOffset] ?? visibleOffset);
}

function pointInsideTextRange(node: Node, start: number, end: number, x: number, y: number): boolean {
  if (node.nodeType !== Node.TEXT_NODE || end <= start) return false;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const rects = Array.from(range.getClientRects());
  range.detach();
  return rects.some((rect) => x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1);
}

function readerVisibleText(root: Element | null | undefined): string {
  if (!root) return "";
  const pieces: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(textNode) {
      const parent = textNode.parentElement;
      return parent?.closest("button, .next-chapter, .load-more, .selection-bar, .idea-popover")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) pieces.push(walker.currentNode.textContent || "");
  return pieces.join("");
}

function wrapTextOutsideTags(html: string, text: string, replacement: string): string {
  const clean = text.trim();
  if (!clean) return html;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escaped})`, "gi");
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => part.startsWith("<") ? part : part.replace(pattern, replacement))
    .join("");
}

function wrapSearchMatches(html: string, search: string, activeRange: { start: number; end: number } | null): string {
  const clean = search.trim();
  if (!clean) return html;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, "gi");
  let cursor = 0;
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;
      const partStart = cursor;
      cursor += part.length;
      let output = "";
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(part)) !== null) {
        const start = partStart + match.index;
        const end = start + match[0].length;
        const active = activeRange && start === activeRange.start && end === activeRange.end;
        output += part.slice(lastIndex, match.index);
        output += `<mark${active ? ` class="active-search"` : ""}>${match[0]}</mark>`;
        lastIndex = match.index + match[0].length;
      }
      return output + part.slice(lastIndex);
    })
    .join("");
}

function wrapPlainRange(html: string, start: number, end: number, replacement: string): string {
  if (start < 0 || end <= start) return html;
  let cursor = 0;
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;
      const partStart = cursor;
      const partEnd = cursor + part.length;
      cursor = partEnd;
      if (end <= partStart || start >= partEnd) return part;
      const from = Math.max(0, start - partStart);
      const to = Math.min(part.length, end - partStart);
      return `${part.slice(0, from)}${replacement.replace("$1", part.slice(from, to))}${part.slice(to)}`;
    })
    .join("");
}

function wrapTtsRange(html: string, start: number, end: number): string {
  if (start < 0 || end <= start) return html;
  let cursor = 0;
  let markedFirst = false;
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;
      const partStart = cursor;
      const partEnd = cursor + part.length;
      cursor = partEnd;
      if (end <= partStart || start >= partEnd) return part;
      const from = Math.max(0, start - partStart);
      const to = Math.min(part.length, end - partStart);
      const className = markedFirst ? "tts-current tts-continuation" : "tts-current";
      markedFirst = true;
      return `${part.slice(0, from)}<span class="${className}">${part.slice(from, to)}</span>${part.slice(to)}`;
    })
    .join("");
}

function noteWash(color: string): string {
  return `${color}26`;
}

function waveSvgDataUri(color: string): string {
  const stroke = /^#[0-9a-f]{3,8}$/i.test(color) ? color : NOTE_COLORS[0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="7" viewBox="0 0 18 7"><path d="M0 4 Q4.5 1.6 9 4 T18 4" fill="none" stroke="${stroke}" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
}

function countMatches(text: string, search: string): number {
  const clean = search.trim();
  if (!clean) return 0;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(escaped, "gi"))?.length || 0;
}

function shortcutMatches(event: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut) return false;
  return eventToShortcut(event) === shortcut;
}

function eventToShortcut(event: KeyboardEvent): string {
  const key = normalizeShortcutKey(event.key);
  if (!key) return "";
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(key);
  return parts.join("+");
}

function normalizeShortcutKey(key: string): string {
  if (["Control", "Alt", "Shift", "Meta"].includes(key)) return "";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function isSimpleWord(text: string): boolean {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)?$/.test(text.trim());
}

function singularizeLookupTerm(term: string): string {
  const clean = term.trim();
  if (!/^[A-Za-z]+$/.test(clean) || clean.length < 4) return clean;
  const lower = clean.toLowerCase();
  if (INVARIANT_S_WORDS.has(lower)) return clean;
  if (/[^aeiou]ies$/i.test(clean) && clean.length > 4) return clean.replace(/ies$/i, "y");
  if (/[aeiou]ies$/i.test(clean) && clean.length > 4) return clean.replace(/s$/i, "");
  if (/(ches|shes|xes|zes|sses)$/i.test(clean)) return clean.replace(/es$/i, "");
  if (/s$/i.test(clean) && !/(ss|us|is)$/i.test(clean)) return clean.replace(/s$/i, "");
  return clean;
}

function sourceLabel(item: VocabItem): string {
  const parts = [item.bookTitle, item.chapterTitle].filter(Boolean);
  return parts.length ? parts.join(" · ") : "未记录";
}

function formatAiMessage(text: string): React.ReactNode {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!paragraphs.length) return text;
  return paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>);
}

function findSelectedMark(notes: ReaderNote[], chapterId: string | undefined, selectedText: string, selectedRange: { start: number; end: number } | null): ReaderNote | undefined {
  if (!chapterId || !selectedText.trim()) return undefined;
  if (selectedRange) {
    return notes.find((note) =>
      note.chapterId === chapterId &&
      note.startOffset !== undefined &&
      note.endOffset !== undefined &&
      overlaps(note.startOffset, note.endOffset, selectedRange.start, selectedRange.end)
    );
  }
  return notes.find((note) => note.chapterId === chapterId && note.selectedText.trim() === selectedText.trim());
}

function exactNoteForSelection(notes: ReaderNote[], chapterId: string | undefined, selectedText: string, selectedRange: { start: number; end: number } | null): ReaderNote | undefined {
  if (!chapterId || !selectedText.trim()) return undefined;
  if (selectedRange) {
    return notes.find((note) =>
      note.chapterId === chapterId &&
      note.startOffset === selectedRange.start &&
      note.endOffset === selectedRange.end
    );
  }
  return notes.find((note) => note.chapterId === chapterId && note.selectedText.trim() === selectedText.trim());
}

function notesContainedInSelection(notes: ReaderNote[], chapterId: string | undefined, selectedRange: { start: number; end: number } | null): ReaderNote[] {
  if (!chapterId || !selectedRange) return [];
  return notes.filter((note) =>
    note.chapterId === chapterId &&
    typeof note.startOffset === "number" &&
    typeof note.endOffset === "number" &&
    note.startOffset >= selectedRange.start &&
    note.endOffset <= selectedRange.end
  );
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

function nextNotebookName(notebooks: Notebook[]): string {
  const names = new Set(notebooks.map((item) => item.name));
  let index = 1;
  while (names.has(`新建生词本${index}`)) index += 1;
  return `新建生词本${index}`;
}

function preferredNotebookId(settings: AppSettings, notebooks: Notebook[], bookId?: string): string {
  const preferred = [bookId ? settings.vocabulary.bookDefaults[bookId] : "", settings.vocabulary.lastNotebookId];
  return preferred.find((id) => notebooks.some((notebook) => notebook.id === id)) || notebooks[0]?.id || "";
}

function nextShelfName(shelves: AppSettings["library"]["shelves"]): string {
  const names = new Set(shelves.map((item) => item.name));
  let index = shelves.length + 1;
  while (names.has(`书架 ${index}`)) index += 1;
  return `书架 ${index}`;
}

function normalizeReaderHref(currentHref: string, href: string): string {
  if (/^(https?:|mailto:|file:)/i.test(href)) return href;
  const [pathPart, fragment = ""] = href.split("#");
  const base = currentHref.includes("/") ? currentHref.slice(0, currentHref.lastIndexOf("/") + 1) : "";
  const path = pathPart ? normalizePath(`${base}${pathPart}`) : stripFragment(currentHref);
  return fragment ? `${path}#${fragment}` : path;
}

function normalizePath(value: string): string {
  const stack: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function stripFragment(href: string): string {
  return href.split("#")[0];
}

function toFileUrl(filePath: string): string {
  if (WEB && /^(?:data:image\/|blob:)/i.test(filePath)) return filePath;
  return encodeURI(`file:///${filePath.replace(/\\/g, "/").replace(/^\/+/, "")}`);
}

function configureWebVoice(utterance: SpeechSynthesisUtterance, voiceURI: string) {
  if (!WEB) return;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(item => item.voiceURI === voiceURI) || voices.find(item => /^en/i.test(item.lang) && item.localService) || voices.find(item => /^en/i.test(item.lang));
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
}

createRoot(document.getElementById("root")!).render(<App />);
