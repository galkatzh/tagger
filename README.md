# PDF Tagger

A simple web application that allows users to upload PDF files, annotate them with different types of annotations, and export the annotations as a ZIP file.

## Features

- Upload and display PDF documents
- Navigate through multiple-page PDFs
- Rotate pages to the correct orientation
- Create three types of annotations:
  - **Color**: Annotations with index and grade (both numbers)
  - **Copy**: Annotations with index, grade, and age range (text)
  - **Drawing**: Annotations with body part count (number) and age range (text)
- Drag annotations to reposition them
- Export annotations as a ZIP file containing:
  - Full page images
  - Individual annotation images
  - Annotation metadata in JSON and CSV formats

## How to Use

1. Open the `index.html` file in a modern web browser
2. Upload a PDF file using the "Upload PDF" button
3. Navigate through the PDF using the "Previous" and "Next" buttons
4. Rotate pages if needed using the "Rotate Left" and "Rotate Right" buttons
5. Select an annotation type (Color, Copy, or Drawing)
6. Enter the required properties for the selected annotation type
7. Draw an annotation by clicking and dragging on the PDF
8. Reposition annotations by dragging them
9. Delete annotations using the × button or from the annotations list
10. Click "Export Annotations" to download a ZIP file with all annotations and images

## Requirements

This application runs in the browser and requires no server-side components. It uses the following libraries:

- PDF.js for rendering PDFs
- PDF-LIB.js for PDF manipulation
- JSZip for creating ZIP files
- FileSaver.js for downloading files

All libraries are loaded from CDNs, so an internet connection is required.

## Exporting

Keep the tab open and in the foreground while an export runs. pdf.js paints
pages via `requestAnimationFrame`, which browsers suspend in background tabs;
the export waits for the tab to come back rather than saving unpainted pages.
Every page image is checked for content before it is zipped, and the export
aborts with an error rather than writing a blank page.

`annotations.json` records the provenance needed to reproduce an export from
the source file: per-page zoom, rotation and canvas size, the pdf.js `page.view`
box and intrinsic `/Rotate`, the pdf.js version, and a SHA-256 of the source
bytes. Note that `pageRotations` is absolute, not a delta — pdf.js's
`getViewport({ rotation })` overrides the PDF's own `/Rotate`.

## Tests

```bash
npm install
npx playwright install chromium
npm test
```

The suite builds a fixture PDF of multi-megapixel scanned JPEGs, annotates
three pages, exports, and asserts every `page_*.png` in the zip is actually
painted — once in the foreground and once with the tab hidden.

## Browser Compatibility

This application works in modern browsers that support ES6 features, including:

- Chrome (latest)
- Firefox (latest)
- Edge (latest)
- Safari (latest)

## License

This software is provided as-is under the MIT license.# tagger
# tagger
