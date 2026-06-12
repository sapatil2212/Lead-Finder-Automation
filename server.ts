/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { CONFIG } from "./src/config";
import { Lead } from "./src/types";
import { runScraper, requestStopScraping } from "./src/mapsScraper";
import { logger } from "./src/logger";
import { duplicateChecker } from "./src/duplicateChecker";
import { loadFailedLeads, retryFailedLeads, sendLeadToWebhook, fetchLeadsFromGoogleSheet, fetchSheetNamesFromGoogleSheet } from "./src/googleSheetsWebhook";
import { 
  getWhatsAppStatus, 
  initializeWhatsApp, 
  disconnectWhatsApp,
  sendEmailOutreach, 
  sendWhatsAppMessage,
  sendWhatsAppTestMessage
} from "./src/outreachService";
import { generateOutreachCopy } from "./src/outreachCopy";
import { generateAICopy } from "./src/aiCopyGenerator";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Scraper runtime state
let isScrapingRunning = false;
let scraperResult: any = null;

// CORS headers for local debugging
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// API Routes
app.get("/api/config", (req, res) => {
  try {
    // Read directly from file to be updated on client changes
    const configPath = path.join(process.cwd(), "src/config.ts");
    if (fs.existsSync(configPath)) {
      // Find the CONFIG object via matching regex or serve import
      res.json(CONFIG);
    } else {
      res.json({ businessType: "Dental Clinic", location: "Baner Pune", maxResults: 10 });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to load config." });
  }
});

app.post("/api/config", (req, res) => {
  try {
    const { businessType, location, maxResults, enableSimulation, headless, lat, lng, radius } = req.body;
    if (!businessType || !location || maxResults === undefined) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const configPath = path.join(process.cwd(), "src/config.ts");
    const newContent = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from "./types";

export const CONFIG: Config = {
  businessType: ${JSON.stringify(businessType)},
  location: ${JSON.stringify(location)},
  maxResults: ${parseInt(maxResults, 10)},
  enableSimulation: ${Boolean(enableSimulation)},
  headless: ${Boolean(headless)},
  lat: ${lat !== undefined && lat !== null ? parseFloat(lat) : "undefined"},
  lng: ${lng !== undefined && lng !== null ? parseFloat(lng) : "undefined"},
  radius: ${radius !== undefined && radius !== null ? parseFloat(radius) : "undefined"}
};
`;
    fs.writeFileSync(configPath, newContent, "utf8");
    
    // Also update current memory instance
    CONFIG.businessType = businessType;
    CONFIG.location = location;
    CONFIG.maxResults = parseInt(maxResults, 10);
    CONFIG.enableSimulation = Boolean(enableSimulation);
    CONFIG.headless = Boolean(headless);
    CONFIG.lat = lat !== undefined && lat !== null ? parseFloat(lat) : undefined;
    CONFIG.lng = lng !== undefined && lng !== null ? parseFloat(lng) : undefined;
    CONFIG.radius = radius !== undefined && radius !== null ? parseFloat(radius) : undefined;

    logger.info(`Configuration updated: ${businessType} in ${location} (max: ${maxResults}, coords: ${lat},${lng}, radius: ${radius}km)`);
    res.json({ success: true, config: CONFIG });
  } catch (error) {
    res.status(500).json({ error: "Failed to write configuration file." });
  }
});

app.get("/api/processed", (req, res) => {
  const leads = duplicateChecker.loadLeads();
  res.json(leads);
});

app.get("/api/failed", (req, res) => {
  const leads = loadFailedLeads();
  res.json(leads);
});

app.get("/api/logs", (req, res) => {
  const logs = logger.readLogs();
  res.json({ logs });
});

app.post("/api/run-scraper", async (req, res) => {
  if (isScrapingRunning) {
    return res.status(400).json({ error: "Scraping session is already active." });
  }

  isScrapingRunning = true;
  res.json({ success: true, message: "Scraper launched in background." });

  // Run scraper asynchronously
  try {
    logger.clear();
    const result = await runScraper();
    scraperResult = result;
  } catch (error) {
    logger.error("Scraper crash in server-runner execution thread", error);
  } finally {
    isScrapingRunning = false;
  }
});

app.post("/api/stop-scraper", (req, res) => {
  if (!isScrapingRunning) {
    return res.status(400).json({ error: "Scraping session is not active." });
  }
  requestStopScraping();
  res.json({ success: true, message: "Stop requested." });
});

app.post("/api/retry-failed", async (req, res) => {
  try {
    const result = await retryFailedLeads();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: "Failed to retry delivery." });
  }
});

app.post("/api/test-webhook", async (req, res) => {
  try {
    const testLead: Lead = {
      businessName: "Test Lead (LeadFinder Verification)",
      phone: "+1 (555) 019-2831",
      address: "123 Diagnostic Lane, Silicon Valley, CA",
      rating: 4.9,
      reviews: 42,
      website: "",
      mapsUrl: "https://google.com/maps/test",
      category: "Software Testing",
      websiteMissing: true,
      leadScore: 95,
      dateAdded: new Date().toISOString(),
      websiteStatus: "MISSING",
      instagramUrl: "",
      instagramStatus: "NOT_FOUND",
      instagramLastPost: "",
      facebookUrl: "",
      facebookStatus: "NOT_FOUND",
      facebookLastPost: "",
      whatsappPresent: false,
      appointmentSystem: false,
      leadPriority: "HOT",
      aiInsight: "Excellent candidate for website creation and social presence.",
      emails: [],
      linkedinUrl: "",
      linkedinStatus: "NOT_FOUND",
      googleAnalyticsPresent: false,
      metaPixelPresent: false
    };
    
    const success = await sendLeadToWebhook(testLead);
    if (success) {
      res.json({ success: true, message: "Webhook ping successful! Check your sheet for the test line." });
    } else {
      res.json({ success: false, error: "Authentication or setup error (status code 403 or server unreachable)." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to issue test webhook call." });
  }
});

app.post("/api/clear-leads", (req, res) => {
  try {
    const processedPath = path.join(process.cwd(), "processed-leads.json");
    const failedPath = path.join(process.cwd(), "failed-leads.json");
    
    fs.writeFileSync(processedPath, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(failedPath, JSON.stringify([], null, 2), "utf8");
    logger.clear();
    logger.success("Processed and Failed Lead Caches have been successfully reset!");
    
    res.json({ success: true, message: "Lead caches cleared successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset lead caches." });
  }
});

async function updateLeadOutreachStatus(businessName: string, channel: "email" | "whatsapp", status: "SENT" | "FAILED", mapsUrl?: string) {
  try {
    const leads = duplicateChecker.loadLeads();
    let targetLead: any = null;
    const updated = leads.map(lead => {
      if (lead.businessName === businessName || (mapsUrl && lead.mapsUrl === mapsUrl)) {
        targetLead = lead;
        if (channel === "email") {
          lead.emailStatus = status;
          lead.emailSentDate = new Date().toISOString().split("T")[0];
        } else if (channel === "whatsapp") {
          lead.whatsappStatus = status;
          lead.whatsappSentDate = new Date().toISOString().split("T")[0];
        }
      }
      return lead;
    });
    const processedPath = path.join(process.cwd(), "processed-leads.json");
    fs.writeFileSync(processedPath, JSON.stringify(updated, null, 2), "utf8");

    // Sync back to Google Sheet
    const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    if (webhookUrl && webhookUrl.trim() !== "" && webhookUrl !== "YOUR_WEBHOOK_URL") {
      try {
        const payload = {
          action: "updateOutreach",
          businessName,
          mapsUrl: mapsUrl || (targetLead ? targetLead.mapsUrl : ""),
          emailStatus: channel === "email" ? status : undefined,
          emailSentDate: channel === "email" ? new Date().toISOString().split("T")[0] : undefined,
          whatsappStatus: channel === "whatsapp" ? status : undefined,
          whatsappSentDate: channel === "whatsapp" ? new Date().toISOString().split("T")[0] : undefined
        };
        const axios = (await import("axios")).default;
        const response = await axios.post(webhookUrl, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 8000
        });
        
        let responseData = response.data;
        if (typeof responseData === "string") {
          try {
            responseData = JSON.parse(responseData);
          } catch (e) {
            // Ignore parse errors if it's not JSON
          }
        }
        if (responseData && typeof responseData === "object" && responseData.status === "error") {
          throw new Error(`Google Apps Script error: ${responseData.message}`);
        }
        
        logger.success(`Synchronized outreach status for '${businessName}' back to Google Sheet.`);
      } catch (err: any) {
        logger.warn(`Failed to sync outreach status back to Google Sheet: ${err.message || err}`);
      }
    }
  } catch (error) {
    console.error("Failed to update outreach status:", error);
  }
}

// SMTP configurations endpoints
app.get("/api/config/smtp", (req, res) => {
  res.json({
    host: process.env.SMTP_HOST || "",
    port: process.env.SMTP_PORT || "587",
    user: process.env.SMTP_USER || "",
    from: process.env.SMTP_FROM || "",
    hasPassword: !!process.env.SMTP_PASS
  });
});

app.post("/api/config/smtp", (req, res) => {
  try {
    const { host, port, user, pass, from } = req.body;
    const envPath = path.join(process.cwd(), ".env");
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    const smtpKeys = {
      SMTP_HOST: host,
      SMTP_PORT: port,
      SMTP_USER: user,
      SMTP_PASS: pass,
      SMTP_FROM: from
    };

    for (const [key, val] of Object.entries(smtpKeys)) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}="${val}"`);
      } else {
        envContent += `\n${key}="${val}"`;
      }
      process.env[key] = String(val);
    }

    fs.writeFileSync(envPath, envContent.trim() + "\n", "utf8");
    res.json({ success: true, message: "SMTP configuration updated successfully." });
  } catch (e) {
    res.status(500).json({ error: "Failed to write SMTP configurations." });
  }
});

// WhatsApp endpoints
app.get("/api/whatsapp/status", (req, res) => {
  res.json(getWhatsAppStatus());
});

app.post("/api/whatsapp/initialize", (req, res) => {
  initializeWhatsApp();
  res.json({ success: true, message: "WhatsApp initialization launched." });
});

app.post("/api/whatsapp/disconnect", async (req, res) => {
  try {
    await disconnectWhatsApp();
    initializeWhatsApp();
    res.json({ success: true, message: "WhatsApp disconnected and re-initialized." });
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.post("/api/whatsapp/send-test", async (req, res) => {
  try {
    const { phone } = req.body;
    const success = await sendWhatsAppTestMessage(phone);
    if (success) {
      res.json({ success: true, message: "Test message sent successfully." });
    } else {
      res.status(500).json({ error: "Failed to send test message." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

// Geocoding Proxy endpoints
app.get("/api/geocode/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query parameter 'q'." });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(String(q))}&format=json&limit=5`, {
      headers: {
        "User-Agent": "LeadFinder-AI-Agent/1.0"
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get("/api/geocode/reverse", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "Missing 'lat' or 'lon' parameters." });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
      headers: {
        "User-Agent": "LeadFinder-AI-Agent/1.0"
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Data Reset endpoint
app.post("/api/reset-data", (req, res) => {
  try {
    const processedPath = path.join(process.cwd(), "processed-leads.json");
    const failedPath = path.join(process.cwd(), "failed-leads.json");
    const scraperLogPath = path.join(process.cwd(), "scraper-log.txt");

    fs.writeFileSync(processedPath, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(failedPath, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(scraperLogPath, "LeadFinder System reset successfully.\nReady.", "utf8");
    
    logger.clear();
    logger.success("Dashboard database has been completely wiped and reset!");

    // Also stop active campaign if running
    isCampaignRunning = false;
    campaignCancelRequested = true;

    res.json({ success: true, message: "System data completely reset." });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to reset system data." });
  }
});

// Outreach execution endpoints
app.post("/api/send-email", async (req, res) => {
  const { businessName, to, subject, body } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing parameters (to, subject, body)" });
  }
  const success = await sendEmailOutreach(to, subject, body);
  if (success) {
    await updateLeadOutreachStatus(businessName, "email", "SENT");
    res.json({ success: true, message: "Email sent successfully." });
  } else {
    await updateLeadOutreachStatus(businessName, "email", "FAILED");
    res.status(500).json({ error: "Failed to send email." });
  }
});

app.post("/api/send-whatsapp", async (req, res) => {
  const { businessName, phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "Missing parameters (phone, message)" });
  }
  const success = await sendWhatsAppMessage(phone, message);
  if (success) {
    await updateLeadOutreachStatus(businessName, "whatsapp", "SENT");
    res.json({ success: true, message: "WhatsApp message sent successfully." });
  } else {
    await updateLeadOutreachStatus(businessName, "whatsapp", "FAILED");
    res.status(500).json({ error: "Failed to send WhatsApp message." });
  }
});

app.post("/api/generate-copy", async (req, res) => {
  const { lead } = req.body;
  if (!lead) {
    return res.status(400).json({ error: "Missing lead parameter." });
  }
  try {
    const copy = await generateAICopy(lead);
    res.json(copy);
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

// Campaign variables
let isCampaignRunning = false;
let campaignCancelRequested = false;
let campaignProgress = {
  current: 0,
  total: 0,
  status: "Idle",
  secondsRemaining: 0,
  emailsSent: 0,
  emailsFailed: 0,
  whatsappSent: 0,
  whatsappFailed: 0,
  skipped: 0
};

async function runCampaignLoop(delaySeconds = 30, enableEmail = true, enableWhatsapp = true, dryRun = false, sheetName?: string) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const isSheetConfigured = webhookUrl && webhookUrl.trim() !== "" && webhookUrl !== "YOUR_WEBHOOK_URL";

  if (!isSheetConfigured) {
    logger.error("Outreach campaign aborted: GOOGLE_SHEET_WEBHOOK_URL is not configured. Campaigns can only run on leads stored in the Google Sheet.");
    campaignProgress.status = "Aborted: Google Sheet not configured";
    isCampaignRunning = false;
    return;
  }

  const host = process.env.SMTP_HOST || "";
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const emailAvailable = !!(host && user && pass);

  const waStatusObj = getWhatsAppStatus();
  const whatsappAvailable = waStatusObj.status === "CONNECTED";

  if (!dryRun) {
    if (enableEmail && !emailAvailable) {
      logger.error("Outreach campaign aborted: Email outreach is active but SMTP is not configured in settings.");
      campaignProgress.status = "Aborted: SMTP not configured";
      isCampaignRunning = false;
      return;
    }
    if (enableWhatsapp && !whatsappAvailable) {
      logger.error("Outreach campaign aborted: WhatsApp outreach is active but WhatsApp Gateway is inactive.");
      campaignProgress.status = "Aborted: WhatsApp not connected";
      isCampaignRunning = false;
      return;
    }
    if (!enableEmail && !enableWhatsapp) {
      logger.error("Outreach campaign aborted: Neither Email nor WhatsApp channel is enabled for delivery.");
      campaignProgress.status = "Aborted: No channels active";
      isCampaignRunning = false;
      return;
    }
  }

  campaignProgress.status = "Fetching leads from Google Sheet...";
  let leads = await fetchLeadsFromGoogleSheet(sheetName);
  
  if (!leads || leads.length === 0) {
    logger.error("Outreach campaign aborted: Failed to fetch leads from Google Sheet, or the sheet is empty.");
    campaignProgress.status = "Aborted: Failed to fetch leads from sheet";
    isCampaignRunning = false;
    return;
  }

  const targetLeads = leads.filter(lead => {
    const needsEmail = enableEmail && lead.emails && lead.emails.length > 0 && lead.emailStatus !== "SENT";
    const needsWhatsapp = enableWhatsapp && lead.phone && lead.whatsappStatus !== "SENT";
    return needsEmail || needsWhatsapp;
  });

  campaignProgress.total = targetLeads.length;
  campaignProgress.current = 0;
  campaignProgress.emailsSent = 0;
  campaignProgress.emailsFailed = 0;
  campaignProgress.whatsappSent = 0;
  campaignProgress.whatsappFailed = 0;
  campaignProgress.skipped = 0;

  if (targetLeads.length === 0) {
    campaignProgress.status = "Completed (No pending leads found)";
    logger.info("Outreach campaign completed: No pending leads found requiring outreach.");
    isCampaignRunning = false;
    return;
  }

  campaignProgress.status = dryRun ? "Running (Simulation Mode)" : "Running";
  logger.info(`Starting automated outreach campaign (${dryRun ? "SIMULATION" : "LIVE"}) for ${targetLeads.length} leads...`);

  for (let i = 0; i < targetLeads.length; i++) {
    if (campaignCancelRequested) {
      logger.warn("Outreach campaign cancelled by user.");
      campaignProgress.status = "Cancelled";
      break;
    }

    const lead = targetLeads[i];
    campaignProgress.current = i + 1;
    campaignProgress.status = `Processing lead ${i + 1}/${targetLeads.length}: ${lead.businessName}`;
    logger.info(`Campaign dispatching lead ${i + 1}/${targetLeads.length}: ${lead.businessName}`);

    const copy = await generateAICopy(lead);

    let skippedLead = true;

    // Send Email
    const recipient = lead.emails && lead.emails.length > 0 ? lead.emails[0] : "";
    if (enableEmail && recipient && lead.emailStatus !== "SENT") {
      skippedLead = false;
      if (dryRun) {
        logger.info(`[SIMULATION] Email would be sent to ${lead.businessName} (${recipient}) with subject: "${copy.emailSubject}"`);
        campaignProgress.emailsSent++;
      } else {
        if (emailAvailable) {
          logger.info(`Campaign sending email to ${lead.businessName} (${recipient})...`);
          const success = await sendEmailOutreach(recipient, copy.emailSubject, copy.emailBody);
          if (success) {
            await updateLeadOutreachStatus(lead.businessName, "email", "SENT", lead.mapsUrl);
            campaignProgress.emailsSent++;
          } else {
            await updateLeadOutreachStatus(lead.businessName, "email", "FAILED", lead.mapsUrl);
            campaignProgress.emailsFailed++;
          }
        } else {
          logger.warn(`Skipping Email for '${lead.businessName}': SMTP parameters are not configured in settings.`);
          await updateLeadOutreachStatus(lead.businessName, "email", "FAILED", lead.mapsUrl);
          campaignProgress.emailsFailed++;
        }
      }
    }

    // Send WhatsApp
    if (enableWhatsapp && lead.phone && lead.whatsappStatus !== "SENT") {
      skippedLead = false;
      if (dryRun) {
        logger.info(`[SIMULATION] WhatsApp message would be sent to ${lead.businessName} (${lead.phone})`);
        campaignProgress.whatsappSent++;
      } else {
        if (whatsappAvailable) {
          logger.info(`Campaign sending WhatsApp to ${lead.businessName} (${lead.phone})...`);
          const success = await sendWhatsAppMessage(lead.phone, copy.whatsappMessage);
          if (success) {
            await updateLeadOutreachStatus(lead.businessName, "whatsapp", "SENT", lead.mapsUrl);
            campaignProgress.whatsappSent++;
          } else {
            await updateLeadOutreachStatus(lead.businessName, "whatsapp", "FAILED", lead.mapsUrl);
            campaignProgress.whatsappFailed++;
          }
        } else {
          logger.warn(`Skipping WhatsApp for '${lead.businessName}': WhatsApp Web client is not connected.`);
          await updateLeadOutreachStatus(lead.businessName, "whatsapp", "FAILED", lead.mapsUrl);
          campaignProgress.whatsappFailed++;
        }
      }
    }

    if (skippedLead) {
      campaignProgress.skipped++;
    }

    // Wait delaySeconds seconds
    if (i < targetLeads.length - 1 && !campaignCancelRequested) {
      logger.info(`Time gap: Waiting ${delaySeconds} seconds before dispatching the next lead...`);
      for (let sec = delaySeconds; sec > 0; sec--) {
        if (campaignCancelRequested) break;
        campaignProgress.secondsRemaining = sec;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      campaignProgress.secondsRemaining = 0;
    }
  }

  if (!campaignCancelRequested) {
    campaignProgress.status = "Completed";
    logger.success(`Automated outreach campaign successfully completed! (${dryRun ? "Simulation" : "Live"})`);
  }
  isCampaignRunning = false;
  campaignCancelRequested = false;
}

app.get("/api/campaign/status", (req, res) => {
  res.json({
    isRunning: isCampaignRunning,
    progress: campaignProgress
  });
});

app.get("/api/campaign/sheets", async (req, res) => {
  try {
    const sheets = await fetchSheetNamesFromGoogleSheet();
    res.json(sheets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch Google Sheet tabs list." });
  }
});

app.post("/api/campaign/start", (req, res) => {
  if (isCampaignRunning) {
    return res.status(400).json({ error: "Campaign is already running." });
  }

  const { delaySeconds, enableEmail, enableWhatsapp, dryRun, sheetName } = req.body;
  const delaySec = parseInt(delaySeconds, 10) || 30;
  const mailActive = enableEmail !== undefined ? Boolean(enableEmail) : true;
  const waActive = enableWhatsapp !== undefined ? Boolean(enableWhatsapp) : true;
  const simulated = Boolean(dryRun);

  isCampaignRunning = true;
  campaignCancelRequested = false;
  campaignProgress = {
    current: 0,
    total: 0,
    status: "Initializing",
    secondsRemaining: 0,
    emailsSent: 0,
    emailsFailed: 0,
    whatsappSent: 0,
    whatsappFailed: 0,
    skipped: 0
  };
  
  runCampaignLoop(delaySec, mailActive, waActive, simulated, sheetName).catch(err => {
    logger.error(`Campaign crashed: ${err}`);
    isCampaignRunning = false;
    campaignProgress.status = `Error: ${err.message || err}`;
  });

  res.json({ success: true, message: "Outreach campaign started in the background." });
});


app.post("/api/campaign/stop", (req, res) => {
  if (!isCampaignRunning) {
    return res.status(400).json({ error: "No campaign currently active." });
  }
  campaignCancelRequested = true;
  campaignProgress.status = "Cancelling...";
  res.json({ success: true, message: "Campaign cancellation requested." });
});

app.get("/api/status", (req, res) => {
  res.json({
    isRunning: isScrapingRunning,
    lastResult: scraperResult,
    webhookUrlConfigured: !!process.env.GOOGLE_SHEET_WEBHOOK_URL && process.env.GOOGLE_SHEET_WEBHOOK_URL !== "YOUR_WEBHOOK_URL",
    whatsappConnected: getWhatsAppStatus().status === "CONNECTED",
    campaignRunning: isCampaignRunning
  });
});

async function startServer() {
  // Vite integration middleware in dev mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LeadFinder AI Server running on http://localhost:${PORT}`);
  });
}

startServer();
