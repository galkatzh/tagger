class ExportHandler {
    constructor() {
        this.exportButton = document.getElementById('export-annotations');
        this.initEventListeners();
    }

    initEventListeners() {
        this.exportButton.addEventListener('click', () => this.exportAnnotations());
    }

    // Helper method to get demographic data from the form
    getDemographicData() {
        return {
            age: {
                years: document.getElementById('age-years').value ? parseInt(document.getElementById('age-years').value, 10) : null,
                months: document.getElementById('age-months').value ? parseInt(document.getElementById('age-months').value, 10) : null
            },
            birthDate: document.getElementById('birth-date').value || null,
            sex: document.querySelector('input[name="sex"]:checked') ? document.querySelector('input[name="sex"]:checked').value : null,
            momEducation: document.getElementById('mom-education').value ? parseInt(document.getElementById('mom-education').value, 10) : null,
            siblingPosition: document.getElementById('sibling-position').value ? parseInt(document.getElementById('sibling-position').value, 10) : null,
            residence: document.getElementById('residence').value || null,
            education: document.getElementById('education').value || null,
            developmentTreatment: document.querySelector('input[name="development-treatment"]:checked') ? document.querySelector('input[name="development-treatment"]:checked').value : null,
            specialEducation: document.querySelector('input[name="special-education"]:checked') ? document.querySelector('input[name="special-education"]:checked').value : null
        };
    }

    async exportAnnotations() {
        // Create a new ZIP file
        const zip = new JSZip();
        
        // Get all annotations
        const annotations = annotationHandler.getAllAnnotations();
        
        if (annotations.length === 0) {
            alert('No annotations to export. Please create some annotations first.');
            return;
        }
        
        // Group annotations by page
        const annotationsByPage = {};
        annotations.forEach(annotation => {
            if (!annotationsByPage[annotation.page]) {
                annotationsByPage[annotation.page] = [];
            }
            annotationsByPage[annotation.page].push(annotation);
        });
        
        // Get demographic data
        const demographicData = this.getDemographicData();
        
        // Helper function to check if a value is provided
        const isProvided = (value) => value !== null && value !== "";
        
        // Process demographic data with provided status
        const processedDemographicData = {
            age: {
                years: demographicData.age.years,
                months: demographicData.age.months,
                provided: isProvided(demographicData.age.years) || isProvided(demographicData.age.months)
            },
            birthDate: {
                value: demographicData.birthDate,
                provided: isProvided(demographicData.birthDate)
            },
            sex: {
                value: demographicData.sex,
                provided: isProvided(demographicData.sex)
            },
            momEducation: {
                value: demographicData.momEducation,
                provided: isProvided(demographicData.momEducation)
            },
            siblingPosition: {
                value: demographicData.siblingPosition,
                provided: isProvided(demographicData.siblingPosition)
            },
            residence: {
                value: demographicData.residence,
                provided: isProvided(demographicData.residence)
            },
            education: {
                value: demographicData.education,
                provided: isProvided(demographicData.education)
            },
            developmentTreatment: {
                value: demographicData.developmentTreatment,
                provided: isProvided(demographicData.developmentTreatment)
            },
            specialEducation: {
                value: demographicData.specialEducation,
                provided: isProvided(demographicData.specialEducation)
            }
        };
        
        // Calculate summary statistics
        const totalFields = 9; // Total number of demographic fields
        const providedFields = Object.values(processedDemographicData).filter(field => field.provided).length;
        
        // Create a JSON file with all annotation data, page rotations, and demographics
        const exportData = {
            annotations: annotations,
            pageRotations: pdfHandler.pageRotations,
            demographics: {
                data: processedDemographicData,
                summary: {
                    providedFields: providedFields,
                    totalFields: totalFields,
                    completionPercentage: (providedFields / totalFields * 100).toFixed(1)
                }
            }
        };
        zip.file('annotations.json', JSON.stringify(exportData, null, 2));
        
        // Create CSV file for demographics
        let demographicsCSV = 'Field,Value,Provided\n';
        
        // Format age - handling both years and months
        const ageYearsProvided = isProvided(demographicData.age.years);
        const ageMonthsProvided = isProvided(demographicData.age.months);
        let ageValue = "";
        
        if (ageYearsProvided) ageValue += `${demographicData.age.years} years `;
        if (ageMonthsProvided) ageValue += `${demographicData.age.months} months`;
        demographicsCSV += `Age,${ageValue},${processedDemographicData.age.provided ? 'Yes' : 'No'}\n`;
        
        // Add other demographic fields with provided status
        demographicsCSV += `Birth Date,${demographicData.birthDate || ''},${processedDemographicData.birthDate.provided ? 'Yes' : 'No'}\n`;
        demographicsCSV += `Sex,${demographicData.sex || ''},${processedDemographicData.sex.provided ? 'Yes' : 'No'}\n`;
        demographicsCSV += `Mom's Years of Education,${demographicData.momEducation || ''},${processedDemographicData.momEducation.provided ? 'Yes' : 'No'}\n`;
        demographicsCSV += `Position Among Siblings,${demographicData.siblingPosition || ''},${processedDemographicData.siblingPosition.provided ? 'Yes' : 'No'}\n`;
        demographicsCSV += `Place of Residence,${demographicData.residence || ''},${processedDemographicData.residence.provided ? 'Yes' : 'No'}\n`;
        demographicsCSV += `Education,${demographicData.education || ''},${processedDemographicData.education.provided ? 'Yes' : 'No'}\n`;
        demographicsCSV += `Treated for Development,${demographicData.developmentTreatment || ''},${processedDemographicData.developmentTreatment.provided ? 'Yes' : 'No'}\n`;
        demographicsCSV += `Special Education,${demographicData.specialEducation || ''},${processedDemographicData.specialEducation.provided ? 'Yes' : 'No'}\n`;
        
        // Add a summary of provided fields using the values we already calculated
        demographicsCSV += `\nSummary,${providedFields}/${totalFields} fields provided,${(providedFields / totalFields * 100).toFixed(1)}%\n`;
        
        zip.file('demographics.csv', demographicsCSV);
        
        const mode = pdfHandler.getMode ? pdfHandler.getMode() : 'pdf';

        try {
            // Create a folder for each page/image and store assets with annotations
            for (const page of Object.keys(annotationsByPage)) {
                const pageNum = parseInt(page, 10);

                // Switch to the page
                while (pdfHandler.pageNum !== pageNum) {
                    if (pdfHandler.pageNum < pageNum) {
                        pdfHandler.onNextPage();
                    } else {
                        pdfHandler.onPrevPage();
                    }

                    // Wait for page to render
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                const folder = pdfHandler.getPageIdentifier(pageNum);
                const pageAnnotations = annotationsByPage[pageNum];

                // Add the source asset (original image in image mode, rendered page in PDF mode)
                if (mode === 'images') {
                    const entry = pdfHandler.getImageEntry(pageNum);
                    if (entry) {
                        zip.file(`${folder}/${entry.name}`, entry.blob);
                    }
                } else {
                    const pageImage = await pdfHandler.getPageAsImage();
                    zip.file(`${folder}/page_${pageNum}.png`, pageImage);
                }

                // The rendered canvas reflects current rotation/scale and matches
                // annotation coordinates, so use it for cropping annotation regions.
                const renderedPage = await pdfHandler.getPageAsImage();

                // Create CSV for page annotations
                const idColumn = mode === 'images' ? 'ImageName' : 'Page';
                let csvContent = `${idColumn},Type,X,Y,Width,Height,Properties\n`;

                pageAnnotations.forEach(annotation => {
                    const propertiesStr = Object.entries(annotation.properties)
                        .map(([key, value]) => `${key}:${value}`)
                        .join(';');

                    const identifier = mode === 'images'
                        ? (annotation.imageName || '')
                        : annotation.page;

                    csvContent += `${identifier},${annotation.type},${annotation.position.x},${annotation.position.y},`;
                    csvContent += `${annotation.position.width},${annotation.position.height},${propertiesStr}\n`;
                });

                zip.file(`${folder}/annotations.csv`, csvContent);

                // Extract each annotation as a separate image
                for (const [index, annotation] of pageAnnotations.entries()) {
                    // Create canvas for cropping
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Set canvas size to annotation dimensions
                    canvas.width = annotation.position.width;
                    canvas.height = annotation.position.height;

                    // Create an image from the rendered page
                    const img = new Image();
                    img.src = URL.createObjectURL(renderedPage);

                    await new Promise(resolve => {
                        img.onload = () => {
                            // Draw only the portion of the page within the annotation rectangle
                            ctx.drawImage(
                                img,
                                annotation.position.x, annotation.position.y,
                                annotation.position.width, annotation.position.height,
                                0, 0,
                                annotation.position.width, annotation.position.height
                            );

                            // Add to zip
                            canvas.toBlob(blob => {
                                zip.file(`${folder}/annotation_${index + 1}_${annotation.type}.png`, blob);
                                resolve();
                            });

                            // Clean up
                            URL.revokeObjectURL(img.src);
                        };
                    });

                    // Create JSON file with annotation details
                    zip.file(
                        `${folder}/annotation_${index + 1}_metadata.json`,
                        JSON.stringify(annotation, null, 2)
                    );
                }
            }

            // Generate and download the zip file
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            // Pick a base filename based on mode
            let baseFilename;
            if (mode === 'images') {
                baseFilename = pdfHandler.getFolderName ? pdfHandler.getFolderName() : 'images';
            } else {
                baseFilename = pdfHandler.getPDFFilename();
                if (baseFilename.toLowerCase().endsWith('.pdf')) {
                    baseFilename = baseFilename.slice(0, -4);
                }
            }

            // Create zip filename
            const zipFilename = `${baseFilename}_annotations.zip`;
            
            // Log the filename
            console.log(`Exporting annotations as: ${zipFilename}`);
            
            // Save the zip file
            saveAs(zipBlob, zipFilename);
            
            console.log('Export complete');
        } catch (error) {
            console.error('Error during export:', error);
            alert('Error during export. See console for details.');
        }
    }
}