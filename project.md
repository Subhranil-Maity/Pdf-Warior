# PDF Editor — Agent Build Guide

> **For the agent:** Read this entire document before writing a single line of code. Every architectural decision, file path, data model, IPC contract, and implementation order is specified here. Follow the phases in sequence. Do not skip ahead.

---

## 1. What we are building

A desktop application that lets users visually combine, reorder, and split PDF pages from one or more source files and export the result as a new PDF. The app has:

- A **left sidebar** showing small thumbnail previews of every page across all loaded PDFs, with checkboxes (include/exclude) and drag handles (reorder).
- A **main panel** showing a large, full-quality preview of the currently selected page.
- A **top toolbar** with open-file, undo/redo, and save actions.
- A **Rust backend** that opens PDFs, extracts pages in any order, and writes the merged output to a user-chosen path via a native OS save dialog.

---

## 2. Tech stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Tauri | 2.x |
| Backend language | Rust | stable (1.78+) |
| PDF manipulation | lopdf | 0.32 |
| Frontend framework | React | 18 |
| Frontend language | TypeScript | 5.x |
| Build tool | Vite | 5.x |
| State management | Zustand | 4.x |
| PDF preview renderer | pdfjs-dist | 4.x |
| Drag and drop | @dnd-kit/core + sortable | 6.x |
| Styling | Plain CSS modules (no Tailwind) | — |

---

## 3. Repository layout

Create this exact directory structure from the repo root:

```
pdf-editor/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs          # Tauri setup, command registration
│       ├── pdf_ops.rs       # All lopdf logic (open, extract, merge, write)
│       └── errors.rs        # Shared error type
├── src/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Root layout shell
│   ├── store.ts             # Zustand store (single source of truth)
│   ├── ipc.ts               # All invoke() calls, typed wrappers
│   ├── pdfRenderer.ts       # PDF.js worker init + render helpers
│   ├── components/
│   │   ├── Toolbar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── PageThumbnail.tsx
│   │   ├── MainPreview.tsx
│   │   └── SaveDialog.tsx   # thin wrapper around Tauri save dialog
│   └── styles/
│       ├── global.css
│       ├── Toolbar.module.css
│       ├── Sidebar.module.css
│       ├── PageThumbnail.module.css
│       └── MainPreview.module.css
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. Core data model

This is the single most important piece of shared knowledge between the frontend and backend. Get this right first.

### 4.1 Frontend (TypeScript)

Defined in `src/store.ts`:

```typescript
// One entry per page in the working set (across all loaded PDFs)
export interface PageRef {
  id: string;           // nanoid(), stable across reorders
  sourceFile: string;   // absolute path to the source PDF on disk
  sourcePageIndex: number; // 0-based page index within that PDF
  included: boolean;    // whether this page appears in the output
  thumbnailUrl: string | null; // object URL from PDF.js render, null while loading
}

export interface SourceFile {
  path: string;
  pageCount: number;
  color: string;        // one of ~8 preset hex values, assigned round-robin
}

export interface AppState {
  pages: PageRef[];                  // ordered list — this IS the document
  sourceFiles: SourceFile[];
  selectedPageId: string | null;
  history: PageRef[][];              // for undo/redo (snapshot array)
  historyIndex: number;
  isProcessing: boolean;
  processingProgress: number;        // 0–1
}
```

### 4.2 Backend (Rust)

Defined in `src-tauri/src/pdf_ops.rs`:

```rust
// Mirrors the TS PageRef fields the backend actually needs
#[derive(serde::Deserialize)]
pub struct PageManifestEntry {
    pub source_file: String,        // absolute path
    pub source_page_index: u32,     // 0-based
}
```

The backend never knows about `id`, `included`, `thumbnailUrl`, or `color` — those are frontend concerns. The frontend filters to `included === true` and sends only the ordered included pages.

---

## 5. IPC contract

All communication goes through Tauri commands (Rust side, `#[tauri::command]`) invoked from the frontend via `@tauri-apps/api/core`'s `invoke()`. Define typed wrappers for every command in `src/ipc.ts`.

### 5.1 Commands

#### `get_page_count`
```
Input:  { path: string }
Output: number   (u32 on Rust side)
Purpose: Called immediately after a file is opened to know how many PageRef entries to create.
```

#### `render_page_thumbnail`
```
Input:  { path: string, page_index: number, width_px: number }
Output: number[]  (Vec<u8> PNG bytes on Rust side, received as Uint8Array in JS)
Purpose: Rust renders a page to a PNG bitmap using a PDF rendering crate.
         Frontend turns the bytes into a Blob URL and sets thumbnailUrl.
```

> **Important:** For thumbnail rendering in Rust, use `pdfium-render` (wraps Google's PDFium library, pre-built binaries available). Add it to Cargo.toml with feature `"thread_safe"`. On first run the agent must download the correct PDFium binary for the build target and place it in `src-tauri/` alongside the executable. See pdfium-render docs for the `Pdfium::bind_to_library()` call.

#### `pick_save_path`
```
Input:  { default_name: string }
Output: string | null   (null = user cancelled)
Purpose: Shows the native OS "Save As" dialog. Returns chosen absolute path.
         Call this BEFORE merge_and_save so the user picks location first.
```

#### `merge_and_save`
```
Input:  { pages: PageManifestEntry[], out_path: string }
Output: { success: true } | { error: string }
Purpose: Core operation. Rust opens each source PDF, extracts pages in manifest order,
         assembles a new lopdf::Document, saves to out_path.
         Emits progress events (see §5.2) during processing.
```

### 5.2 Events (Rust → Frontend)

Register listeners in `src/ipc.ts` using `@tauri-apps/api/event`'s `listen()`.

```
Event name: "merge_progress"
Payload:    { done: number, total: number }
Purpose:    Frontend updates processingProgress = done / total.

Event name: "merge_complete"
Payload:    { out_path: string }
Purpose:    Frontend shows success toast, clears isProcessing.

Event name: "merge_error"
Payload:    { message: string }
Purpose:    Frontend shows error toast, clears isProcessing.
```

---

## 6. Rust implementation

### 6.1 `Cargo.toml` dependencies

```toml
[dependencies]
tauri = { version = "2", features = ["dialog"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
lopdf = "0.32"
pdfium-render = { version = "0.8", features = ["thread_safe"] }
image = "0.25"         # for PNG encoding of rendered bitmaps
```

### 6.2 `src-tauri/src/errors.rs`

```rust
#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("PDF error: {0}")]
    Pdf(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("Render error: {0}")]
    Render(String),
}

impl From<lopdf::Error> for AppError {
    fn from(e: lopdf::Error) -> Self { Self::Pdf(e.to_string()) }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { Self::Io(e.to_string()) }
}

pub type Result<T> = std::result::Result<T, AppError>;
```

### 6.3 `src-tauri/src/pdf_ops.rs` — key function signatures

```rust
/// Returns the number of pages in a PDF file.
pub fn page_count(path: &str) -> Result<u32>

/// Renders one page to a PNG byte vec at the given pixel width (height auto).
/// Uses pdfium-render. Width typically 140 for thumbnails.
pub fn render_page_to_png(path: &str, page_index: u32, width_px: u32) -> Result<Vec<u8>>

/// Core merge: reads pages from multiple source files in manifest order,
/// writes a new PDF to out_path. Calls progress_cb(done, total) each page.
pub fn merge_pages<F>(
    manifest: &[PageManifestEntry],
    out_path: &str,
    progress_cb: F,
) -> Result<()>
where F: Fn(usize, usize)
```

### 6.4 `merge_pages` implementation notes

lopdf page extraction pattern — do this for each entry in the manifest:

```rust
// Open (or get from cache) the source document
let src_doc = lopdf::Document::load(entry.source_file)?;

// Clone the page object and all its referenced objects
// lopdf::Document::get_page_content returns page dict id
let page_id = src_doc.get_pages()[&(entry.source_page_index + 1)]; // lopdf is 1-based

// Use Document::copy_object_to to copy page + all its referenced
// objects (fonts, images, content streams) into the output document.
// The recommended pattern is to use lopdf::merge::merge_documents or
// build up a new Document using low-level object copy.
```

> **Agent note:** lopdf's high-level merge API (`lopdf::Document::merge`) merges entire documents. To pick individual pages, use the lower-level approach: open each source document, call `document.get_pages()` to get a `BTreeMap<u32, ObjectId>`, copy the target page's object tree into the output doc using a recursive object copy helper, then push the page ID into the output doc's pages array. Reference lopdf's `merge.rs` source for the object copy pattern.

### 6.5 `src-tauri/src/main.rs` — command registration

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_page_count,
            commands::render_page_thumbnail,
            commands::pick_save_path,
            commands::merge_and_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 6.6 `pick_save_path` implementation

```rust
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn pick_save_path(app: tauri::AppHandle, default_name: String) -> Option<String> {
    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("PDF", &["pdf"])
        .blocking_save_file()
        .map(|p| p.to_string_lossy().into_owned())
}
```

---

## 7. Frontend implementation

### 7.1 `src/store.ts` — Zustand store actions

Implement these actions on the store:

```typescript
openFiles(paths: string[]): Promise<void>
  // For each path: call ipc.getPageCount(), create PageRef[] entries,
  // assign SourceFile with round-robin color, trigger thumbnail loading.

loadThumbnailsForFile(path: string, pageCount: number): void
  // Queue ipc.renderPageThumbnail calls (max 4 concurrent),
  // set thumbnailUrl on each PageRef as they resolve.

reorderPages(fromIndex: number, toIndex: number): void
  // Push snapshot to history before mutating, then arrayMove pages[].

togglePageIncluded(id: string): void
  // Push snapshot to history, toggle included.

undo(): void
redo(): void

save(): Promise<void>
  // 1. Call ipc.pickSavePath("merged.pdf")
  // 2. If null, return (cancelled)
  // 3. Set isProcessing = true
  // 4. Build manifest from pages.filter(p => p.included)
  // 5. Call ipc.mergeAndSave(manifest, path)
  // (merge_complete / merge_error events handle the rest)
```

### 7.2 `src/pdfRenderer.ts` — PDF.js setup

```typescript
import * as pdfjs from "pdfjs-dist";

// Point to the worker bundled by Vite
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export async function renderPageToObjectUrl(
  filePath: string,         // absolute path — use Tauri's convertFileSrc()
  pageIndex: number,        // 0-based
  targetWidth: number       // px
): Promise<string> {
  // Use pdfjs.getDocument({ url: convertFileSrc(filePath) })
  // Render page to an OffscreenCanvas at targetWidth
  // Return URL.createObjectURL(blob)
}
```

> **Note:** `convertFileSrc()` from `@tauri-apps/api/core` converts an absolute filesystem path to a Tauri asset URL (`asset://`) that PDF.js can fetch. Make sure `"asset"` protocol is enabled in `tauri.conf.json` under `allowlist.protocol` (Tauri 2: `app.security.assetProtocol.enable: true, scope: ["**"]`).

### 7.3 `src/components/Sidebar.tsx` — structure

```
<aside class="sidebar">
  <button onClick={openFiles}>+ Add PDF</button>

  {sourceFiles.map(sf => (
    <div class="file-group" style={{ borderColor: sf.color }}>
      <span class="file-name">{basename(sf.path)}</span>
      <button onClick={() => toggleAllForFile(sf.path)}>all / none</button>
    </div>
  ))}

  <DndContext onDragEnd={handleDragEnd}>
    <SortableContext items={pages.map(p => p.id)}>
      {pages.map((page, i) => (
        <PageThumbnail key={page.id} page={page} index={i} />
      ))}
    </SortableContext>
  </DndContext>
</aside>
```

### 7.4 `src/components/PageThumbnail.tsx` — structure

```
<div
  class={["thumb", !page.included && "excluded"].join(" ")}
  onClick={() => selectPage(page.id)}
  style={{ borderColor: sourceColor }}
>
  <input
    type="checkbox"
    checked={page.included}
    onChange={() => togglePageIncluded(page.id)}
  />
  {/* drag handle icon — CSS cursor: grab */}
  <div class="drag-handle" {...listeners} {...attributes}>⠿</div>
  {page.thumbnailUrl
    ? <img src={page.thumbnailUrl} alt={`Page ${index + 1}`} />
    : <div class="thumb-skeleton" />}
  <span class="page-num">{index + 1}</span>
</div>
```

When `page.included === false`, render the thumbnail at 50% opacity with a strikethrough badge.

### 7.5 `src/components/MainPreview.tsx`

Renders the selected page at full quality (~1200px wide). Call `renderPageToObjectUrl` with `targetWidth: 1200` when `selectedPageId` changes. Show a spinner while loading. Keyboard handlers:

- `ArrowRight` / `ArrowDown` → select next page
- `ArrowLeft` / `ArrowUp` → select previous page

### 7.6 `src/components/Toolbar.tsx`

```
[Open PDF(s)]  [|]  [Undo] [Redo]  [|]  [Save →]
                                          disabled if pages.length === 0
```

"Open PDF(s)" calls Tauri's `open` dialog with `multiple: true, filters: [{name:"PDF",extensions:["pdf"]}]` then dispatches `store.openFiles(paths)`.

---

## 8. State flow walkthrough

This traces a complete user session so the agent can verify correctness.

```
1. App starts → store initializes with empty pages[], sourceFiles[]

2. User clicks "Open PDF(s)"
   → Tauri open dialog → user picks 2 PDFs: /a/foo.pdf, /b/bar.pdf
   → store.openFiles(["/a/foo.pdf", "/b/bar.pdf"])
     → ipc.getPageCount("/a/foo.pdf") → 3
     → ipc.getPageCount("/b/bar.pdf") → 5
     → sourceFiles = [{path:"/a/foo.pdf", pageCount:3, color:"#4A90D9"}, {path:"/b/bar.pdf", pageCount:5, color:"#E57373"}]
     → pages = [
         {id:"a1", sourceFile:"/a/foo.pdf", sourcePageIndex:0, included:true, thumbnailUrl:null},
         {id:"a2", sourceFile:"/a/foo.pdf", sourcePageIndex:1, included:true, thumbnailUrl:null},
         {id:"a3", sourceFile:"/a/foo.pdf", sourcePageIndex:2, included:true, thumbnailUrl:null},
         {id:"b1", sourceFile:"/b/bar.pdf", sourcePageIndex:0, included:true, thumbnailUrl:null},
         ... 5 more from bar.pdf
       ]
     → thumbnail loading begins (queued, max 4 concurrent)
     → selectedPageId = "a1"

3. Thumbnails load in → each PageRef's thumbnailUrl is set → Sidebar renders images

4. User drags page id:"b1" from position 3 to position 0
   → store.reorderPages(3, 0)
   → snapshot pushed to history
   → pages = [b1, a1, a2, a3, b2, b3, b4, b5]

5. User unchecks page id:"a2"
   → store.togglePageIncluded("a2")
   → pages[2].included = false
   → thumbnail renders at 50% opacity

6. User clicks "Save →"
   → ipc.pickSavePath("merged.pdf") → "/Users/alice/Desktop/output.pdf"
   → store.isProcessing = true
   → manifest = [
       {source_file:"/b/bar.pdf", source_page_index:0},
       {source_file:"/a/foo.pdf", source_page_index:0},
       // a2 skipped (included:false)
       {source_file:"/a/foo.pdf", source_page_index:2},
       {source_file:"/b/bar.pdf", source_page_index:1},
       ...
     ]
   → ipc.mergeAndSave(manifest, "/Users/alice/Desktop/output.pdf")
   → Rust processes, emits merge_progress events
   → Frontend updates progress bar
   → merge_complete event → toast "Saved to /Users/alice/Desktop/output.pdf"
   → isProcessing = false
```

---

## 9. `tauri.conf.json` — critical settings

```json
{
  "build": {
    "beforeDevCommand": "bun run dev",
    "beforeBuildCommand": "bun run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "PDF Editor",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true
      }
    ],
    "security": {
      "assetProtocol": {
        "enable": true,
        "scope": ["**"]
      }
    }
  },
  "plugins": {
    "dialog": {}
  }
}
```

---

## 10. Visual design spec

Keep styling minimal and functional. No component library — plain CSS modules.

### 10.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Toolbar (48px, border-bottom)                               │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  Sidebar     │   Main Preview                                │
│  (260px)     │   (flex: 1, overflow: auto)                   │
│  overflow-y  │                                               │
│  : auto      │                                               │
│              │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

### 10.2 Page thumbnail card (in sidebar)

- Width: 220px, height: auto (aspect ratio preserved)
- Thumbnail image: 200px wide, shadow: `0 1px 3px rgba(0,0,0,.15)`
- Left border: 3px solid `sourceFile.color`
- Unchecked state: `opacity: 0.4`, overlay badge "SKIP" in red
- Selected state (= shown in main preview): background `#f0f4ff`
- Drag active: `box-shadow: 0 8px 24px rgba(0,0,0,.2)`, slight scale up

### 10.3 Color palette for source file groups

Cycle through in order:
```
["#4A90D9", "#E57373", "#66BB6A", "#FFA726", "#AB47BC", "#26C6DA", "#8D6E63", "#EC407A"]
```

---

## 11. Build & run instructions (for the agent to verify at the end)

```bash
# 1. Install JS dependencies
bun install

# 2. Download PDFium binary (pdfium-render requirement)
# The pdfium-render crate fetches this automatically on first build
# via its build.rs if the PDFIUM_DYNAMIC_LIB_PATH env var is unset.
# Alternatively: cargo pdfium-render download (if CLI installed)

# 3. Dev mode
bun run tauri dev

# 4. Production build
bun run tauri build
# Output: src-tauri/target/release/bundle/
```

---

## 12. Implementation order (phases)

Follow this exact order. Do not proceed to the next phase until the current one compiles and runs.

### Phase 1 — Scaffold
1. `bun create tauri-app@latest pdf-editor -- --template react-ts`
2. Add all Cargo.toml dependencies
3. Add all bun dependencies
4. Create the full directory structure (empty files are fine)
5. Verify `bun run tauri dev` opens a blank window 

### Phase 2 — IPC skeleton
1. Implement `get_page_count` command (lopdf only, no rendering)
2. Implement `pick_save_path` command
3. Write `src/ipc.ts` with typed wrappers for all commands
4. Add placeholder `merge_and_save` that just logs the manifest
5. Verify commands are callable from the browser console

### Phase 3 — Store + file open
1. Implement full Zustand store with `openFiles` action
2. Wire Toolbar "Open PDF(s)" button
3. Verify `pages[]` and `sourceFiles[]` populate correctly after opening files
4. No rendering yet — thumbnailUrl stays null

### Phase 4 — Thumbnail rendering
1. Implement `render_page_thumbnail` command using pdfium-render
2. Implement `src/pdfRenderer.ts` PDF.js helpers
3. Implement thumbnail loading queue in store
4. Implement `PageThumbnail` component
5. Implement `Sidebar` component with static list (no DnD yet)
6. Verify thumbnails appear in sidebar

### Phase 5 — Main preview
1. Implement `MainPreview` component (full-quality render via PDF.js)
2. Wire selectedPageId changes to re-render
3. Add keyboard navigation
4. Verify clicking a thumbnail shows it in the main area

### Phase 6 — Drag and drop + checkbox
1. Add @dnd-kit wrappers to Sidebar
2. Wire reorderPages action to drag end
3. Wire togglePageIncluded to checkbox
4. Implement undo/redo (snapshot history)
5. Verify reorder persists and undo works

### Phase 7 — Rust merge + save
1. Implement `merge_pages` in `pdf_ops.rs` using lopdf page copy
2. Implement full `merge_and_save` Tauri command with progress events
3. Wire frontend save flow: pick path → merge → listen for events → toast
4. Implement progress bar in Toolbar during processing
5. Verify a real merged PDF opens correctly in a PDF viewer

### Phase 8 — Polish
1. Error handling: corrupt PDF, password-protected PDF, write permission denied
2. Empty state: show "Open a PDF to get started" when pages[] is empty
3. Keyboard shortcuts: ⌘O (open), ⌘S (save), ⌘Z (undo), ⌘⇧Z (redo)
4. Window title: "PDF Editor — {file count} files, {page count} pages"
5. Disable Save button when all pages are unchecked
6. Add app icon (512×512 PNG → src-tauri/icons/)

---

## 13. Known gotchas

| Issue | Fix |
|---|---|
| PDF.js can't load `file://` URLs in Tauri | Use `convertFileSrc(path)` from `@tauri-apps/api/core` to get an `asset://` URL |
| lopdf page indices are 1-based | `get_pages()` returns `BTreeMap<u32, ObjectId>` where keys start at 1. Subtract 1 from user-facing indices or add 1 when looking up. |
| pdfium-render needs the PDFium binary at runtime | The `.so`/`.dll`/`.dylib` must be in the same directory as the executable in production. Tauri's bundler copies files listed in `tauri.conf.json` → `bundle.resources`. |
| DnD and checkboxes conflict | Put the checkbox's `onClick` handler with `e.stopPropagation()` to prevent the drag activation from firing. |
| Large PDFs cause UI freeze during thumbnail load | Use a concurrency-limited queue (4 at a time) and `Promise.all` batches. Never fire all renders simultaneously. |
| Tauri asset protocol scope | `scope: ["**"]` is required to load PDFs from arbitrary paths. In production, consider tightening to the user's home directory. |
| lopdf merge corrupts some PDFs | Some PDFs use object streams (compressed xref). Call `document.decompress()` on each source document before extracting pages. |

---

## 14. Out of scope (do not implement)

- PDF annotation editing
- Text extraction or search
- Password-protected PDF support
- Cloud storage / auto-save
- Page rotation (can be added in v2)
- Undo/redo across save operations