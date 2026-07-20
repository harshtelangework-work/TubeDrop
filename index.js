console.log("JS Loaded");

// ===============================
// DOM References
// ===============================
const videoUrl = document.getElementById("videoUrl");
const clearBtn = document.getElementById("clearBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const errorMessage = document.getElementById("errorMessage");
const videoCard = document.getElementById("videoCard");
const downloadOptions = document.getElementById("downloadOptions");
const videoOption = document.getElementById("videoOption");
const audioOption = document.getElementById("audioOption");

const downloadBtn = document.getElementById("downloadBtn");
const progressCard = document.getElementById("progressCard");
const progressFill = document.getElementById("progressFill");
const progressPercent = document.getElementById("progressPercent");

const youtubeLogo = document.getElementById("youtubeLogo");
const progressCheck = document.getElementById("progressCheck");
const progressTrack = document.querySelector(".progress-track");

const browseBtn = document.getElementById("browseBtn");
const downloadFolder = document.getElementById("downloadFolder");

const loadingCard = document.getElementById("loadingCard");

const qualitySelect = document.getElementById("quality");

const downloadedSizeEl = document.getElementById("downloadedSize");
const downloadSpeedEl = document.getElementById("downloadSpeed");
const timeLeftEl = document.getElementById("timeLeft");

let availableFormats = [];
let selectedFormat = null;
let currentUrl = "";
let downloadType = "video";

// ===============================
// Initial UI State
// ===============================
loadingCard.style.display = "none";
videoCard.style.display = "none";
downloadOptions.style.display = "none";
progressCard.style.display = "none";

// ===============================
// URL Input
// ===============================
videoUrl.addEventListener("input", () => {
    clearBtn.style.display = videoUrl.value.length > 0 ? "block" : "none";
});

clearBtn.addEventListener("click", () => {
    videoUrl.value = "";
    clearBtn.style.display = "none";
    videoUrl.focus();
});

// ===============================
// Helper: update quality/size UI for the currently selected format
// ===============================
function updateSelectedFormatDisplay() {
    if (!selectedFormat) return;

    document.getElementById("resolution").textContent = selectedFormat.quality;

    if (selectedFormat.size > 0) {
        document.getElementById("fileSize").textContent =
            (selectedFormat.size / 1024 / 1024).toFixed(1) + " MB";
    } else {
        document.getElementById("fileSize").textContent = "Unknown";
    }
}

// ===============================
// Analyze Video
// ===============================
analyzeBtn.addEventListener("click", async () => {

    const url = videoUrl.value.trim();
    currentUrl = url;

    if (!url) {
        errorMessage.style.display = "flex";
        return;
    }

    errorMessage.style.display = "none";

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing...";

    loadingCard.style.display = "flex";
    videoCard.style.display = "none";
    downloadOptions.style.display = "none";

    try {

        const info = await window.electronAPI.analyzeMedia(url);

        document.getElementById("videoTitle").textContent = info.title || "Untitled";
        document.getElementById("channelName").textContent = info.channel || "Unknown";
        document.getElementById("duration").textContent = info.duration || "--:--";

        availableFormats = info.formats || [];

        // Rebuild quality options from the analyzed formats
        qualitySelect.innerHTML = "";

        availableFormats.forEach((format, index) => {
            const option = document.createElement("option");
            option.value = index;
            option.textContent = `${format.quality} (${format.ext.toUpperCase()})`;
            qualitySelect.appendChild(option);
        });

        if (availableFormats.length > 0) {
            selectedFormat = availableFormats[0];
            updateSelectedFormatDisplay();
        } else {
            selectedFormat = null;
            document.getElementById("resolution").textContent = "N/A";
            document.getElementById("fileSize").textContent = "Unknown";
        }

        if (info.thumbnail) {
            document.getElementById("thumbnail").src = info.thumbnail;
        }

        loadingCard.style.display = "none";
        videoCard.style.display = "flex";
        downloadOptions.style.display = "block";

    } catch (err) {

        loadingCard.style.display = "none";
        videoCard.style.display = "none";
        downloadOptions.style.display = "none";

        alert(err.message || "Failed to analyze video.");

    } finally {

        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Analyze Video";

    }

});

// ===============================
// Download Type Toggle
// ===============================
videoOption.addEventListener("click", () => {
    downloadType = "video";
    videoOption.classList.add("active");
    audioOption.classList.remove("active");
});

audioOption.addEventListener("click", () => {
    downloadType = "audio";
    audioOption.classList.add("active");
    videoOption.classList.remove("active");
});

// ===============================
// Quality Selection
// ===============================
qualitySelect.addEventListener("change", () => {
    selectedFormat = availableFormats[qualitySelect.value];
    updateSelectedFormatDisplay();
});

// ===============================
// Download
// ===============================
function resetProgressUI() {
    progressFill.style.width = "0%";
    progressPercent.textContent = "0%";

    youtubeLogo.style.opacity = "1";
    progressCheck.style.opacity = "0";
    youtubeLogo.style.left = "0px";

    downloadedSizeEl.textContent = "0 MB / 0 MB";
    downloadSpeedEl.textContent = "0 MB/s";
    timeLeftEl.textContent = "--:--";
}

downloadBtn.addEventListener("click", async () => {

    if (!currentUrl) {
        alert("Please analyze a video first.");
        return;
    }

    if (!selectedFormat) {
        alert("Please select a quality.");
        return;
    }

    if (!downloadFolder.value) {
        alert("Please select a download folder.");
        return;
    }

    resetProgressUI();

    progressCard.style.display = "block";
    requestAnimationFrame(() => {
        progressCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    try {

        downloadBtn.disabled = true;
        downloadBtn.textContent = "Downloading...";

        const result = await window.electronAPI.downloadMedia({
            url: currentUrl,
            formatId: selectedFormat.formatId,
            downloadFolder: downloadFolder.value,
            downloadType: downloadType
        });

        if (result.success) {

            progressFill.style.width = "100%";
            progressPercent.textContent = "100%";

            youtubeLogo.style.opacity = "0";
            progressCheck.style.opacity = "1";

            alert("✅ Download completed!");

        } else {
            alert(result.error || "Download failed.");
        }

    } catch (err) {

        console.error(err);
        alert(err.message || "Download failed.");

    } finally {

        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download";

    }

});

// ===============================
// Download Folder
// ===============================
browseBtn.addEventListener("click", async () => {
    const folder = await window.electronAPI.selectFolder();

    if (folder) {
        downloadFolder.value = folder;
    }
});

window.addEventListener("DOMContentLoaded", async () => {
    const savedFolder = await window.electronAPI.getDownloadFolder();

    if (savedFolder) {
        downloadFolder.value = savedFolder;
    }
});

// ===============================
// Download Progress (structured payload from server)
// ===============================
window.electronAPI.onDownloadProgress((progress) => {

    if (!progress) return;

    const percent = Math.min(100, Math.max(0, Number(progress.percent) || 0));
    const downloaded = progress.downloaded || "--";
    const total = progress.total || "--";
    const speed = progress.speed || "--";
    const eta = progress.eta || "--:--";

    progressCard.style.display = "block";

    progressFill.style.width = percent + "%";
    progressPercent.textContent = percent.toFixed(1) + "%";

    downloadedSizeEl.textContent = `${downloaded} / ${total}`;
    downloadSpeedEl.textContent = speed;
    timeLeftEl.textContent = eta;

    // Move TubeDrop logo along the progress track
    const trackWidth = progressTrack.clientWidth;
    const logoWidth = youtubeLogo.offsetWidth;

    youtubeLogo.style.left =
        ((percent / 100) * (trackWidth - logoWidth)) + "px";

    if (percent >= 100) {
        youtubeLogo.style.opacity = "0";
        progressCheck.style.opacity = "1";
    }

});
