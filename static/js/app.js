// --- State Management & Configuration ---
const BACKEND_URL = 'http://127.0.0.1:8000'; 
const MAX_CAPTURES = 10;
const appState = {
    capturedPhotos: [],
    selectedPhotos: [],
    selectedLayout: null,
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
            
            // Scan for white pixels and find connected regions
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const index = (y * canvas.width + x) * 4;
                    const r = data[index];
                    const g = data[index + 1];
                    const b = data[index + 2];
                    
                    // Check if pixel is white (with some tolerance)
                    const isWhite = r > 250 && g > 250 && b > 250;
                    
                    // If pixel is white and not visited
                    if (isWhite && !visited[y * canvas.width + x]) {
                        const slot = floodFillAndGetBounds(data, visited, x, y, canvas.width, canvas.height);
                        
                        // Only consider regions large enough to be photo slots
                        const width = slot.maxX - slot.minX;
                        const height = slot.maxY - slot.minY;
                        const area = width * height;
                        
                        if (area > minSlotSize * minSlotSize) {
                            slots.push({
                                x: slot.minX,
                                y: slot.minY,
                                width: width,
                                height: height,
                                radius: Math.min(20, Math.floor(Math.min(width, height) * 0.1)) // Adaptive radius
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
            
            // Log detected slots for debugging
            console.log('Detected slots:', slots);
            
            resolve(slots);
        };
        
        img.onerror = () => {
            console.error('Failed to load frame image for slot detection');
            resolve([]); // Return empty array on error
        };
        
        img.src = frameImageSrc;
    });
}

// Flood fill algorithm to find connected white regions
function floodFillAndGetBounds(data, visited, startX, startY, width, height) {
    const stack = [{x: startX, y: startY}];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    
    // Get initial pixel color
    const startIndex = (startY * width + startX) * 4;
    const startR = data[startIndex];
    const startG = data[startIndex + 1];
    const startB = data[startIndex + 2];
    
    while (stack.length > 0) {
        const {x, y} = stack.pop();
        
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (visited[y * width + x]) continue;
        
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        
        // Check if current pixel is similar to start pixel (with tolerance)
        const isSimliar = Math.abs(r - startR) < 5 && 
                            Math.abs(g - startG) < 5 && 
                            Math.abs(b - startB) < 5;
        
        if (!isSimliar) continue;
        
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
                { x: 30, y: 30,  width: 530, height: 370, radius: 20 },
                { x: 30, y: 420, width: 530, height: 370, radius: 20 }
            ]
        },
        {
            id: 'frame_3_photos',
            name: 'Frame 3 Foto',
            src: '/static/frames/3/20250924_220911_0000.png',
            photoCount: 3,
            slots: [
                { x: 30, y: 30,  width: 530, height: 222, radius: 20 },
                { x: 30, y: 282, width: 530, height: 222, radius: 20 },
                { x: 30, y: 534, width: 530, height: 222, radius: 20 }
            ]
        },
        {
            id: 'frame_4_photos',
            name: 'Frame 4 Foto',
            src: '/static/frames/4/20250924_220911_0001.png',
            photoCount: 4,
            slots: [
                { x: 40,  y: 40,  width: 245, height: 340, radius: 20 },
                { x: 305, y: 40,  width: 245, height: 340, radius: 20 },
                { x: 40,  y: 400, width: 245, height: 340, radius: 20 },
                { x: 305, y: 400, width: 245, height: 340, radius: 20 }
            ]
        }
    ];
}

// --- Element References ---
const screens = {};
document.querySelectorAll('.screen').forEach(el => screens[el.id.replace('-screen','')] = el);

const video = document.getElementById('video');
const captureCanvas = document.getElementById('capture-canvas');

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
            const totalImages = photoImages.length + 1;
            
            const checkAllLoaded = () => {
                loadedCount++;
                if (loadedCount === totalImages) {
                    try {
                        const canvas = document.createElement('canvas');
                        
                        // Menggunakan ukuran frame asli
                        canvas.width = frameImg.naturalWidth;
                        canvas.height = frameImg.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        
                        // Gambar frame terlebih dahulu untuk mendapatkan area yang transparan
                        ctx.drawImage(frameImg, 0, 0);
                        
                        // Draw photos in slots
                        photoImages.forEach((photoImg, index) => {
                            const slot = appState.selectedLayout.slots[index];
                            if (!slot) return;

                            // Dapatkan dimensi frame asli dari hardcoded layout
                            const baseFrameWidth = 590;
                            const baseFrameHeight = 787;
                            
                            // Hitung skala berdasarkan ukuran frame asli
                            const scaleX = frameImg.naturalWidth / baseFrameWidth;
                            const scaleY = frameImg.naturalHeight / baseFrameHeight;
                            
                            // Skala slot sesuai dengan ukuran frame
                            const scaledX = slot.x * scaleX;
                            const scaledY = slot.y * scaleY;
                            const scaledWidth = slot.width * scaleX;
                            const scaledHeight = slot.height * scaleY;
                            const scaledRadius = slot.radius * scaleX;

                            ctx.save();
                            
                            // Buat clipping path untuk foto
                            roundedRect(ctx, 
                                scaledX, 
                                scaledY, 
                                scaledWidth, 
                                scaledHeight, 
                                scaledRadius
                            );
                            ctx.clip();
                            
                            // Hitung aspek rasio
                            const photoRatio = photoImg.naturalWidth / photoImg.naturalHeight;
                            const slotRatio = scaledWidth / scaledHeight;
                            
                            // Hitung dimensi foto yang akan digambar
                            let drawWidth, drawHeight;
                            
                            if (photoRatio > slotRatio) {
                                // Foto lebih lebar - sesuaikan dengan tinggi slot
                                drawHeight = scaledHeight;
                                drawWidth = scaledHeight * photoRatio;
                            } else {
                                // Foto lebih tinggi - sesuaikan dengan lebar slot
                                drawWidth = scaledWidth;
                                drawHeight = scaledWidth / photoRatio;
                            }
                            
                            // Hitung posisi untuk memusatkan foto
                            const drawX = scaledX + (scaledWidth - drawWidth) / 2;
                            const drawY = scaledY + (scaledHeight - drawHeight) / 2;
                            
                            // Gambar foto
                            ctx.drawImage(photoImg, 0, 0, photoImg.naturalWidth, photoImg.naturalHeight,
                                        drawX, drawY, drawWidth, drawHeight);
                            ctx.restore();
                        });
                        
                        resolve(canvas.toDataURL('image/png'));
                    } catch (error) {
                        reject(error);
                    }
                }
            };
            
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
    // Calculate aspect ratios
    const imgAspectRatio = img.naturalWidth / img.naturalHeight;
    const slotAspectRatio = dWidth / dHeight;
    
    // Calculate dimensions to fit the image in the slot while maintaining aspect ratio
    let drawWidth, drawHeight, drawX, drawY;
    
    if (imgAspectRatio > slotAspectRatio) {
        // Image is wider than slot
        drawHeight = dHeight;
        drawWidth = drawHeight * imgAspectRatio;
        drawX = dx - (drawWidth - dWidth) / 2;
        drawY = dy;
    } else {
        // Image is taller than slot
        drawWidth = dWidth;
        drawHeight = drawWidth / imgAspectRatio;
        drawX = dx;
        drawY = dy - (drawHeight - dHeight) / 2;
    }
    
    // Draw the full image, scaled and centered
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, drawX, drawY, drawWidth, drawHeight);
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
document.getElementById('confirm-selection-button').addEventListener('click', processAndFinalize);
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