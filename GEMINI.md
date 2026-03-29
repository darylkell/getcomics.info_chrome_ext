# Gemini Project Context: getcomics.info Downloader

## Project Overview
This is a Chrome Extension designed to automate the sequential downloading of comic series from `getcomics.info`. It allows users to track multiple series and a "last checked" date, automatically searching for and downloading new releases since that date.

### Key Technologies
- **Manifest V3**: Modern Chrome Extension architecture.
- **Vanilla JavaScript**: All logic is implemented in `popup.js` and `opentab.js` without external dependencies.
- **Chrome APIs**: Uses `chrome.storage` for data persistence, `chrome.downloads` for file handling, and `chrome.tabs`/`chrome.scripting` for navigation.
- **DOMParser**: Used to scrape `getcomics.info` search results and individual post pages.

### Architecture
- `manifest.json`: Extension configuration and permissions.
- `opentab.html/js`: A small "bridge" that ensures the main interface (`popup.html`) opens in a full browser tab rather than a tiny popup window.
- `popup.html/js`: The primary application interface and logic.
- `styles.css`: UI styling, including support for dark mode.

## Building and Running
As a manifest-v3 extension with no build step, it is "run" by loading it into a Chromium-based browser.

### Installation / Setup
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select the root directory of this project.

### Key Commands / Workflow
- **Add Series**: Enter a series name and optional start date.
- **Get Recent**: Scrapes the site for all tracked series and downloads new issues sequentially.
- **Verbose Mode**: Toggles detailed logging of the scraping and download process.

## Development Conventions
- **Sequential Downloads**: To avoid over-burdening the source site and triggering rate limits, downloads are strictly sequential (one file at a time).
- **Persistence**: Series data and user preferences are stored in `chrome.storage.sync`, allowing them to persist across devices for the same Chrome profile.
- **Scraping Logic**: 
    - Search results are fetched via `https://getcomics.info/page/{n}?s={query}`.
    - Articles are filtered by the `time` element against the stored `date`.
    - It specifically looks for "DOWNLOAD NOW" or "Main Server" links on the post pages.
- **UI State**: The `title` of the tab is used to provide status updates (e.g., `[Searching]`, `[Downloading 1/5]`).

### TODOs / Potential Improvements
- [x] Add robust error handling for network timeouts during scraping (Implemented via AbortController and Retry logic).
- [x] Improve the parsing logic if `getcomics.info` changes their HTML structure (Implemented with broader selectors).
- [x] Consider adding a "Pause/Resume" feature for large batches (Implemented).
- [x] Consider the ability to import/export the series, include date last scraped (Implemented).
- [x] Is it possible to show the state of the current download (% complete, including progress bar, download speed, filename)? (Implemented).
- [x] Consider the ability to skip a download, if possible. It should cancel that download and move on to the next item (Implemented).
- [x] When the page loads, it shows as a 00 timestamp like: "[00:00:00] System initialized. Ready to download." (Fixed with dynamic initial logging).