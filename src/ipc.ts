import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface PageManifestEntry {
  source_file: string;
  source_page_index: number;
  rotation: number;
  flip_horizontal: boolean;
  flip_vertical: boolean;
}

export async function getPageCount(path: string): Promise<number> {
  return invoke('get_page_count', { path });
}

export async function renderPageThumbnail(path: string, pageIndex: number, widthPx: number): Promise<Uint8Array> {
  return invoke('render_page_thumbnail', { path, pageIndex, widthPx });
}

export async function pickSavePath(defaultName: string): Promise<string | null> {
  return invoke('pick_save_path', { defaultName });
}

export async function mergeAndSave(pages: PageManifestEntry[], outPath: string): Promise<void> {
  return invoke('merge_and_save', { pages, outPath });
}

export function listenToMergeProgress(cb: (done: number, total: number) => void) {
  return listen<{ done: number; total: number }>('merge_progress', (event) => {
    cb(event.payload.done, event.payload.total);
  });
}

export function listenToMergeComplete(cb: (outPath: string) => void) {
  return listen<{ out_path: string }>('merge_complete', (event) => {
    cb(event.payload.out_path);
  });
}

export function listenToMergeError(cb: (message: string) => void) {
  return listen<{ message: string }>('merge_error', (event) => {
    cb(event.payload.message);
  });
}
