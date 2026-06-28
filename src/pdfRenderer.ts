import * as pdfjs from "pdfjs-dist";
import { convertFileSrc } from "@tauri-apps/api/core";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export async function renderPageToObjectUrl(
  filePath: string,
  pageIndex: number,
  targetWidth: number
): Promise<{ url: string; width: number; height: number }> {
  const loadingTask = pdfjs.getDocument({ url: convertFileSrc(filePath) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);

  const viewport = page.getViewport({ scale: 1.0 });
  const scale = targetWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  
  const context = canvas.getContext('2d');
  if (!context) throw new Error("Could not get 2D context");

  const renderContext = {
    canvasContext: context,
    canvas: canvas,
    viewport: scaledViewport
  } as any;

  await page.render(renderContext).promise;

  const url = await new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        reject(new Error("Canvas to Blob failed"));
      }
    }, 'image/png');
  });

  return { url, width: viewport.width, height: viewport.height };
}
