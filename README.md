# PDF Warior

A powerful desktop PDF editor built with **Tauri**, **React**, and **TypeScript**. Visually combine, reorder, split, rotate, and flip pages from multiple PDFs — then export a polished merged result.

[![Download Badge](https://img.shields.io/github/v/release/Subhranil-Maity/Pdf-Warior)](https://github.com/Subhranil-Maity/Pdf-Warior/releases/tag/v1.0.0)
![Tauri](https://img.shields.io/badge/Tauri-2.x-blue?logo=tauri)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)
![Rust](https://img.shields.io/badge/Rust-2021-orange?logo=rust)

---

## Demo

https://github.com/user-attachments/assets/fb321e03-d542-450c-bd89-a764a176a791

---

## Features

### Core

- **Open multiple PDFs** — native file picker or drag-and-drop onto the window
- **Page thumbnail sidebar** — fast batch-rendered previews of every loaded page
- **Full-quality preview** — select any page to inspect it at high resolution
- **Drag-and-drop reordering** — arrange pages however you want via sortable drag-and-drop
- **Include / exclude pages** — toggle individual pages on or off (excluded pages show a `SKIP` badge)
- **Toggle all per file** — quickly select or deselect every page in a source file
- **Save / merge** — export only the included pages as a new PDF in their current order

### Page Manipulation

- **Rotate** — 90° increments left or right
- **Flip** — horizontal or vertical flip (long side / short side)
- **Remove** — drop entire PDF groups from the workspace
- **Save individual pages** — export a single page as its own PDF

### History

- **Undo / Redo** — full snapshot-based history for every operation (reorder, rotate, flip, toggle, remove)

### UI / UX

- **Dark theme** — custom dark UI with blur effects and accent colors
- **Skeleton loading** — shimmer animations while thumbnails render
- **Progress bar** — live progress indicator during save operations
- **Drag-drop overlay** — full-screen overlay when dragging files into the window
- **Smart context menus** — right-click menus on file groups and individual pages, positioned to stay in-bounds
- **Dynamic window title** — reflects the current file and page count

---

## Keyboard Shortcuts

| Action       | Shortcut                       |
| ------------ | ------------------------------ |
| Open PDFs    | `Ctrl` / `Cmd` + `O`           |
| Save / Merge | `Ctrl` / `Cmd` + `S`           |
| Undo         | `Ctrl` / `Cmd` + `Z`           |
| Redo         | `Ctrl` / `Cmd` + `Shift` + `Z` |

---

## Tech Stack

| Layer         | Technology                               |
| ------------- | ---------------------------------------- |
| Desktop shell | Tauri 2                                  |
| Backend       | Rust — `lopdf`, `pdfium-render`, `image` |
| Frontend      | React 19 + TypeScript + Vite             |
| State         | Zustand                                  |
| PDF preview   | pdfjs-dist                               |
| Drag-and-drop | @dnd-kit                                 |
| Styling       | CSS Modules                              |
| Font          | Outfit (Google Fonts)                    |

---

## Getting Started

### Prebuilt Binaries

No need to build from source — grab the latest prebuilt binary for your platform from the [**Releases**](https://github.com/Subhranil-Maity/Pdf-Warior/releases) section.

### Build from Source

#### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) (18+)
- [Bun](https://bun.sh/) (or npm / yarn)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

#### Install & Run

```bash
# install dependencies
bun install

# run in development mode
bun run tauri dev

# build for production
bun run tauri build
```

---

## Roadmap — Upcoming Features

- [ ] **PDF compression** — reduce file size with configurable quality settings
- [ ] **Image → PDF** — drag-and-drop images (PNG, JPG, WEBP, etc.) directly into the workspace and have them converted to PDF pages
- [ ] **Page cropping & margins** — adjust visible area of each page
- [ ] **Watermark overlay** — add text or image watermarks to selected pages
- [ ] **Page numbering / headers** — stamp page numbers or custom text onto pages
- [ ] **PDF encryption / password protection** — lock exported PDFs with a password

---

## License

See [LICENSE](LICENSE) for details.

---

**Author:** Subhranil Maity
