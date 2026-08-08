# Fix silent blank-page exports in `galkatzh/tagger`

## The bug

`exportAnnotations()` in `js/export.js` (lines 147–174) navigates pages with
`pdfHandler.onNextPage()/onPrevPage()` and then waits a fixed
`await new Promise(r => setTimeout(r, 100))` (line 159) before calling
`pdfHandler.getPageAsImage()` (line 172).

`PDFHandler.renderPage()` in `js/pdfHandler.js` (lines 247–307) returns
`undefined` and resolves rendering inside an un-awaitable
`renderTask.promise.then()` (line 294) with **no `.catch`**. It also assigns
`canvas.width/height` (lines 270–271), which clears the bitmap.

pdf.js fills the canvas opaque `#ffffff` in `CanvasGraphics.beginDrawing`
*before* painting any content, then continues painting via
`requestAnimationFrame`, parking at the `OPS.dependency` operator until the
page's embedded JPEG has been decoded in the worker. So `canvas.toBlob()`
frequently snapshots a pure-white canvas. If the tab is backgrounded during
export, `requestAnimationFrame` is suspended entirely while the `setTimeout`
loop keeps running, and **every** page exports white — with all annotation
metadata still perfect, because annotations are serialised from memory and
never touch the canvas.

Observed in production: 131 of 394 exported page images (33%) are pure white
`RGBA(255,255,255,255)`, across 45 of 116 exams; 32 exams are blank on every
page. The opaque (not transparent) white is the signature that pdf.js's
pre-fill ran and content never followed.

## Do this

1. **`js/pdfHandler.js`** — make `renderPage(num)` `async` and **return** a
   promise that resolves only after `renderTask.promise`. Add `.catch()` on
   both `getPage()` and `renderTask.promise` that resets
   `this.pageRendering = false`, logs, and rethrows. Keep `this._renderTask`,
   and cancel any in-flight task (swallowing `RenderingCancelledException`)
   before starting a new one, so `rotateLeft/rotateRight/setZoom` can no longer
   trigger pdf.js's *"Cannot use the same canvas during multiple render()
   operations"*. Fix lines 261/264/359 to read rotation and zoom from the `num`
   argument, **not** `this.pageNum` — a deferred render currently picks up a
   neighbouring page's settings. Make `queueRenderPage`, `onNextPage`,
   `onPrevPage` return promises and add `async gotoPage(n)` that navigates and
   awaits a full render.

2. **`js/export.js`** — replace the `while` loop + `setTimeout(100)` with
   `await pdfHandler.gotoPage(pageNum)`. Call `getPageAsImage()` **once** per
   page and reuse the blob for both the page PNG and the crops (it is currently
   called twice, lines 172 and 178). Before zipping each page, assert the canvas
   is non-blank (sample `getImageData` on a grid; if every sampled pixel is
   `255,255,255,255`, re-render once, then `throw`) so a failure is loud rather
   than silent.

3. **Guard visibility** — if `document.visibilityState !== 'visible'`, await a
   `visibilitychange` before rendering; show a persistent "keep this tab open
   and in front while exporting" notice plus per-page progress.

4. **Record provenance** in `annotations.json` (`js/export.js` ~line 102):
   `pageZoomLevels`, per-page `canvasWidth/canvasHeight`, per-page pdf.js
   `page.view` viewBox and intrinsic `page.rotate`, the pdf.js version, and a
   SHA-256 of the source file's bytes. Note in the JSON that
   `getViewport({rotation})` **overrides** the PDF's `/Rotate`, so
   `pageRotations` is absolute, not a delta. Without the zoom level the export
   cannot be reproduced from the source without guesswork.

5. Transform stored annotation positions in `rotateLeft()/rotateRight()` the way
   `setZoom()` already does via `rescaleAnnotationsForPage`, so
   `annotation.rotation` can never disagree with `pageRotations`.

## Reproduce before fixing

Serve with `node server.js`, load a PDF whose pages are 3+ MP scanned JPEGs,
draw one box on each of 5 pages, click Export, then immediately switch to
another browser tab for 10 s → every `page_*.png` in the zip is pure white.
Also reproducible in the foreground with DevTools CPU throttling at 6×.

## Verify and regress

Add a Playwright test that loads a fixture scanned PDF, creates annotations on
3 pages, exports, unzips in memory, and asserts each `page_*.png` has more than
one distinct colour and >0.5% non-white pixels — run once in the foreground and
once with the page hidden (`Page.setVisibilityState`). Add a unit test that
`renderPage()` resolves strictly after `renderTask.promise`, and that
`gotoPage(n)` never resolves onto a blank canvas.
