import { useState, useEffect } from 'react'

const AI_PROVIDERS = [
  {
    id: 'chrome-builtin',
    name: 'Chrome AI (Gemini Nano)',
    description: 'Runs locally in your browser. No API key needed.',
    badge: 'Free',
    badgeColor: 'bg-green-100 text-green-700',
    borderColor: 'border-green-500 bg-green-50',
    requiresKey: false
  },
  {
    id: 'claude',
    name: 'Claude API',
    description: 'More powerful AI from Anthropic. Requires API key.',
    badge: 'Paid',
    badgeColor: 'bg-purple-100 text-purple-700',
    borderColor: 'border-purple-500 bg-purple-50',
    requiresKey: true
  },
  {
    id: 'openai',
    name: 'OpenAI API',
    description: 'GPT-4o mini. Requires API key from OpenAI.',
    badge: 'Paid',
    badgeColor: 'bg-emerald-100 text-emerald-700',
    borderColor: 'border-emerald-500 bg-emerald-50',
    requiresKey: true
  },
  {
    id: 'gemini',
    name: 'Gemini API',
    description: 'Google Gemini Pro. Requires API key.',
    badge: 'Paid',
    badgeColor: 'bg-blue-100 text-blue-700',
    borderColor: 'border-blue-500 bg-blue-50',
    requiresKey: true
  }
]

export default function SettingsModal({ onClose }) {
  const [provider, setProvider] = useState('chrome-builtin')
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(['aiProvider', 'apiKey'], (result) => {
      if (result.aiProvider) setProvider(result.aiProvider)
      if (result.apiKey) setApiKey(result.apiKey)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await chrome.storage.local.set({
      aiProvider: provider,
      apiKey: apiKey
    })
    setSaving(false)
    onClose()
  }

  const selectedProvider = AI_PROVIDERS.find(p => p.id === provider)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Settings</h3>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* AI Provider Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">AI Provider</h4>
            <div className="space-y-2">
              {AI_PROVIDERS.map(p => (
                <label
                  key={p.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    provider === p.id ? p.borderColor : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={p.id}
                    checked={provider === p.id}
                    onChange={e => setProvider(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{p.name}</span>
                      <span className={`px-1.5 py-0.5 text-xs rounded ${p.badgeColor}`}>
                        {p.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Chrome Built-in AI note */}
          {provider === 'chrome-builtin' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-700">
                Works automatically on Chrome 138+. For Chrome 127-137, enable{' '}
                <code className="bg-green-100 px-1 rounded">chrome://flags/#prompt-api-for-gemini-nano</code>
              </p>
            </div>
          )}

          {/* API Key - only show for paid providers */}
          {selectedProvider?.requiresKey && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <div className="flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key..."
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Your API key is stored locally and never shared.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
