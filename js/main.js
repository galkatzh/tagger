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
    
    // Initialize and show video popup
    initVideoPopup();
    
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

// Function to handle video popup functionality
function initVideoPopup() {
    const videoModal = document.getElementById('video-popup');
    const closeBtn = document.querySelector('.video-close');
    const video = document.getElementById('popup-video');
    
    if (!videoModal || !closeBtn || !video) return;
    
    // Function to open the modal and play the video
    function openVideoModal() {
        videoModal.style.display = 'block';
        video.play().catch(error => {
            console.log('Error playing video:', error);
        });
    }
    
    // Function to close the modal and pause the video
    function closeVideoModal() {
        videoModal.style.display = 'none';
        video.pause();
        video.currentTime = 0; // Reset video position
    }
    
    // Show the video popup when the page loads
    // Use a small timeout to ensure the modal appears after the page has rendered
    setTimeout(openVideoModal, 500);
    
    // Close the modal when the close button is clicked
    closeBtn.addEventListener('click', closeVideoModal);
    
    // Close the modal when clicking outside the modal content
    videoModal.addEventListener('click', (event) => {
        if (event.target === videoModal) {
            closeVideoModal();
        }
    });
    
    // Close the modal when ESC key is pressed
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && videoModal.style.display === 'block') {
            closeVideoModal();
        }
    });
}