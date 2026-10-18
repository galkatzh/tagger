class PDFHandler {
    constructor() {
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageCount = 0;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.minScale = 0.5;   // Minimum zoom level
        this.maxScale = 3.0;   // Maximum zoom level
        this.defaultScale = 1.5; // Default zoom level
        this.pageZoomLevels = {}; // Store zoom level for each page individually
        this.pageCanvasSizes = {}; // Canvas size each page's annotations are expressed in
        this.canvas = document.getElementById('pdf-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.pageRotations = {}; // Store rotation for each page individually
        this.pdfData = null;
        this.pdfFilename = null; // Store the PDF filename
        this.pdfSha256 = null;   // SHA-256 of the source file's bytes
        this.pdfByteLength = null;
        this._renderTask = null; // In-flight pdf.js RenderTask, if any

        // Image folder mode state
        this.mode = 'pdf'; // 'pdf' or 'images'
        this.imageFiles = []; // Array of { name, blob, image: HTMLImageElement }
        this.folderName = null;

        // Page navigation elements
        this.prevButton = document.getElementById('prev-page');
        this.nextButton = document.getElementById('next-page');
        this.pageInfo = document.getElementById('page-info');
        this.rotationInfo = document.getElementById('rotation-info');

        // Rotation controls
        this.rotateLeftButton = document.getElementById('rotate-left');
        this.rotateRightButton = document.getElementById('rotate-right');
        
        // Zoom controls
        this.zoomInButton = document.getElementById('zoom-in');
        this.zoomOutButton = document.getElementById('zoom-out');
        this.zoomResetButton = document.getElementById('zoom-reset');
        this.zoomInfo = document.getElementById('zoom-info');

        // Initialize event listeners
        this.initEventListeners();
    }

    initEventListeners() {
        // Page navigation listeners
        this.prevButton.addEventListener('click', () => this.reportRenderError(this.onPrevPage()));
        this.nextButton.addEventListener('click', () => this.reportRenderError(this.onNextPage()));

        // Rotation listeners
        this.rotateLeftButton.addEventListener('click', () => this.reportRenderError(this.rotateLeft()));
        this.rotateRightButton.addEventListener('click', () => this.reportRenderError(this.rotateRight()));

        // Zoom listeners
        this.zoomInButton.addEventListener('click', () => this.reportRenderError(this.zoomIn()));
        this.zoomOutButton.addEventListener('click', () => this.reportRenderError(this.zoomOut()));
        this.zoomResetButton.addEventListener('click', () => this.reportRenderError(this.zoomReset()));

        // PDF upload listener - improved to respond to clicks anywhere on the button
        const pdfUploadInput = document.getElementById('pdf-upload');
        const uploadButton = document.getElementById('pdf-upload-button');
        
        // Direct change event on the input
        pdfUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && file.type === 'application/pdf') {
                this.loadPDF(file);
            }
        });
        
        // Add click event on the entire button to trigger file input
        uploadButton.addEventListener('click', (event) => {
            // Stop any potential event propagation issues
            event.preventDefault();
            event.stopPropagation();

            // Explicitly click the input to ensure the file dialog opens
            pdfUploadInput.click();
        });

        // Folder upload listener
        const folderUploadInput = document.getElementById('folder-upload');
        const folderUploadButton = document.getElementById('folder-upload-button');

        folderUploadInput.addEventListener('change', (event) => {
            const files = Array.from(event.target.files || []);
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                this.loadImageFolder(imageFiles);
            } else {
                alert('No image files found in the selected folder.');
            }
            // Reset input so selecting the same folder again re-triggers change
            folderUploadInput.value = '';
        });

        folderUploadButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            folderUploadInput.click();
        });
        
        // Keyboard shortcuts for zoom
        document.addEventListener('keydown', (event) => {
            // Check if Ctrl/Cmd key is pressed
            if ((event.ctrlKey || event.metaKey) && this.hasContent()) {
                if (event.key === '+' || event.key === '=') {
                    // Zoom in with Ctrl/Cmd +
                    event.preventDefault();
                    this.reportRenderError(this.zoomIn());
                } else if (event.key === '-') {
                    // Zoom out with Ctrl/Cmd -
                    event.preventDefault();
                    this.reportRenderError(this.zoomOut());
                } else if (event.key === '0') {
                    // Reset zoom with Ctrl/Cmd 0
                    event.preventDefault();
                    this.reportRenderError(this.zoomReset());
                }
            }
        });

        // Mouse wheel zoom when Ctrl/Cmd is pressed
        this.canvas.addEventListener('wheel', (event) => {
            if ((event.ctrlKey || event.metaKey) && this.hasContent()) {
                event.preventDefault();
                if (event.deltaY < 0) {
                    // Zoom in on scroll up
                    this.reportRenderError(this.zoomIn());
                } else {
                    // Zoom out on scroll down
                    this.reportRenderError(this.zoomOut());
                }
            }
        }, { passive: false });
    }

    // Returns true if a PDF or image folder is currently loaded
    hasContent() {
        return this.mode === 'images' ? this.imageFiles.length > 0 : !!this.pdfDoc;
    }

    // Logs render failures from fire-and-forget UI handlers. Cancellations are
    // expected whenever a newer render supersedes an older one.
    reportRenderError(maybePromise) {
        if (!maybePromise || typeof maybePromise.catch !== 'function') return maybePromise;
        return maybePromise.catch((error) => {
            if (!this.isRenderingCancelled(error)) {
                console.error('Render failed:', error);
            }
        });
    }

    isRenderingCancelled(error) {
        return !!error && error.name === 'RenderingCancelledException';
    }

    loadPDF(file) {
        const fileReader = new FileReader();

        // Store the filename
        this.pdfFilename = file.name;

        fileReader.onload = async (event) => {
            this.pdfData = new Uint8Array(event.target.result);
            this.pdfByteLength = this.pdfData.byteLength;

            // Hash the bytes before handing them to pdf.js, which may transfer
            // (and thereby detach) the underlying buffer.
            this.pdfSha256 = await this.sha256Hex(this.pdfData);

            try {
                // Load PDF using PDF.js
                const loadingTask = pdfjsLib.getDocument({ data: this.pdfData });
                this.pdfDoc = await loadingTask.promise;
                this.pageCount = this.pdfDoc.numPages;

                this.mode = 'pdf';
                this.imageFiles = [];
                this.folderName = null;

                // Reset page navigation, rotation, and zoom
                this.pageNum = 1;
                this.pageRotations = {}; // Reset rotations when loading a new PDF
                this.pageZoomLevels = {}; // Reset zoom levels when loading a new PDF
                this.pageCanvasSizes = {};
                this.updatePageInfo();

                // Enable navigation buttons
                this.prevButton.disabled = this.pageNum <= 1;
                this.nextButton.disabled = this.pageNum >= this.pageCount;

                // Reset annotations when loading a new PDF
                annotationHandler.clearAnnotations();

                // Render the first page
                await this.renderPage(this.pageNum);

                console.log('PDF loaded successfully');
            } catch (error) {
                console.error('Error loading PDF:', error);
            }
        };

        fileReader.readAsArrayBuffer(file);
    }

    async loadImageFolder(files) {
        // Sort by relative path / name so order is deterministic
        const sorted = files.slice().sort((a, b) => {
            const pa = a.webkitRelativePath || a.name;
            const pb = b.webkitRelativePath || b.name;
            return pa.localeCompare(pb, undefined, { numeric: true, sensitivity: 'base' });
        });

        // Derive a folder name from the first file's relative path, if available
        const firstPath = sorted[0].webkitRelativePath || '';
        const slashIdx = firstPath.indexOf('/');
        this.folderName = slashIdx > 0 ? firstPath.slice(0, slashIdx) : 'images';

        // Load each image into an HTMLImageElement
        const loaded = [];
        for (const file of sorted) {
            try {
                const image = await this.loadImageElement(file);
                loaded.push({ name: file.name, blob: file, image });
            } catch (err) {
                console.warn('Failed to load image:', file.name, err);
            }
        }

        if (loaded.length === 0) {
            alert('No images could be loaded from the selected folder.');
            return;
        }

        this.mode = 'images';
        this.imageFiles = loaded;
        this.pdfDoc = null;
        this.pdfData = null;
        this.pdfFilename = null;
        this.pageCount = loaded.length;
        this.pageNum = 1;
        this.pageRotations = {};
        this.pageZoomLevels = {};
        this.pageCanvasSizes = {};

        annotationHandler.clearAnnotations();

        this.updatePageInfo();
        this.prevButton.disabled = this.pageNum <= 1;
        this.nextButton.disabled = this.pageNum >= this.pageCount;

        await this.renderPage(this.pageNum);
        console.log(`Loaded ${loaded.length} images from folder "${this.folderName}"`);
    }

    loadImageElement(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => {
                URL.revokeObjectURL(url);
                reject(e);
            };
            img.src = url;
        });
    }

    // Renders page `num` and resolves only once the canvas actually holds the
    // painted page. Callers may await this; a rejection means nothing usable
    // was drawn (never a silently blank canvas).
    renderPage(num, options = {}) {
        this.pageRendering = true;

        // Tell any in-flight render to stop right away, then queue behind it:
        // pdf.js throws if two render() calls target the same canvas at once.
        const cancelling = this.cancelInFlightRender();

        const promise = Promise.resolve(this._renderChain)
            .catch(() => {})
            .then(() => cancelling)
            .then(() => {
                // A newer navigation superseded this coalescable request
                if (options.coalesce && this.pageNumPending !== num) return;
                return this._renderPage(num);
            })
            .finally(() => {
                if (this._renderChain === promise) {
                    this.pageRendering = false;
                }
            });

        this._renderChain = promise;
        // Callers may ignore the promise; don't let that surface as an
        // unhandled rejection.
        promise.catch(() => {});
        return promise;
    }

    async _renderPage(num) {
        // Update page info
        this.updatePageInfo();

        if (this.mode === 'images') {
            this.renderImagePage(num);
        } else {
            await this.renderPdfPage(num);
        }

        // Refresh annotations for this page
        annotationHandler.showAnnotationsForPage(num);
    }

    async renderPdfPage(num) {
        let page;
        try {
            page = await this.pdfDoc.getPage(num);
        } catch (error) {
            console.error(`Failed to get page ${num}:`, error);
            throw error;
        }

        // Rotation and zoom must come from the page being rendered, not from
        // this.pageNum, which may already point at a different page.
        const rotation = this.getPageRotation(num);
        const scale = this.getCurrentZoomLevel(num);

        // Calculate viewport with rotation and scale
        const viewport = page.getViewport({ scale: scale, rotation: rotation });

        // Set canvas dimensions to match viewport (this also clears the bitmap)
        this.canvas.height = viewport.height;
        this.canvas.width = viewport.width;
        this.pageCanvasSizes[num] = { width: viewport.width, height: viewport.height };

        // Adjust annotation layer size
        const annotationLayer = document.getElementById('annotation-layer');
        annotationLayer.style.width = `${viewport.width}px`;
        annotationLayer.style.height = `${viewport.height}px`;

        // Reset the position to match the canvas
        annotationLayer.style.top = '0';
        annotationLayer.style.left = '0';

        console.log('Annotation layer set to:', viewport.width, viewport.height);

        // Render the page
        const renderTask = page.render({
            canvasContext: this.ctx,
            viewport: viewport
        });
        this._renderTask = renderTask;

        try {
            await renderTask.promise;
        } catch (error) {
            if (!this.isRenderingCancelled(error)) {
                console.error(`Rendering page ${num} failed:`, error);
            }
            throw error;
        } finally {
            if (this._renderTask === renderTask) {
                this._renderTask = null;
            }
        }
    }

    // Cancels the in-flight render, if any, swallowing the resulting
    // RenderingCancelledException.
    async cancelInFlightRender() {
        const task = this._renderTask;
        if (!task) return;
        this._renderTask = null;

        try {
            task.cancel();
            await task.promise;
        } catch (error) {
            if (!this.isRenderingCancelled(error)) {
                console.warn('Error while cancelling in-flight render:', error);
            }
        }
    }

    renderImagePage(num) {
        const entry = this.imageFiles[num - 1];
        if (!entry) {
            throw new Error(`No image loaded for page ${num}`);
        }

        const img = entry.image;
        const rotation = this.getPageRotation(num);
        const scale = this.getCurrentZoomLevel(num);

        const baseWidth = img.naturalWidth * scale;
        const baseHeight = img.naturalHeight * scale;

        // Swap dimensions for 90/270 rotations
        const rotated = rotation % 180 !== 0;
        const canvasWidth = rotated ? baseHeight : baseWidth;
        const canvasHeight = rotated ? baseWidth : baseHeight;

        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.pageCanvasSizes[num] = { width: canvasWidth, height: canvasHeight };

        const annotationLayer = document.getElementById('annotation-layer');
        annotationLayer.style.width = `${canvasWidth}px`;
        annotationLayer.style.height = `${canvasHeight}px`;
        annotationLayer.style.top = '0';
        annotationLayer.style.left = '0';

        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(img, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
        ctx.restore();
    }

    // Zoom level of a specific page (defaults to the current page)
    getCurrentZoomLevel(num = this.pageNum) {
        return this.pageZoomLevels[num] || this.defaultScale;
    }

    // Rotation of a specific page (defaults to the current page)
    getPageRotation(num = this.pageNum) {
        return this.pageRotations[num] || 0;
    }

    // Canvas size that a page's stored annotation positions are expressed in.
    // Tracked separately from the live canvas so back-to-back rotate/zoom
    // clicks compose correctly even before the next render lands.
    getAnnotationSpaceSize(num = this.pageNum) {
        return this.pageCanvasSizes[num] || { width: this.canvas.width, height: this.canvas.height };
    }

    updatePageInfo() {
        // Update page counter
        if (this.mode === 'images') {
            const name = this.getImageNameForPage(this.pageNum) || '';
            this.pageInfo.textContent = `Image ${this.pageNum} of ${this.pageCount}${name ? ` — ${name}` : ''}`;
        } else {
            this.pageInfo.textContent = `Page ${this.pageNum} of ${this.pageCount}`;
        }
        
        // Update rotation display
        const currentRotation = this.pageRotations[this.pageNum] || 0;
        this.rotationInfo.textContent = `Rotation: ${currentRotation}°`;
        
        // Update zoom display
        this.updateZoomInfo();
        
        // Update button states
        this.prevButton.disabled = this.pageNum <= 1;
        this.nextButton.disabled = this.pageNum >= this.pageCount;
    }

    // Returns a promise that resolves once `num` has rendered, or earlier if a
    // newer navigation supersedes it (rapid paging skips intermediate pages).
    queueRenderPage(num) {
        this.pageNumPending = num;
        return this.renderPage(num, { coalesce: true });
    }

    onPrevPage() {
        if (this.pageNum <= 1) return Promise.resolve();
        this.pageNum--;

        // Update rotation and zoom info for the new page
        this.updatePageInfo();

        return this.queueRenderPage(this.pageNum);
    }

    onNextPage() {
        if (this.pageNum >= this.pageCount) return Promise.resolve();
        this.pageNum++;

        // Update rotation and zoom info for the new page
        this.updatePageInfo();

        return this.queueRenderPage(this.pageNum);
    }

    // Navigates to `num` and resolves only after that page is fully rendered.
    // Waits for the tab to be visible first: pdf.js paints via
    // requestAnimationFrame, which is suspended in background tabs.
    async gotoPage(num) {
        if (!this.hasContent()) {
            throw new Error('No document loaded');
        }
        if (!Number.isInteger(num) || num < 1 || num > this.pageCount) {
            throw new Error(`Page ${num} is out of range (1-${this.pageCount})`);
        }

        await this.waitUntilVisible();

        this.pageNum = num;
        this.pageNumPending = null;
        this.updatePageInfo();

        await this.renderPage(num);
        return num;
    }

    // Resolves immediately when the tab is in the foreground, otherwise on the
    // next visibilitychange that brings it back.
    waitUntilVisible() {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const onVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                    resolve();
                }
            };
            document.addEventListener('visibilitychange', onVisibilityChange);
        });
    }

    rotateLeft() {
        return this.rotatePage(-90);
    }

    rotateRight() {
        return this.rotatePage(90);
    }

    // Rotates the current page by ±90° and moves stored annotations with it, so
    // annotation.rotation can never disagree with pageRotations.
    async rotatePage(degrees) {
        if (!this.hasContent()) return;

        const pageNum = this.pageNum;
        const currentRotation = this.getPageRotation(pageNum);
        const newRotation = (((currentRotation + degrees) % 360) + 360) % 360;

        // Map positions using the coordinate space the annotations are stored
        // in, which a still-pending render has not applied to the canvas yet.
        const { width: oldWidth, height: oldHeight } = this.getAnnotationSpaceSize(pageNum);
        if (typeof annotationHandler !== 'undefined' && annotationHandler) {
            annotationHandler.rotateAnnotationsForPage(pageNum, degrees, oldWidth, oldHeight, newRotation);
        }
        this.pageCanvasSizes[pageNum] = { width: oldHeight, height: oldWidth };

        // Store new rotation for this page
        this.pageRotations[pageNum] = newRotation;

        console.log(`Page ${pageNum} rotated to ${newRotation} degrees`);

        // Update rotation info display
        this.rotationInfo.textContent = `Rotation: ${newRotation}°`;

        // Re-render the page with new rotation
        await this.renderPage(pageNum);
    }

    getCurrentPageRotation() {
        return this.getPageRotation(this.pageNum);
    }

    getPageDimensions() {
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    async getPageAsImage() {
        return new Promise((resolve) => {
            const canvas = this.canvas;
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    }

    // True when every sampled pixel is opaque white — the signature of a canvas
    // that pdf.js pre-filled but never painted content onto.
    isCanvasBlank(samplesPerAxis = 8) {
        const { width, height } = this.canvas;
        if (!width || !height) return true;

        for (let i = 0; i < samplesPerAxis; i++) {
            for (let j = 0; j < samplesPerAxis; j++) {
                const x = Math.min(width - 1, Math.floor(((i + 0.5) / samplesPerAxis) * width));
                const y = Math.min(height - 1, Math.floor(((j + 0.5) / samplesPerAxis) * height));
                const [r, g, b, a] = this.ctx.getImageData(x, y, 1, 1).data;
                if (r !== 255 || g !== 255 || b !== 255 || a !== 255) return false;
            }
        }
        return true;
    }

    // Source-page geometry, for reproducing an export from the original file.
    async getPageProvenance(num) {
        if (this.mode !== 'pdf' || !this.pdfDoc) return null;

        try {
            const page = await this.pdfDoc.getPage(num);
            return {
                // PDF user-space box [x0, y0, x1, y1]
                view: page.view,
                // The PDF's own /Rotate; getViewport({rotation}) overrides it
                intrinsicRotate: page.rotate
            };
        } catch (error) {
            console.warn(`Could not read provenance for page ${num}:`, error);
            return null;
        }
    }

    getSourceInfo() {
        return {
            mode: this.mode,
            pdfjsVersion: (typeof pdfjsLib !== 'undefined' && pdfjsLib.version) || null,
            filename: this.mode === 'images' ? this.getFolderName() : this.pdfFilename,
            byteLength: this.pdfByteLength,
            sha256: this.pdfSha256
        };
    }

    async sha256Hex(bytes) {
        if (!bytes || typeof crypto === 'undefined' || !crypto.subtle) return null;

        try {
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        } catch (error) {
            console.warn('Could not hash source bytes:', error);
            return null;
        }
    }

    getPDFData() {
        return this.pdfData;
    }

    getPDFFilename() {
        return this.pdfFilename || 'pdf_document';
    }

    getMode() {
        return this.mode;
    }

    getImageEntry(pageNum) {
        if (this.mode !== 'images') return null;
        return this.imageFiles[pageNum - 1] || null;
    }

    getImageNameForPage(pageNum) {
        const entry = this.getImageEntry(pageNum);
        return entry ? entry.name : null;
    }

    // Returns a string suitable for folder names in the export zip
    getPageIdentifier(pageNum) {
        if (this.mode === 'images') {
            const entry = this.getImageEntry(pageNum);
            if (entry) {
                // Strip extension for folder name
                const dot = entry.name.lastIndexOf('.');
                return dot > 0 ? entry.name.slice(0, dot) : entry.name;
            }
        }
        return `page_${pageNum}`;
    }

    getFolderName() {
        return this.folderName || 'images';
    }
    
    // Zoom methods
    // Apply a new zoom level to the current page, keeping annotations aligned
    setZoom(newZoom) {
        if (!this.hasContent()) return;

        // Clamp to allowed range
        newZoom = Math.max(this.minScale, Math.min(this.maxScale, newZoom));

        const currentZoom = this.getCurrentZoomLevel();
        if (newZoom === currentZoom) return;

        // Rescale existing annotations on this page so they stay aligned
        // with the content after the canvas is resized.
        const ratio = newZoom / currentZoom;
        if (typeof annotationHandler !== 'undefined' && annotationHandler) {
            annotationHandler.rescaleAnnotationsForPage(this.pageNum, ratio);
        }

        const size = this.getAnnotationSpaceSize(this.pageNum);
        this.pageCanvasSizes[this.pageNum] = {
            width: size.width * ratio,
            height: size.height * ratio
        };

        this.pageZoomLevels[this.pageNum] = newZoom;
        this.updateZoomInfo();
        console.log(`Page ${this.pageNum} zoom set to ${Math.round(newZoom * 100)}%`);
        return this.renderPage(this.pageNum);
    }

    zoomIn() {
        return this.setZoom(this.getCurrentZoomLevel() + 0.25);
    }

    zoomOut() {
        return this.setZoom(this.getCurrentZoomLevel() - 0.25);
    }

    zoomReset() {
        return this.setZoom(this.defaultScale);
    }

    updateZoomInfo() {
        // Update zoom percentage display
        const currentZoom = this.getCurrentZoomLevel();
        this.zoomInfo.textContent = `Zoom: ${Math.round(currentZoom * 100)}%`;
    }
}