class AnnotationHandler {
    constructor() {
        this.annotations = []; // Array to store all annotations
        this.isDrawing = false;
        this.isResizing = false;
        this.resizeDirection = null;
        this.startX = 0;
        this.startY = 0;
        this.currentAnnotationElement = null;
        this.selectedAnnotation = null;
        this.annotationModal = null;
        
        // DOM elements
        this.annotationLayer = document.getElementById('annotation-layer');
        this.annotationsList = document.getElementById('annotations-list');
        
        this.initEventListeners();
        this.createAnnotationModal();
    }

    initEventListeners() {
        // Annotation layer mouse events
        console.log('Setting up annotation layer mouse events');
        this.annotationLayer.addEventListener('mousedown', (e) => {
            // Only start drawing if the target is the annotation layer itself
            // (not an existing annotation)
            if (e.target === this.annotationLayer) {
                console.log('Mousedown on annotation layer');
                this.startDrawing(e);
            }
        });
        
        this.annotationLayer.addEventListener('mousemove', (e) => {
            if (this.isDrawing) {
                this.drawAnnotation(e);
            } else if (this.isResizing && this.currentAnnotationElement) {
                this.resizeAnnotation(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isDrawing) {
                this.endDrawing();
            } else if (this.isResizing) {
                this.endResizing();
            }
        });
        
        // Add debugging to verify the layer is present
        console.log('Annotation layer dimensions:', 
            this.annotationLayer.offsetWidth, 
            this.annotationLayer.offsetHeight);
    }

    createAnnotationModal() {
        // Create the modal container
        this.annotationModal = document.createElement('div');
        this.annotationModal.className = 'annotation-modal';
        this.annotationModal.style.display = 'none';
        
        // Add modal content
        this.annotationModal.innerHTML = `
            <h4>Annotation Properties</h4>
            <div class="type-options">
                <div class="type-option">
                    <input type="radio" name="modal-annotation-type" id="modal-type-color" value="color" checked>
                    <label for="modal-type-color">Color</label>
                </div>
                <div class="type-option">
                    <input type="radio" name="modal-annotation-type" id="modal-type-copy" value="copy">
                    <label for="modal-type-copy">Copy</label>
                </div>
                <div class="type-option">
                    <input type="radio" name="modal-annotation-type" id="modal-type-drawing" value="drawing">
                    <label for="modal-type-drawing">Drawing</label>
                </div>
            </div>
            <div class="properties" id="modal-properties"></div>
            <div class="buttons">
                <button id="modal-cancel">Cancel</button>
                <button id="modal-save">Save</button>
            </div>
        `;
        
        // Add event listeners for type change
        const typeRadios = this.annotationModal.querySelectorAll('input[name="modal-annotation-type"]');
        typeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateModalProperties();
            });
        });
        
        // Add event listeners for buttons
        this.annotationModal.querySelector('#modal-cancel').addEventListener('click', () => {
            // Get the annotation ID before hiding the modal
            const annotationId = this.currentAnnotationElement ? 
                this.currentAnnotationElement.dataset.id : null;
            
            // Hide the modal
            this.hideAnnotationModal();
            
            // Remove the annotation if canceled
            if (annotationId) {
                this.deleteAnnotation(annotationId);
            }
        });
        
        this.annotationModal.querySelector('#modal-save').addEventListener('click', () => {
            this.saveAnnotationFromModal();
        });
        
        // Add modal to the page
        document.body.appendChild(this.annotationModal);
    }
    
    updateModalProperties() {
        const propertiesContainer = this.annotationModal.querySelector('#modal-properties');
        propertiesContainer.innerHTML = '';
        
        const selectedType = this.annotationModal.querySelector('input[name="modal-annotation-type"]:checked').value;
        
        // Create different property inputs based on annotation type
        if (selectedType === 'color') {
            // Color annotations have index, filling and accuracy
            this.createModalPropertyInput(propertiesContainer, 'index', 'number', 'Index', 1);
            this.createModalPropertyInput(propertiesContainer, 'filling', 'number', 'Filling', 0);
            this.createModalPropertyInput(propertiesContainer, 'accuracy', 'number', 'Accuracy', 0);
        } else if (selectedType === 'copy') {
            // Copy annotations have index, grade, and number of lines
            this.createModalPropertyInput(propertiesContainer, 'index', 'number', 'Index', 1);
            this.createModalPropertyInput(propertiesContainer, 'grade', 'number', 'Grade', 0);
            this.createModalPropertyInput(propertiesContainer, 'numLines', 'number', 'Number of lines', 0);
            this.createModalPropertySelect(propertiesContainer, 'closure', 'Closure', ['open', 'close', 'irrelevant'], 'irrelevant');
            this.createModalPropertySelect(propertiesContainer, 'segments', 'Segments', ['too many', 'too few', 'irrelevant'], 'irrelevant');
            this.createModalPropertySelect(propertiesContainer, 'jerkiness', 'Jerkiness', ['fluid', 'jerky'], 'fluid');
            this.createModalPropertySelect(propertiesContainer, 'pressure', 'Pressure', ['too much', 'too little', 'irrelevant'], 'irrelevant');
        } else if (selectedType === 'drawing') {
            // Drawing annotations have body part count
            this.createModalPropertyInput(propertiesContainer, 'bodyPartCount', 'number', 'Body Part Count', 0);
        }
    }

    createModalPropertyInput(container, name, type, label, defaultValue) {
        const div = document.createElement('div');
        div.className = 'property-input';
        
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.setAttribute('for', `modal-${name}`);
        
        const input = document.createElement('input');
        input.id = `modal-${name}`;
        input.type = type;
        input.name = name;
        input.value = defaultValue;
        
        div.appendChild(labelElement);
        div.appendChild(input);
        container.appendChild(div);
    }

    createModalPropertySelect(container, name, label, options, defaultValue) {
        const div = document.createElement('div');
        div.className = 'property-input';
        
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.setAttribute('for', `modal-${name}`);
        
        const select = document.createElement('select');
        select.id = `modal-${name}`;
        select.name = name;
        
        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option;
            if (option === defaultValue) {
                optionElement.selected = true;
            }
            select.appendChild(optionElement);
        });
        
        div.appendChild(labelElement);
        div.appendChild(select);
        container.appendChild(div);
    }

    getModalPropertyValues() {
        const properties = {};
        const inputs = this.annotationModal.querySelectorAll('#modal-properties input, #modal-properties select');
        
        inputs.forEach(input => {
            let value = input.value;
            if (input.type === 'number') {
                value = parseInt(value, 10);
            }
            properties[input.name] = value;
        });
        
        return properties;
    }
    
    showAnnotationModal(x, y) {
        // Update the modal position
        this.annotationModal.style.left = `${x}px`;
        this.annotationModal.style.top = `${y}px`;
        
        // If the modal would go off the screen, adjust its position
        const rect = this.annotationModal.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.annotationModal.style.left = `${window.innerWidth - rect.width - 20}px`;
        }
        if (rect.bottom > window.innerHeight) {
            this.annotationModal.style.top = `${window.innerHeight - rect.height - 20}px`;
        }
        
        // Update the properties based on the default type
        this.updateModalProperties();
        
        // Show the modal
        this.annotationModal.style.display = 'block';
    }
    
    hideAnnotationModal() {
        this.annotationModal.style.display = 'none';
        // Clear the current annotation element reference after saving or canceling
        this.currentAnnotationElement = null;
    }
    
    saveAnnotationFromModal() {
        if (!this.currentAnnotationElement) {
            console.error('No current annotation element to save!');
            this.hideAnnotationModal();
            return;
        }
        
        // Get selected type and property values
        const selectedType = this.annotationModal.querySelector('input[name="modal-annotation-type"]:checked').value;
        const properties = this.getModalPropertyValues();
        
        // Update annotation element class
        this.currentAnnotationElement.className = `annotation-rectangle ${selectedType}`;
        
        // Get position and size
        const width = parseInt(this.currentAnnotationElement.style.width, 10);
        const height = parseInt(this.currentAnnotationElement.style.height, 10);
        const left = parseInt(this.currentAnnotationElement.style.left, 10);
        const top = parseInt(this.currentAnnotationElement.style.top, 10);
        
        // Create annotation object
        const annotation = {
            id: this.currentAnnotationElement.dataset.id,
            type: selectedType,
            properties: properties,
            page: pdfHandler.pageNum,
            rotation: pdfHandler.getCurrentPageRotation(),
            position: {
                x: left,
                y: top,
                width: width,
                height: height
            }
        };
        
        // Find if this annotation already exists
        const existingIndex = this.annotations.findIndex(a => a.id === annotation.id);
        if (existingIndex >= 0) {
            // Update existing annotation
            this.annotations[existingIndex] = annotation;
        } else {
            // Add to annotations array
            this.annotations.push(annotation);
        }
        
        // Update annotations list display
        this.updateAnnotationsList();
        
        // Hide the modal
        this.hideAnnotationModal();
    }

    startDrawing(e) {
        console.log('startDrawing called', e.clientX, e.clientY);
        
        if (this.isDrawing) {
            console.log('Already drawing, ignoring');
            return;
        }
        
        const rect = this.annotationLayer.getBoundingClientRect();
        console.log('Annotation layer rect:', rect.left, rect.top, rect.width, rect.height);
        
        this.startX = e.clientX - rect.left;
        this.startY = e.clientY - rect.top;
        this.isDrawing = true;
        
        console.log('Setting start position to:', this.startX, this.startY);
        
        // Create a unique id for the annotation
        const id = Date.now().toString();
        
        // Create a new annotation element with "unassigned" type initially
        this.currentAnnotationElement = document.createElement('div');
        this.currentAnnotationElement.className = 'annotation-rectangle unassigned';
        this.currentAnnotationElement.style.left = `${this.startX}px`;
        this.currentAnnotationElement.style.top = `${this.startY}px`;
        this.currentAnnotationElement.style.width = '0';
        this.currentAnnotationElement.style.height = '0';
        this.currentAnnotationElement.dataset.id = id;
        
        console.log('Created annotation element with class:', this.currentAnnotationElement.className);
        
        // Add it to the DOM
        this.annotationLayer.appendChild(this.currentAnnotationElement);
        console.log('Appended annotation element to layer');
    }

    drawAnnotation(e) {
        if (!this.isDrawing) return;
        if (!this.currentAnnotationElement) {
            console.error('Drawing but no current annotation element!');
            return;
        }
        
        console.log('drawAnnotation called', e.clientX, e.clientY);
        
        const rect = this.annotationLayer.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        // Calculate rectangle properties
        const width = Math.abs(currentX - this.startX);
        const height = Math.abs(currentY - this.startY);
        const left = Math.min(this.startX, currentX);
        const top = Math.min(this.startY, currentY);
        
        console.log('Rectangle dimensions:', left, top, width, height);
        
        // Update rectangle display
        this.currentAnnotationElement.style.width = `${width}px`;
        this.currentAnnotationElement.style.height = `${height}px`;
        this.currentAnnotationElement.style.left = `${left}px`;
        this.currentAnnotationElement.style.top = `${top}px`;
    }

    endDrawing() {
        console.log('endDrawing called');
        
        if (!this.isDrawing) {
            console.log('Not drawing, ignoring');
            return;
        }
        
        if (!this.currentAnnotationElement) {
            console.error('No current annotation element!');
            this.isDrawing = false;
            return;
        }
        
        this.isDrawing = false;
        
        // Check if the annotation has a valid size
        const width = parseInt(this.currentAnnotationElement.style.width, 10);
        const height = parseInt(this.currentAnnotationElement.style.height, 10);
        
        console.log('Final annotation size:', width, height);
        
        if (width < 10 || height < 10) {
            // If too small, remove it
            console.log('Annotation too small, removing');
            this.annotationLayer.removeChild(this.currentAnnotationElement);
            this.currentAnnotationElement = null;
            return;
        }
        
        console.log('Annotation has valid size, keeping it');
        
        // Create a temporary unassigned annotation
        const annotationId = this.currentAnnotationElement.dataset.id;
        const tempAnnotation = {
            id: annotationId,
            type: 'unassigned',
            properties: {},
            page: pdfHandler.pageNum,
            rotation: pdfHandler.getCurrentPageRotation(),
            position: {
                x: parseInt(this.currentAnnotationElement.style.left, 10),
                y: parseInt(this.currentAnnotationElement.style.top, 10),
                width: width,
                height: height
            }
        };
        
        // Add to annotations array as unassigned
        this.annotations.push(tempAnnotation);
        
        // Add resize handles
        this.addResizeHandles(this.currentAnnotationElement);
        
        // Add delete button
        const deleteButton = document.createElement('div');
        deleteButton.className = 'annotation-delete';
        deleteButton.textContent = '×';
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteAnnotation(this.currentAnnotationElement.dataset.id);
        });
        
        this.currentAnnotationElement.appendChild(deleteButton);
        
        // Add drag functionality
        this.makeElementDraggable(this.currentAnnotationElement);
        
        // Show the modal to select annotation type and properties
        const rect = this.annotationLayer.getBoundingClientRect();
        const modalX = rect.left + parseInt(this.currentAnnotationElement.style.left, 10) + width;
        const modalY = rect.top + parseInt(this.currentAnnotationElement.style.top, 10);
        
        // Show modal next to the annotation
        this.showAnnotationModal(modalX, modalY);
    }
    
    addResizeHandles(element) {
        // Create resize handles for the 4 corners
        const directions = ['nw', 'ne', 'sw', 'se'];
        
        directions.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${dir}`;
            handle.dataset.direction = dir;
            
            // Add mouse down event for resizing
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Prevent dragging
                this.startResizing(e, element, dir);
            });
            
            element.appendChild(handle);
        });
    }
    
    startResizing(e, element, direction) {
        e.preventDefault();
        
        this.isResizing = true;
        this.resizeDirection = direction;
        this.currentAnnotationElement = element;
        
        // Save initial mouse position
        const rect = this.annotationLayer.getBoundingClientRect();
        this.startX = e.clientX - rect.left;
        this.startY = e.clientY - rect.top;
        
        // Save the original element dimensions
        this.origWidth = parseInt(element.style.width, 10);
        this.origHeight = parseInt(element.style.height, 10);
        this.origLeft = parseInt(element.style.left, 10);
        this.origTop = parseInt(element.style.top, 10);
        
        console.log('Started resizing in direction:', direction);
    }
    
    resizeAnnotation(e) {
        if (!this.isResizing || !this.currentAnnotationElement) return;
        
        const rect = this.annotationLayer.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        const deltaX = currentX - this.startX;
        const deltaY = currentY - this.startY;
        
        let newWidth = this.origWidth;
        let newHeight = this.origHeight;
        let newLeft = this.origLeft;
        let newTop = this.origTop;
        
        // Handle different resize directions
        if (this.resizeDirection.includes('e')) {
            newWidth = Math.max(10, this.origWidth + deltaX);
        } else if (this.resizeDirection.includes('w')) {
            newWidth = Math.max(10, this.origWidth - deltaX);
            newLeft = this.origLeft + (this.origWidth - newWidth);
        }
        
        if (this.resizeDirection.includes('s')) {
            newHeight = Math.max(10, this.origHeight + deltaY);
        } else if (this.resizeDirection.includes('n')) {
            newHeight = Math.max(10, this.origHeight - deltaY);
            newTop = this.origTop + (this.origHeight - newHeight);
        }
        
        // Update rectangle dimensions
        this.currentAnnotationElement.style.width = `${newWidth}px`;
        this.currentAnnotationElement.style.height = `${newHeight}px`;
        this.currentAnnotationElement.style.left = `${newLeft}px`;
        this.currentAnnotationElement.style.top = `${newTop}px`;
    }
    
    endResizing() {
        if (!this.isResizing) return;
        
        this.isResizing = false;
        
        // Update the annotation in the annotations array
        if (this.currentAnnotationElement && this.currentAnnotationElement.dataset.id) {
            const id = this.currentAnnotationElement.dataset.id;
            const annotation = this.annotations.find(a => a.id === id);
            
            if (annotation) {
                annotation.position = {
                    x: parseInt(this.currentAnnotationElement.style.left, 10),
                    y: parseInt(this.currentAnnotationElement.style.top, 10),
                    width: parseInt(this.currentAnnotationElement.style.width, 10),
                    height: parseInt(this.currentAnnotationElement.style.height, 10)
                };
                
                // Update annotations list
                this.updateAnnotationsList();
            }
        }
    }

    makeElementDraggable(element) {
        let offsetX = 0;
        let offsetY = 0;
        
        const mouseMoveHandler = (e) => {
            const rect = this.annotationLayer.getBoundingClientRect();
            let newX = e.clientX - rect.left - offsetX;
            let newY = e.clientY - rect.top - offsetY;
            
            // Keep annotation within bounds
            const maxX = rect.width - parseInt(element.style.width, 10);
            const maxY = rect.height - parseInt(element.style.height, 10);
            
            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));
            
            element.style.left = `${newX}px`;
            element.style.top = `${newY}px`;
            
            // Update annotation data
            const annotationId = element.dataset.id;
            const annotation = this.annotations.find(a => a.id === annotationId);
            if (annotation) {
                annotation.position.x = newX;
                annotation.position.y = newY;
            }
        };
        
        const mouseUpHandler = () => {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        };
        
        element.addEventListener('mousedown', (e) => {
            // Only handle dragging if the target is the element itself (not a resize handle or delete button)
            if (e.target === element) {
                e.preventDefault();
                
                // Set this as the current annotation element
                this.currentAnnotationElement = element;
                
                // Calculate offset of mouse relative to element
                const rect = element.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                
                document.addEventListener('mousemove', mouseMoveHandler);
                document.addEventListener('mouseup', mouseUpHandler);
            }
        });
        
        // Double click to edit annotation
        element.addEventListener('dblclick', (e) => {
            // Set this as the current annotation element
            this.currentAnnotationElement = element;
            
            // Get the annotation data
            const annotationId = element.dataset.id;
            const annotation = this.annotations.find(a => a.id === annotationId);
            
            if (annotation) {
                // Position modal near the annotation
                const rect = this.annotationLayer.getBoundingClientRect();
                const modalX = rect.left + annotation.position.x + annotation.position.width;
                const modalY = rect.top + annotation.position.y;
                
                // Pre-select the current type and properties
                const typeRadio = this.annotationModal.querySelector(`input[value="${annotation.type}"]`);
                if (typeRadio) {
                    typeRadio.checked = true;
                }
                
                // Show the modal
                this.showAnnotationModal(modalX, modalY);
                
                // Update properties with existing values
                this.updateModalProperties();
                
                // Set values for properties
                setTimeout(() => {
                    Object.entries(annotation.properties).forEach(([key, value]) => {
                        const input = this.annotationModal.querySelector(`input[name="${key}"]`);
                        if (input) {
                            input.value = value;
                        }
                    });
                }, 50);
            }
        });
    }

    deleteAnnotation(id) {
        // Find annotation in array
        const index = this.annotations.findIndex(a => a.id === id);
        if (index === -1) return;
        
        // Remove from array
        this.annotations.splice(index, 1);
        
        // Remove element from DOM
        const element = this.annotationLayer.querySelector(`[data-id="${id}"]`);
        if (element) {
            this.annotationLayer.removeChild(element);
        }
        
        // Update annotations list
        this.updateAnnotationsList();
    }

    updateAnnotationsList() {
        this.annotationsList.innerHTML = '';
        
        // Group annotations by page
        const annotationsByPage = {};
        
        this.annotations.forEach(annotation => {
            if (annotation.type === 'unassigned') return; // Skip unassigned annotations
            
            if (!annotationsByPage[annotation.page]) {
                annotationsByPage[annotation.page] = [];
            }
            annotationsByPage[annotation.page].push(annotation);
        });
        
        // Create list items for each page and its annotations
        Object.keys(annotationsByPage).sort((a, b) => parseInt(a) - parseInt(b)).forEach(page => {
            const pageAnnotations = annotationsByPage[page];
            
            const pageHeader = document.createElement('h4');
            pageHeader.textContent = `Page ${page} (${pageAnnotations.length} annotations)`;
            this.annotationsList.appendChild(pageHeader);
            
            pageAnnotations.forEach(annotation => {
                const item = document.createElement('div');
                item.className = `annotation-item annotation-item-${annotation.type}`;
                
                // Create annotation info based on type
                let properties = '';
                if (annotation.type === 'color') {
                    properties = `Index: ${annotation.properties.index}, Filling: ${annotation.properties.filling}, Accuracy: ${annotation.properties.accuracy}`;
                } else if (annotation.type === 'copy') {
                    properties = `Index: ${annotation.properties.index}, Grade: ${annotation.properties.grade}, Lines: ${annotation.properties.numLines}, Closure: ${annotation.properties.closure}, Segments: ${annotation.properties.segments}, Jerkiness: ${annotation.properties.jerkiness}, Pressure: ${annotation.properties.pressure}`;
                } else if (annotation.type === 'drawing') {
                    properties = `Body Parts: ${annotation.properties.bodyPartCount}`;
                }
                
                item.innerHTML = `
                    <div class="annotation-info">
                        <strong>${annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}</strong>: ${properties}
                    </div>
                    <div class="buttons">
                        <button class="edit-btn" data-id="${annotation.id}">Edit</button>
                        <button class="delete-btn" data-id="${annotation.id}">Delete</button>
                    </div>
                `;
                
                // Add click handler for edit button
                item.querySelector('.edit-btn').addEventListener('click', () => {
                    const element = this.annotationLayer.querySelector(`[data-id="${annotation.id}"]`);
                    if (element) {
                        // Simulate double click to edit
                        const event = new MouseEvent('dblclick', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        element.dispatchEvent(event);
                    }
                });
                
                // Add click handler for delete button
                item.querySelector('.delete-btn').addEventListener('click', () => {
                    this.deleteAnnotation(annotation.id);
                });
                
                this.annotationsList.appendChild(item);
            });
        });
        
        // If no annotations yet, show a message
        if (Object.keys(annotationsByPage).length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'No annotations yet. Draw boxes on the PDF to add annotations.';
            emptyMessage.className = 'empty-annotations-message';
            this.annotationsList.appendChild(emptyMessage);
        }
    }

    showAnnotationsForPage(pageNum) {
        // Hide the annotation modal
        this.hideAnnotationModal();
        
        // Clear all annotations from the layer
        while (this.annotationLayer.firstChild) {
            this.annotationLayer.removeChild(this.annotationLayer.firstChild);
        }
        
        // Show only annotations for the current page
        const pageAnnotations = this.annotations.filter(a => a.page === pageNum);
        
        pageAnnotations.forEach(annotation => {
            // Create annotation element
            const element = document.createElement('div');
            element.className = `annotation-rectangle ${annotation.type}`;
            element.style.left = `${annotation.position.x}px`;
            element.style.top = `${annotation.position.y}px`;
            element.style.width = `${annotation.position.width}px`;
            element.style.height = `${annotation.position.height}px`;
            element.dataset.id = annotation.id;
            
            // Add resize handles
            if (annotation.type !== 'unassigned') {
                this.addResizeHandles(element);
            }
            
            // Add delete button
            const deleteButton = document.createElement('div');
            deleteButton.className = 'annotation-delete';
            deleteButton.textContent = '×';
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteAnnotation(annotation.id);
            });
            
            element.appendChild(deleteButton);
            
            // Make draggable
            this.makeElementDraggable(element);
            
            // Add to layer
            this.annotationLayer.appendChild(element);
        });
    }

    clearAnnotations() {
        this.annotations = [];
        this.hideAnnotationModal();
        this.updateAnnotationsList();
        this.showAnnotationsForPage(pdfHandler.pageNum);
    }

    getAllAnnotations() {
        // Filter out any unassigned annotations for export
        return this.annotations.filter(a => a.type !== 'unassigned');
    }
}