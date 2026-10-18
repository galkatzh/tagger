const fs = require('fs');
const JSZip = require('jszip');
const { test, expect } = require('@playwright/test');
const {
    installVisibilityControl,
    setHidden,
    openApp,
    loadFixturePdf,
    gotoPage,
    drawAnnotation,
    exportZip,
    assertPageImagesArePainted
} = require('./helpers');

const ANNOTATED_PAGES = [1, 2, 3];

async function annotatePages(page) {
    for (const pageNum of ANNOTATED_PAGES) {
        await gotoPage(page, pageNum);
        await drawAnnotation(page, { x: 40 + pageNum * 10, y: 40 + pageNum * 10 });
    }

    await expect
        .poll(() => page.evaluate(() => annotationHandler.getAllAnnotations().length))
        .toBe(ANNOTATED_PAGES.length);
}

test('exported page images are painted, not blank', async ({ page }) => {
    await openApp(page);
    await loadFixturePdf(page);
    await annotatePages(page);

    const zip = await exportZip(page);
    await assertPageImagesArePainted(zip, ANNOTATED_PAGES);
});

test('export never yields blank pages when the tab is hidden', async ({ page }) => {
    await installVisibilityControl(page);
    await openApp(page);
    await loadFixturePdf(page);
    await annotatePages(page);

    await setHidden(page, true);

    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    await page.evaluate(() => document.getElementById('export-annotations').click());

    // While hidden, pdf.js cannot paint (requestAnimationFrame is parked), so
    // the export must wait rather than snapshot white canvases.
    await page.waitForTimeout(3000);
    const stillExporting = await page.evaluate(() => {
        const notice = document.getElementById('export-notice');
        return !!notice && notice.style.display === 'block';
    });
    expect(stillExporting).toBe(true);

    await setHidden(page, false);

    const download = await downloadPromise;
    const zip = await JSZip.loadAsync(fs.readFileSync(await download.path()));

    await assertPageImagesArePainted(zip, ANNOTATED_PAGES);
});

test('a page that will not paint aborts the export instead of zipping white', async ({ page }) => {
    await openApp(page);
    await loadFixturePdf(page);
    await annotatePages(page);

    const alerts = [];
    page.on('dialog', async dialog => {
        alerts.push(dialog.message());
        await dialog.dismiss();
    });

    // Simulate a canvas that stays unpainted no matter how often we re-render
    await page.evaluate(() => { pdfHandler.isCanvasBlank = () => true; });

    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.locator('#export-annotations').click();

    await expect.poll(() => alerts.length).toBeGreaterThan(0);
    expect(alerts[0]).toContain('blank canvas');
    expect(downloaded).toBe(false);

    // The banner is cleared and the button re-enabled after a failed export
    await expect(page.locator('#export-annotations')).toBeEnabled();
});

test('annotations.json records the provenance needed to reproduce the export', async ({ page }) => {
    await openApp(page);
    await loadFixturePdf(page);
    await annotatePages(page);

    const zip = await exportZip(page);
    const data = JSON.parse(await zip.file('annotations.json').async('string'));

    expect(data.source.pdfjsVersion).toBeTruthy();
    expect(data.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(data.pageZoomLevels).toBeDefined();

    for (const pageNum of ANNOTATED_PAGES) {
        const provenance = data.pages[pageNum];
        expect(provenance.canvasWidth).toBeGreaterThan(0);
        expect(provenance.canvasHeight).toBeGreaterThan(0);
        expect(provenance.zoom).toBeGreaterThan(0);
        expect(provenance.view).toHaveLength(4);
        expect(typeof provenance.intrinsicRotate).toBe('number');
    }

    // pageRotations is absolute because getViewport({rotation}) overrides /Rotate
    expect(data.notes.pageRotations).toContain('Absolute');
});
