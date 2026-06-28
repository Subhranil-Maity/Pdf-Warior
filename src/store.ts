import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { getPageCount, pickSavePath, mergeAndSave } from './ipc';
import { renderPageToObjectUrl } from './pdfRenderer';

export interface PageRef {
  id: string;
  sourceFile: string;
  sourcePageIndex: number;
  included: boolean;
  thumbnailUrl: string | null;
}

export interface SourceFile {
  path: string;
  pageCount: number;
  color: string;
}

export interface AppState {
  pages: PageRef[];
  sourceFiles: SourceFile[];
  selectedPageId: string | null;
  history: PageRef[][];
  historyIndex: number;
  isProcessing: boolean;
  processingProgress: number;

  openFiles: (paths: string[]) => Promise<void>;
  loadThumbnailsForFile: (path: string, pageCount: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  togglePageIncluded: (id: string) => void;
  toggleAllForFile: (path: string) => void;
  selectPage: (id: string) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  setIsProcessing: (isProcessing: boolean) => void;
  setProcessingProgress: (progress: number) => void;
}

const COLORS = ["#4A90D9", "#E57373", "#66BB6A", "#FFA726", "#AB47BC", "#26C6DA", "#8D6E63", "#EC407A"];

function pushState(state: AppState, newPages: PageRef[]) {
  const currentHistory = state.history.slice(0, state.historyIndex + 1);
  currentHistory.push(state.pages);
  return {
    history: currentHistory,
    historyIndex: currentHistory.length - 1,
    pages: newPages,
  };
}

export const useStore = create<AppState>((set, get) => ({
  pages: [],
  sourceFiles: [],
  selectedPageId: null,
  history: [],
  historyIndex: -1,
  isProcessing: false,
  processingProgress: 0,

  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setProcessingProgress: (processingProgress) => set({ processingProgress }),

  openFiles: async (paths: string[]) => {
    const { sourceFiles, pages } = get();
    const newSourceFiles = [...sourceFiles];
    const newPages = [...pages];
    let nextColorIndex = sourceFiles.length % COLORS.length;

    for (const path of paths) {
      if (newSourceFiles.some(sf => sf.path === path)) continue;

      const count = await getPageCount(path);
      const color = COLORS[nextColorIndex];
      nextColorIndex = (nextColorIndex + 1) % COLORS.length;

      newSourceFiles.push({ path, pageCount: count, color });

      for (let i = 0; i < count; i++) {
        newPages.push({
          id: nanoid(),
          sourceFile: path,
          sourcePageIndex: i,
          included: true,
          thumbnailUrl: null,
        });
      }
      
      get().loadThumbnailsForFile(path, count);
    }

    set((state) => ({
      ...pushState(state, newPages),
      sourceFiles: newSourceFiles,
      selectedPageId: state.selectedPageId || (newPages.length > 0 ? newPages[0].id : null)
    }));
  },

  loadThumbnailsForFile: async (path: string, pageCount: number) => {
    const concurrencyLimit = 4;
    for (let i = 0; i < pageCount; i += concurrencyLimit) {
      const batch = Array.from({ length: Math.min(concurrencyLimit, pageCount - i) }, (_, idx) => i + idx);
      
      await Promise.all(batch.map(async (pageIndex) => {
        try {
          const url = await renderPageToObjectUrl(path, pageIndex, 200);
          
          set((state) => ({
            pages: state.pages.map(p => 
              (p.sourceFile === path && p.sourcePageIndex === pageIndex) 
                ? { ...p, thumbnailUrl: url } 
                : p
            )
          }));
        } catch (e) {
          console.error(`Failed to load thumbnail for ${path} page ${pageIndex}`, e);
        }
      }));
    }
  },

  reorderPages: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const newPages = [...state.pages];
      const [moved] = newPages.splice(fromIndex, 1);
      newPages.splice(toIndex, 0, moved);
      return pushState(state, newPages);
    });
  },

  togglePageIncluded: (id: string) => {
    set((state) => {
      const newPages = state.pages.map(p => p.id === id ? { ...p, included: !p.included } : p);
      return pushState(state, newPages);
    });
  },

  toggleAllForFile: (path: string) => {
    set((state) => {
      const allIncluded = state.pages.filter(p => p.sourceFile === path).every(p => p.included);
      const newPages = state.pages.map(p => p.sourceFile === path ? { ...p, included: !allIncluded } : p);
      return pushState(state, newPages);
    });
  },

  selectPage: (id: string) => set({ selectedPageId: id }),

  undo: () => {
    set((state) => {
      if (state.historyIndex >= 0) {
        const prevPages = state.history[state.historyIndex];
        return {
          historyIndex: state.historyIndex - 1,
          pages: prevPages,
        };
      }
      return state;
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex + 1 < state.history.length) {
        const nextPages = state.history[state.historyIndex + 1];
        return {
          historyIndex: state.historyIndex + 1,
          pages: nextPages,
        };
      }
      return state;
    });
  },

  save: async () => {
    const { pages } = get();
    const manifest = pages
      .filter(p => p.included)
      .map(p => ({
        source_file: p.sourceFile,
        source_page_index: p.sourcePageIndex,
      }));

    if (manifest.length === 0) return;

    const path = await pickSavePath("merged.pdf");
    if (!path) return;

    set({ isProcessing: true, processingProgress: 0 });

    try {
      await mergeAndSave(manifest, path);
    } catch (e) {
      console.error(e);
      set({ isProcessing: false });
    }
  },
}));
