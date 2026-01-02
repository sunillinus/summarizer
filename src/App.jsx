import { useState, useEffect, useCallback } from 'react'
import SettingsModal from './components/SettingsModal'
import { useAISummary } from './hooks/useAISummary'

export default function App() {
  const { getSummary, summaries, loadingSummary } = useAISummary()
  const [currentTab, setCurrentTab] = useState(null)
  const [summary, setSummary] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState(null)
  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [copied, setCopied] = useState(false)

  const isYouTubeUrl = (url) => url?.includes('youtube.com/watch') || url?.includes('youtu.be/')

  // Check for cached summary
  const checkCachedSummary = useCallback(async (url) => {
    // Check memory cache
    if (summaries.has(url)) {
      return summaries.get(url)
    }
    // Check persistent storage
    const stored = await chrome.storage.local.get(['summaryCache'])
    if (stored.summaryCache?.[url]) {
      return stored.summaryCache[url]
    }
    return null
  }, [summaries])

  // Handle tab change
  const handleTabChange = useCallback(async (tab) => {
    setCurrentTab(tab)
    setError(null)

    // Check if we have a cached summary for this URL
    const cached = await checkCachedSummary(tab.url)
    if (cached) {
      setSummary(cached)
    } else {
      setSummary(null)
    }
  }, [checkCachedSummary])

  // Handle context menu summarize request
  const handleContextMenuSummarize = useCallback(async (message) => {
    setError(null)
    setSummary(null)
    setIsFirstLoad(false)

    if (message.mode === 'page') {
      // Summarize current page
      setCurrentTab({ url: message.url, title: message.title })
      const result = await getSummary(message.url, message.title, true)
      if (result?.error) {
        setError(result.error)
      } else {
        setSummary(result)
      }
    } else if (message.mode === 'selection') {
      // Summarize selected text directly
      setCurrentTab({ url: message.url, title: message.title, isSelection: true })
      const result = await getSummary(message.url, message.title, true, message.text)
      if (result?.error) {
        setError(result.error)
      } else {
        setSummary(result)
      }
    } else if (message.mode === 'link') {
      // Summarize linked page
      setCurrentTab({ url: message.url, title: message.title, isLink: true })
      const result = await getSummary(message.url, message.title, true)
      if (result?.error) {
        setError(result.error)
      } else {
        setSummary(result)
      }
    }
  }, [getSummary])

  // Get active tab on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, (response) => {
      if (response?.tab) {
        setCurrentTab(response.tab)
      } else {
        setError('Could not get current tab')
      }
    })

    // Listen for messages from background
    const messageListener = (message) => {
      if (message.type === 'TAB_CHANGED' && message.tab) {
        setIsFirstLoad(false)
        handleTabChange(message.tab)
      }
      if (message.type === 'CONTEXT_MENU_SUMMARIZE') {
        handleContextMenuSummarize(message)
      }
    }
    chrome.runtime.onMessage.addListener(messageListener)

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [handleTabChange, handleContextMenuSummarize])

  // Auto-summarize only on first load (when panel opens)
  useEffect(() => {
    if (currentTab?.url && isFirstLoad && !summary && !loadingSummary) {
      handleSummarize()
    }
  }, [currentTab, isFirstLoad])

  const handleSummarize = async (forceRefresh = false) => {
    if (!currentTab?.url) return

    setError(null)
    const result = await getSummary(currentTab.url, currentTab.title, forceRefresh)

    if (result?.error) {
      setError(result.error)
      setSummary(null)
    } else {
      setSummary(result)
    }
  }

  const handleCopy = async () => {
    if (!summary?.bullets) return

    const text = summary.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const domain = currentTab?.url ? (() => {
    try {
      return new URL(currentTab.url).hostname.replace('www.', '')
    } catch {
      return ''
    }
  })() : ''

  // Determine what to show in the content area
  const showLoading = loadingSummary
  const showError = error && !loadingSummary
  const showSummary = summary && !loadingSummary && !error
  const showSummarizeButton = currentTab && !summary && !loadingSummary && !error

  return (
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <h1 className="font-semibold text-gray-900">Summarizer</h1>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Page info */}
      {currentTab && (
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">{domain}</p>
            <div className="flex gap-1">
              {currentTab.isSelection && (
                <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Selection</span>
              )}
              {currentTab.isLink && (
                <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Link</span>
              )}
              {isYouTubeUrl(currentTab.url) && (
                <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">YouTube</span>
              )}
            </div>
          </div>
          <h2 className="font-medium text-gray-900 text-sm leading-tight line-clamp-2">{currentTab.title}</h2>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {/* Loading state */}
        {showLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <svg className="animate-spin h-8 w-8 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-sm">
              {currentTab?.isSelection
                ? 'Summarizing selection...'
                : currentTab?.isLink && isYouTubeUrl(currentTab?.url)
                ? 'Opening YouTube video to extract transcript...'
                : currentTab?.isLink
                ? 'Fetching linked page and generating summary...'
                : isYouTubeUrl(currentTab?.url)
                ? 'Extracting transcript and generating summary...'
                : 'Generating summary...'}
            </p>
          </div>
        )}

        {/* Error state */}
        {showError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={() => handleSummarize(true)}
              className="mt-3 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Summarize button - shown when no summary exists */}
        {showSummarizeButton && (
          <div className="flex flex-col items-center justify-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-sm mb-4">No summary for this page yet</p>
            <button
              onClick={() => handleSummarize()}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              Summarize Page
            </button>
          </div>
        )}

        {/* Summary */}
        {showSummary && (
          <div>
            {/* Header with copy and regenerate */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Summary</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-green-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleSummarize(true)}
                  disabled={loadingSummary}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                  title="Regenerate summary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Regenerate
                </button>
              </div>
            </div>

            {/* Bullet points */}
            <ul className="space-y-2">
              {summary.bullets?.map((bullet, i) => (
                <li key={i} className="flex gap-3 bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <span className="text-blue-500 font-bold flex-shrink-0">{i + 1}.</span>
                  <span className="text-gray-700 text-sm leading-relaxed">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Initial state - no tab yet */}
        {!currentTab && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <p className="text-sm">Loading page info...</p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
