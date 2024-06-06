var seriesList = document.getElementById('series-list');
var addSeriesButton = document.getElementById('add-series');
var seriesInput = document.getElementById('comic-series');
var dateInput = document.getElementById('comic-series-date');
var getRecentButton = document.getElementById('get-recent');
var output = document.getElementById('output');

var title = "getcomics.info downloader";

document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.sync.get('comicSeries', function(data) {
        displaySeries(data.comicSeries || []);
    });

    addSeriesButton.addEventListener('click', addSeries);
  
    seriesInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            addSeries();
        }
    });
    dateInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            addSeries();
        }
    });
  
    // Get recent issues
    getRecentButton.addEventListener('click', function() {
        log("Fetching new issues...<br>");
        chrome.storage.sync.get('comicSeries', async function(data) {
            const series = data.comicSeries || [];
            
            for (let s of sorted(series)) {
                // download one series at a time
                await searchAndDownloadSeries(s.name, s.date)
            }
            log("<br>All series processed.<br>");
        });
    });
});


function log(text, flush) {
    if (flush) {
        output.innerHTML = text;
    }
    else {
        output.innerHTML += `<br>${text}`;
    }
    output.scrollTop = output.scrollHeight;
}

function addSeries() {
    /**
     * Add new series to the DOM and chrome.storage.sync
     **/ 
    const seriesName = seriesInput.value.trim();
    const seriesDate = dateInput.value.trim() || getCurrentDate();

    if (!seriesName) {
        return
    }

    chrome.storage.sync.get('comicSeries', function(data) {
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
                seriesInput.value = '';
                dateInput.value = '';
            }
        );
    });
}


function displaySeries(series) {
    seriesList.innerHTML = '';

    for (let { name, date } of sorted(series)) {
        const listItem = document.createElement('li');
        listItem.innerHTML = `${name} (Last Updated: ${date}) <button class="remove-series">x</button>`;
        seriesList.appendChild(listItem);

        listItem.querySelector('.remove-series').addEventListener('click', () => {
            removeSeries(name);
        });
    }
}


function addSeriesToList(seriesName) {
    /**
     * Adds series to the DOM
     **/
    const li = document.createElement('li');

    const removeButton = document.createElement('button');
    removeButton.textContent = 'x';
    removeButton.addEventListener('click', function() {
        removeSeries(seriesName);
    });

    const seriesSpan = document.createElement('span');
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
    chrome.storage.sync.get('comicSeries', function(data) {
        let series = data.comicSeries || [];
        // series = series.filter(s => s !== seriesName);
        // chrome.storage.sync.set(
        //     {comicSeries: series}, 
        //     function() {
        //         seriesList.innerHTML = '';
        //         series.forEach(addSeriesToList);
        //     }
        // );
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
     * TODO: use the 'date' variable to control what is downloaded
     * TODO: consider how instead of date we could do individual issue
     * numbers
     **/
    const parser = new DOMParser();

    document.querySelector("title").innerText = `[Searching] ${title}`;
    var comicLinks = [];
    var page = -1;
    while (true) {
        page++;
        if (page == 0) {
            var searchUrl = `https://getcomics.info/?s=${encodeURIComponent(seriesName).replace(/%20/g, '+')}`;
        }
        else {
            var searchUrl = `https://getcomics.info/page/${page}?s=${encodeURIComponent(seriesName).replace(/%20/g, '+')}`;
        }
        
        var response = await fetch(searchUrl);

        // found the limit of results
        if (response.status == 404) {
            break
        }

        var html = await response.text();
  
        var newLinks = getComicDetails(
            parser.parseFromString(html, 'text/html'),
            date
        )

        // haven't found any more links (possibly due to date)
        if (newLinks.length == 0) {
            break
        }

        comicLinks = comicLinks.concat(newLinks);
    }

    let downloadingText = comicLinks.length == 1 ?  
        "comic found. Downloading..." :
        comicLinks.length > 1 ? 
            "comics found. Downloading..." :
            "comics found."
    log(`${seriesName}: ${comicLinks.length} ${downloadingText}`);

    // download comic links from the found comics one at a time
    var i = 0;
    for (let comicLink of comicLinks) {
        i++;
        document.querySelector("title").innerText = `[Downloading ${i}/${comicLinks.length}] ${title}`;
        var response = await fetch(comicLink.url);
        var data = await response.text();
        var html = parser.parseFromString(data, 'text/html');
        
        var downloadLinks = html.querySelectorAll("a[title='DOWNLOAD NOW' i]");

        for (let link of downloadLinks) {
            await downloadFile(link.href);
        }
    }
    document.querySelector("title").innerText = title;

    // all downloaded, update 'last updated' and refresh the list to show it
    chrome.storage.sync.get('comicSeries', function(data) {
        const series = data.comicSeries || [];

        try {
            for (let obj of series) {
                if (obj.name.toLowerCase() == seriesName.toLowerCase()) {
                    obj.date = getCurrentDate();
                    break
                }
            }
        }
        catch (err) {
            // could've been deleted in between downloading
            return
        }

        chrome.storage.sync.set(
            {comicSeries: series}, 
            function() {
                displaySeries(series);
            }
        );
    });
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
                time: comicDate
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
                reject(chrome.runtime.lastError);
            } else {
                chrome.downloads.onChanged.addListener(function onChanged(downloadDelta) {
                    if (downloadDelta.id === downloadId && downloadDelta.state && downloadDelta.state.current === 'complete') {
                        chrome.downloads.onChanged.removeListener(onChanged);
                        resolve();
                    } else if (downloadDelta.id === downloadId && downloadDelta.state && downloadDelta.state.current === 'interrupted') {
                        chrome.downloads.onChanged.removeListener(onChanged);
                        reject(new Error('Download interrupted'));
                    }
                });
            }
        });
    });
}


function parseDate(dateString) {
    // Split the string into an array of [year, month, day]
    const parts = dateString.split('-');
    
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
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(today.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}