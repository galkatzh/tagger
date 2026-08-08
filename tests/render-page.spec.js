const { test, expect } = require('@playwright/test');
const { openApp, loadFixturePdf } = require('./helpers');

test('renderPage() resolves strictly after renderTask.promise', async ({ page }) => {
    await openApp(page);
    await loadFixturePdf(page);

    const order = await page.evaluate(async () => {
        const events = [];
        const doc = pdfHandler.pdfDoc;
        const originalGetPage = doc.getPage.bind(doc);
        const wrapped = new WeakSet();

        doc.getPage = async (num) => {
            const pdfPage = await originalGetPage(num);
            if (!wrapped.has(pdfPage)) {
                wrapped.add(pdfPage);
                const originalRender = pdfPage.render.bind(pdfPage);
                pdfPage.render = (context) => {
                    const task = originalRender(context);
                    task.promise.then(() => events.push('renderTask'), () => {});
                    return task;
                };
            }
            return pdfPage;
        };

        await pdfHandler.renderPage(2);
        events.push('renderPage');

        doc.getPage = originalGetPage;
        return events;
    });

    expect(order).toEqual(['renderTask', 'renderPage']);
});

test('gotoPage() never resolves onto a blank canvas', async ({ page }) => {
    await openApp(page);
    await loadFixturePdf(page);

    const results = await page.evaluate(async () => {
        const blank = [];
        for (let num = 1; num <= pdfHandler.pageCount; num++) {
            await pdfHandler.gotoPage(num);
            blank.push({ num, isBlank: pdfHandler.isCanvasBlank() });
        }
        return blank;
    });

    expect(results.filter(r => r.isBlank)).toEqual([]);
});

test('rapid rotate/zoom never trips the "same canvas" render error', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') pageErrors.push(message.text());
    });

    await openApp(page);
    await loadFixturePdf(page);

    await page.evaluate(async () => {
        const handler = pdfHandler;
        // Fire these without awaiting, the way impatient clicking does
        handler.rotateRight();
        handler.zoomIn();
        handler.rotateLeft();
        handler.zoomOut();
        await handler.rotateRight();
    });

    await expect
        .poll(() => page.evaluate(() => pdfHandler.pageRendering))
        .toBe(false);

    expect(pageErrors.join('\n')).not.toContain('multiple render');
    expect(await page.evaluate(() => pdfHandler.isCanvasBlank())).toBe(false);
});

test('rotating a page moves its annotations with the canvas', async ({ page }) => {
    await openApp(page);
    await loadFixturePdf(page);

    const result = await page.evaluate(async () => {
        const handler = pdfHandler;
        const annotations = annotationHandler;

        const canvasHeightBefore = handler.canvas.height;
        annotations.annotations.push({
            id: 'test-1',
            type: 'color',
            properties: {},
            page: 1,
            imageName: null,
            rotation: handler.getCurrentPageRotation(),
            position: { x: 100, y: 50, width: 40, height: 20 }
        });

        await handler.rotateRight();
        const [annotation] = annotations.annotations;

        return {
            canvasHeightBefore,
            position: annotation.position,
            annotationRotation: annotation.rotation,
            pageRotation: handler.pageRotations[1]
        };
    });

    // 90° clockwise: (x, y, w, h) -> (H - y - h, x, h, w)
    expect(result.position).toEqual({
        x: result.canvasHeightBefore - 50 - 20,
        y: 100,
        width: 20,
        height: 40
    });
    expect(result.annotationRotation).toBe(result.pageRotation);
    expect(result.pageRotation).toBe(90);
});
