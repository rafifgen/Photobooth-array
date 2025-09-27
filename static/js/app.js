// --- State Management & Configuration ---
const BACKEND_URL = 'http://127.0.0.1:8000'; 
const MAX_CAPTURES = 10;
const appState = {
    capturedPhotos: [],
    selectedPhotos: [],
    // BARU: Menyimpan data crop (sx, sy, sWidth, sHeight) per index foto asli.
    photoCropData: new Map(), 
    selectedLayout: null,
    // BARU: Melacak indeks foto yang sedang di-crop dalam array selectedPhotos
    currentCropIndex: 0, 
    // BARU: Instance Cropper.js
    cropperInstance: null 
};

// Dynamic frame layouts - will be populated by slot detection
let frameLayouts = [];

// --- Slot Detection Functions ---
async function detectPhotoSlots(frameImageSrc, minSlotSize = 50) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw the frame image
            ctx.drawImage(img, 0, 0);
            
            // Get image data
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Create a visited map
            const visited = new Array(canvas.width * canvas.height).fill(false);
            const slots = [];
            
            // Scan for transparent pixels and find connected regions
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const index = (y * canvas.width + x) * 4;
                    const red = data[index];
                    const green = data[index + 1];
                    const blue = data[index + 2];
                    const alpha = data[index + 3];
                    
                    // If pixel is transparent or white and not visited
                    const isWhite = red === 255 && green === 255 && blue === 255;
                    const isTransparent = alpha === 0;
                    
                    if ((isTransparent || isWhite) && !visited[y * canvas.width + x]) {
                        const slot = floodFillAndGetBounds(data, visited, x, y, canvas.width, canvas.height);
                        
                        // Only consider regions large enough to be photo slots
                        const area = (slot.maxX - slot.minX) * (slot.maxY - slot.minY);
                        if (area > minSlotSize) {
                            slots.push({
                                x: slot.minX,
                                y: slot.minY,
                                width: slot.maxX - slot.minX,
                                height: slot.maxY - slot.minY,
                                radius: 20 // Default radius
                            });
                        }
                    }
                }
            }
            
            // Sort slots by position (top to bottom, left to right)
            slots.sort((a, b) => {
                const rowDiff = Math.abs(a.y - b.y);
                if (rowDiff < 50) { // Same row threshold
                    return a.x - b.x; // Left to right
                } else {
                    return a.y - b.y; // Top to bottom
                }
            });
            
            resolve(slots);
        };
        
        img.onerror = () => {
            console.error('Failed to load frame image for slot detection');
            resolve([]); // Return empty array on error
        };
        
        img.src = frameImageSrc;
    });
}

// Flood fill algorithm to find connected transparent regions
function floodFillAndGetBounds(data, visited, startX, startY, width, height) {
    const stack = [{x: startX, y: startY}];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    
    while (stack.length > 0) {
        const {x, y} = stack.pop();
        
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (visited[y * width + x]) continue;
        
        const index = (y * width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        
        const isWhite = red === 255 && green === 255 && blue === 255;
        const isTransparent = alpha === 0;
        
        if (!isTransparent && !isWhite) continue; // Not a slot
        
        visited[y * width + x] = true;
        
        // Update bounds
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        
        // Add neighbors to stack
        stack.push({x: x + 1, y: y});
        stack.push({x: x - 1, y: y});
        stack.push({x: x, y: y + 1});
        stack.push({x: x, y: y - 1});
    }
    
    return {minX, maxX, minY, maxY};
}

// Create dynamic frame layout with detected slots
async function createDynamicFrameLayout(frameData) {
    try {
        const slots = await detectPhotoSlots(frameData.src);
        
        return {
            ...frameData,
            photoCount: slots.length,
            slots: slots
        };
    } catch (error) {
        console.error('Error detecting slots for frame:', frameData.id, error);
        // Return frame with no slots as fallback
        return {
            ...frameData,
            photoCount: 0,
            slots: []
        };
    }
}

// Load frame configurations with fallback to hardcoded
async function loadFrameConfigurations() {
    const staticFrameData = [
        {
            id: 'frame_2_photos', 
            name: 'Frame 2 Foto', 
            src: '/static/frames/2/20250924_221409_0000.png'
        },
        {
            id: 'frame_3_photos', 
            name: 'Frame 3 Foto', 
            src: '/static/frames/3/20250924_220911_0000.png'
        },
        {
            id: 'frame_4_photos', 
            name: 'Frame 4 Foto', 
            src: '/static/frames/4/20250924_220911_0001.png'
        }
    ];
    
    try {
        // Try dynamic slot detection first
        const dynamicLayouts = await Promise.all(
            staticFrameData.map(frameData => createDynamicFrameLayout(frameData))
        );
        
        // Filter out frames with no slots detected
        const validLayouts = dynamicLayouts.filter(layout => layout.photoCount > 0);
        
        if (validLayouts.length > 0) {
            console.log('Successfully loaded frames with dynamic slot detection');
            return validLayouts;
        }
    } catch (error) {
        console.error('Dynamic slot detection failed, using fallback:', error);
    }
    
    // Fallback to hardcoded layouts if detection fails
    console.log('Using hardcoded frame layouts as fallback');
    return getHardcodedFrameLayouts();
}

// Fallback hardcoded layouts (your original data)
function getHardcodedFrameLayouts() {
    return [
        {
            id: 'frame_2_photos', 
            name: 'Frame 2 Foto',
            src: '/static/frames/2/20250924_221409_0000.png',
            photoCount: 2,
            slots: [
                { x: 18, y: 20, width: 200, height: 330, radius: 10 },
                { x: 18, y: 360, width: 200, height: 330, radius: 10 }
            ]
        },
        {
            id: 'frame_3_photos',
            name: 'Frame 3 Foto',
            src: '/static/frames/3/20250924_220911_0000.png',
            photoCount: 3,
            slots: [
                { x: 18, y: 20,  width: 200, height: 220, radius: 10 },
                { x: 18, y: 250, width: 200, height: 220, radius: 10 },
                { x: 18, y: 480, width: 200, height: 220, radius: 10 }
            ]
        },
        {
            id: 'frame_4_photos',
            name: 'Frame 4 Foto',
            src: '/static/frames/4/20250924_220911_0001.png',
            photoCount: 4,
            slots: [
                { x: 18,  y: 20,  width: 95, height: 160, radius: 10 },
                { x: 123, y: 20,  width: 95, height: 160, radius: 10 },
                { x: 18,  y: 190, width: 95, height: 160, radius: 10 },
                { x: 123, y: 190, width: 95, height: 160, radius: 10 }
            ]
        }
    ];
}

// --- Element References ---
const screens = {};
document.querySelectorAll('.screen').forEach(el => screens[el.id.replace('-screen','')] = el);

const video = document.getElementById('video');
const captureCanvas = document.getElementById('capture-canvas');
const cropperImage = document.getElementById('cropper-image');
const cropTitle = document.getElementById('crop-title');

// --- App Logic ---
function showScreen(screenName, text = 'Memproses...') {
    document.getElementById('loading-text').textContent = text;
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName]?.classList.add('active');
}

async function populateFrameChoices() {
    const container = document.getElementById('frame-container');
    container.innerHTML = '<div class="col-span-2 text-center text-gray-500">Memuat bingkai...</div>';
    
    try {
        // Load frame layouts dynamically
        frameLayouts = await loadFrameConfigurations();
        
        container.innerHTML = '';
        frameLayouts.forEach(layout => {
            container.innerHTML += `
                <div class="frame-choice text-center" data-id="${layout.id}">
                    <img src="${layout.src}" class="w-full rounded-lg shadow-md hover:ring-4 ring-blue-400">
                    <p class="text-sm font-medium mt-2">${layout.name}</p>
                    <p class="text-xs text-gray-500">${layout.photoCount} foto</p>
                </div>
            `;
        });
    } catch (error) {
        console.error('Error loading frame choices:', error);
        container.innerHTML = '<div class="col-span-2 text-center text-red-500">Gagal memuat bingkai. Silakan refresh halaman.</div>';
    }
}

function handleFrameSelection(e) {
    const frameChoice = e.target.closest('.frame-choice');
    if (!frameChoice) return;
    
    const selectedLayout = frameLayouts.find(l => l.id === frameChoice.dataset.id);
    if (!selectedLayout) {
        alert('Frame yang dipilih tidak valid. Silakan coba lagi.');
        return;
    }
    
    if (selectedLayout.photoCount === 0) {
        alert('Frame ini belum dikonfigurasi dengan benar. Silakan pilih frame lain.');
        return;
    }
    
    appState.selectedLayout = selectedLayout;
    showScreen('method');
}

async function startCamera() {
    showScreen('capture');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 },
                facingMode: 'user' // Prefer front camera for photobooth
            } 
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => { 
            captureCanvas.width = video.videoWidth; 
            captureCanvas.height = video.videoHeight; 
        };
        updateCaptureTitle();
    } catch (err) {
        console.error('Camera access error:', err);
        alert("Tidak bisa mengakses kamera. Mohon izinkan akses kamera di browser Anda.");
        showScreen('method');
    }
}

function updateCaptureTitle() {
    document.getElementById('capture-title').textContent = 
        `Foto Diambil: ${appState.capturedPhotos.length}/${MAX_CAPTURES} (Perlu ${appState.selectedLayout.photoCount} foto)`;
}

function handleCapture() {
    if (appState.capturedPhotos.length >= MAX_CAPTURES) {
        alert(`Anda sudah mencapai batas maksimum ${MAX_CAPTURES} foto.`);
        goToSelectionScreen();
        return;
    }
    
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    appState.capturedPhotos.push(captureCanvas.toDataURL('image/jpeg', 0.9));
    updateCaptureTitle();
    
    // Auto-proceed if we have enough photos
    if (appState.capturedPhotos.length >= appState.selectedLayout.photoCount) {
        setTimeout(() => {
            goToSelectionScreen();
        }, 500); // Small delay to show the count update
    }
}

function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    
    showScreen('loading', 'Memproses gambar...');
    
    const promises = files.map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    });

    Promise.all(promises).then(dataUrls => {
        appState.capturedPhotos.push(...dataUrls);
        goToSelectionScreen();
    }).catch(error => {
        console.error('File upload error:', error);
        alert('Gagal memproses file. Silakan coba lagi.');
        showScreen('method');
    });
    
    event.target.value = null; // Reset input
}

function goToSelectionScreen() {
    // Stop camera stream if active
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    const gallery = document.getElementById('gallery-container');
    const title = document.getElementById('selection-title');
    gallery.innerHTML = '';
    
    title.textContent = `Pilih ${appState.selectedLayout.photoCount} foto terbaik Anda`;

    appState.capturedPhotos.forEach((src, index) => {
        const img = document.createElement('img');
        img.src = src;
        img.dataset.index = index;
        img.className = 'w-full h-24 object-cover rounded-md cursor-pointer transition-transform hover:scale-105';
        img.onclick = togglePhotoSelection;
        gallery.appendChild(img);
    });
    
    appState.selectedPhotos = [];
    updateSelectionButton();
    showScreen('selection');
}

function togglePhotoSelection(event) {
    const img = event.target;
    const index = parseInt(img.dataset.index);
    const selectedIndex = appState.selectedPhotos.indexOf(index);
    
    if (selectedIndex > -1) {
        appState.selectedPhotos.splice(selectedIndex, 1);
        img.classList.remove('thumbnail-selected');
    } else {
        if (appState.selectedPhotos.length < appState.selectedLayout.photoCount) {
            appState.selectedPhotos.push(index);
            img.classList.add('thumbnail-selected');
        } else {
            alert(`Anda hanya bisa memilih ${appState.selectedLayout.photoCount} foto.`);
        }
    }
    updateSelectionButton();
}

function updateSelectionButton() {
    const btn = document.getElementById('confirm-selection-button');
    const required = appState.selectedLayout.photoCount;
    const selected = appState.selectedPhotos.length;
    btn.disabled = selected !== required;
    btn.textContent = `Lanjutkan (${selected}/${required})`;
}

async function processAndFinalize() {
    showScreen('loading', 'Menyusun foto Anda...');
    
    try {
        const finalImage = await generateFinalImage();
        
        showScreen('loading', 'Mengunggah ke server...');
        const uploadResult = await uploadImage(finalImage);
        
        if (uploadResult && uploadResult.url) {
            displayFinalResult(uploadResult.url);
        } else {
            throw new Error('Upload failed');
        }
    } catch (error) {
        console.error('Processing error:', error);
        alert("Gagal memproses gambar. Silakan coba lagi.");
        showScreen('selection');
    }
}

function displayFinalResult(url) {
    const qrcodeContainer = document.getElementById('qrcode');
    const resultCanvas = document.getElementById('result-canvas');
    const photoLink = document.getElementById('photo-link');
    
    photoLink.value = url;
    qrcodeContainer.innerHTML = '';
    
    try {
        new QRCode(qrcodeContainer, { 
            text: url, 
            width: 150, 
            height: 150,
            colorDark: "#000000",
            colorLight: "#ffffff"
        });
    } catch (error) {
        console.error('QR Code generation error:', error);
    }
    
    const finalImg = new Image();
    finalImg.crossOrigin = "anonymous";
    finalImg.onload = () => {
        const ctx = resultCanvas.getContext('2d');
        resultCanvas.width = finalImg.width;
        resultCanvas.height = finalImg.height;
        ctx.drawImage(finalImg, 0, 0);
    };
    finalImg.onerror = () => {
        console.error('Failed to load final image');
    };
    finalImg.src = url;
    
    showScreen('result');
}

function generateFinalImage() {
    return new Promise((resolve, reject) => {
        try {
            const finalPhotos = appState.selectedPhotos.map(i => appState.capturedPhotos[i]);
            const photoImages = finalPhotos.map(src => {
                const img = new Image(); 
                img.crossOrigin = "anonymous";
                img.src = src; 
                return img;
            });
            const frameImg = new Image(); 
            frameImg.crossOrigin = "anonymous";
            frameImg.src = appState.selectedLayout.src;
            
            let loadedCount = 0;
            const totalImages = photoImages.length + 1; // +1 for frame

            
            const checkAllLoaded = () => {
                loadedCount++;
                if (loadedCount === totalImages) {
                    try {
                        // Gunakan ukuran asli frame
                        const canvas = document.createElement('canvas');
                        canvas.width = frameImg.naturalWidth;
                        canvas.height = frameImg.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        
                        // Log dimensi untuk debugging
                        console.log('Canvas size:', canvas.width, canvas.height);
                        console.log('Frame natural size:', frameImg.naturalWidth, frameImg.naturalHeight);

                        console.log('Mulai menggambar foto...');
                        console.log('Jumlah foto:', photoImages.length);
                        console.log('Jumlah slot:', appState.selectedLayout.slots.length);

                        // Set composite operation untuk foto
                        ctx.globalCompositeOperation = 'destination-over';


                        // Draw photos in the slots
                        photoImages.forEach((photoImg, index) => {
                            const slot = appState.selectedLayout.slots[index];
                            if (!slot) return;
                            
                            console.log('Processing photo:', index);
                            console.log('Photo dimensions:', photoImg.naturalWidth, 'x', photoImg.naturalHeight);
                            console.log('Original slot:', slot);

                            // Gunakan slot asli tanpa scaling
                            const scaledSlot = {
                                x: slot.x,
                                y: slot.y,
                                width: slot.width,
                                height: slot.height,
                                radius: slot.radius
                            };
                            
                            console.log('Using slot:', scaledSlot);

                            // Clip area foto (no rounding)
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(
                                scaledSlot.x, 
                                scaledSlot.y, 
                                scaledSlot.width, 
                                scaledSlot.height
                            );
                            ctx.clip();
                            
                            // Gambar foto dengan perhitungan aspek rasio
                            const photoRatio = photoImg.naturalWidth / photoImg.naturalHeight;
                            const slotRatio = scaledSlot.width / scaledSlot.height;
                            
                            // Calculate photo and slot ratios
                            let drawWidth, drawHeight, drawX, drawY;
                            
                            console.log('Photo size:', photoImg.naturalWidth, photoImg.naturalHeight);
                            console.log('Scaled slot:', scaledSlot);

                            if (photoImg.naturalWidth / photoImg.naturalHeight > scaledSlot.width / scaledSlot.height) {
                                // Jika foto lebih lebar, sesuaikan dengan tinggi slot dan crop sisi
                                drawHeight = scaledSlot.height;
                                drawWidth = drawHeight * photoRatio;
                                drawY = scaledSlot.y;
                                drawX = scaledSlot.x - (drawWidth - scaledSlot.width) / 2;
                            } else {
                                // Jika foto lebih tinggi atau sama, sesuaikan dengan lebar slot dan crop atas/bawah
                                drawWidth = scaledSlot.width;
                                drawHeight = drawWidth / photoRatio;
                                drawX = scaledSlot.x;
                                drawY = scaledSlot.y - (drawHeight - scaledSlot.height) / 2;
                            }
                            
                            console.log('Draw dimensions:', { drawX, drawY, drawWidth, drawHeight });
                            
                            // Gambar foto
                            console.log('Drawing photo at:', { drawX, drawY, drawWidth, drawHeight });
                            ctx.drawImage(photoImg, 0, 0, photoImg.naturalWidth, photoImg.naturalHeight,
                                        drawX, drawY, drawWidth, drawHeight);
                            ctx.restore();
                            console.log('Photo drawn');
                        });

                        // Reset composite operation dan gambar frame final
                        ctx.globalCompositeOperation = 'source-over';
                        console.log('Drawing final frame');
                        ctx.drawImage(frameImg, 0, 0);
                        
                        resolve(canvas.toDataURL('image/png'));
                    } catch (error) {
                        reject(error);
                    }
                }
            };
            
            // Set up load handlers
            frameImg.onload = checkAllLoaded;
            frameImg.onerror = () => reject(new Error('Failed to load frame image'));
            
            photoImages.forEach(img => {
                img.onload = checkAllLoaded;
                img.onerror = () => reject(new Error('Failed to load photo image'));
            });
            
        } catch (error) {
            reject(error);
        }
    });
}

async function uploadImage(imageDataUrl) {
    try {
        const response = await fetch(`${BACKEND_URL}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_data: imageDataUrl })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Upload failed:', error);
        return null;
    }
}

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawAndCropImage(ctx, img, dx, dy, dWidth, dHeight) {
    const imgAspectRatio = img.naturalWidth / img.naturalHeight;
    const slotAspectRatio = dWidth / dHeight;
    let sx, sy, sWidth, sHeight;
    
    if (imgAspectRatio > slotAspectRatio) {
        // Image is wider - crop sides
        sHeight = img.naturalHeight; 
        sWidth = sHeight * slotAspectRatio;
        sx = (img.naturalWidth - sWidth) / 2; 
        sy = 0;
    } else {
        // Image is taller - crop top/bottom
        sWidth = img.naturalWidth; 
        sHeight = sWidth / slotAspectRatio;
        sx = 0; 
        sy = (img.naturalHeight - sHeight) / 2;
    }
    
    ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
}

function resetApp() {
    // Stop camera if active
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    // Reset state
    Object.keys(appState).forEach(key => {
        if (Array.isArray(appState[key])) {
            appState[key] = [];
        } else {
            appState[key] = null;
        }
    });
    
    showScreen('landing');
}

// --- Event Listeners ---
document.getElementById('start-button').addEventListener('click', () => showScreen('frame'));
document.getElementById('frame-container').addEventListener('click', handleFrameSelection);
document.getElementById('use-camera-button').addEventListener('click', startCamera);
document.getElementById('upload-input').addEventListener('change', handleFileUpload);
document.getElementById('capture-button').addEventListener('click', handleCapture);
document.getElementById('done-capturing-button').addEventListener('click', goToSelectionScreen);
// document.getElementById('confirm-selection-button').addEventListener('click', processAndFinalize);
document.getElementById('confirm-selection-button').addEventListener('click', startCroppingProcess);
document.getElementById('retake-button').addEventListener('click', goToSelectionScreen);
document.getElementById('start-over-button').addEventListener('click', resetApp);

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', async () => {
    showScreen('loading', 'Memuat aplikasi...');
    
    try {
        await populateFrameChoices();
        showScreen('landing');
    } catch (error) {
        console.error('App initialization error:', error);
        alert('Gagal memuat aplikasi. Silakan refresh halaman.');
    }
});