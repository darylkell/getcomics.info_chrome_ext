/**
 * @file opentab.js
 * @description Ensures the extension interface (popup.html) opens in a full browser tab 
 * rather than a small popup window. If the tab already exists, it switches focus to it.
 */
chrome.tabs.query({ url: chrome.runtime.getURL("popup.html") }, (tabs) => {
    if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
    } else {
        chrome.tabs.create({
            url: chrome.runtime.getURL("popup.html")
        });
    }
});
window.close();