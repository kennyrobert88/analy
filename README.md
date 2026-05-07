# Analy - Email Analytics

Electron-based email analytics dashboard with Google OAuth2 SSO, SQLite storage, and local AI analysis.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Rebuild native modules for Apple Silicon:
```bash
npm run rebuild
```

3. Set up Google OAuth2 credentials:
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Gmail API
   - Create OAuth2 credentials (Desktop app)
   - Edit `.env` and add your credentials:
```bash
# In .env file:
GOOGLE_CLIENT_ID=your_actual_client_id
GOOGLE_CLIENT_SECRET=your_actual_client_secret
```

## Run

```bash
npm start
```

## Architecture

- **Main Process** (`main.js`): Manages Electron window, IPC handlers, SQLite, OAuth2, and AI analysis
- **Preload** (`preload.js`): Secure IPC bridge between main and renderer
- **Renderer** (`src/index.html`, `src/renderer.js`): Dashboard UI with Chart.js visualizations
- **Database** (`src/db.js`): SQLite module for email and token storage
- **OAuth** (`src/oauth.js`): Google OAuth2 SSO and Gmail API integration
- **AI** (`src/ai.js`): Local email analysis and prompt-based queries

## Data Flow

Google API → SQLite → Local AI Analysis → Frontend UI
