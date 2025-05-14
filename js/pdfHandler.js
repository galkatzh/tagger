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

        // Page navigation elements
        this.prevButton = document.getElementById('prev-page');
        this.nextButton = document.getElementById('next-page');
        this.pageInfo = document.getElementById('page-info');
        this.rotationInfo = document.getElementById('rotation-info');

        // Rotation controls
        this.rotateLeftButton = document.getElementById('rotate-left');
        this.rotateRightButton = document.getElementById('rotate-right');
        
        // Zoom controls - commented out
        /*
        this.zoomInButton = document.getElementById('zoom-in');
        this.zoomOutButton = document.getElementById('zoom-out');
        this.zoomResetButton = document.getElementById('zoom-reset');
        this.zoomInfo = document.getElementById('zoom-info');
        */

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
        
        // Zoom listeners - commented out
        /*
        this.zoomInButton.addEventListener('click', () => this.zoomIn());
        this.zoomOutButton.addEventListener('click', () => this.zoomOut());
        this.zoomResetButton.addEventListener('click', () => this.zoomReset());
        */

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
        
        // Keyboard shortcuts for zoom - commented out
        /*
        document.addEventListener('keydown', (event) => {
            // Check if Ctrl/Cmd key is pressed
            if ((event.ctrlKey || event.metaKey) && this.pdfDoc) {
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
        */
        
        // Mouse wheel zoom when Ctrl/Cmd is pressed - commented out
        /*
        this.canvas.addEventListener('wheel', (event) => {
            if ((event.ctrlKey || event.metaKey) && this.pdfDoc) {
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
        */
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

    renderPage(num) {
        this.pageRendering = true;
        
        // Update page info
        this.updatePageInfo();
        
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
    
    // Helper method to get current page's zoom level
    getCurrentZoomLevel() {
        return this.pageZoomLevels[this.pageNum] || this.defaultScale;
    }

    updatePageInfo() {
        // Update page counter
        this.pageInfo.textContent = `Page ${this.pageNum} of ${this.pageCount}`;
        
        // Update rotation display
        const currentRotation = this.pageRotations[this.pageNum] || 0;
        this.rotationInfo.textContent = `Rotation: ${currentRotation}°`;
        
        // Update zoom display - commented out
        // this.updateZoomInfo();
        
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
    
    // Zoom methods
    zoomIn() {
        const currentZoom = this.getCurrentZoomLevel();
        if (currentZoom < this.maxScale) {
            this.pageZoomLevels[this.pageNum] = currentZoom + 0.25;
            this.updateZoomInfo();
            this.renderPage(this.pageNum);
            console.log(`Page ${this.pageNum} zoomed in to ${Math.round(this.getCurrentZoomLevel() * 100)}%`);
        }
    }
    
    zoomOut() {
        const currentZoom = this.getCurrentZoomLevel();
        if (currentZoom > this.minScale) {
            this.pageZoomLevels[this.pageNum] = currentZoom - 0.25;
            this.updateZoomInfo();
            this.renderPage(this.pageNum);
            console.log(`Page ${this.pageNum} zoomed out to ${Math.round(this.getCurrentZoomLevel() * 100)}%`);
        }
    }
    
    zoomReset() {
        this.pageZoomLevels[this.pageNum] = this.defaultScale;
        this.updateZoomInfo();
        this.renderPage(this.pageNum);
        console.log(`Page ${this.pageNum} zoom reset to ${Math.round(this.getCurrentZoomLevel() * 100)}%`);
    }
    
    // Apply current zoom level to all pages
    applyZoomToAllPages() {
        const currentZoom = this.getCurrentZoomLevel();
        
        // Apply current page's zoom level to all pages
        for (let i = 1; i <= this.pageCount; i++) {
            this.pageZoomLevels[i] = currentZoom;
        }
        
        console.log(`Applied zoom level of ${Math.round(currentZoom * 100)}% to all pages`);
        this.renderPage(this.pageNum);
    }
    
    updateZoomInfo() {
        // Update zoom percentage display
        const currentZoom = this.getCurrentZoomLevel();
        this.zoomInfo.textContent = `Zoom: ${Math.round(currentZoom * 100)}%`;
    }
}