// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

// Initialize handlers
let pdfHandler;
let annotationHandler;
let exportHandler;

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize PDF handler
    pdfHandler = new PDFHandler();
    
    // Initialize annotation handler
    annotationHandler = new AnnotationHandler();
    
    // Initialize export handler
    exportHandler = new ExportHandler();
    
    // Initialize demographics toggle functionality
    initDemographicsToggle();
    
    console.log('PDF Tagger initialized');
    
    // Try to load example.pdf if it exists
    try {
        fetch('example.pdf')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Example PDF not found');
                }
                return response.blob();
            })
            .then(blob => {
                const file = new File([blob], 'example.pdf', { type: 'application/pdf' });
                pdfHandler.loadPDF(file);
            })
            .catch(error => {
                console.log('No example PDF loaded:', error);
            });
    } catch (error) {
        console.log('Error loading example PDF:', error);
    }
});

// Function to handle demographics toggle functionality
function initDemographicsToggle() {
    const toggleButton = document.getElementById('toggle-demographics');
    const demographicsContent = document.getElementById('demographics-content');
    
    if (!toggleButton || !demographicsContent) return;
    
    toggleButton.addEventListener('click', () => {
        const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
        
        // Toggle the aria-expanded attribute
        toggleButton.setAttribute('aria-expanded', !isExpanded);
        
        // Toggle the collapsed class on the content
        if (isExpanded) {
            demographicsContent.classList.add('collapsed');
            demographicsContent.style.maxHeight = '0';
        } else {
            demographicsContent.classList.remove('collapsed');
            demographicsContent.style.maxHeight = demographicsContent.scrollHeight + 'px';
        }
    });
    
    // Initialize the content to be expanded by default
    demographicsContent.style.maxHeight = demographicsContent.scrollHeight + 'px';
}