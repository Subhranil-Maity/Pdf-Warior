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
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  width?: number;
  height?: number;
}

export interface SourceFile {
  path: string;
  pageCount: number;
  color: string;
}

export interface ContextMenuState {
  x: number;
  y: number;
  type: 'group' | 'page';
  filePath: string;
  pageId?: string;
  pageIndex?: number;
}

export interface AppState {
  pages: PageRef[];
  sourceFiles: SourceFile[];
  selectedPageId: string | null;
  history: PageRef[][];
  historyIndex: number;
  isProcessing: boolean;
  processingProgress: number;
  contextMenu: ContextMenuState | null;

  openFiles: (paths: string[]) => Promise<void>;
  loadThumbnailsForFile: (path: string, pageCount: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  togglePageIncluded: (id: string) => void;
  toggleAllForFile: (path: string) => void;
  removeFileGroup: (path: string) => void;
  selectPage: (id: string) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  setIsProcessing: (isProcessing: boolean) => void;
  setProcessingProgress: (progress: number) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  rotatePage: (id: string, direction: 'left' | 'right') => void;
  flipPage: (id: string, axis: 'long' | 'short') => void;
  savePageIndividually: (id: string) => Promise<void>;
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
  contextMenu: null,

  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setProcessingProgress: (processingProgress) => set({ processingProgress }),
  setContextMenu: (contextMenu) => set({ contextMenu }),

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
          rotation: 0,
          flipHorizontal: false,
          flipVertical: false,
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
          const { url, width, height } = await renderPageToObjectUrl(path, pageIndex, 200);
          
          set((state) => ({
            pages: state.pages.map(p => 
              (p.sourceFile === path && p.sourcePageIndex === pageIndex) 
                ? { ...p, thumbnailUrl: url, width, height } 
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
        rotation: p.rotation || 0,
        flip_horizontal: p.flipHorizontal || false,
        flip_vertical: p.flipVertical || false,
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

  savePageIndividually: async (id: string) => {
    const { pages } = get();
    const page = pages.find(p => p.id === id);
    if (!page) return;

    const manifest = [{
      source_file: page.sourceFile,
      source_page_index: page.sourcePageIndex,
      rotation: page.rotation || 0,
      flip_horizontal: page.flipHorizontal || false,
      flip_vertical: page.flipVertical || false,
    }];

    const basename = (p: string) => p.split(/[\\/]/).pop() || p;
    const fileBase = basename(page.sourceFile).replace(/\.pdf$/i, '');
    const defaultName = `${fileBase}_page_${page.sourcePageIndex + 1}.pdf`;

    const path = await pickSavePath(defaultName);
    if (!path) return;

    set({ isProcessing: true, processingProgress: 0 });

    try {
      await mergeAndSave(manifest, path);
    } catch (e) {
      console.error(e);
      set({ isProcessing: false });
    }
  },

  rotatePage: (id: string, direction: 'left' | 'right') => {
    set((state) => {
      const newPages = state.pages.map(p => {
        if (p.id !== id) return p;
        const currentRotation = p.rotation || 0;
        const delta = direction === 'left' ? -90 : 90;
        const rotation = (currentRotation + delta + 360) % 360;
        return { ...p, rotation };
      });
      return pushState(state, newPages);
    });
  },

  flipPage: (id: string, axis: 'long' | 'short') => {
    set((state) => {
      const newPages = state.pages.map(p => {
        if (p.id !== id) return p;

        const width = p.width || 3;
        const height = p.height || 4;
        const currentRotation = p.rotation || 0;

        const isPortrait = (currentRotation === 0 || currentRotation === 180)
          ? (width <= height)
          : (width > height);

        let flipHorizontal = p.flipHorizontal || false;
        let flipVertical = p.flipVertical || false;

        if (axis === 'long') {
          if (isPortrait) {
            flipHorizontal = !flipHorizontal;
          } else {
            flipVertical = !flipVertical;
          }
        } else {
          if (isPortrait) {
            flipVertical = !flipVertical;
          } else {
            flipHorizontal = !flipHorizontal;
          }
        }

        return { ...p, flipHorizontal, flipVertical };
      });
      return pushState(state, newPages);
    });
  },

  removeFileGroup: (path: string) => {
    set((state) => {
      const newSourceFiles = state.sourceFiles.filter(sf => sf.path !== path);
      const newPages = state.pages.filter(p => p.sourceFile !== path);
      
      let nextSelectedPageId = state.selectedPageId;
      if (state.selectedPageId) {
        const selectedPage = state.pages.find(p => p.id === state.selectedPageId);
        if (selectedPage && selectedPage.sourceFile === path) {
          nextSelectedPageId = newPages.length > 0 ? newPages[0].id : null;
        }
      }

      const historyUpdate = pushState(state, newPages);

      return {
        ...historyUpdate,
        sourceFiles: newSourceFiles,
        selectedPageId: nextSelectedPageId
      };
    });
  },
}));
