const subscribeButton = document.getElementById('subscribe-button-nav')
const syncButtonDiv = document.createElement('div')
const syncButtonId = 'sync-button-nav'
syncButtonDiv.id = syncButtonId
syncButtonDiv.innerHTML = '<button class="button  button--primary button--large button--nomin" type="button"><div class="button__content">Sync</div></button>'
subscribeButton.parentNode.insertBefore(syncButtonDiv, subscribeButton.nextSibling)
const syncButton = document.querySelector('#sync-button-nav button')

document.querySelector('#sync-button-nav .button').onclick = doSync

const myBeatportUrlFn = page => `https://www.beatport.com/my-beatport?page=${page}&per-page=150`
const myDownloadsUrl = page => `https://www.beatport.com/downloads/downloaded?page=${page}`

function scriptForTrackType(trackType) {
  return `
  (async () => {
  await new Promise(resolution => setTimeout(resolution, 5000))
  fetch('http://localhost:4000/stores/beatport/tracks', {
    mode: 'no-cors',
    method: 'POST',
    body: JSON.stringify({'${trackType}': window.Playables.tracks})
  })
  })()
  `
}

async function sendTracksFromPage(url, trackType) {
  const iframe = document.createElement('iframe')
  iframe.style.display = "none";
  iframe.src = url
  document.body.appendChild(iframe);

  await new Promise(resolution => setTimeout(resolution, 5000))
  const script = document.createElement('script')
  script.text = scriptForTrackType(trackType)
  iframe.contentWindow.document.documentElement.appendChild(script)
}

function updateLoadingStatus(currentPage) {
  syncButton.innerText = `Syncing: ${currentPage}/20`
}

async function doSync() {
  try {
    syncButton.disabled = true
    for (let page of Array.from(Array(6).keys()).splice(1)) {
      updateLoadingStatus(page)
      await sendTracksFromPage(myBeatportUrlFn(page), 'new')
    }
    for (let page of Array.from(Array(16).keys()).splice(1)) {
      updateLoadingStatus(page + 5)
      await sendTracksFromPage(myDownloadsUrl(page), 'downloaded')
    }
    syncButton.innerText = `Done!`
  } catch (e) {
    console.error(e)
    syncButton.innerText = `Error!`
  } finally {
    await new Promise(resolution => setTimeout(resolution, 5000))
    syncButton.disabled = false
    syncButton.innerText = `Sync`
  }
}
