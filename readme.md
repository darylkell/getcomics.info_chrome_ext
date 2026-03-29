# getcomics.info Downloader

A Chrome extension for sequentially downloading comic series from `getcomics.info`.

> **Note**: This is an unofficial tool and is not affiliated with or released by `getcomics.info`. Please support the site directly at [getcomics.org/support](https://getcomics.org/support/).

## Features

- **Series Tracking**: Add and manage a list of your favorite comic series.
- **Incremental Downloads**: Track the "last updated" date for each series to only download new releases.
- **Sequential Downloading**: Downloads one comic at a time to minimize server load and ensure reliable completion.
- **Real-time Status**: Monitor progress via the tab title and dedicated output panes.
- **Dark Mode Support**: A clean, togglable dark interface for comfortable use.
- **Sync Support**: Series data and settings are synced to your Chrome profile.

## Installation

This extension is currently available for manual installation via "Load Unpacked" mode in Chromium-based browsers (Chrome, Edge, Brave, etc.).

1. **Download the source code**: Clone this repository or download the ZIP file and extract it.
2. **Open Extensions Page**: Navigate to `chrome://extensions/` in your browser.
3. **Enable Developer Mode**: Toggle the switch in the top-right corner.
4. **Load Unpacked**: Click the "Load unpacked" button and select the project root directory.

## Usage

1. **Open the interface**: Click the extension icon in your browser toolbar. It will open in a full browser tab for better visibility.
2. **Add a Series**: 
   - Enter the name of the series (e.g., "The Amazing Spider-Man").
   - (Optional) Enter a starting date in `YYYY-MM-DD` format.
   - Click **Add**.
3. **Download New Issues**:
   - Check the boxes for the series you want to update.
   - Click **Get Recent**.
   - The extension will search for any issues released after the "Last Updated" date and begin downloading them one by one.
4. **Verbose Logging**: Toggle the "Verbose" checkbox to see detailed scraping and download logs.

## Security Warning

Please properly vet any scripts you download from the internet. While this codebase is clean and provided in an un-obfuscated format for transparency, you should always exercise caution when installing developer-mode extensions.

## License

This project is provided for educational and personal use. Please respect the terms of service of the source website.
