/**
 * @file popup.js
 * @description Core logic for the getcomics.info downloader interface.
 */

// DOM Elements
const seriesList = document.getElementById("series-list");
const addSeriesButton = document.getElementById("add-series");
const seriesInput = document.getElementById("comic-series");
const dateInput = document.getElementById("comic-series-date");
const getRecentButton = document.getElementById("get-recent");
const pauseResumeButton = document.getElementById("pause-resume");
const cancelBatchButton = document.getElementById("cancel-batch");
const terminal = document.getElementById("terminal");
const verboseCheckbox = document.getElementById("verboseCheckbox");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const progressSection = document.getElementById("progress-section");
const progressBar = document.getElementById("progress-bar");
const statusText = document.getElementById("status-text");
const imageContainer = document.getElementById("imageContainer");
const currentComicImg = document.getElementById("current-comic-img");
const downloadingTitle = document.getElementById("downloadingTitle");
const emptyState = document.getElementById("empty-state");
const clearLogsButton = document.getElementById("clear-logs");

// Data Management Elements
const exportButton = document.getElementById("export-data");
const importButton = document.getElementById("import-data");
const importFileInput = document.getElementById("import-file-input");

// File Progress Elements
const fileProgressDetails = document.getElementById("file-progress-details");
const currentFileName = document.getElementById("current-file-name");
const currentFileSpeed = document.getElementById("current-file-speed");
const fileProgressBar = document.getElementById("file-progress-bar");
const currentFileSize = document.getElementById("current-file-size");
const currentFilePercent = document.getElementById("current-file-percent");
const skipFileButton = document.getElementById("skip-file");

/** @type {string} Default document title */
const defaultTitle = "getcomics.info downloader";

// State Management
let isProcessing = false;
let isPaused = false;
let isCancelled = false;
let isSkipping = false;
let currentDownloadId = null;

/**
 * Checks the current control state (Paused/Cancelled).
 * Yields if paused, throws if cancelled.
 */
async function checkControlState() {
    if (isCancelled) throw new Error("CANCELLED_BY_USER");
    while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (isCancelled) throw new Error("CANCELLED_BY_USER");
    }
}

/**
 * Initialize the application on DOMContentLoaded.
 */
document.addEventListener("DOMContentLoaded", function() {
    log("System initialized. Ready to download.", false, "info");

    // Load saved comic series
    chrome.storage.sync.get("comicSeries", function(data) {
        displaySeries(data.comicSeries || []);
    });

    // Load verbose logging preference
    chrome.storage.sync.get("getcomics_checkboxStatus", function(data) {
        if (data.getcomics_checkboxStatus) {
            verboseCheckbox.checked = true;
        }
    });

    addSeriesButton.addEventListener("click", addSeries);

    // Input validation for adding series
    seriesInput.addEventListener("keyup", function(event) {
        addSeriesButton.disabled = seriesInput.value.trim() === "";
        if (event.key === "Enter" && !addSeriesButton.disabled) {
            addSeries();
        }
    });

    dateInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            addSeries();
        }
    });
  
    // Trigger download process
    getRecentButton.addEventListener("click", function () {
        isProcessing = true;
        isPaused = false;
        isCancelled = false;
        isSkipping = false;

        getRecentButton.classList.add("hidden");
        pauseResumeButton.classList.remove("hidden");
        cancelBatchButton.classList.remove("hidden");
        pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
        progressBar.classList.remove("paused");
        
        progressSection.classList.remove("hidden");
        
        // Scroll to the bottom of the container to see both progress and terminal
        setTimeout(() => {
            terminal.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 100);

        downloadAllSelected().catch(err => {
            if (err.message === "CANCELLED_BY_USER") {
                log("Batch cancelled by user.", false, "warning");
                statusText.textContent = "Cancelled.";
            } else {
                log(`Unexpected error: ${err.message}`, false, "error");
            }
        }).finally(() => {
            resetProcessUI();
        });
    });

    pauseResumeButton.addEventListener("click", () => {
        isPaused = !isPaused;
        if (isPaused) {
            pauseResumeButton.innerHTML = '<i class="fas fa-play"></i> Resume';
            statusText.textContent = "Paused...";
            progressBar.classList.add("paused");
            log("Batch paused.", false, "warning");
            if (currentDownloadId !== null) {
                chrome.downloads.pause(currentDownloadId);
            }
        } else {
            pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
            progressBar.classList.remove("paused");
            log("Batch resumed.", false, "success");
            if (currentDownloadId !== null) {
                chrome.downloads.resume(currentDownloadId);
            }
        }
    });

    cancelBatchButton.addEventListener("click", () => {
        if (confirm("Are you sure you want to cancel the current batch?")) {
            isCancelled = true;
            isPaused = false; // Unblock the yield loop if paused
            if (currentDownloadId !== null) {
                chrome.downloads.cancel(currentDownloadId);
            }
        }
    });

    skipFileButton.addEventListener("click", () => {
        if (currentDownloadId !== null) {
            isSkipping = true;
            chrome.downloads.cancel(currentDownloadId);
            log("Skipping current file...", false, "warning");
        }
    });

    // Data Management
    exportButton.addEventListener("click", exportSeries);
    importButton.addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            importSeries(e.target.files[0]);
            e.target.value = ""; // Clear for next time
        }
    });

    // Toggle verbose logging
    verboseCheckbox.addEventListener("change", function () {
        chrome.storage.sync.set({ "getcomics_checkboxStatus": verboseCheckbox.checked });
        log(`Verbose logging ${verboseCheckbox.checked ? "enabled" : "disabled"}.`, true);
    });

    // Theme toggling
    const darkModeToggle = document.getElementById("dark-mode-toggle");
    darkModeToggle.addEventListener("click", function () {
        document.body.classList.toggle("dark-mode");
        const isDarkMode = document.body.classList.contains("dark-mode");
        localStorage.setItem("darkMode", isDarkMode ? "enabled" : "disabled");
        darkModeToggle.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });

    if (localStorage.getItem("darkMode") === "enabled") {
        document.body.classList.add("dark-mode");
        darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Clear logs
    clearLogsButton.addEventListener("click", () => {
        terminal.innerHTML = `<div class="terminal-line"><span class="log-time">[${getCurrentTime()}]</span> Logs cleared.</div>`;
    });

    // Select All
    selectAllCheckbox.addEventListener("change", function() {
        const checkboxes = document.querySelectorAll(".series-checkbox");
        checkboxes.forEach(cb => {
            if (cb.id !== "selectAllCheckbox") cb.checked = this.checked;
        });
        updateGetRecentButtonState();
    });
});

/**
 * Resets the UI back to idle state after processing or cancelling.
 */
function resetProcessUI() {
    isProcessing = false;
    isPaused = false;
    isCancelled = false;
    isSkipping = false;
    currentDownloadId = null;
    
    getRecentButton.classList.remove("hidden");
    pauseResumeButton.classList.add("hidden");
    cancelBatchButton.classList.add("hidden");
    
    selectAllCheckbox.checked = false;
    updateGetRecentButtonState();

    document.title = defaultTitle;

    setTimeout(() => {
        if (!isProcessing) {
            progressSection.classList.add("hidden");
            imageContainer.classList.add("hidden");
            fileProgressDetails.classList.add("hidden");
            currentComicImg.src = "";
            downloadingTitle.textContent = "";
            progressBar.style.width = "0%";
        }
    }, 3000);
}

/**
 * Logs messages to the terminal-style UI.
 * @param {string} text - The message to log.
 * @param {boolean} [isVerbose] - If true, only logs when verbose mode is active.
 * @param {string} [type] - The type of log (info, success, error, warning).
 */
function log(text, isVerbose, type = "info") {
    if (isVerbose && !verboseCheckbox.checked) return;

    const line = document.createElement("div");
    line.className = "terminal-line";
    
    const timeSpan = document.createElement("span");
    timeSpan.className = "log-time";
    timeSpan.textContent = `[${getCurrentTime()}]`;
    
    const contentSpan = document.createElement("span");
    contentSpan.className = `log-${type}`;
    contentSpan.textContent = ` ${text}`;
    
    line.appendChild(timeSpan);
    line.appendChild(contentSpan);
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

/**
 * Updates the state of the "Get Recent" button.
 */
function updateGetRecentButtonState() {
    const anyChecked = [...document.querySelectorAll(".series-checkbox:not(#selectAllCheckbox)")].some(cb => cb.checked);
    getRecentButton.disabled = !anyChecked;
}

/**
 * Orchestrates the download of all selected series.
 */
async function downloadAllSelected() {
    return new Promise(async (resolve, reject) => {
        try {
            const data = await chrome.storage.sync.get("comicSeries");
            let series = data.comicSeries || [];
            const selectedSeries = series.filter(s => {
                const cb = document.querySelector(`.series-checkbox[value="${s.name}"]`);
                return cb && cb.checked;
            });

            if (selectedSeries.length === 0) return resolve();

            // Reset previous run states
            document.querySelectorAll(".series-card").forEach(card => {
                card.classList.remove("completed", "processing");
                const badge = card.querySelector(".status-badge");
                if (badge) badge.textContent = "Idle";
            });

            log(`Starting download for ${selectedSeries.length} series...`, false, "info");
            progressBar.style.width = "0%";
            
            let processedCount = 0;
            let pagesFoundWithoutDownloadButtons = [];

            for (let s of selectedSeries) {
                await checkControlState();

                statusText.textContent = `Processing: ${s.name}...`;
                imageContainer.classList.add("hidden");
                fileProgressDetails.classList.add("hidden");
                currentComicImg.src = "";
                downloadingTitle.textContent = "";
                
                const card = document.querySelector(`.series-card[data-name="${s.name}"]`);
                if (card) {
                    card.classList.add("processing");
                    card.classList.remove("completed");
                }

                try {
                    let pagesNoButtons = await searchAndDownloadSeries(s.name, s.date);
                    pagesFoundWithoutDownloadButtons = pagesFoundWithoutDownloadButtons.concat(pagesNoButtons);
                    
                    if (card) {
                        card.classList.remove("processing");
                        card.classList.add("completed");
                        const badge = card.querySelector(".status-badge");
                        if (badge) badge.textContent = "Done";
                    }
                } catch (error) {
                    if (error.message === "CANCELLED_BY_USER") throw error; // bubble up
                    log(`Error processing ${s.name}: ${error.message}`, false, "error");
                    if (card) card.classList.remove("processing");
                }
                
                processedCount++;
                const percent = (processedCount / selectedSeries.length) * 100;
                progressBar.style.width = `${percent}%`;
            }
            
            log("All selected series processed.", false, "success");
            statusText.textContent = "Finished processing all series.";
            
            if (pagesFoundWithoutDownloadButtons.length > 0) {
                log(`${pagesFoundWithoutDownloadButtons.length} issues skipped due to missing download buttons.`, false, "error");
            }

            chrome.storage.sync.get("comicSeries", function(data) {
                displaySeries(data.comicSeries || []);
            });

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Adds a new series.
 */
function addSeries() {
    const name = seriesInput.value.trim().replace(/"/g, "'");
    const date = dateInput.value.trim() || getCurrentDate();

    if (!name) return;

    chrome.storage.sync.get("comicSeries", function(data) {
        const series = data.comicSeries || [];
        const index = series.findIndex(s => s.name.toLowerCase() === name.toLowerCase());

        if (index !== -1) {
            series[index].date = date;
            log(`Updated date for ${name} to ${date}.`);
        } else {
            series.push({ name, date });
            log(`Added series: ${name}.`, false, "success");
        }

        chrome.storage.sync.set({ comicSeries: series }, () => {
            displaySeries(series);
            seriesInput.value = "";
            dateInput.value = "";
            addSeriesButton.disabled = true;
        });
    });
}

/**
 * Renders the series grid.
 */
function displaySeries(series) {
    seriesList.innerHTML = "";
    
    if (series.length === 0) {
        emptyState.classList.remove("hidden");
        return;
    }
    emptyState.classList.add("hidden");

    for (let { name, date } of sorted(series)) {
        const card = document.createElement("li");
        card.className = "series-card";
        card.dataset.name = name;

        card.innerHTML = `
            <div class="card-header">
                <div class="series-info">
                    <span class="series-name">${name}</span>
                    <div class="series-date">
                        <i class="far fa-calendar-alt"></i> 
                        <span class="editable-date" title="Click to edit date">${date}</span>
                    </div>
                </div>
                <input type="checkbox" class="series-checkbox" value="${name}">
            </div>
            <div class="card-actions">
                <button class="btn btn-outline btn-icon remove-btn" title="Remove Series">
                    <i class="fas fa-trash-alt" style="color: var(--danger);"></i>
                </button>
                <span class="status-badge status-idle">Idle</span>
            </div>
        `;

        card.querySelector(".series-checkbox").addEventListener("change", updateGetRecentButtonState);

        card.querySelector(".remove-btn").addEventListener("click", () => {
            if (confirm(`Remove "${name}" from your list?`)) {
                removeSeries(name);
            }
        });

        card.querySelector(".editable-date").addEventListener("click", function() {
            const newDate = prompt(`Update last-checked date for "${name}":`, date);
            if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                updateSeriesDate(name, newDate);
            } else if (newDate) {
                alert("Invalid date format. Please use YYYY-MM-DD.");
            }
        });

        seriesList.appendChild(card);
    }
}

function updateSeriesDate(name, newDate) {
    chrome.storage.sync.get("comicSeries", (data) => {
        const series = data.comicSeries || [];
        const s = series.find(obj => obj.name === name);
        if (s) {
            s.date = newDate;
            chrome.storage.sync.set({ comicSeries: series }, () => {
                displaySeries(series);
                log(`Updated date for ${name} to ${newDate}.`);
            });
        }
    });
}

function removeSeries(name) {
    chrome.storage.sync.get("comicSeries", function(data) {
        const updated = (data.comicSeries || []).filter(s => s.name !== name);
        chrome.storage.sync.set({ comicSeries: updated }, () => {
            displaySeries(updated);
            log(`Removed ${name}.`, false, "info");
        });
    });
}

/**
 * Helper to fetch a resource with a timeout.
 */
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

/**
 * Retries an async function a specified number of times.
 */
async function withRetry(fn, retries = 3, delay = 2000) {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 1.5);
    }
}

/**
 * Scrapes and downloads a single series.
 */
async function searchAndDownloadSeries(seriesName, date) {
    const parser = new DOMParser();
    const card = document.querySelector(`.series-card[data-name="${seriesName}"]`);
    const badge = card ? card.querySelector(".status-badge") : null;
    
    if (badge) {
        badge.textContent = "Searching";
        badge.className = "status-badge status-active";
    }

    document.title = `[Searching] ${seriesName}`;
    
    let pagesFoundWithoutDownloadButtons = [];
    let comicLinks = [];
    let page = 0;

    while (true) {
        await checkControlState();

        page++;
        const searchUrl = `https://getcomics.info/page/${page}?s=${encodeURIComponent(seriesName).replace(/%20/g, "+")}`;
        
        try {
            const response = await withRetry(() => fetchWithTimeout(searchUrl));
            if (response.status === 404) break;

            const html = await response.text();
            const newLinks = getComicDetails(parser.parseFromString(html, "text/html"), date);
            if (newLinks.length === 0) break;
            comicLinks = comicLinks.concat(newLinks);
        } catch (error) {
            if (error.message === "CANCELLED_BY_USER") throw error;
            log(`Network error searching ${seriesName} (Page ${page}): ${error.message}`, false, "error");
            break; 
        }
    }

    log(`${seriesName}: Found ${comicLinks.length} new issues.`, false, comicLinks.length > 0 ? "success" : "info");

    for (let i = 0; i < comicLinks.length; i++) {
        await checkControlState();

        if (badge) badge.textContent = `Downloading ${i+1}/${comicLinks.length}`;
        const comicLink = comicLinks[i];
        document.title = `[Downloading ${i+1}/${comicLinks.length}] ${seriesName}`;

        let downloadLinks = [];
        try {
            const response = await withRetry(() => fetchWithTimeout(comicLink.url));
            const data = await response.text();
            const html = parser.parseFromString(data, "text/html");
            
            const downloadLinksRaw = [
                ...html.querySelectorAll("a[title*='DOWNLOAD' i]"),
                ...[...html.querySelectorAll("a")].filter(a => {
                    const text = a.innerText.trim().toLowerCase();
                    return text.includes("main server") || text.includes("download now") || text.includes("direct download");
                })
            ];
            
            // Deduplicate links based on href
            downloadLinks = [...new Set(downloadLinksRaw.map(a => a.href))].map(href => downloadLinksRaw.find(a => a.href === href));
        } catch (error) {
            if (error.message === "CANCELLED_BY_USER") throw error;
            log(`Network error fetching details for ${comicLink.title}: ${error.message}`, false, "error");
            continue;
        }

        if (downloadLinks.length === 0) {
            log(`Skipped: ${comicLink.title} (No download link found)`, true, "error");
            pagesFoundWithoutDownloadButtons.push(comicLink);
            continue;
        }

        imageContainer.classList.remove("hidden");
        fileProgressDetails.classList.remove("hidden");
        currentComicImg.src = comicLink.image;
        downloadingTitle.textContent = `Downloading: ${comicLink.title}`;

        for (let j = 0; j < downloadLinks.length; j++) {
            await checkControlState();
            isSkipping = false; // Reset skip flag for each part
            
            const link = downloadLinks[j];
            log(`Downloading issue ${i+1}/${comicLinks.length} part ${j+1}/${downloadLinks.length}`, true);
            try {
                const result = await downloadFile(link.href);
                if (result === "SKIPPED") {
                    log(`Skipped part ${j+1} of '${comicLink.title}'`, false, "warning");
                    continue; // Move to next part
                }
            } catch (error) {
                if (error.message === "CANCELLED_BY_USER") throw error;
                log(`Failed to download '${comicLink.title}': ${error.message}`, false, "error");
                
                // Provide manual download link
                const manualLine = document.createElement("div");
                manualLine.className = "terminal-line";
                manualLine.innerHTML = `<span class="log-time">[${getCurrentTime()}]</span> <span class="log-error"> ➜ Manual Download: <a href="${comicLink.url}" target="_blank" style="color: var(--primary); text-decoration: underline;">${comicLink.url}</a></span>`;
                terminal.appendChild(manualLine);
                terminal.scrollTop = terminal.scrollHeight;
            }
        }
    }

    if (badge) {
        badge.textContent = "Idle";
        badge.className = "status-badge status-idle";
    }

    // Update series date to today after successful processing
    await new Promise(resolve => {
        chrome.storage.sync.get("comicSeries", (data) => {
            const series = data.comicSeries || [];
            const s = series.find(obj => obj.name.toLowerCase() === seriesName.toLowerCase());
            if (s) s.date = getCurrentDate();
            chrome.storage.sync.set({ comicSeries: series }, resolve);
        });
    });

    return pagesFoundWithoutDownloadButtons;
}

function getComicDetails(html, date) {
    const filterDate = date ? parseDate(date) : null;
    const articles = html.querySelectorAll("article");
    const pages = [];

    for (const article of articles) {
        // More robust title selector: check for h1, h2, h3, or a generic .post-title class
        const titleTag = article.querySelector("h1.post-title, h1, h2.post-title, h2, h3, .post-title");
        const timeTag = article.querySelector("time");
        
        if (titleTag && timeTag) {
            const comicDate = new Date(timeTag.dateTime || timeTag.getAttribute('datetime'));
            const linkTag = titleTag.tagName.toLowerCase() === 'a' ? titleTag : titleTag.querySelector("a");

            if (!filterDate || comicDate > filterDate) {
                if (linkTag) {
                    const imgTag = article.querySelector("img");
                    pages.push({
                        title: titleTag.innerText.trim(),
                        url: linkTag.href,
                        time: comicDate,
                        image: imgTag ? imgTag.src : ""
                    });
                }
            }
        }
    }
    return pages;
}

/**
 * Formats bytes into a human-readable string.
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Chrome Downloads API wrapper with Pause/Cancel/Skip support and progress tracking.
 */
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({ url: url }, (downloadId) => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);

            currentDownloadId = downloadId;
            let lastBytesReceived = 0;
            let lastCheckTime = Date.now();

            const monitorInterval = setInterval(() => {
                chrome.downloads.search({ id: downloadId }, (items) => {
                    if (items && items[0]) {
                        const item = items[0];
                        const now = Date.now();
                        const duration = (now - lastCheckTime) / 1000;
                        const bytesReceived = item.bytesReceived;
                        const totalBytes = item.totalBytes;
                        
                        // Calculate Speed
                        if (duration > 0) {
                            const speed = (bytesReceived - lastBytesReceived) / duration;
                            currentFileSpeed.textContent = `${formatBytes(speed)}/s`;
                        }

                        // Update Progress Bar & Text
                        if (totalBytes > 0) {
                            const percent = (bytesReceived / totalBytes) * 100;
                            fileProgressBar.style.width = `${percent}%`;
                            currentFilePercent.textContent = `${Math.round(percent)}%`;
                            currentFileSize.textContent = `${formatBytes(bytesReceived)} / ${formatBytes(totalBytes)}`;
                        } else {
                            currentFileSize.textContent = `${formatBytes(bytesReceived)} / Unknown`;
                        }

                        currentFileName.textContent = item.filename ? item.filename.split(/[\\/]/).pop() : "Starting...";

                        lastBytesReceived = bytesReceived;
                        lastCheckTime = now;
                    }
                });
            }, 1000);

            const onChanged = (delta) => {
                if (delta.id === downloadId) {
                    if (delta.state?.current === "complete") {
                        clearInterval(monitorInterval);
                        chrome.downloads.onChanged.removeListener(onChanged);
                        currentDownloadId = null;
                        resolve("COMPLETE");
                    } else if (delta.state?.current === "interrupted") {
                        clearInterval(monitorInterval);
                        chrome.downloads.onChanged.removeListener(onChanged);
                        currentDownloadId = null;
                        if (isCancelled) {
                            resolve("CANCELLED"); 
                        } else if (isSkipping) {
                            isSkipping = false;
                            resolve("SKIPPED");
                        } else {
                            reject(new Error("Download interrupted"));
                        }
                    }
                }
            };
            chrome.downloads.onChanged.addListener(onChanged);
        });
    });
}

/**
 * Exports current comic series to a JSON file.
 */
async function exportSeries() {
    try {
        const data = await chrome.storage.sync.get("comicSeries");
        const series = data.comicSeries || [];
        const blob = new Blob([JSON.stringify(series, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().split('T')[0];
        
        chrome.downloads.download({
            url: url,
            filename: `getcomics-series-${timestamp}.json`,
            saveAs: true
        });
        
        log(`Exported ${series.length} series.`, false, "success");
    } catch (err) {
        log(`Export failed: ${err.message}`, false, "error");
    }
}

/**
 * Imports comic series from a JSON file.
 * @param {File} file 
 */
function importSeries(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const series = JSON.parse(e.target.result);
            if (!Array.isArray(series)) throw new Error("File format is not an array.");
            
            // Basic structural validation
            if (series.length > 0 && (!series[0].name || !series[0].date)) {
                throw new Error("Invalid series data structure. Expected {name, date}.");
            }
            
            if (confirm(`Import ${series.length} series? This will REPLACE your current list.`)) {
                await chrome.storage.sync.set({ comicSeries: series });
                displaySeries(series);
                log(`Successfully imported ${series.length} series.`, false, "success");
            }
        } catch (err) {
            log(`Import failed: ${err.message}`, false, "error");
            alert(`Import failed: ${err.message}`);
        }
    };
    reader.onerror = () => log("Error reading file.", false, "error");
    reader.readAsText(file);
}

function parseDate(dateString) {
    const [y, m, d] = dateString.split("-").map(n => parseInt(n, 10));
    return new Date(y, m - 1, d);
}

function sorted(list) {
    return [...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

function getCurrentDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getCurrentTime() {
    const now = new Date();
    return now.toTimeString().split(" ")[0];
}
