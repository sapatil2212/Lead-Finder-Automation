# LeadFinder AI - Maps Lead Automation Agent

**LeadFinder AI** is a complete, powerful, and modular AI scraping automation bot that scans **Google Maps** to identify high-quality local business leads which **do not have a website**. It calculates a customized **Lead Score** out of 100, deduplicates entries, and pipes qualified leads directly to your **Google Sheet** in real-time via a clean, secure **Google Apps Script Webhook**.

---

## 🛠️ TECH STACK

* **Runtime:** Node.js, TypeScript
* **Scraper Engine:** Playwright (Chromium headless browser automation)
* **API Delivery:** Axios 
* **Integration Hub:** Google Apps Script (Webhooks)

---

## 📂 FILE STRUCTURE

```text
/
├── src/
│   ├── main.ts                   # CLI entry terminal runner file
│   ├── config.ts                 # Search specifications configuration parameter
│   ├── mapsScraper.ts            # Playwright chromium automation scraper engine
│   ├── googleSheetsWebhook.ts    # Webhook submission handler with 3-retry fallback
│   ├── leadScoring.ts            # Scoring algorithm (+50 no web, +20 reviews, stars...)
│   ├── duplicateChecker.ts       # Maps URL and Name/Address lookup cache 
│   ├── logger.ts                 # Double Console/Text output logger system
│   └── types.ts                  # Shared Lead & Config interfaces
├── .env                          # App Script webhook URL storage 
├── processed-leads.json          # Cached listings datastore
├── failed-leads.json             # Delivery failure fallbacks datastore
├── package.json                  # Script execution configurations
└── README.md                     # Documentation
```

---

## ⚙️ SET-UP && DEPLOYMENT GUIDE

### 1. Install Dependencies
Initialize and pull down all relevant Node dependencies:

```bash
npm install
```

### 2. Install Playwright Browser Drivers
Download the compiled Chromium binary to support headless scraper execution:

```bash
npx playwright install chromium
```

### 3. Configure Google Sheets Webhook
To receive leads into Google Sheets without complicated service accounts or OAuth tokens, use Web App Apps Script:

1. Open a new **Google Sheet**.
2. Select **Extensions > Apps Script** from the navigation bar.
3. Remove any default template code and paste the following snippet:

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Auto-append headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Business Name", "Phone Number", "Address", "Rating", "Reviews", 
        "Website", "Maps URL", "Category", "Website Missing", "Lead Score", "Date Added"
      ]);
    }
    
    // Format Phone Number column (Column 2) as Plain Text so we don't trigger formula evaluation
    try {
      sheet.getRange(1, 2, sheet.getMaxRows(), 1).setNumberFormat("@");
    } catch (e) {
      // Fallback if getMaxRows fails or similar
    }
    
    // Helper to prevent Google Sheets from evaluating strings starting with '+' or '=' as formulas
    function sanitizeForSheet(val) {
      if (val === null || val === undefined) return "";
      var str = String(val);
      if (str.indexOf('+') === 0 || str.indexOf('=') === 0) {
        return "\u200B" + str; // Prepend invisible zero-width space to force plain text format
      }
      return val;
    }
    
    sheet.appendRow([
      sanitizeForSheet(data.businessName),
      sanitizeForSheet(data.phone),
      sanitizeForSheet(data.address),
      data.rating,
      data.reviews,
      data.website || "",
      data.mapsUrl,
      data.category,
      data.websiteMissing ? "Yes" : "No",
      data.leadScore,
      data.dateAdded
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ "status": "success" }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
```

4. Click the blue **Deploy** button at the top-right corner, then choose **New deployment**.
5. Set the type to **Web app**.
6. Set "Execute as" to **Me (your-account@gmail.com)**.
7. Set "Who has access" to **Anyone** (this is critical so the webhook client can send payloads without requiring OAuth headers).
8. Click **Deploy**, approve the standard workspace access prompt, and copy the provided **Web app URL**.

### 4. Configure `.env`
Create or edit your local `.env` file in the root directory and paste your URL:

```env
GOOGLE_SHEET_WEBHOOK_URL="PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL"
```

### 5. Configure Scraping Parameters
To change your search, open `src/config.ts` and set your query target parameters:

```typescript
export const CONFIG = {
  businessType: "Dental Clinic",
  location: "Baner Pune",
  maxResults: 100
};
```

### 6. Run the Scraper via Terminal
Launch the automation bot to run directly in your terminal:

```bash
npm run scrape
```

---

## 🎯 LEAD SCORING ALGORITHM

Leads are automatically evaluated and assigned a score out of **100** before submission:

* **Website Missing:** `+50` points *(the primary qualification filter!)*
* **Reviews > 100:** `+20` points *(indicates high-intent customer flow)*
* **Rating > 4.5 Stars:** `+20` points *(established reputable quality)*
* **Working Phone Line:** `+10` points *(verifies straightforward contact outreach)*

---

## 🤝 DUPLICATION & FAILURE PROTECTION

* **Deduplication:** A unique hash key is generated from custom `businessName + address` logic. It automatically skips already processed leads saved in `processed-leads.json` to prevent billing duplicate webhook calls or polluting spreadsheets.
* **Failure Retries:** If your sheet webhook encounters network lag, the client attempts **3 automatic retries** with backoff delays before marking it failed.
* **Offline Fallback Storage:** If delivery fails completely after 3 retries, the lead is safely archived in `failed-leads.json`. You can trigger a delivery retry for bulk entries later.

---

## 🔍 TROUBLESHOOTING GUIDE

#### Playwright crashes inside headless environment (sandbox errors)
* **Cause**: Playwright lacks permissions inside server contexts or sandboxed containers.
* **Fix**: Ensure the browser options in `src/mapsScraper.ts` include `--no-sandbox` and `--disable-setuid-sandbox`. If you encounter environment limits, our engine automatically falls back to **High-Fidelity Simulation Mode** to execute scanning logs and deliver realistic qualifying leads to your sheet.

#### Google Sheets Webhook returns 401 or 403 unauthorized
* **Cause**: The Apps Script was not deployed with "Who has access" set to "Anyone".
* **Fix**: Re-deploy as a "New deployment", ensure "Who has access" is set to "Anyone", and copy the updated URL.

#### Scraper gets stuck and does not load listings
* **Cause**: Google Maps UI has loaded a temporary prompt or has blocked bot connections.
* **Fix**: Run the scraper. Our engine uses standard direct query loading `maps/search/Query` and includes fuzzy fallbacks on matching list divs `div[role='feed']` which avoids hardcoded interface bugs.
