class PDFHandler {
    constructor() {
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageCount = 0;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.scale = 1.5;
        this.canvas = document.getElementById('pdf-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.pageRotations = {}; // Store rotation for each page individually
        this.pdfData = null;

        // Page navigation elements
        this.prevButton = document.getElementById('prev-page');
        this.nextButton = document.getElementById('next-page');
        this.pageInfo = document.getElementById('page-info');
        this.rotationInfo = document.getElementById('rotation-info');

        // Rotation controls
        this.rotateLeftButton = document.getElementById('rotate-left');
        this.rotateRightButton = document.getElementById('rotate-right');

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

        // PDF upload listener
        document.getElementById('pdf-upload').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && file.type === 'application/pdf') {
                this.loadPDF(file);
            }
        });
    }

    loadPDF(file) {
        const fileReader = new FileReader();
        
        fileReader.onload = async (event) => {
            this.pdfData = new Uint8Array(event.target.result);
            
            try {
                // Load PDF using PDF.js
                const loadingTask = pdfjsLib.getDocument({ data: this.pdfData });
                this.pdfDoc = await loadingTask.promise;
                this.pageCount = this.pdfDoc.numPages;
                
                // Reset page navigation
                this.pageNum = 1;
                this.pageRotations = {}; // Reset rotations when loading a new PDF
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
            
            // Calculate viewport with rotation
            const viewport = page.getViewport({ scale: this.scale, rotation: rotation });
            
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

    updatePageInfo() {
        // Update page counter
        this.pageInfo.textContent = `Page ${this.pageNum} of ${this.pageCount}`;
        
        // Update rotation display
        const currentRotation = this.pageRotations[this.pageNum] || 0;
        this.rotationInfo.textContent = `Rotation: ${currentRotation}°`;
        
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
        
        // Update rotation info for the new page
        const currentRotation = this.pageRotations[this.pageNum] || 0;
        this.rotationInfo.textContent = `Rotation: ${currentRotation}°`;
    }

    onNextPage() {
        if (this.pageNum >= this.pageCount) return;
        this.pageNum++;
        this.queueRenderPage(this.pageNum);
        
        // Update rotation info for the new page
        const currentRotation = this.pageRotations[this.pageNum] || 0;
        this.rotationInfo.textContent = `Rotation: ${currentRotation}°`;
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
}