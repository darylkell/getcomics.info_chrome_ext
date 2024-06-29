var seriesList = document.getElementById("series-list");
var addSeriesButton = document.getElementById("add-series");
var seriesInput = document.getElementById("comic-series");
var dateInput = document.getElementById("comic-series-date");
var getRecentButton = document.getElementById("get-recent");
var output = document.getElementById("output");
var verboseOutput = document.getElementById("verboseOutput");
var verboseCheckbox = document.getElementById("verboseCheckbox");

var title = "getcomics.info downloader";


document.addEventListener("DOMContentLoaded", function() {
    chrome.storage.sync.get("comicSeries", function(data) {
        displaySeries(data.comicSeries || []);
    });

    chrome.storage.sync.get("getcomics_checkboxStatus", function(data) {
        if (data.getcomics_checkboxStatus) {
            verboseCheckbox.click();
        }
    });

    addSeriesButton.addEventListener("click", addSeries);


    seriesInput.addEventListener("keyup", function(event) {
        if (seriesInput.value.trim() == "") {
            addSeriesButton.disabled = true;
            return;
        }
        else {
            addSeriesButton.disabled = false;
        }


        if (event.key === "Enter") {
            addSeries();
        }
    });

    dateInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            addSeries();
        }
    });
  
    getRecentButton.addEventListener("click", downloadAllSelected);

    verboseCheckbox.addEventListener("click", function () {
        verboseOutput.style.display = verboseCheckbox.checked ? "block" : "none";
        chrome.storage.sync.set({ "getcomics_checkboxStatus": verboseCheckbox.checked });
    })
});


function log(text, verbose, flush) {
    const textArea = verbose == undefined ? output : verboseOutput;
    if (flush) {
        textArea.value = text;
    }
    else {
        textArea.value += `\n${text}`;
    }
    textArea.scrollTop = textArea.scrollHeight;
}


function downloadAllSelected() {
    chrome.storage.sync.get("comicSeries", async function(data) {
        var pagesFoundWithoutDownloadButtons = [];
        let series = data.comicSeries || [];
        
        series = series.filter(
            s => document.querySelector(`input[value="${s.name}"]`).checked &&
            s.date < getCurrentDate()
        );
        log(`[${getCurrentTime()}]  Fetching new issues for ${series.length} series...\n`);

        let promises = series.map(async (s) => {
            // download one series at a time, track pages we will have to download manually
            let pagesNoButtons = await searchAndDownloadSeries(s.name, s.date);
            pagesFoundWithoutDownloadButtons = pagesFoundWithoutDownloadButtons.concat(pagesNoButtons);
        });
        await Promise.all(promises);
        
        log(`\n[${getCurrentTime()}]  All series processed.\n`);

        if (pagesFoundWithoutDownloadButtons.length != 0) {
            log("\nDownload buttons could not be found on the following pages:");
            for (page of pagesFoundWithoutDownloadButtons) {
                log(` - ${pagesFoundWithoutDownloadButtons.title}`);
                log(`   ${pagesFoundWithoutDownloadButtons.url}\n`)
            }
            log("\n")
        }

        chrome.storage.sync.get("comicSeries", async function(data) {
            displaySeries(data.comicSeries || []);
        });
    }); 
}


function addSeries() {
    /**
     * Add new series to the DOM and chrome.storage.sync
     **/ 
    const seriesName = seriesInput.value.trim().replace(/"/g, "'");
    const seriesDate = dateInput.value.trim() || getCurrentDate();

    if (!seriesName) {
        return
    }

    chrome.storage.sync.get("comicSeries", function(data) {
        const series = data.comicSeries || [];

        var alreadyExists = series.some(obj => obj.name.toLowerCase() == seriesName.toLowerCase());

        if (alreadyExists) {
            for (let obj of series) {
                if (obj.name.toLowerCase() == seriesName.toLowerCase()) {
                    obj.date = seriesDate;
                    break
                }
            }
        }
        else {
            series.push({ name: seriesName, date: seriesDate });
        }

        chrome.storage.sync.set(
            {comicSeries: series}, 
            function() {
                displaySeries(series);
                seriesInput.value = "";
                dateInput.value = "";
            }
        );
    });
}


function displaySeries(series) {
    seriesList.innerHTML = "";

    // Add 'Select All' checkbox
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.id = "selectAllCheckbox";
    selectAllCheckbox.addEventListener("change", function() {
        const checkboxes = document.querySelectorAll(".series-checkbox");
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });

        getRecentButton.disabled = ![...document.querySelectorAll(".series-checkbox")].some(
            checkbox => checkbox.checked
        )
    });

    const selectAllLabel = document.createElement("label");
    selectAllLabel.htmlFor = "selectAllCheckbox";
    selectAllLabel.textContent = "Select All";

    const selectAllListItem = document.createElement("li");
    selectAllListItem.appendChild(selectAllCheckbox);
    selectAllListItem.appendChild(selectAllLabel);
    seriesList.appendChild(selectAllListItem);

    // Add series with checkboxes and remove button
    for (let { name, date } of sorted(series)) {
        const listItem = document.createElement("li");

        const seriesCheckbox = document.createElement("input");
        seriesCheckbox.type = "checkbox";
        seriesCheckbox.className = "series-checkbox";
        seriesCheckbox.value = name;
        seriesCheckbox.id = `checkbox-${name}`;
        seriesCheckbox.addEventListener("click", () => {
            getRecentButton.disabled = ![...document.querySelectorAll(".series-checkbox")].some(
                checkbox => checkbox.checked
            )
        });

        const removeButton = document.createElement("button");
        removeButton.className = "remove-series";
        removeButton.textContent = "x";
        removeButton.addEventListener("click", () => {
            removeSeries(name);
            listItem.remove();
        });

        const seriesLabel = document.createElement("label");
        seriesLabel.htmlFor = `checkbox-${name}`;
        seriesLabel.textContent = `${name} (Last Updated: ${date})`;

        listItem.appendChild(seriesCheckbox);
        listItem.appendChild(removeButton);
        listItem.appendChild(seriesLabel);

        seriesList.appendChild(listItem);
    }
}


function addSeriesToList(seriesName) {
    /**
     * Adds series to the DOM
     **/
    const li = document.createElement("li");

    const removeButton = document.createElement("button");
    removeButton.textContent = "x";
    removeButton.addEventListener("click", function() {
        removeSeries(seriesName);
    });

    const seriesSpan = document.createElement("span");
    seriesSpan.textContent = seriesName;

    li.appendChild(removeButton);
    li.appendChild(seriesSpan);
    seriesList.appendChild(li);
}


function removeSeries(seriesName) {
    /**
     * Removes a series from chrome.storage and re-writes the list of 
     * series in the DOM to match the new list
     * 
     **/
    chrome.storage.sync.get("comicSeries", function(data) {
        let series = data.comicSeries || [];
        const updatedSeries = series.filter(s => s.name !== seriesName);
        chrome.storage.sync.set(
            {comicSeries: updatedSeries},
            function() {
                displaySeries(updatedSeries);
            }
        )
    });
}


async function searchAndDownloadSeries(seriesName, date) {
    /**
     * Fetch comics for the series, then parse the comic pages for 
     * downloadable comic links and download them one at a time.
     * 
     **/
    const parser = new DOMParser();

    document.querySelector("title").innerText = `[Searching] ${title}`;
    
    var pagesFoundWithoutDownloadButtons = [];
    var comicLinks = [];
    var page = 0;
    while (true) {
        page++;
        var searchUrl = `https://getcomics.info/page/${page}?s=${encodeURIComponent(seriesName).replace(/%20/g, "+")}`;

        var response = await fetch(searchUrl);

        // found the limit of results
        if (response.status == 404) {
            break
        }

        var html = await response.text();
  
        var newLinks = getComicDetails(
            parser.parseFromString(html, "text/html"),
            date
        )

        // haven't found any more links (possibly due to date)
        if (newLinks.length == 0) {
            break
        }

        comicLinks = comicLinks.concat(newLinks);
    }

    if (comicLinks.length) {
        log(`                 --- ${seriesName} ---`, "verbose")
    }

    let downloadingText = comicLinks.length == 1 ?  
        "comic found. Downloading..." :
        comicLinks.length > 1 ? 
            "comics found. Downloading..." :
            "comics found."
    log(`${seriesName}:  ${comicLinks.length} ${downloadingText}`);

    // download comic links from the found comics one at a time
    var i = 0;
    for (let comicLink of comicLinks) {
        i++;
        document.querySelector("title").innerText = `[Downloading ${i}/${comicLinks.length}] ${title}`;

        var response = await fetch(comicLink.url);
        var data = await response.text();
        var html = parser.parseFromString(data, "text/html");
        var downloadLinks = html.querySelectorAll("a[title='DOWNLOAD NOW' i]");

        if (downloadLinks.length == 0) {
            log(` 🔗 ${comicLink.url}\n    ❌ Download buttons found:  0\n`, "verbose");
            pagesFoundWithoutDownloadButtons.push(comicLink)
            continue
        }
        
        log(` 🔗 ${comicLink.url}\n    ✅ Download buttons found:  ${downloadLinks.length}\n`, "verbose");

        document.querySelector("img").src = comicLink.image;
        document.querySelector("#downloadingTitle").innerText = `Downloading '${comicLink.title}'`;

        for (let link of downloadLinks) {
            log(`    [${getCurrentTime()}] ↓ Downloading\n    ${link.href}\n`, "verbose")

            try {
                await downloadFile(link.href);
            } catch (error) {
                if (error.message == "Download removed") {
                    log(`Download of '${comicLink.title}' was removed by the user. Continuing downloads...`)
                } else if (error.message == "Download paused") {
                    log(`Download of '${comicLink.title}' was paused by the user. Continuing downloads...`)
                }
            }
        }

        document.querySelector("img").src = "";
        document.querySelector("#downloadingTitle").innerText = "";
    }
    document.querySelector("title").innerText = title;

    // all downloaded, update "last updated" and refresh the list to show it
    await new Promise((resolve, reject) => {
        chrome.storage.sync.get("comicSeries", function(data) {
            const series = data.comicSeries || [];

            try {
                for (let obj of series) {
                    if (obj.name.toLowerCase() === seriesName.toLowerCase()) {
                        obj.date = getCurrentDate();
                        break;
                    }
                }
            } catch (err) {
                return reject(err);
            }

            chrome.storage.sync.set({comicSeries: series}, function() {
                resolve();
            });
        });
    });

    return pagesFoundWithoutDownloadButtons;
}


function getComicDetails(html, date) {
    /**
     * Parses the comics for a series, returning attributes needed 
     * to find the comic links
     **/
    if (date != undefined) {
        date = parseDate(date);
    }

    var articles = html.querySelectorAll("article");

    if (articles.length == 0) {
        return []
    }

    var pages = [];
    for (var article of articles) {
        let title_tag = article.querySelector("h1.post-title");
        let comicDate = new Date(article.querySelector("time").dateTime);

        if (date == undefined || comicDate > date) {
            pages.push({
                title: title_tag.innerText,
                url: title_tag.querySelector("a").href,
                time: comicDate,
                image: article.querySelector("img").src
            })
        }
    }
 
    return pages
}


function downloadFile(url) {
    /**
     * Downloads a file but only proceeds when the file has finished 
     * getcomics.info is too slow to try multiple downloads...
     **/
    return new Promise((resolve, reject) => {
        chrome.downloads.download({ url: url }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.log(chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } 

            chrome.downloads.onChanged.addListener(function onChanged(downloadDelta) {
                if (
                    downloadDelta.id === downloadId && 
                    downloadDelta.state && 
                    downloadDelta.state.current === "complete"
                    ) {
                    chrome.downloads.onChanged.removeListener(onChanged);
                    resolve();
                }
                else if (
                    downloadDelta.id === downloadId && 
                    downloadDelta.paused?.current
                    ) {
                    chrome.downloads.onChanged.removeListener(onChanged);
                    reject(new Error("Download paused"));
                }
                else if (
                    downloadDelta.id === downloadId && 
                    downloadDelta.state && 
                    downloadDelta.state.current === "interrupted"
                    ) {
                    // if download is removed by user
                    chrome.downloads.onChanged.removeListener(onChanged);
                    reject(new Error("Download removed"));
                }
                else if (downloadDelta.id === downloadId) {
                    console.log(`[${getCurrentTime()}]  Unknown download state change:`)
                    console.log(downloadDelta);
                }
            });
        });
    });
}


function parseDate(dateString) {
    // Split the string into an array of [year, month, day]
    const parts = dateString.split("-");
    
    // Note: JavaScript months are 0-based, so subtract 1 from the month
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    // Create and return the Date object
    return new Date(year, month, day);
}


function sorted(list) {
    /**
     * Sorts a list alphabetically, ignoring case
     */
    let sortedList = [...list].sort((a, b) => {
        if (a.name.toLowerCase() < b.name.toLowerCase()) {
            return -1;
        }
        if (a.name.toLowerCase() > b.name.toLowerCase()) {
            return 1;
        }
        return 0;
    });
    return sortedList
}


function getCurrentDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are zero-based
    const day = String(today.getDate()).padStart(2, "0");
    
    return `${year}-${month}-${day}`;
}


function getCurrentTime() {
    const now = new Date();
    let hours = now.getHours().toString().padStart(2, "0"); // Ensure 2 digits
    let minutes = now.getMinutes().toString().padStart(2, "0"); // Ensure 2 digits
    let seconds = now.getSeconds().toString().padStart(2, "0"); // Ensure 2 digits

    return `${hours}:${minutes}:${seconds}`;
}




// chrome.storage.sync.get('comicSeries', function(data) {
//     let comicsList = data.comicSeries || [];
    
//     // Update the date for each item in the list
//     let updatedComicsList = comicsList.map(comic => {
//         comic.date = "2024-06-14";
//         return comic;
//     });

//     // Save the updated list back to chrome.storage.sync
//     chrome.storage.sync.set({ 'comicSeries': updatedComicsList }, function() {
//         console.log('Data updated successfully!');
//     });
// });
