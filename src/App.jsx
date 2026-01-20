import { useState, useEffect, useCallback, useRef } from 'react'
import { jsPDF } from 'jspdf'
import ReactMarkdown from 'react-markdown'
import SettingsModal from './components/SettingsModal'
import { useAISummary } from './hooks/useAISummary'

export default function App() {
  const { getSummary, summaries, loadingSummary, sendChatMessage, chatLoading } = useAISummary()
  const [currentTab, setCurrentTab] = useState(null)
  const [summary, setSummary] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState(null)
  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [copied, setCopied] = useState(false)
  const [pageContent, setPageContent] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

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
      // Fetch page content for chat context
      chrome.runtime.sendMessage({ type: 'FETCH_PAGE_CONTENT', url: currentTab.url }, (response) => {
        if (response?.content) {
          setPageContent(response.content)
        }
      })
    }
  }

  const handleCopy = async () => {
    if (!summary?.bullets) return

    const date = new Date().toLocaleDateString()
    const bullets = summary.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')
    const text = `${currentTab?.title || 'Summary'}\n${currentTab?.url || ''}\nSummarized on ${date}\n\n${bullets}`

    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!summary?.bullets) return

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const maxWidth = pageWidth - margin * 2
    let y = 20

    // Title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    const title = currentTab?.title || 'Summary'
    const titleLines = doc.splitTextToSize(title, maxWidth)
    doc.text(titleLines, margin, y)
    y += titleLines.length * 7 + 5

    // URL
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    if (currentTab?.url) {
      const urlLines = doc.splitTextToSize(currentTab.url, maxWidth)
      doc.text(urlLines, margin, y)
      y += urlLines.length * 5 + 3
    }

    // Date
    const date = new Date().toLocaleDateString()
    doc.text(`Summarized on ${date}`, margin, y)
    y += 15

    // Bullets
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    summary.bullets.forEach((bullet, i) => {
      const bulletText = `${i + 1}. ${bullet}`
      const lines = doc.splitTextToSize(bulletText, maxWidth)

      // Check if we need a new page
      if (y + lines.length * 6 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage()
        y = 20
      }

      doc.text(lines, margin, y)
      y += lines.length * 6 + 4
    })

    // Generate filename from title
    const filename = (currentTab?.title || 'summary')
      .replace(/[^a-z0-9]/gi, '_')
      .substring(0, 50) + '.pdf'

    doc.save(filename)
  }

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])

    // Scroll to bottom
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

    const result = await sendChatMessage(userMessage, pageContent, summary?.bullets, chatMessages)

    if (result.error) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${result.error}`, isError: true }])
    } else {
      setChatMessages(prev => [...prev, { role: 'assistant', content: result.content }])
    }

    // Scroll to bottom after response
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendChat()
    }
  }

  // Clear chat when tab changes
  useEffect(() => {
    setChatMessages([])
    setPageContent(null)
  }, [currentTab?.url])

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
    <div className="min-h-full bg-theme-base">
      {/* Header */}
      <div className="bg-theme-elevated border-b border-theme px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-theme-accent rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <h1 className="font-semibold text-theme-primary">Bulletify.ai</h1>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-lg transition-colors"
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
        <div className="px-4 py-3 border-b border-theme bg-theme-elevated">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-theme-muted">{domain}</p>
            <div className="flex gap-1">
              {currentTab.isSelection && (
                <span className="px-1.5 py-0.5 text-xs bg-theme-accent-muted text-theme-accent-text rounded">Selection</span>
              )}
              {currentTab.isLink && (
                <span className="px-1.5 py-0.5 text-xs bg-theme-accent-subtle text-theme-accent rounded">Link</span>
              )}
              {isYouTubeUrl(currentTab.url) && (
                <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded">YouTube</span>
              )}
            </div>
          </div>
          <h2 className="font-medium text-theme-primary text-sm leading-tight line-clamp-2">{currentTab.title}</h2>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {/* Loading state */}
        {showLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-theme-secondary">
            <svg className="animate-spin h-8 w-8 mb-3 text-theme-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
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
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-theme-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-theme-secondary text-sm mb-4">No summary for this page yet</p>
            <button
              onClick={() => handleSummarize()}
              className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              Bulletify Page
            </button>
          </div>
        )}

        {/* Summary */}
        {showSummary && (
          <div>
            {/* Header with copy and regenerate */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-theme-muted uppercase tracking-wide">Summary</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-green-600 dark:text-green-400">Copied!</span>
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
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded transition-colors"
                  title="Download as PDF"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  PDF
                </button>
                <button
                  onClick={() => handleSummarize(true)}
                  disabled={loadingSummary}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded transition-colors disabled:opacity-50"
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
                <li key={i} className="card-tab flex gap-3 p-3">
                  <span className="text-theme-accent font-bold flex-shrink-0">{i + 1}.</span>
                  <span className="text-theme-secondary text-sm leading-relaxed">{bullet}</span>
                </li>
              ))}
            </ul>

            {/* Chat Section - Always visible */}
            <div className="mt-6 border-t border-theme pt-4">
              <div className="flex items-center gap-2 text-sm font-medium text-theme-primary mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-theme-accent" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
                Ask a Question
              </div>

              <div className="card-window">
                {/* Chat Messages */}
                <div className="max-h-72 overflow-y-auto p-3 space-y-3">
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-theme-muted text-center py-4">
                      Ask follow-up questions about this article...
                    </p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-theme-accent text-white'
                            : msg.isError
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                            : 'bg-theme-hover text-theme-secondary'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          msg.content
                        ) : (
                          <div className="prose prose-sm prose-stone dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>li]:my-0.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-theme-hover rounded-lg px-3 py-2 text-sm text-theme-muted">
                        <span className="inline-flex gap-1">
                          <span className="animate-bounce">.</span>
                          <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="border-t border-theme p-3">
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a question..."
                      className="input-theme flex-1 px-3 py-2 text-sm"
                      disabled={chatLoading}
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={chatLoading || !chatInput.trim()}
                      className="btn-primary px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Initial state - no tab yet */}
        {!currentTab && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-theme-secondary">
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
