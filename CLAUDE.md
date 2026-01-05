# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Bulletify.ai is a Chrome extension (Manifest V3) that summarizes webpages with AI. It auto-summarizes the current tab when the side panel opens.

## Tech Stack

- React 19 + Vite + Tailwind CSS v4

## Build Commands

```bash
npm install        # Install dependencies
npm run dev        # Development server
npm run build      # Production build (outputs to dist/)
```

To test as Chrome extension: Load `dist/` folder as unpacked extension in chrome://extensions/

## Development Workflow

After completing changes:
1. Run `npm run build` to verify the build succeeds
2. Commit and push changes

## Architecture

### Key Files
- `src/App.jsx` - Main UI, auto-summarizes on load
- `src/hooks/useAISummary.js` - AI summarization logic with caching
- `src/components/SettingsModal.jsx` - AI provider configuration
- `src/background.js` - Service worker for fetching page content

### AI Providers
- Chrome Built-in AI (Gemini Nano) - Free, runs locally
- Claude API
- OpenAI API (GPT-4o mini)
- Gemini API

### YouTube Support
For YouTube videos, the extension extracts the transcript by:
1. Clicking "Show transcript" button automatically
2. Reading transcript text from DOM elements
3. Falling back to video description if transcript unavailable

### Caching
Summaries are cached in `chrome.storage.local` to avoid regenerating on revisit.
