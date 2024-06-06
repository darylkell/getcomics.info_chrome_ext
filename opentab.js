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