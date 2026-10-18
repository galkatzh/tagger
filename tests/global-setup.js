const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

const TMP_DIR = path.join(__dirname, '.tmp');
const FIXTURE_PATH = path.join(TMP_DIR, 'scanned.pdf');
const PAGE_COUNT = 5;
// Big enough that pdf.js has to decode the JPEG in the worker before it can
// paint — that decode is what the old fixed 100ms wait raced against.
const IMAGE_WIDTH = 2200;
const IMAGE_HEIGHT = 1700;

// Renders a noisy "scan"-like JPEG per page using a headless canvas.
async function makeScanJpegs(count) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
        return await page.evaluate(
            ({ count, width, height }) => {
                const jpegs = [];

                for (let p = 0; p < count; p++) {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    // Off-white paper with per-pixel noise, so no region of the
                    // page is uniformly 255,255,255
                    const imageData = ctx.createImageData(width, height);
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        const shade = 200 + ((i * 7 + p * 13) % 40);
                        imageData.data[i] = shade;
                        imageData.data[i + 1] = shade;
                        imageData.data[i + 2] = shade;
                        imageData.data[i + 3] = 255;
                    }
                    ctx.putImageData(imageData, 0, 0);

                    // Some dark "handwriting" so crops have real content
                    ctx.fillStyle = '#101010';
                    ctx.font = `${Math.round(height / 8)}px sans-serif`;
                    for (let line = 0; line < 6; line++) {
                        ctx.fillText(`page ${p + 1} line ${line}`, 60, (line + 1) * (height / 7));
                    }

                    jpegs.push(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
                }

                return jpegs;
            },
            { count, width: IMAGE_WIDTH, height: IMAGE_HEIGHT }
        );
    } finally {
        await browser.close();
    }
}

module.exports = async function globalSetup() {
    fs.mkdirSync(TMP_DIR, { recursive: true });

    if (fs.existsSync(FIXTURE_PATH)) return;

    const jpegs = await makeScanJpegs(PAGE_COUNT);
    const pdfDoc = await PDFDocument.create();

    for (const base64 of jpegs) {
        const jpeg = await pdfDoc.embedJpg(Buffer.from(base64, 'base64'));
        const page = pdfDoc.addPage([jpeg.width / 3, jpeg.height / 3]);
        page.drawImage(jpeg, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    }

    fs.writeFileSync(FIXTURE_PATH, await pdfDoc.save());
};

module.exports.FIXTURE_PATH = FIXTURE_PATH;
module.exports.PAGE_COUNT = PAGE_COUNT;
