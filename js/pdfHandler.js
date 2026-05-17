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
        this.canvas = document.getElementById('pdf-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.pageRotations = {}; // Store rotation for each page individually
        this.pdfData = null;
        this.pdfFilename = null; // Store the PDF filename

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
        this.prevButton.addEventListener('click', () => this.onPrevPage());
        this.nextButton.addEventListener('click', () => this.onNextPage());

        // Rotation listeners
        this.rotateLeftButton.addEventListener('click', () => this.rotateLeft());
        this.rotateRightButton.addEventListener('click', () => this.rotateRight());
        
        // Zoom listeners
        this.zoomInButton.addEventListener('click', () => this.zoomIn());
        this.zoomOutButton.addEventListener('click', () => this.zoomOut());
        this.zoomResetButton.addEventListener('click', () => this.zoomReset());

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
                    this.zoomIn();
                } else if (event.key === '-') {
                    // Zoom out with Ctrl/Cmd -
                    event.preventDefault();
                    this.zoomOut();
                } else if (event.key === '0') {
                    // Reset zoom with Ctrl/Cmd 0
                    event.preventDefault();
                    this.zoomReset();
                }
            }
        });

        // Mouse wheel zoom when Ctrl/Cmd is pressed
        this.canvas.addEventListener('wheel', (event) => {
            if ((event.ctrlKey || event.metaKey) && this.hasContent()) {
                event.preventDefault();
                if (event.deltaY < 0) {
                    // Zoom in on scroll up
                    this.zoomIn();
                } else {
                    // Zoom out on scroll down
                    this.zoomOut();
                }
            }
        }, { passive: false });
    }

    // Returns true if a PDF or image folder is currently loaded
    hasContent() {
        return this.mode === 'images' ? this.imageFiles.length > 0 : !!this.pdfDoc;
    }

    loadPDF(file) {
        const fileReader = new FileReader();

        // Store the filename
        this.pdfFilename = file.name;

        fileReader.onload = async (event) => {
            this.pdfData = new Uint8Array(event.target.result);

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
                this.updatePageInfo();

                // Enable navigation buttons
                this.prevButton.disabled = this.pageNum <= 1;
                this.nextButton.disabled = this.pageNum >= this.pageCount;

                // Render the first page
                this.renderPage(this.pageNum);

                // Reset annotations when loading a new PDF
                annotationHandler.clearAnnotations();

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

        annotationHandler.clearAnnotations();

        this.updatePageInfo();
        this.prevButton.disabled = this.pageNum <= 1;
        this.nextButton.disabled = this.pageNum >= this.pageCount;

        this.renderPage(this.pageNum);
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

    renderPage(num) {
        this.pageRendering = true;

        // Update page info
        this.updatePageInfo();

        if (this.mode === 'images') {
            this.renderImagePage(num);
            return;
        }

        // Get the page
        this.pdfDoc.getPage(num).then((page) => {
            // Get rotation for current page (or default to 0)
            const rotation = this.pageRotations[this.pageNum] || 0;
            
            // Get zoom level for current page (or default to defaultScale)
            const scale = this.getCurrentZoomLevel();
            
            // Calculate viewport with rotation and scale
            const viewport = page.getViewport({ scale: scale, rotation: rotation });
            
            // Set canvas dimensions to match viewport
            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;
            
            // Adjust annotation layer size
            const annotationLayer = document.getElementById('annotation-layer');
            annotationLayer.style.width = `${viewport.width}px`;
            annotationLayer.style.height = `${viewport.height}px`;
            
            // Reset the position to match the canvas
            annotationLayer.style.top = '0';
            annotationLayer.style.left = '0';
            
            console.log('Annotation layer set to:', viewport.width, viewport.height);
            
            // Prepare canvas for rendering
            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };
            
            // Render the page
            const renderTask = page.render(renderContext);
            
            // Wait for rendering to finish
            renderTask.promise.then(() => {
                this.pageRendering = false;
                
                // If another page is pending, render it immediately
                if (this.pageNumPending !== null) {
                    this.renderPage(this.pageNumPending);
                    this.pageNumPending = null;
                }
                
                // Refresh annotations for this page
                annotationHandler.showAnnotationsForPage(this.pageNum);
            });
        });
    }
    
    renderImagePage(num) {
        const entry = this.imageFiles[num - 1];
        if (!entry) {
            this.pageRendering = false;
            return;
        }

        const img = entry.image;
        const rotation = this.pageRotations[this.pageNum] || 0;
        const scale = this.getCurrentZoomLevel();

        const baseWidth = img.naturalWidth * scale;
        const baseHeight = img.naturalHeight * scale;

        // Swap dimensions for 90/270 rotations
        const rotated = rotation % 180 !== 0;
        const canvasWidth = rotated ? baseHeight : baseWidth;
        const canvasHeight = rotated ? baseWidth : baseHeight;

        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;

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

        this.pageRendering = false;

        if (this.pageNumPending !== null) {
            const pending = this.pageNumPending;
            this.pageNumPending = null;
            this.renderPage(pending);
            return;
        }

        annotationHandler.showAnnotationsForPage(this.pageNum);
    }

    // Helper method to get current page's zoom level
    getCurrentZoomLevel() {
        return this.pageZoomLevels[this.pageNum] || this.defaultScale;
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

    queueRenderPage(num) {
        if (this.pageRendering) {
            this.pageNumPending = num;
        } else {
            this.renderPage(num);
        }
    }

    onPrevPage() {
        if (this.pageNum <= 1) return;
        this.pageNum--;
        this.queueRenderPage(this.pageNum);
        
        // Update rotation and zoom info for the new page
        this.updatePageInfo();
    }

    onNextPage() {
        if (this.pageNum >= this.pageCount) return;
        this.pageNum++;
        this.queueRenderPage(this.pageNum);
        
        // Update rotation and zoom info for the new page
        this.updatePageInfo();
    }

    rotateLeft() {
        // Get current rotation or default to 0
        let currentRotation = this.pageRotations[this.pageNum] || 0;
        
        // Calculate new rotation
        currentRotation = (currentRotation - 90) % 360;
        if (currentRotation < 0) currentRotation += 360;
        
        // Store new rotation for this page
        this.pageRotations[this.pageNum] = currentRotation;
        
        console.log(`Page ${this.pageNum} rotated left to ${currentRotation} degrees`);
        
        // Update rotation info display
        this.rotationInfo.textContent = `Rotation: ${currentRotation}°`;
        
        // Re-render the page with new rotation
        this.renderPage(this.pageNum);
    }

    rotateRight() {
        // Get current rotation or default to 0
        let currentRotation = this.pageRotations[this.pageNum] || 0;
        
        // Calculate new rotation
        currentRotation = (currentRotation + 90) % 360;
        
        // Store new rotation for this page
        this.pageRotations[this.pageNum] = currentRotation;
        
        console.log(`Page ${this.pageNum} rotated right to ${currentRotation} degrees`);
        
        // Update rotation info display
        this.rotationInfo.textContent = `Rotation: ${currentRotation}°`;
        
        // Re-render the page with new rotation
        this.renderPage(this.pageNum);
    }

    getCurrentPageRotation() {
        return this.pageRotations[this.pageNum] || 0;
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

        this.pageZoomLevels[this.pageNum] = newZoom;
        this.updateZoomInfo();
        this.renderPage(this.pageNum);
        console.log(`Page ${this.pageNum} zoom set to ${Math.round(newZoom * 100)}%`);
    }

    zoomIn() {
        this.setZoom(this.getCurrentZoomLevel() + 0.25);
    }

    zoomOut() {
        this.setZoom(this.getCurrentZoomLevel() - 0.25);
    }

    zoomReset() {
        this.setZoom(this.defaultScale);
    }

    updateZoomInfo() {
        // Update zoom percentage display
        const currentZoom = this.getCurrentZoomLevel();
        this.zoomInfo.textContent = `Zoom: ${Math.round(currentZoom * 100)}%`;
    }
}