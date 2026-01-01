import { useState, useCallback, useEffect } from 'react'

// Robust JSON parsing with fallback extraction
function parseAIResponse(text) {
  // Try to extract and parse JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    let jsonStr = jsonMatch[0]

    // Try direct parse first
    try {
      const parsed = JSON.parse(jsonStr)
      if (parsed.bullets && Array.isArray(parsed.bullets)) {
        // Clean up bullets - trim whitespace and filter empty
        parsed.bullets = parsed.bullets
          .map(b => typeof b === 'string' ? b.trim() : '')
          .filter(b => b.length > 0)
        return parsed
      }
    } catch (e) {
      // JSON malformed, try to fix common issues
    }

    // Fix common JSON issues
    let fixed = jsonStr
      // Remove newlines within strings (between quotes)
      .replace(/("\s*:\s*\[[\s\S]*?\])/g, (match) => {
        return match.replace(/\n/g, ' ')
      })
      // Remove control characters
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      // Fix trailing commas
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}')
      // Normalize whitespace
      .replace(/\s+/g, ' ')

    try {
      const parsed = JSON.parse(fixed)
      if (parsed.bullets && Array.isArray(parsed.bullets)) {
        parsed.bullets = parsed.bullets
          .map(b => typeof b === 'string' ? b.trim() : '')
          .filter(b => b.length > 0)
        return parsed
      }
    } catch (e2) {
      // Still failing, try regex extraction
    }

    // Extract bullets using regex from JSON-like structure
    const bulletRegex = /"([^"]{20,})"/g
    const bullets = []
    let match
    while ((match = bulletRegex.exec(jsonStr)) !== null) {
      const bullet = match[1].trim()
      // Skip if it looks like a key name
      if (!bullet.includes(':') || bullet.length > 50) {
        bullets.push(bullet)
      }
    }
    if (bullets.length > 0) {
      return { bullets }
    }
  }

  // Fallback: extract bullets manually from non-JSON text
  const bullets = []
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // Match bullet points: - bullet, • bullet, * bullet, 1. numbered, 1) numbered
    const bulletMatch = trimmed.match(/^(?:[-•*]|\d+[.\)])\s*(.+)/)
    if (bulletMatch && bulletMatch[1].length > 10) {
      bullets.push(bulletMatch[1].trim())
    }
  }

  if (bullets.length > 0) {
    return { bullets }
  }

  // Last resort: split by sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20)
  if (sentences.length > 0) {
    return { bullets: sentences.slice(0, 10).map(s => s.trim()) }
  }

  throw new Error('Could not parse AI response')
}

const SYSTEM_PROMPT = `Extract the core substance from this article as bullet points.

Your job is to distill the article down to its ACTUAL CONTENT, removing all author embellishment.

REMOVE:
- Introductions, conclusions, transitions
- Author opinions, commentary, asides
- Motivational fluff ("This will change your life!")
- Repetition and padding
- "Why this matters" sections unless they contain facts

KEEP:
- For listicles: Extract EVERY item in the list with a brief description of what it does
- For how-tos: Extract each step or technique
- For news: Extract the key facts (who, what, when, where, why)
- For tutorials: Extract the specific commands, code, or instructions
- For opinion pieces: Extract the core arguments and evidence

Be thorough. If an article lists 10 things, output 10 bullets. If it has 15 steps, output 15 bullets.

Respond in JSON format:
{
  "bullets": ["point 1", "point 2", ...]
}`

async function fetchPageContent(url) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_PAGE_CONTENT',
      url
    })

    if (response.error) {
      console.error('Error fetching page:', response.error)
      return null
    }

    return response.content
  } catch (error) {
    console.error('Error fetching page:', error)
    return null
  }
}

async function callClaudeAPI(apiKey, content) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Summarize this article:\n\n${content}` }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.content[0]?.text || ''

  return parseAIResponse(text)
}

async function callOpenAIAPI(apiKey, content) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Summarize this article:\n\n${content}` }
      ],
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.choices[0]?.message?.content || ''

  return parseAIResponse(text)
}

async function callGeminiAPI(apiKey, content) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${SYSTEM_PROMPT}\n\nSummarize this article:\n\n${content}`
          }]
        }]
      })
    }
  )

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  return parseAIResponse(text)
}

async function callChromeBuiltInAI(content) {
  let session

  // Try new LanguageModel API first (Chrome 138+)
  if (typeof self !== 'undefined' && 'LanguageModel' in self) {
    try {
      const availability = await self.LanguageModel.availability()
      if (availability === 'available' || availability === 'downloadable') {
        session = await self.LanguageModel.create()
      }
    } catch (err) {
      console.warn('LanguageModel API failed, trying legacy API:', err)
    }
  }

  // Fallback to legacy API (Chrome 127-137)
  if (!session && typeof self !== 'undefined' && self.ai?.languageModel) {
    try {
      const capabilities = await self.ai.languageModel.capabilities()
      if (capabilities.available === 'readily' || capabilities.available === 'after-download') {
        session = await self.ai.languageModel.create({
          systemPrompt: SYSTEM_PROMPT
        })
      }
    } catch (err) {
      console.warn('Legacy AI API failed:', err)
    }
  }

  if (!session) {
    throw new Error(
      'Chrome Built-in AI not available. Requires Chrome 138+ on a supported device, ' +
      'or enable chrome://flags/#prompt-api-for-gemini-nano on Chrome 127-137.'
    )
  }

  try {
    const text = await session.prompt(
      `${SYSTEM_PROMPT}\n\nSummarize this article:\n\n${content}`
    )

    return parseAIResponse(text)
  } finally {
    session.destroy?.()
  }
}

export function useAISummary() {
  const [summaries, setSummaries] = useState(new Map())
  const [loadingSummary, setLoadingSummary] = useState(null)

  // Load cached summaries from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['summaryCache'], (result) => {
      if (result.summaryCache) {
        setSummaries(new Map(Object.entries(result.summaryCache)))
      }
    })
  }, [])

  const getSummary = useCallback(async (url, title, forceRefresh = false, rawText = null) => {
    // For raw text (selection), use a hash as cache key
    const cacheKey = rawText ? `selection:${url}:${rawText.slice(0, 100)}` : url

    // Check cache unless force refreshing
    if (!forceRefresh && !rawText) {
      // Check memory cache first
      if (summaries.has(cacheKey)) {
        return summaries.get(cacheKey)
      }

      // Check persistent storage
      const stored = await chrome.storage.local.get(['summaryCache'])
      if (stored.summaryCache?.[cacheKey]) {
        const cached = stored.summaryCache[cacheKey]
        setSummaries(prev => new Map(prev).set(cacheKey, cached))
        return cached
      }
    }

    setLoadingSummary(url)

    try {
      // Get settings
      const settings = await chrome.storage.local.get(['aiProvider', 'apiKey'])
      const provider = settings.aiProvider || 'chrome-builtin'

      // API key required for non-Chrome providers
      if (provider !== 'chrome-builtin' && !settings.apiKey) {
        return { error: 'Please configure your API key in settings.' }
      }

      // Use raw text if provided, otherwise fetch page content
      let content
      if (rawText) {
        content = rawText
      } else {
        content = await fetchPageContent(url)
      }

      if (!content) {
        return { error: 'Could not fetch article content.' }
      }

      // Call appropriate API
      let result

      switch (provider) {
        case 'openai':
          result = await callOpenAIAPI(settings.apiKey, content)
          break
        case 'gemini':
          result = await callGeminiAPI(settings.apiKey, content)
          break
        case 'claude':
          result = await callClaudeAPI(settings.apiKey, content)
          break
        case 'chrome-builtin':
        default:
          result = await callChromeBuiltInAI(content)
          break
      }

      // Cache the result in memory
      setSummaries(prev => new Map(prev).set(cacheKey, result))

      // Persist to storage (skip for selections to avoid bloating storage)
      if (!rawText) {
        const stored = await chrome.storage.local.get(['summaryCache'])
        const cache = stored.summaryCache || {}
        cache[cacheKey] = result
        await chrome.storage.local.set({ summaryCache: cache })
      }

      return result
    } catch (error) {
      console.error('Error getting summary:', error)
      return { error: error.message || 'Failed to generate summary.' }
    } finally {
      setLoadingSummary(null)
    }
  }, [summaries])

  return {
    summaries,
    getSummary,
    loadingSummary
  }
}
