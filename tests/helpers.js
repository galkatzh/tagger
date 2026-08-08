const fs = require('fs');
const JSZip = require('jszip');
const { PNG } = require('pngjs');
const { expect } = require('@playwright/test');
const { FIXTURE_PATH } = require('./global-setup');

// Emulates a backgrounded tab the way browsers really behave: visibilityState
// flips to 'hidden' and requestAnimationFrame callbacks are parked until the
// tab comes back. pdf.js paints from rAF, so this is exactly the condition that
// used to make exports snapshot pre-filled white canvases.
// Call before openApp(); flip with setHidden(page, true/false).
async function installVisibilityControl(page) {
    await page.addInitScript(() => {
        let hidden = false;
        const parked = [];
        const realRequestAnimationFrame = window.requestAnimationFrame.bind(window);

        Object.defineProperty(Document.prototype, 'visibilityState', {
            configurable: true,
            get: () => (hidden ? 'hidden' : 'visible')
        });
        Object.defineProperty(Document.prototype, 'hidden', {
            configurable: true,
            get: () => hidden
        });

        window.requestAnimationFrame = (callback) => {
            if (!hidden) return realRequestAnimationFrame(callback);
            parked.push(callback);
            return -1;
        };

        window.__setHidden = (value) => {
            hidden = value;
            if (!hidden && parked.length) {
                const pending = parked.splice(0);
                realRequestAnimationFrame(timestamp => pending.forEach(cb => cb(timestamp)));
            }
            document.dispatchEvent(new Event('visibilitychange'));
        };
    });
}

// While hidden, drive the page only through page.evaluate: Playwright's own
// actionability polling also rides on requestAnimationFrame.
async function setHidden(page, hidden) {
    await page.evaluate(value => window.__setHidden(value), hidden);
}

// Loads the app with the 54MB instruction video stubbed out and the popup closed.
async function openApp(page) {
    await page.route('**/video.mp4', route => route.abort());
    await page.goto('/index.html');
    await page.waitForFunction(() => !!pdfHandler && !!annotationHandler);
    await page.evaluate(() => {
        const popup = document.getElementById('video-popup');
        if (popup) popup.remove();
    });
}

async function loadFixturePdf(page) {
    await page.setInputFiles('#pdf-upload', FIXTURE_PATH);
    await page.waitForFunction(() => !!pdfHandler.pdfDoc, null, { timeout: 60000 });
    // Settle on a fully rendered page 1 regardless of load-time render timing
    await page.evaluate(() => pdfHandler.gotoPage(1));
}

async function gotoPage(page, pageNum) {
    await page.evaluate(n => pdfHandler.gotoPage(n), pageNum);
}

// Drags a rectangle on the annotation layer and saves it with the default type.
// The drag is dispatched as synthetic mouse events rather than driven through
// page.mouse: the real input queue intermittently stops delivering moves once
// the in-progress rectangle grows under the cursor, which makes the geometry
// (and whether the modal opens at all) non-deterministic.
async function drawAnnotation(page, { x = 60, y = 60, width = 220, height = 160 } = {}) {
    await page.evaluate(({ x, y, width, height }) => {
        const layer = document.getElementById('annotation-layer');
        const rect = layer.getBoundingClientRect();
        const at = (dx, dy) => ({
            clientX: rect.left + dx,
            clientY: rect.top + dy,
            bubbles: true,
            cancelable: true
        });

        layer.dispatchEvent(new MouseEvent('mousedown', at(x, y)));
        layer.dispatchEvent(new MouseEvent('mousemove', at(x + width / 2, y + height / 2)));
        layer.dispatchEvent(new MouseEvent('mousemove', at(x + width, y + height)));
        document.dispatchEvent(new MouseEvent('mouseup', at(x + width, y + height)));
    }, { x, y, width, height });

    await page.locator('#modal-save').click();
    await expect(page.locator('.annotation-modal')).toBeHidden();
}

async function exportZip(page) {
    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#export-annotations').click();
    const download = await downloadPromise;
    const zipPath = await download.path();
    return JSZip.loadAsync(fs.readFileSync(zipPath));
}

// A page image is "blank" when pdf.js pre-filled white and never painted.
function describePng(buffer) {
    const png = PNG.sync.read(buffer);
    const colours = new Set();
    let nonWhite = 0;

    for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b, a] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
        colours.add((r << 24) | (g << 16) | (b << 8) | a);
        if (r !== 255 || g !== 255 || b !== 255 || a !== 255) nonWhite++;
    }

    const pixels = png.width * png.height;
    return {
        width: png.width,
        height: png.height,
        distinctColours: colours.size,
        nonWhiteFraction: nonWhite / pixels
    };
}

async function assertPageImagesArePainted(zip, expectedPages) {
    const pageFiles = Object.keys(zip.files).filter(name => /page_\d+\/page_\d+\.png$/.test(name));
    expect(pageFiles.sort()).toHaveLength(expectedPages.length);

    for (const name of pageFiles) {
        const stats = describePng(await zip.file(name).async('nodebuffer'));
        expect(stats.distinctColours, `${name} distinct colours`).toBeGreaterThan(1);
        expect(stats.nonWhiteFraction, `${name} non-white fraction`).toBeGreaterThan(0.005);
    }
}

module.exports = {
    installVisibilityControl,
    setHidden,
    openApp,
    loadFixturePdf,
    gotoPage,
    drawAnnotation,
    exportZip,
    describePng,
    assertPageImagesArePainted
};
