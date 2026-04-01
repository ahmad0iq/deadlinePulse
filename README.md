# Deadline Pulse (Chrome Extension)

Deadline Pulse is a comprehensive pending submission tracker that automatically scrapes your university deadlines and provides timely notifications.

**Note:** This repository contains **only the Chrome Extension** codebase.

## 🌟 Features

- **Automated Scraping**: Seamlessly reads your pending submissions from the university portal.
- **Cloud Synchronization**: Pushes your deadlines to the cloud for mobile access.
- **Background Support**: Runs quietly, keeping your data up to date without manual intervention.

## 🚀 Setup Instructions

Since this repository is restricted to the browser extension, the backend services (Supabase) are securely managed and not included in this code. 

**To use this extension, you must configure your local environment with the authorized API credentials.**

### 1. Configure the Environment Variables
Browser extensions cannot read traditional `.env` files natively. Instead, this extension uses a secure Javascript environment file (`env.js`).
1. In the root directory, you will find a file named `env.example.js`.
2. Create a copy of this file and name it `env.js` (this file is ignored by Git to keep your secrets safe).
3. Open `env.js` and paste in the provided connection secrets:
   ```javascript
   window.ENV = {
       SUPABASE_URL: "YOUR_PROVIDED_URL",
       SUPABASE_ANON_KEY: "YOUR_PROVIDED_KEY"
   };
   ```

### 2. Install the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle in the top right corner.
3. Click **"Load unpacked"** and select the root folder of this repository (the folder containing `manifest.json`).
4. If you have correctly configured your `env.js` file, the extension will connect directly to the database.
5. Open the extension from your Chrome toolbar and generate a **Sync Token**.
6. Visit your university portal to begin auto-syncing your pending deadlines!

---

*Security Note: Never commit `env.js` into version control. It has already been added to the `.gitignore`.*
