const videoElement = document.getElementById('video_input');
const canvasElement = document.getElementById('canvas_output');
const canvasCtx = canvasElement.getContext('2d');
const drawingCanvas = document.createElement('canvas');
const dctx = drawingCanvas.getContext('2d');

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const landingPage = document.getElementById('landing-page');
const doodleInterface = document.getElementById('doodle-interface');
const loadingOverlay = document.getElementById('loading-overlay');
const shapeSelect = document.getElementById('shape-select');

// State Variables
let lastX = 0, lastY = 0;
let smoothX = 0, smoothY = 0;
let startX = 0, startY = 0; 
let initialized = false;
let isDrawing = false;
let currentColor = "#00FF00"; 
let currentShape = "line"; 
let hoverTimer = 0;
let stream = null; 

// Constants
const smoothingFactor = 0.35;
const hoverThreshold = 30; 
const eraserSize = 80; // Updated larger eraser size

const buttons = [
    { name: 'Green', color: '#00FF00', x: 100, y: 60, radius: 30 },
    { name: 'Blue',  color: '#0000FF', x: 200, y: 60, radius: 30 },
    { name: 'Red',   color: '#FF0000', x: 300, y: 60, radius: 30 }
];

// 1. Initialize MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

hands.onResults(onResults);

// --- NAVIGATION ---
startBtn.onclick = async () => {
    landingPage.classList.add('hidden');
    doodleInterface.classList.remove('hidden');
    await startApp();
};

stopBtn.onclick = () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    doodleInterface.classList.add('hidden');
    landingPage.classList.remove('hidden');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
    }
    dctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    initialized = false;
};

shapeSelect.onchange = (e) => { currentShape = e.target.value; };

// --- CORE DETECTION ---
async function startApp() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 } 
        });
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            runDetection();
        };
    } catch (err) {
        console.error("Camera Error:", err);
        alert("Camera blocked! Please allow access to use the Doodle Aid.");
    }
}

async function runDetection() {
    if (!doodleInterface.classList.contains('hidden') && videoElement.readyState >= 2) {
        await hands.send({ image: videoElement });
    }
    requestAnimationFrame(runDetection);
}

// 4. Processing Results
function onResults(results) {
    if (loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
        loadingOverlay.classList.add('hidden');
    }
    if (!initialized && videoElement.videoWidth > 0) {
        // Match drawing resolution to display size
        canvasElement.width = drawingCanvas.width = canvasElement.clientWidth;
        canvasElement.height = drawingCanvas.height = canvasElement.clientHeight;
        
        dctx.lineWidth = 6;
        dctx.lineCap = 'round';
        dctx.lineJoin = 'round';
        initialized = true;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw Camera Feed
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            handleGestures(landmarks);
        }
    }
    
    // Overlay the drawing layer
    canvasCtx.drawImage(drawingCanvas, 0, 0);
    canvasCtx.restore();
}

// 5. Gesture and Button Logic
function handleGestures(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    const targetX = indexTip.x * canvasElement.width;
    const targetY = indexTip.y * canvasElement.height;

    // Smoothing (Lerp)
    smoothX += (targetX - smoothX) * smoothingFactor;
    smoothY += (targetY - smoothY) * smoothingFactor;

    // --- A. VIRTUAL BUTTONS ---
    let isHovering = false;
    buttons.forEach(btn => {
        canvasCtx.beginPath();
        canvasCtx.fillStyle = btn.color;
        canvasCtx.globalAlpha = 0.5;
        canvasCtx.arc(btn.x, btn.y, btn.radius, 0, Math.PI * 2);
        canvasCtx.fill();
        canvasCtx.globalAlpha = 1.0;

        const dist = Math.hypot(targetX - btn.x, targetY - btn.y);
        if (dist < btn.radius) {
            isHovering = true;
            hoverTimer++;
            
            // Loading Ring
            canvasCtx.beginPath();
            canvasCtx.strokeStyle = "white";
            canvasCtx.lineWidth = 4;
            canvasCtx.arc(btn.x, btn.y, btn.radius + 5, 0, (hoverTimer / hoverThreshold) * Math.PI * 2);
            canvasCtx.stroke();

            if (hoverTimer >= hoverThreshold) {
                currentColor = btn.color;
                hoverTimer = 0;
            }
        }
    });
    if (!isHovering) hoverTimer = 0;

    // --- B. GESTURE DETECTION ---
    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    const isOpenPalm = (middleTip.y < landmarks[10].y) && 
                       (ringTip.y < landmarks[14].y) && 
                       (pinkyTip.y < landmarks[18].y);

    // --- C. ACTIONS ---
    if (isOpenPalm) {
        // Eraser Visual (Red Circle)
        canvasCtx.beginPath();
        canvasCtx.strokeStyle = "rgba(255, 0, 0, 0.7)";
        canvasCtx.lineWidth = 4;
        canvasCtx.arc(smoothX, smoothY, eraserSize, 0, 2 * Math.PI);
        canvasCtx.stroke();

        // Erase Logic
        dctx.globalCompositeOperation = 'destination-out';
        dctx.beginPath();
        dctx.arc(smoothX, smoothY, eraserSize, 0, Math.PI * 2);
        dctx.fill();
        dctx.globalCompositeOperation = 'source-over';
        
        lastX = 0;
        isDrawing = false;
    } 
    else if (pinchDist < 0.08) {
        // Start Drawing Mode
        if (!isDrawing) {
            isDrawing = true;
            startX = smoothX;
            startY = smoothY;
        }

        if (currentShape === "line") {
            // Free Draw Logic
            dctx.strokeStyle = currentColor;
            if (lastX !== 0) {
                dctx.beginPath();
                dctx.moveTo(lastX, lastY);
                dctx.lineTo(smoothX, smoothY);
                dctx.stroke();
            }
        } else {
            // Shape Preview (Dotted Lines)
            canvasCtx.beginPath();
            canvasCtx.strokeStyle = currentColor;
            canvasCtx.setLineDash([5, 5]);
            if (currentShape === "circle") {
                let radius = Math.hypot(smoothX - startX, smoothY - startY);
                canvasCtx.arc(startX, startY, radius, 0, Math.PI * 2);
            } else if (currentShape === "square") {
                canvasCtx.strokeRect(startX, startY, smoothX - startX, smoothY - startY);
            }
            canvasCtx.stroke();
            canvasCtx.setLineDash([]);
        }
        lastX = smoothX; lastY = smoothY;

        // Visual Pointer
        canvasCtx.fillStyle = "white";
        canvasCtx.beginPath();
        canvasCtx.arc(smoothX, smoothY, 8, 0, 2 * Math.PI);
        canvasCtx.fill();
    } else {
        // Pinch Released: Finalize Shape stamping
        if (isDrawing) {
            if (currentShape !== "line") {
                dctx.strokeStyle = currentColor;
                dctx.beginPath();
                if (currentShape === "circle") {
                    let radius = Math.hypot(smoothX - startX, smoothY - startY);
                    dctx.arc(startX, startY, radius, 0, Math.PI * 2);
                } else if (currentShape === "square") {
                    dctx.strokeRect(startX, startY, smoothX - startX, smoothY - startY);
                }
                dctx.stroke();
            }
            isDrawing = false;
        }
        lastX = 0;
        
        // Idle Cursor
        canvasCtx.fillStyle = currentColor;
        canvasCtx.beginPath();
        canvasCtx.arc(smoothX, smoothY, 10, 0, 2 * Math.PI);
        canvasCtx.fill();
    }
}

// 6. UI Controls
document.getElementById('clearBtn').onclick = () => dctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

document.getElementById('saveBtn').onclick = () => {
    const link = document.createElement('a');
    link.download = 'ansh-doodle.png';
    // Combine layers for the final image
    link.href = canvasElement.toDataURL();
    link.click();
};