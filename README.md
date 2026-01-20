# Bulletify.ai

A Chrome extension that transforms any webpage into concise bullet points using AI. Get the key takeaways from articles, documentation, and YouTube videos in one click.

## Features

- **One-Click Summarization** - Click the extension icon to instantly bulletify the current page
- **Auto-Summarize** - Automatically generates bullet points when you open the side panel
- **YouTube Support** - Extracts and summarizes video transcripts
- **Text Selection** - Right-click to summarize selected text
- **Link Summarization** - Right-click any link to summarize the linked page
- **Follow-Up Chat** - Ask questions about the content after summarizing
- **Export Options** - Copy to clipboard or download as PDF
- **Smart Caching** - Summaries are cached to avoid regenerating on revisit
- **Dark Mode** - Warm Stone UI theme with light/dark mode support

## Supported AI Providers

| Provider | Notes |
|----------|-------|
| Chrome Built-in AI (Gemini Nano) | Free, runs locally, requires Chrome 127+ |
| Claude API | Requires API key |
| OpenAI API (GPT-4o mini) | Requires API key |
| Gemini API | Requires API key |

## Installation

### From Source

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

## Usage

1. Click the Bulletify.ai icon in your Chrome toolbar to open the side panel
2. The current page will be automatically summarized
3. Use the context menu (right-click) to:
   - Bulletify the current page
   - Bulletify selected text
   - Bulletify a linked page
4. Ask follow-up questions in the chat section
5. Copy or download your summary

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start dev server with hot reload
npm run build      # Production build
```

## Tech Stack

- React 19
- Vite
- Tailwind CSS v4
- Chrome Extension Manifest V3

## License

MIT
