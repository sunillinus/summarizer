// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId })
})

// Set the side panel behavior to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

// Track the current tab URL to detect changes
let currentTabUrl = null

// Notify side panel of tab changes
async function notifyTabChange() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab && tab.url !== currentTabUrl) {
      currentTabUrl = tab.url
      // Send message to side panel (it may not be open, so catch errors)
      chrome.runtime.sendMessage({
        type: 'TAB_CHANGED',
        tab: { url: tab.url, title: tab.title, id: tab.id }
      }).catch(() => {}) // Ignore if side panel not open
    }
  } catch (e) {
    // Ignore errors
  }
}

// Listen for tab switches
chrome.tabs.onActivated.addListener(() => {
  notifyTabChange()
})

// Listen for URL changes in the current tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    // Check if this is the active tab
    chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
      if (activeTab && activeTab.id === tabId) {
        notifyTabChange()
      }
    })
  }
})

// Handle messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_PAGE_CONTENT') {
    fetchPageContent(message.url)
      .then(content => sendResponse({ content }))
      .catch(error => sendResponse({ error: error.message }))
    return true // Keep channel open for async response
  }

  if (message.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(tabs => {
        if (tabs[0]) {
          sendResponse({ tab: { url: tabs[0].url, title: tabs[0].title, id: tabs[0].id } })
        } else {
          sendResponse({ error: 'No active tab found' })
        }
      })
      .catch(error => sendResponse({ error: error.message }))
    return true
  }
})

async function fetchPageContent(url) {
  // Handle YouTube specially - extract transcript from current tab
  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
    return await extractYouTubeContent(url)
  }

  // For regular pages, fetch and parse HTML
  const response = await fetch(url)
  const html = await response.text()

  // Basic HTML to text extraction using regex (no DOM in service worker)
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')

  // Try to extract article or main content
  const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i)

  if (articleMatch) {
    text = articleMatch[1]
  } else if (mainMatch) {
    text = mainMatch[1]
  }

  // Remove remaining HTML tags and clean up whitespace
  text = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  // Limit content length
  return text.slice(0, 30000)
}

async function extractYouTubeContent(url) {
  // Extract video ID from URL
  const videoIdMatch = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/)
  if (!videoIdMatch) {
    throw new Error('Could not extract video ID from URL')
  }
  const videoId = videoIdMatch[1]

  // Find the YouTube tab
  const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/watch*' })
  const matchingTab = tabs.find(tab => tab.url && tab.url.includes(videoId))

  if (!matchingTab) {
    // Fallback to description only
    const response = await fetch(url)
    const html = await response.text()
    return extractYouTubeDescriptionFromHtml(html)
  }

  console.log('[YouTube] Found tab:', matchingTab.id)

  // Execute script to extract transcript from the current tab
  const results = await chrome.scripting.executeScript({
    target: { tabId: matchingTab.id },
    world: 'MAIN',
    func: extractTranscriptFromPage
  })

  if (results && results[0] && results[0].result) {
    const result = results[0].result
    if (result.success) {
      console.log('[YouTube] Got transcript, length:', result.data.transcript.length)
      let content = `YouTube Video: ${result.data.title}\n`
      if (result.data.channel) content += `Channel: ${result.data.channel}\n`
      content += `\nTranscript:\n${result.data.transcript}`
      return content.slice(0, 30000)
    } else {
      console.log('[YouTube] Extraction error:', result.error)
      if (result.debug) {
        console.log('[YouTube] Debug info:', JSON.stringify(result.debug))
      }
    }
  }

  // Fallback to description
  const response = await fetch(url)
  const html = await response.text()
  return extractYouTubeDescriptionFromHtml(html)
}

function extractYouTubeDescriptionFromHtml(html) {
  // Extract title
  const titleMatch = html.match(/<meta\s+name="title"\s+content="([^"]+)"/i) ||
                     html.match(/<title>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1] : 'Unknown Title'

  // Extract channel name
  const channelMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/i) ||
                       html.match(/<link\s+itemprop="name"\s+content="([^"]+)"/i)
  const channel = channelMatch ? channelMatch[1] : ''

  // Extract description
  const jsonLdMatch = html.match(/"description"\s*:\s*"([^"]{50,})"/i)
  let description = jsonLdMatch ? jsonLdMatch[1] : ''

  if (description) {
    try {
      description = JSON.parse(`"${description}"`)
    } catch (e) {
      description = description
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    }
  }

  if (!description) {
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
    description = descMatch ? descMatch[1] : ''
  }

  let content = `YouTube Video: ${title}\n`
  if (channel) content += `Channel: ${channel}\n`
  content += `\nDescription:\n${description}`

  if (content.length < 100) {
    content += `\n\n[Note: Could not extract transcript. Try clicking "Show transcript" on the video, then refresh.]`
  }

  return content.slice(0, 30000)
}

// This function runs in the YouTube page's context (MAIN world)
async function extractTranscriptFromPage() {
  try {
    // Helper to wait for element
    const waitForElement = (selector, timeout = 3000) => {
      return new Promise((resolve) => {
        const el = document.querySelector(selector)
        if (el) return resolve(el)

        const observer = new MutationObserver(() => {
          const el = document.querySelector(selector)
          if (el) {
            observer.disconnect()
            resolve(el)
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
        setTimeout(() => {
          observer.disconnect()
          resolve(null)
        }, timeout)
      })
    }

    // Helper to get transcript from DOM
    const getTranscriptFromDOM = () => {
      const transcriptItems = document.querySelectorAll('ytd-transcript-segment-renderer')
      if (transcriptItems && transcriptItems.length > 0) {
        const texts = []
        transcriptItems.forEach(item => {
          const textEl = item.querySelector('.segment-text')
          if (textEl && textEl.textContent) {
            texts.push(textEl.textContent.trim())
          }
        })
        return texts
      }
      return []
    }

    // Check if transcript is already open
    let texts = getTranscriptFromDOM()

    // If not, try to open it automatically
    if (texts.length === 0) {
      // Wait a bit for page to be ready
      await new Promise(r => setTimeout(r, 500))

      // Scroll down slightly to trigger lazy loading
      window.scrollTo(0, 300)
      await new Promise(r => setTimeout(r, 300))

      // Try to expand description
      const descriptionArea = document.querySelector('#description-inline-expander') ||
                              document.querySelector('ytd-text-inline-expander') ||
                              document.querySelector('#meta #description')
      if (descriptionArea) {
        descriptionArea.click()
        await new Promise(r => setTimeout(r, 500))
      }

      // Try the "...more" button
      const moreButton = document.querySelector('#expand') ||
                        document.querySelector('tp-yt-paper-button#expand') ||
                        document.querySelector('#description-inline-expander #expand') ||
                        document.querySelector('[aria-label="Show more"]')
      if (moreButton && moreButton.offsetParent !== null) {
        moreButton.click()
        await new Promise(r => setTimeout(r, 500))
      }

      // Look for "Show transcript" button
      const findTranscriptButton = () => {
        const selectors = [
          'button[aria-label="Show transcript"]',
          'ytd-video-description-transcript-section-renderer button',
          '#primary-button button',
          'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button'
        ]
        for (const sel of selectors) {
          const btn = document.querySelector(sel)
          if (btn) return btn
        }
        const allButtons = document.querySelectorAll('button, yt-button-shape button')
        for (const btn of allButtons) {
          if (btn.textContent?.toLowerCase().includes('transcript') ||
              btn.getAttribute('aria-label')?.toLowerCase().includes('transcript')) {
            return btn
          }
        }
        return null
      }

      let transcriptBtn = findTranscriptButton()

      if (!transcriptBtn) {
        await new Promise(r => setTimeout(r, 500))
        transcriptBtn = findTranscriptButton()
      }

      if (transcriptBtn) {
        transcriptBtn.click()
        await waitForElement('ytd-transcript-segment-renderer', 3000)
        await new Promise(r => setTimeout(r, 500))
        texts = getTranscriptFromDOM()
      }
    }

    if (texts.length > 0) {
      const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() ||
                    document.querySelector('yt-formatted-string.ytd-watch-metadata')?.textContent?.trim() ||
                    document.title
      const channel = document.querySelector('#owner #channel-name a')?.textContent?.trim() || ''
      return {
        success: true,
        data: { title, channel, transcript: texts.join(' ') }
      }
    }

    return {
      success: false,
      error: 'NO_TRANSCRIPT_DOM',
      debug: {
        hasDescriptionExpander: !!document.querySelector('#description-inline-expander'),
        hasExpandButton: !!document.querySelector('#expand'),
        hasTranscriptSection: !!document.querySelector('ytd-video-description-transcript-section-renderer'),
        transcriptButtonFound: !!document.querySelector('button[aria-label="Show transcript"]'),
        pageTitle: document.title
      }
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
