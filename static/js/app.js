document.addEventListener('DOMContentLoaded', () => {
    
    // --- State Management & Configuration ---
    const BACKEND_URL = 'http://127.0.0.1:8000';
    const MAX_CAPTURES = 10;
    const appState = {
        capturedPhotos: [],
        selectedPhotos: [], // Menyimpan INDEKS dari capturedPhotos
        selectedLayout: null,
    };
    let frameLayouts = [];

    // --- Referensi Elemen DOM ---
    const screens = {
        landing: document.getElementById('landing-screen'),
        frame: document.getElementById('frame-screen'),
        method: document.getElementById('method-screen'),
        capture: document.getElementById('capture-screen'),
        selection: document.getElementById('selection-screen'),
        result: document.getElementById('result-screen'),
        loading: document.getElementById('loading-screen'),
    };
    const videoEl = document.getElementById('video');
    const captureCanvasEl = document.getElementById('capture-canvas');
    const frameContainer = document.getElementById('frame-container');
    const galleryContainer = document.getElementById('gallery-container');
    
    // --- Slot Detection (Tidak Berubah) ---
    async function detectPhotoSlots(frameImageSrc, minSlotSize = 50) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const visited = new Array(canvas.width * canvas.height).fill(false);
                const slots = [];
                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        if (data[(y * canvas.width + x) * 4 + 3] < 128 && !visited[y * canvas.width + x]) {
                            const slot = floodFillAndGetBounds(data, visited, x, y, canvas.width, canvas.height);
                            if ((slot.maxX - slot.minX) * (slot.maxY - slot.minY) > minSlotSize) {
                                slots.push({ x: slot.minX, y: slot.minY, width: slot.maxX - slot.minX, height: slot.maxY - slot.minY });
                            }
                        }
                    }
                }
                slots.sort((a, b) => a.y - b.y || a.x - b.x);
                resolve(slots);
            };
            img.onerror = () => resolve([]);
            img.src = frameImageSrc;
        });
    }

    function floodFillAndGetBounds(data, visited, startX, startY, width, height) {
        const stack = [{ x: startX, y: startY }];
        let minX = startX, maxX = startX, minY = startY, maxY = startY;
        while (stack.length > 0) {
            const { x, y } = stack.pop();
            if (x < 0 || x >= width || y < 0 || y >= height || visited[y * width + x] || data[(y * width + x) * 4 + 3] >= 128) continue;
            visited[y * width + x] = true;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            stack.push({ x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 });
        }
        return { minX, maxX, minY, maxY };
    }

    async function createDynamicFrameLayout(frameData) {
        const slots = await detectPhotoSlots(frameData.src);
        return { ...frameData, photoCount: slots.length, slots };
    }

    async function loadFrameConfigurations() {
        const staticFrameData = [
            { id: 'frame_2_photos', name: 'Frame 2 Foto', src: '/static/frames/2/20250924_221409_0000.png' },
            { id: 'frame_3_photos', name: 'Frame 3 Foto', src: '/static/frames/3/20250924_220911_0000.png' },
            { id: 'frame_4_photos', name: 'Frame 4 Foto', src: '/static/frames/4/20250924_220911_0001.png' },
        ];
        const dynamicLayouts = await Promise.all(staticFrameData.map(createDynamicFrameLayout));
        return dynamicLayouts.filter(layout => layout.photoCount > 0);
    }

    // --- App Logic ---
    function showScreen(screenName, text = 'Memproses...') {
        Object.values(screens).forEach(screen => screen?.classList.remove('active'));
        screens[screenName]?.classList.add('active');
        document.getElementById('loading-text').textContent = text;
    }

    async function populateFrameChoices() {
        frameContainer.innerHTML = '<div class="col-span-2 text-center text-gray-500">Memuat bingkai...</div>';
        try {
            frameLayouts = await loadFrameConfigurations();
            frameContainer.innerHTML = frameLayouts.map(layout => `
                <div class="frame-choice text-center" data-id="${layout.id}">
                    <img src="${layout.src}" class="w-full rounded-lg shadow-md hover:ring-4 ring-blue-400">
                    <p class="text-sm font-medium mt-2">${layout.name}</p>
                    <p class="text-xs text-gray-500">${layout.photoCount} foto</p>
                </div>`).join('');
        } catch (error) {
            frameContainer.innerHTML = '<div class="col-span-2 text-center text-red-500">Gagal memuat bingkai.</div>';
        }
    }

    function handleFrameSelection(e) {
        const frameChoice = e.target.closest('.frame-choice');
        if (!frameChoice) return;
        appState.selectedLayout = frameLayouts.find(l => l.id === frameChoice.dataset.id);
        if (appState.selectedLayout) showScreen('method');
    }

    // PERUBAHAN KUNCI: Menyesuaikan rasio aspek kamera
    async function startCamera() {
        showScreen('capture');
        const firstSlot = appState.selectedLayout.slots[0];
        const targetAspectRatio = firstSlot.width / firstSlot.height;

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                aspectRatio: { ideal: targetAspectRatio },
                facingMode: 'user'
            }
        };

        // --- PERUBAHAN KUNCI DIMULAI DI SINI ---

        // 1. Atur gaya CSS elemen video secara dinamis
        videoEl.style.aspectRatio = targetAspectRatio;
        videoEl.style.objectFit = 'cover'; // Memastikan video mengisi area tanpa distorsi

        // --- PERUBAHAN KUNCI SELESAI ---

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoEl.srcObject = stream;
            await videoEl.play();
            captureCanvasEl.width = videoEl.videoWidth;
            captureCanvasEl.height = videoEl.videoHeight;
            updateCaptureTitle();
        } catch (err) {
            console.error("Gagal memulai kamera dengan rasio aspek, mencoba tanpa:", err);
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                videoEl.srcObject = stream;
                await videoEl.play();
                captureCanvasEl.width = videoEl.videoWidth;
                captureCanvasEl.height = videoEl.videoHeight;
                updateCaptureTitle();
            } catch (fallbackErr) {
                alert("Tidak bisa mengakses kamera.");
                showScreen('method');
            }
        }
    }

    
    function updateCaptureTitle() {
        document.getElementById('capture-title').textContent = `Foto: ${appState.capturedPhotos.length}/${MAX_CAPTURES} (Perlu ${appState.selectedLayout.photoCount})`;
    }

    function handleCapture() {
        if (appState.capturedPhotos.length >= MAX_CAPTURES) return;
        const ctx = captureCanvasEl.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, captureCanvasEl.width, captureCanvasEl.height);
        appState.capturedPhotos.push(captureCanvasEl.toDataURL('image/jpeg', 0.9));
        updateCaptureTitle();
    }

    function handleFileUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        showScreen('loading', 'Memproses gambar...');
        Promise.all(files.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        }))).then(dataUrls => {
            appState.capturedPhotos.push(...dataUrls);
            goToSelectionScreen();
        }).catch(() => {
            alert('Gagal memproses file.');
            showScreen('method');
        });
        event.target.value = null;
    }

    function goToSelectionScreen() {
        if (videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(track => track.stop());
            videoEl.srcObject = null;
        }
        galleryContainer.innerHTML = appState.capturedPhotos.map((src, index) =>
            `<img src="${src}" data-index="${index}" class="w-full h-24 object-cover rounded-md cursor-pointer transition-transform hover:scale-105">`
        ).join('');
        document.getElementById('selection-title').textContent = `Pilih ${appState.selectedLayout.photoCount} foto`;
        appState.selectedPhotos = [];
        updateSelectionButton();
        showScreen('selection');
    }

    function togglePhotoSelection(event) {
        const img = event.target.closest('img');
        if (!img) return;
        const index = parseInt(img.dataset.index);
        const selectedIndex = appState.selectedPhotos.indexOf(index);
        if (selectedIndex > -1) {
            appState.selectedPhotos.splice(selectedIndex, 1);
            img.classList.remove('thumbnail-selected');
        } else if (appState.selectedPhotos.length < appState.selectedLayout.photoCount) {
            appState.selectedPhotos.push(index);
            img.classList.add('thumbnail-selected');
        } else {
            alert(`Hanya bisa memilih ${appState.selectedLayout.photoCount} foto.`);
        }
        updateSelectionButton();
    }

    function updateSelectionButton() {
        const btn = document.getElementById('confirm-selection-button');
        const { photoCount } = appState.selectedLayout;
        const { length } = appState.selectedPhotos;
        btn.disabled = length !== photoCount;
        btn.textContent = `Lanjutkan (${length}/${photoCount})`;
    }
    
    // PERUBAHAN KUNCI: Fungsi ini akan menggambar gambar dengan logika center-crop
    function drawImageToSlot(ctx, img, slot) {
        const imgRatio = img.naturalWidth / img.naturalHeight;
        const slotRatio = slot.width / slot.height;
        let sx, sy, sWidth, sHeight;

        if (imgRatio > slotRatio) { // Gambar lebih lebar dari slot
            sHeight = img.naturalHeight;
            sWidth = sHeight * slotRatio;
            sx = (img.naturalWidth - sWidth) / 2;
            sy = 0;
        } else { // Gambar lebih tinggi dari slot
            sWidth = img.naturalWidth;
            sHeight = sWidth / slotRatio;
            sx = 0;
            sy = (img.naturalHeight - sHeight) / 2;
        }
        ctx.drawImage(img, sx, sy, sWidth, sHeight, slot.x, slot.y, slot.width, slot.height);
    }

    async function processAndFinalize() {
        showScreen('loading', 'Menyusun foto...');
        try {
            const finalImage = await generateFinalImage();
            showScreen('loading', 'Mengunggah...');
            const uploadResult = await uploadImage(finalImage);
            if (uploadResult?.url) {
                displayFinalResult(uploadResult.url);
            } else {
                throw new Error('Upload gagal');
            }
        } catch (error) {
            alert("Gagal memproses gambar.");
            showScreen('selection');
        }
    }

    function displayFinalResult(url) {
        const qrcodeContainer = document.getElementById('qrcode');
        const resultCanvas = document.getElementById('result-canvas');
        document.getElementById('photo-link').value = url;
        qrcodeContainer.innerHTML = '';
        new QRCode(qrcodeContainer, { text: url, width: 150, height: 150 });

        const finalImg = new Image();
        finalImg.crossOrigin = "anonymous";
        finalImg.onload = () => {
            const ctx = resultCanvas.getContext('2d');
            resultCanvas.width = finalImg.naturalWidth;
            resultCanvas.height = finalImg.naturalHeight;
            ctx.drawImage(finalImg, 0, 0);
        };
        finalImg.src = url;
        showScreen('result');
    }

    // PERUBAHAN KUNCI: Menggunakan fungsi drawImageToSlot
    function generateFinalImage() {
        return new Promise((resolve, reject) => {
            const frameImg = new Image();
            frameImg.crossOrigin = "anonymous";
            frameImg.src = appState.selectedLayout.src;

            const photoImages = appState.selectedPhotos.map(index => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = appState.capturedPhotos[index];
                return img;
            });

            let loadedCount = 0;
            const allImages = [frameImg, ...photoImages];
            const onImageLoad = () => {
                if (++loadedCount === allImages.length) {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = frameImg.naturalWidth;
                        canvas.height = frameImg.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        photoImages.forEach((photoImg, i) => {
                            const slot = appState.selectedLayout.slots[i];
                            if (slot) {
                                drawImageToSlot(ctx, photoImg, slot); // Gunakan fungsi baru
                            }
                        });
                        ctx.drawImage(frameImg, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                    } catch (e) { reject(e); }
                }
            };
            allImages.forEach(img => {
                img.onload = onImageLoad;
                img.onerror = () => reject(new Error('Gagal memuat gambar.'));
            });
        });
    }

    async function uploadImage(imageDataUrl) {
        try {
            const response = await fetch(`${BACKEND_URL}/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data: imageDataUrl })
            });
            return response.ok ? response.json() : null;
        } catch (error) {
            return null;
        }
    }

    function resetApp() {
        if (videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(track => track.stop());
            videoEl.srcObject = null;
        }
        Object.assign(appState, { capturedPhotos: [], selectedPhotos: [], selectedLayout: null });
        showScreen('landing');
    }

    // --- Inisialisasi dan Event Listeners ---
    (async () => {
        document.getElementById('start-button').addEventListener('click', () => showScreen('frame'));
        frameContainer.addEventListener('click', handleFrameSelection);
        galleryContainer.addEventListener('click', togglePhotoSelection);
        document.getElementById('use-camera-button').addEventListener('click', startCamera);
        document.getElementById('upload-button').addEventListener('click', () => document.getElementById('upload-input').click());
        document.getElementById('upload-input').addEventListener('change', handleFileUpload);
        document.getElementById('capture-button').addEventListener('click', handleCapture);
        document.getElementById('done-capturing-button').addEventListener('click', goToSelectionScreen);
        document.getElementById('retake-button').addEventListener('click', goToSelectionScreen);
        document.getElementById('start-over-button').addEventListener('click', resetApp);
        // PERUBAHAN: Tombol konfirmasi sekarang langsung memproses gambar
        document.getElementById('confirm-selection-button').addEventListener('click', processAndFinalize);

        showScreen('loading', 'Memuat aplikasi...');
        await populateFrameChoices();
        showScreen('landing');
    })();
});