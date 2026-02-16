# Code Coalition

Real-time collaborative coding workspace with:
- multi-user editor
- chat (group + direct)
- file sharing
- external import (link, Google Drive account, GitHub account)
- drawing board
- terminal
- screen sharing

## 1. Project structure

```text
code-coalition-ui-updated-/
  client/   # React + Vite frontend
  server/   # Node + Express + Socket.IO backend
```

## 2. Prerequisites

1. Node.js `18+` (Node `20` recommended)
2. npm
3. Google Cloud account (for Drive OAuth import)
4. GitHub account (for GitHub OAuth import)

## 3. Install dependencies

Run in two terminals:

1. Backend
```bash
cd server
npm ci
```

2. Frontend
```bash
cd client
npm ci
```

## 4. Environment variables

### 4.1 Server env (`server/.env`)

Create `server/.env`:

```env
PORT=3000
SERVER_PUBLIC_URL=http://localhost:3000

# Required for Copilot endpoint
APIFREELLM_API_KEY=your_apifreellm_key

# Required for Run button (self-hosted or authorized Piston endpoint)
PISTON_API_BASE_URL=http://localhost:2000/api/v2/piston

# Optional: token for protected Piston instances
PISTON_API_TOKEN=

# Required for Google Drive OAuth import
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Required for GitHub OAuth import
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Optional
FILE_SHARE_MAX_SIZE_MB=20
EXTERNAL_IMPORT_MAX_SIZE_MB=15
GITHUB_TOKEN=your_optional_github_pat_for_private_raw_access
INIT_CWD=optional_terminal_start_path
```

### 4.2 Client env (`client/.env`)

Create `client/.env`:

```env
VITE_BACKEND_URL=http://localhost:3000

# Optional
VITE_FILE_SHARE_MAX_MB=20
VITE_POLLINATIONS_API_KEY=optional_pollinations_key
```

## 5. How to get required keys

### 5.1 APIFREELLM key

1. Create/get key from your API Free LLM provider account.
2. Put it in `APIFREELLM_API_KEY` in `server/.env`.

### 5.2 Google OAuth client (Drive import)

1. Open Google Cloud Console.
2. Create/select a project.
3. Enable **Google Drive API**.
4. Configure OAuth consent screen:
   1. App status: `Testing` (for local development)
   2. Add your Google account to **Test users**
5. Create OAuth Client ID:
   1. Type: `Web application`
   2. Authorized JavaScript origins: `http://localhost:5173`
   3. Authorized redirect URI: `http://localhost:3000/api/oauth/gdrive/callback`
6. Copy values into:
   1. `GOOGLE_CLIENT_ID`
   2. `GOOGLE_CLIENT_SECRET`

### 5.3 GitHub OAuth app (GitHub import)

1. Go to GitHub -> Settings -> Developer settings -> OAuth Apps.
2. Create `New OAuth App`.
3. Set:
   1. Homepage URL: `http://localhost:5173`
   2. Authorization callback URL: `http://localhost:3000/api/oauth/github/callback`
4. Copy:
   1. `Client ID` -> `GITHUB_CLIENT_ID`
   2. Generated `Client Secret` -> `GITHUB_CLIENT_SECRET`

## 6. Run locally

1. Start backend:
```bash
cd server
npm run dev
```

2. Start frontend:
```bash
cd client
npm run dev
```

3. Open:
`http://localhost:5173`

## 7. Quick OAuth verification

Before testing buttons in UI, verify these URLs in browser:

1. Google start endpoint  
`http://localhost:3000/api/oauth/gdrive/start?origin=http://localhost:5173`

2. GitHub start endpoint  
`http://localhost:3000/api/oauth/github/start?origin=http://localhost:5173`

If configured correctly, each returns JSON with `authorizeUrl`.

## 8. Common issues

1. `Request failed with status code 401` when clicking Run
The public `https://emkc.org/api/v2/piston` execute endpoint became whitelist-only on February 15, 2026. Point `PISTON_API_BASE_URL` to your own Piston instance (or an authorized endpoint), then restart backend and frontend.

1. `GOOGLE_CLIENT_ID is not configured on the server`  
`server/.env` missing keys, or backend not restarted.

2. Google `access_denied` during login  
OAuth app is in Testing and your account is not in Google OAuth **Test users**.

3. `invalid_client`  
Wrong Google client type or wrong redirect URI. Use **Web application** and exact callback URL above.

4. UI still hitting old backend  
Set `VITE_BACKEND_URL=http://localhost:3000` in `client/.env` and restart client.

## 9. Push project to GitHub

`.env` files are ignored by git in both `client` and `server`. Do not commit secrets.

### 9.1 If remote is already configured

```bash
git status
git add .
git commit -m "Update README and setup guide"
git push origin master
```

### 9.2 If you want to push to a new GitHub repo

1. Create empty repo on GitHub.
2. Run:

```bash
git remote remove origin
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M master
git push -u origin master
```

## 10. Security note

If you ever pasted secrets into chats/screenshots/public places, rotate them:
1. Google client secret
2. GitHub client secret
3. API keys
