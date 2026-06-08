// server.ts
import express from "express";
import path5 from "path";
import fs5 from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// src/config.ts
var CONFIG = {
  businessType: "dental clinic",
  location: "swargate",
  maxResults: 50,
  enableSimulation: false,
  headless: false,
  lat: 18.4986771,
  lng: 73.8578427,
  radius: 15
};

// src/mapsScraper.ts
import { chromium } from "playwright";

// src/logger.ts
import fs from "fs";
import path from "path";
var logFilePath = path.join(process.cwd(), "scraper-log.txt");
try {
  fs.writeFileSync(logFilePath, `[${(/* @__PURE__ */ new Date()).toISOString()}] Scraper Logger Initialized
`);
} catch (e) {
}
var logger = {
  log: (message) => {
    const formatted = `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] ${message}`;
    console.log(formatted);
    try {
      fs.appendFileSync(logFilePath, formatted + "\n");
    } catch (e) {
    }
  },
  info: (message) => {
    logger.log(`INFO: ${message}`);
  },
  success: (message) => {
    logger.log(`SUCCESS: ${message}`);
  },
  warn: (message) => {
    logger.log(`WARN: ${message}`);
  },
  error: (message, error) => {
    const errMessage = error ? ` - ${error.message || String(error)}` : "";
    logger.log(`ERROR: ${message}${errMessage}`);
  },
  clear: () => {
    try {
      fs.writeFileSync(logFilePath, "");
    } catch (e) {
    }
  },
  getLogFilePath: () => logFilePath,
  readLogs: () => {
    try {
      if (fs.existsSync(logFilePath)) {
        return fs.readFileSync(logFilePath, "utf8");
      }
    } catch (e) {
    }
    return "No logs generated yet.";
  }
};

// src/duplicateChecker.ts
import fs2 from "fs";
import path2 from "path";
var filePath = path2.join(process.cwd(), "processed-leads.json");
function createKey(name, address) {
  const cleanName = (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanAddress = (address || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${cleanName}_${cleanAddress}`;
}
var duplicateChecker = {
  /**
   * Loads all previously processed leads from file
   */
  loadLeads: () => {
    try {
      if (fs2.existsSync(filePath)) {
        const content = fs2.readFileSync(filePath, "utf8");
        return JSON.parse(content);
      }
    } catch (error) {
      logger.error("Failed to read processed-leads.json, starting fresh", error);
    }
    return [];
  },
  /**
   * Checks if a lead has already been processed based on Name + Address key
   */
  isDuplicate: (name, address) => {
    const leads = duplicateChecker.loadLeads();
    const targetKey = createKey(name, address);
    return leads.some((lead) => createKey(lead.businessName, lead.address) === targetKey);
  },
  /**
   * Adds and saves a new processed lead to the end of the file
   */
  saveLead: (lead) => {
    const leads = duplicateChecker.loadLeads();
    const leadKey = createKey(lead.businessName, lead.address);
    const exists = leads.some((l) => createKey(l.businessName, l.address) === leadKey);
    if (!exists) {
      leads.push(lead);
      try {
        fs2.writeFileSync(filePath, JSON.stringify(leads, null, 2), "utf8");
        logger.info(`Lead saved locally: ${lead.businessName}`);
      } catch (error) {
        logger.error(`Failed to save lead ${lead.businessName} to processed-leads.json`, error);
      }
    }
  }
};

// src/googleSheetsWebhook.ts
import fs3 from "fs";
import path3 from "path";
import axios from "axios";
var failedLeadsPath = path3.join(process.cwd(), "failed-leads.json");
function loadFailedLeads() {
  try {
    if (fs3.existsSync(failedLeadsPath)) {
      const content = fs3.readFileSync(failedLeadsPath, "utf8");
      return JSON.parse(content);
    }
  } catch (error) {
    logger.error("Failed to read failed-leads.json", error);
  }
  return [];
}
function saveFailedLeads(leads) {
  try {
    fs3.writeFileSync(failedLeadsPath, JSON.stringify(leads, null, 2), "utf8");
  } catch (error) {
    logger.error("Failed to write to failed-leads.json", error);
  }
}
function addFailedLead(lead) {
  const failedList = loadFailedLeads();
  const exists = failedList.some(
    (l) => l.businessName === lead.businessName && l.address === lead.address
  );
  if (!exists) {
    failedList.push(lead);
    saveFailedLeads(failedList);
    logger.warn(`Fallback: Saved '${lead.businessName}' to failed-leads.json for future retry.`);
  }
}
async function sendLeadToWebhook(lead) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.trim() === "" || webhookUrl === "YOUR_WEBHOOK_URL") {
    logger.warn("GOOGLE_SHEET_WEBHOOK_URL is not configured in environment or .env file.");
    addFailedLead(lead);
    return false;
  }
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Sending '${lead.businessName}' to webhook (Attempt ${attempt}/${maxRetries})...`);
      const response = await axios.post(webhookUrl, lead, {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 1e4
      });
      if (response && response.status >= 200 && response.status < 300) {
        logger.success(`Webhook delivery successful for '${lead.businessName}'!`);
        return true;
      } else {
        const statusCode = response ? response.status : "unknown";
        throw new Error(`Server returned status code ${statusCode}`);
      }
    } catch (error) {
      let statusCode = "unknown";
      let errorMsg = error.message || String(error);
      if (error.response) {
        statusCode = String(error.response.status);
        errorMsg = JSON.stringify(error.response.data) || errorMsg;
        if (error.response.status === 403) {
          logger.error(`[403 AUTHENTICATION FAILURE] Your Google Apps Script Web App returned 403 Forbidden!`);
          logger.error(`DIAGNOSTIC ADVISORY: Please verify the sharing configurations in your active script deployment:`);
          logger.error(`1. In the Google Apps Script project editor, click "Deploy" > "Manage deployments".`);
          logger.error(`2. Click the edit (pencil) icon. Change "Execute as" to "Me" and configure "Who has access" to "Anyone" (Anonymous/public access is REQUIRED for webhook posting).`);
          logger.error(`3. Create a NEW DEPLOYMENT (very important: Apps Script will not update your script changes on old links unless you create a new deployment) and paste the updated link in your .env configuration.`);
        } else if (error.response.status === 405) {
          logger.error(`[405 METHOD NOT ALLOWED] Server returned 405 Method Not Allowed.`);
          logger.error(`DIAGNOSTIC ADVISORY: Please ensure that your Apps Script Web App has a 'doPost(e)' function implemented, is deployed as a Web App, and the deployment is active.`);
        }
      }
      logger.error(`Attempt ${attempt} failed for '${lead.businessName}' (status: ${statusCode}): ${errorMsg}`);
      if (attempt < maxRetries) {
        const delay = attempt * 1500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  logger.error(`Webhook delivery permanently failed for '${lead.businessName}' after 3 attempts.`);
  addFailedLead(lead);
  return false;
}
async function retryFailedLeads() {
  const failedList = loadFailedLeads();
  if (failedList.length === 0) {
    logger.info("No failed leads found to retry.");
    return { succeeded: 0, failed: 0 };
  }
  logger.info(`Found ${failedList.length} failed leads. Retrying delivery...`);
  const remainingFailed = [];
  let succeededCount = 0;
  for (const lead of failedList) {
    const success = await sendLeadToWebhook(lead);
    if (success) {
      succeededCount++;
    } else {
      remainingFailed.push(lead);
    }
  }
  saveFailedLeads(remainingFailed);
  logger.success(`Retry finished. Successfully processed: ${succeededCount}, remaining: ${remainingFailed.length}`);
  return {
    succeeded: succeededCount,
    failed: remainingFailed.length
  };
}
async function fetchLeadsFromGoogleSheet() {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.trim() === "" || webhookUrl === "YOUR_WEBHOOK_URL") {
    logger.warn("GOOGLE_SHEET_WEBHOOK_URL is not configured. Cannot fetch leads from Google Sheet.");
    return [];
  }
  try {
    logger.info("Fetching active leads list directly from Google Sheet...");
    const response = await axios.get(webhookUrl, {
      timeout: 15e3,
      maxRedirects: 5
    });
    if (response && Array.isArray(response.data)) {
      logger.success(`Successfully fetched ${response.data.length} leads from Google Sheet.`);
      const normalizedLeads = response.data.map((rawLead) => {
        const lead = { ...rawLead };
        if (lead.whatsappOutreachStatus !== void 0 && lead.whatsappStatus === void 0) {
          lead.whatsappStatus = lead.whatsappOutreachStatus;
        }
        return lead;
      });
      return normalizedLeads;
    } else {
      if (response && response.data && typeof response.data === "object" && response.data.status === "error") {
        logger.error(`Google Sheet Web App returned script error: ${response.data.message}`);
        return [];
      }
      logger.error("Invalid response format received from Google Sheet Web App (expected JSON array).");
      if (response && response.data) {
        const rawData = String(response.data);
        const preview = rawData.substring(0, 300);
        logger.error(`Response content preview: ${preview}`);
        const errorMatch = rawData.match(/class="errorMessage"[^>]*>([\s\S]*?)<\/div>/i) || rawData.match(/class="errorMessage"[^>]*>([\s\S]*?)<\/span>/i) || rawData.match(/<div[^>]*id="error-message"[^>]*>([\s\S]*?)<\/div>/i);
        if (errorMatch && errorMatch[1]) {
          logger.error(`Extracted Google Script Error: ${errorMatch[1].replace(/<[^>]*>/g, "").trim()}`);
        } else {
          const bodyMatch = rawData.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch && bodyMatch[1]) {
            const bodyText = bodyMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            logger.error(`Extracted error page text: ${bodyText.substring(0, 500)}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Failed to fetch leads from Google Sheet: ${error.message || error}`);
  }
  return [];
}

// src/websiteAnalyzer.ts
async function analyzeWebsite(browser, url) {
  const analysis = {
    reachable: false,
    loading: false,
    responsive: false,
    https: false,
    whatsappPresent: false,
    contactFormPresent: false,
    appointmentSystem: false,
    copyrightYear: null,
    status: "MISSING",
    emails: [],
    googleAnalyticsPresent: false,
    metaPixelPresent: false
  };
  if (!url || url.trim() === "") {
    return analysis;
  }
  analysis.https = url.toLowerCase().startsWith("https://");
  let page = null;
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });
    page = await context.newPage();
    logger.info(`Analyzing website: ${url}`);
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15e3 });
    analysis.reachable = true;
    if (response && response.status() >= 200 && response.status() < 400) {
      analysis.loading = true;
    }
    if (analysis.loading) {
      analysis.responsive = await page.evaluate(() => {
        const meta = document.querySelector("meta[name='viewport']");
        if (!meta) return false;
        const content = meta.getAttribute("content") || "";
        return content.includes("width=device-width");
      });
      analysis.whatsappPresent = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        const hasWhatsAppLink = anchors.some((a) => {
          const href = a.href.toLowerCase();
          return href.includes("wa.me") || href.includes("api.whatsapp.com") || href.includes("whatsapp.com/send");
        });
        const hasWhatsAppWidget = !!document.querySelector('[class*="whatsapp"]') || !!document.querySelector('[id*="whatsapp"]') || !!document.querySelector('iframe[src*="whatsapp"]');
        return hasWhatsAppLink || hasWhatsAppWidget;
      });
      analysis.contactFormPresent = await page.evaluate(() => {
        const forms = Array.from(document.querySelectorAll("form"));
        const hasForm = forms.some((form) => {
          const action = form.getAttribute("action") || "";
          const id = form.getAttribute("id") || "";
          const text = form.innerText.toLowerCase();
          return text.includes("contact") || text.includes("email") || text.includes("message") || action.includes("contact") || id.includes("contact");
        });
        const hasContactFields = !!document.querySelector('input[type="email"]') && (!!document.querySelector("textarea") || !!document.querySelector('input[name*="message"]'));
        return hasForm || hasContactFields;
      });
      analysis.appointmentSystem = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        const keywords = ["book appointment", "appointment", "schedule visit", "consultation booking", "book now", "schedule an appointment", "calendly.com", "acuityscheduling.com"];
        const hasKeyword = keywords.some((keyword) => bodyText.includes(keyword));
        const hasBookingWidget = !!document.querySelector('iframe[src*="calendly"]') || !!document.querySelector('iframe[src*="acuity"]') || !!document.querySelector('a[href*="calendly.com"]') || !!document.querySelector('a[href*="acuityscheduling.com"]');
        return hasKeyword || hasBookingWidget;
      });
      analysis.copyrightYear = await page.evaluate(() => {
        const regex = /(?:©|copyright|copywrite|all rights reserved)\s*(?:.*?\b(20\d{2})\b)/i;
        const match = document.body.innerText.match(regex);
        if (match) return parseInt(match[1], 10);
        const footer = document.querySelector("footer");
        const text = footer ? footer.innerText : document.body.innerText;
        const match2 = text.match(/(?:©|copyright)\s*([0-9]{4})/i);
        if (match2) return parseInt(match2[1], 10);
        return null;
      });
      analysis.emails = await page.evaluate(() => {
        const mailtoEmails = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map((a) => a.href.replace(/^mailto:/i, "").trim().split("?")[0]).filter((email) => email.includes("@"));
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const textEmails = document.body.innerText.match(emailRegex) || [];
        return Array.from(/* @__PURE__ */ new Set([...mailtoEmails, ...textEmails])).map((e) => e.toLowerCase().trim()).filter((e) => {
          const ext = e.split(".").pop() || "";
          return !["png", "jpg", "jpeg", "gif", "webp", "svg", "css", "js"].includes(ext);
        }).slice(0, 3);
      });
      analysis.googleAnalyticsPresent = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll("script"));
        const hasGaSrc = scripts.some((s) => {
          const src = s.src || "";
          return src.includes("googletagmanager.com") || src.includes("google-analytics.com");
        });
        const hasGaInText = scripts.some((s) => {
          const text = s.text || "";
          return text.includes("gtag") || text.includes("ga(") || text.includes("GoogleAnalyticsObject");
        });
        return hasGaSrc || hasGaInText || window.dataLayer !== void 0;
      });
      analysis.metaPixelPresent = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll("script"));
        const hasPixelSrc = scripts.some((s) => {
          const src = s.src || "";
          return src.includes("connect.facebook.net");
        });
        const hasPixelInText = scripts.some((s) => {
          const text = s.text || "";
          return text.includes("fbq") || text.includes("fbpx") || text.includes("_fbq");
        });
        return hasPixelSrc || hasPixelInText || window.fbq !== void 0;
      });
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      const isOutdatedCopyright = analysis.copyrightYear !== null && currentYear - analysis.copyrightYear >= 3;
      if (!analysis.responsive || isOutdatedCopyright) {
        analysis.status = "OUTDATED";
      } else {
        analysis.status = "WORKING";
      }
    } else {
      analysis.status = "BROKEN";
    }
  } catch (error) {
    logger.warn(`Website analysis failed or timed out for ${url}: ${error}`);
    analysis.status = "BROKEN";
  } finally {
    if (page) {
      await page.close();
    }
  }
  return analysis;
}

// src/instagramAnalyzer.ts
function extractInstagramHandle(url) {
  if (!url) return null;
  const match = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (match) {
    const handle = match[1];
    if (["p", "explore", "reels", "direct", "stories"].includes(handle.toLowerCase())) {
      return null;
    }
    return handle;
  }
  return null;
}
function parseGoogleSearchDate(text) {
  if (!text) return null;
  const clean = text.toLowerCase().trim();
  const now = /* @__PURE__ */ new Date();
  if (clean.includes("hour") || clean.includes("hr") || clean.includes("minute") || clean.includes("min") || clean.includes("just now")) {
    return now;
  }
  const dayMatch = clean.match(/(\d+)\s*d/);
  if (dayMatch) {
    now.setDate(now.getDate() - parseInt(dayMatch[1], 10));
    return now;
  }
  const dayAgoMatch = clean.match(/(\d+)\s*day/);
  if (dayAgoMatch) {
    now.setDate(now.getDate() - parseInt(dayAgoMatch[1], 10));
    return now;
  }
  if (clean.includes("yesterday")) {
    now.setDate(now.getDate() - 1);
    return now;
  }
  const wkMatch = clean.match(/(\d+)\s*wk/);
  if (wkMatch) {
    now.setDate(now.getDate() - parseInt(wkMatch[1], 10) * 7);
    return now;
  }
  const weekAgoMatch = clean.match(/(\d+)\s*week/);
  if (weekAgoMatch) {
    now.setDate(now.getDate() - parseInt(weekAgoMatch[1], 10) * 7);
    return now;
  }
  const monthAgoMatch = clean.match(/(\d+)\s*month/);
  if (monthAgoMatch) {
    now.setMonth(now.getMonth() - parseInt(monthAgoMatch[1], 10));
    return now;
  }
  const yearAgoMatch = clean.match(/(\d+)\s*year/);
  if (yearAgoMatch) {
    now.setFullYear(now.getFullYear() - parseInt(yearAgoMatch[1], 10));
    return now;
  }
  const parsed = Date.parse(clean);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  return null;
}
async function analyzeInstagram(browser, businessName) {
  const result = {
    url: "",
    followers: null,
    posts: null,
    lastPostDate: "",
    status: "NOT_FOUND"
  };
  let page = null;
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US"
    });
    page = await context.newPage();
    const query = `${businessName} Instagram`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    logger.info(`Searching Google for Instagram profile: ${query}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
    const snippetData = await page.evaluate(() => {
      const results = Array.from(document.querySelectorAll("div.g"));
      for (const res of results) {
        const linkEl = res.querySelector("a[href]");
        if (linkEl) {
          const href = linkEl.href;
          if (href.includes("instagram.com/") && !href.includes("google.com") && !href.includes("/search")) {
            return {
              href,
              text: res.textContent || ""
            };
          }
        }
      }
      const anchors = Array.from(document.querySelectorAll('a[href*="instagram.com/"]'));
      for (const a of anchors) {
        const href = a.href;
        if (!href.includes("google.com") && !href.includes("/search")) {
          let parent = a.parentElement;
          for (let i = 0; i < 5; i++) {
            if (parent && (parent.classList.contains("g") || parent.textContent.length > 100)) {
              return { href, text: parent.textContent || "" };
            }
            parent = parent?.parentElement || null;
          }
          return { href, text: "" };
        }
      }
      return null;
    });
    if (snippetData && snippetData.href) {
      result.url = snippetData.href;
      result.status = "ACTIVE";
      const snippetText = snippetData.text;
      const followersMatch = snippetText.match(/([\d,.]*[KkMm]?)\s*Followers/i);
      if (followersMatch) {
        const raw = followersMatch[1].toLowerCase();
        let val = parseFloat(raw.replace(/[^0-9.]/g, ""));
        if (raw.includes("k")) val *= 1e3;
        if (raw.includes("m")) val *= 1e6;
        result.followers = isNaN(val) ? null : Math.round(val);
      }
      const postsMatch = snippetText.match(/([\d,.]*)\s*Posts/i);
      if (postsMatch) {
        const raw = postsMatch[1].toLowerCase();
        const val = parseInt(raw.replace(/[^0-9]/g, ""), 10);
        result.posts = isNaN(val) ? null : val;
      }
      const handle = extractInstagramHandle(result.url);
      let newestDate = null;
      if (handle) {
        try {
          const siteSearchUrl = `https://www.google.com/search?q=site%3Ainstagram.com+%22${handle}%22`;
          logger.info(`Searching Google index for Instagram posts of ${handle}: ${siteSearchUrl}`);
          await page.goto(siteSearchUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
          const rawDates = await page.evaluate(() => {
            const list = [];
            const spans = document.querySelectorAll("div.VwiC3b span.YrbPuc > span");
            spans.forEach((span) => {
              if (span.textContent) list.push(span.textContent);
            });
            const divs = document.querySelectorAll("div.VwiC3b");
            divs.forEach((div) => {
              const text = div.textContent || "";
              const relMatch = text.match(/(\d+\s+(?:days|day|weeks|week|months|month|years|year|hours|hour|mins|min|hrs|hr)\s+ago)/i);
              if (relMatch) list.push(relMatch[1]);
              if (text.toLowerCase().includes("yesterday")) list.push("yesterday");
              const absMatch = text.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4})/i) || text.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
              if (absMatch) list.push(absMatch[1]);
            });
            const cites = document.querySelectorAll("cite");
            cites.forEach((cite) => {
              const text = cite.textContent || "";
              if (text.includes("\xB7")) {
                const parts = text.split("\xB7");
                list.push(parts[parts.length - 1]);
              } else if (text.toLowerCase().includes("ago") || text.toLowerCase().includes("yesterday")) {
                list.push(text);
              }
            });
            return list;
          });
          for (const rawStr of rawDates) {
            const parsed = parseGoogleSearchDate(rawStr);
            if (parsed) {
              if (!newestDate || parsed > newestDate) {
                newestDate = parsed;
              }
            }
          }
        } catch (searchErr) {
          logger.warn(`Google index search failed for handle ${handle}: ${searchErr}`);
        }
      }
      if (newestDate) {
        result.lastPostDate = newestDate.toISOString().split("T")[0];
        const diffMs = Date.now() - newestDate.getTime();
        const diffDays = diffMs / (1e3 * 60 * 60 * 24);
        if (diffDays > 90) {
          result.status = "INACTIVE";
        } else {
          result.status = "ACTIVE";
        }
        logger.success(`Instagram last post date extracted via Google: ${result.lastPostDate} (Status: ${result.status})`);
      } else {
        try {
          logger.info(`Visiting Instagram profile directly as fallback: ${result.url}`);
          await page.goto(result.url, { waitUntil: "domcontentloaded", timeout: 1e4 });
          const timeVal = await page.evaluate(() => {
            const timeEl = document.querySelector("time");
            return timeEl ? timeEl.getAttribute("datetime") || timeEl.textContent || "" : "";
          });
          if (timeVal) {
            result.lastPostDate = timeVal.split("T")[0];
            const diffMs = Date.now() - new Date(timeVal).getTime();
            const diffDays = diffMs / (1e3 * 60 * 60 * 24);
            if (diffDays > 90) {
              result.status = "INACTIVE";
            } else {
              result.status = "ACTIVE";
            }
            logger.success(`Instagram last post date extracted directly: ${result.lastPostDate} (Status: ${result.status})`);
          }
        } catch (err) {
          logger.warn(`Failed to inspect Instagram page directly: ${err}. Defaulting to status ACTIVE.`);
        }
      }
    }
  } catch (error) {
    logger.warn(`Instagram analysis failed: ${error}`);
  } finally {
    if (page) {
      await page.close();
    }
  }
  return result;
}

// src/facebookAnalyzer.ts
function parseRelativeDate(text) {
  if (!text) return null;
  const clean = text.toLowerCase().trim();
  const now = /* @__PURE__ */ new Date();
  if (clean.includes("hr") || clean.includes("hour") || clean.includes("min") || clean.includes("sec") || clean.includes("just now")) {
    return now;
  }
  const dayMatch = clean.match(/(\d+)\s*d/);
  if (dayMatch) {
    now.setDate(now.getDate() - parseInt(dayMatch[1], 10));
    return now;
  }
  const dayAgoMatch = clean.match(/(\d+)\s*day/);
  if (dayAgoMatch) {
    now.setDate(now.getDate() - parseInt(dayAgoMatch[1], 10));
    return now;
  }
  if (clean.includes("yesterday")) {
    now.setDate(now.getDate() - 1);
    return now;
  }
  const wkMatch = clean.match(/(\d+)\s*wk/);
  if (wkMatch) {
    now.setDate(now.getDate() - parseInt(wkMatch[1], 10) * 7);
    return now;
  }
  const weekAgoMatch = clean.match(/(\d+)\s*week/);
  if (weekAgoMatch) {
    now.setDate(now.getDate() - parseInt(weekAgoMatch[1], 10) * 7);
    return now;
  }
  const monthAgoMatch = clean.match(/(\d+)\s*month/);
  if (monthAgoMatch) {
    now.setMonth(now.getMonth() - parseInt(monthAgoMatch[1], 10));
    return now;
  }
  const parsed = Date.parse(text);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  return null;
}
async function analyzeFacebook(browser, businessName) {
  const result = {
    url: "",
    lastPostDate: "",
    status: "NOT_FOUND"
  };
  let page = null;
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US"
    });
    page = await context.newPage();
    const query = `${businessName} Facebook`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    logger.info(`Searching Google for Facebook page: ${query}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
    const snippetData = await page.evaluate(() => {
      const results = Array.from(document.querySelectorAll("div.g"));
      for (const res of results) {
        const linkEl = res.querySelector("a[href]");
        if (linkEl) {
          const href = linkEl.href;
          if (href.includes("facebook.com/") && !href.includes("google.com") && !href.includes("/search") && !href.includes("sharer.php")) {
            return href;
          }
        }
      }
      const anchors = Array.from(document.querySelectorAll('a[href*="facebook.com/"]'));
      for (const a of anchors) {
        const href = a.href;
        if (!href.includes("google.com") && !href.includes("/search") && !href.includes("sharer.php")) {
          return href;
        }
      }
      return "";
    });
    if (snippetData) {
      result.url = snippetData;
      result.status = "ACTIVE";
      try {
        logger.info(`Visiting Facebook page to check last post date: ${result.url}`);
        await page.goto(result.url, { waitUntil: "domcontentloaded", timeout: 1e4 });
        const postDateText = await page.evaluate(() => {
          const timeEl = document.querySelector("time");
          if (timeEl) return timeEl.getAttribute("datetime") || timeEl.textContent || "";
          const postLinks = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink.php"], a[href*="/photos/"]'));
          for (const a of postLinks) {
            if (a.textContent && a.textContent.length > 2 && a.textContent.length < 25) {
              return a.textContent;
            }
          }
          return "";
        });
        if (postDateText) {
          const parsedDate = parseRelativeDate(postDateText);
          if (parsedDate) {
            result.lastPostDate = parsedDate.toISOString().split("T")[0];
            const diffMs = Date.now() - parsedDate.getTime();
            const diffDays = diffMs / (1e3 * 60 * 60 * 24);
            if (diffDays > 90) {
              result.status = "INACTIVE";
            } else {
              result.status = "ACTIVE";
            }
          }
        }
      } catch (err) {
        logger.warn(`Failed to inspect Facebook page directly: ${err}. Defaulting to status ACTIVE.`);
      }
    }
  } catch (error) {
    logger.warn(`Facebook analysis failed: ${error}`);
  } finally {
    if (page) {
      await page.close();
    }
  }
  return result;
}

// src/linkedinAnalyzer.ts
async function analyzeLinkedIn(browser, businessName) {
  const result = {
    url: "",
    status: "NOT_FOUND"
  };
  let page = null;
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US"
    });
    page = await context.newPage();
    const query = `${businessName} LinkedIn`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    logger.info(`Searching Google for LinkedIn presence: ${query}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
    const snippetData = await page.evaluate(() => {
      const results = Array.from(document.querySelectorAll("div.g"));
      for (const res of results) {
        const linkEl = res.querySelector("a[href]");
        if (linkEl) {
          const href = linkEl.href;
          if ((href.includes("linkedin.com/company/") || href.includes("linkedin.com/in/")) && !href.includes("google.com") && !href.includes("/search")) {
            return href;
          }
        }
      }
      const anchors = Array.from(document.querySelectorAll('a[href*="linkedin.com/company/"], a[href*="linkedin.com/in/"]'));
      for (const a of anchors) {
        const href = a.href;
        if (!href.includes("google.com") && !href.includes("/search")) {
          return href;
        }
      }
      return "";
    });
    if (snippetData) {
      result.url = snippetData;
      result.status = "ACTIVE";
      logger.success(`LinkedIn page identified: ${result.url}`);
    } else {
      logger.info(`No LinkedIn presence identified for: ${businessName}`);
    }
  } catch (error) {
    logger.warn(`LinkedIn analysis failed: ${error}`);
  } finally {
    if (page) {
      await page.close();
    }
  }
  return result;
}

// src/digitalPresenceScorer.ts
function calculateDigitalPresenceScore(lead) {
  let score = 0;
  if (lead.websiteStatus === "MISSING") {
    score += 50;
  } else if (lead.websiteStatus === "BROKEN") {
    score += 40;
  } else if (lead.websiteStatus === "OUTDATED") {
    score += 30;
  }
  if (lead.reviews > 100) {
    score += 20;
  }
  if (lead.rating > 4.5) {
    score += 20;
  }
  if (lead.instagramStatus === "NOT_FOUND") {
    score += 15;
  } else if (lead.instagramStatus === "INACTIVE") {
    score += 10;
  }
  if (lead.facebookStatus === "NOT_FOUND") {
    score += 10;
  } else if (lead.facebookStatus === "INACTIVE") {
    score += 10;
  }
  if (lead.websiteStatus !== "MISSING" && lead.websiteStatus !== "BROKEN") {
    if (!lead.whatsappPresent) {
      score += 10;
    }
    if (!lead.appointmentSystem) {
      score += 10;
    }
  } else {
    score += 10;
    score += 10;
  }
  if (lead.websiteStatus !== "MISSING" && lead.websiteStatus !== "BROKEN") {
    if (!lead.googleAnalyticsPresent) {
      score += 10;
    }
    if (!lead.metaPixelPresent) {
      score += 10;
    }
    if (!lead.emails || lead.emails.length === 0) {
      score += 5;
    }
  } else {
    score += 10;
    score += 10;
    score += 5;
  }
  if (lead.linkedinStatus === "NOT_FOUND") {
    score += 10;
  }
  score = Math.min(score, 200);
  let priority = "COLD";
  if (score >= 100) {
    priority = "HOT";
  } else if (score >= 60) {
    priority = "WARM";
  }
  return {
    score,
    priority
  };
}

// src/aiInsights.ts
import { GoogleGenAI } from "@google/genai";
import axios2 from "axios";
async function generateSalesInsight(lead) {
  const currentDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const prompt = `Perform a comprehensive digital presence audit and create improvement insights for the business '${lead.businessName}'.
Analyze all of the following digital presence audit metrics:
- Business Category: ${lead.category || "Local Business"}
- Google Maps Rating: ${lead.rating} (${lead.reviews} reviews)
- Website Status: ${lead.websiteStatus} (Website URL: ${lead.website || "None"})
- Instagram Status: ${lead.instagramStatus} (URL: ${lead.instagramUrl || "None"}, Last Post Date: ${lead.instagramLastPost || "None"})
- Facebook Status: ${lead.facebookStatus} (URL: ${lead.facebookUrl || "None"}, Last Post Date: ${lead.facebookLastPost || "None"})
- LinkedIn Status: ${lead.linkedinStatus || "NOT_FOUND"} (URL: ${lead.linkedinUrl || "None"})
- Emails Found: ${lead.emails && lead.emails.length > 0 ? lead.emails.join(", ") : "None"}
- WhatsApp Chat Button on Site: ${lead.whatsappPresent ? "Present" : "Missing"}
- Online Booking System: ${lead.appointmentSystem ? "Present" : "Missing"}
- Google Analytics (GA4): ${lead.googleAnalyticsPresent ? "Present" : "Missing"}
- Meta Pixel: ${lead.metaPixelPresent ? "Present" : "Missing"}
- Digital Presence Score: ${lead.leadScore}/200 (Priority: ${lead.leadPriority})
- Current Date: ${currentDate}

Audit Formatting Instructions:
1. **Summary Audit Draft**: Start the output with a single paragraph summarizing their current assets and activity. Use phrases like "Having website!", "Having instagram account but X months since last posted", "Fb account is active/inactive but Y months since last posted", etc. Compute the time differences between the Current Date (${currentDate}) and their last post dates.
2. **Business Improvement Recommendations**: Provide a detailed list of actionable suggestions explaining how they can grow their business and improve their digital presence (e.g., website creation/redesign, booking automation, pixel tracking, social media active posting). Keep the tone helpful, professional, and business-focused. Do not use placeholders or markdown bolding. Keep the whole audit under 150 words.`;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey && openRouterKey.trim() !== "" && openRouterKey !== "YOUR_OPENROUTER_API_KEY") {
    try {
      logger.info(`Generating AI Insight via OpenRouter for: '${lead.businessName}'`);
      const response = await axios2.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        },
        {
          headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://leadfinder-ai.com",
            "X-Title": "LeadFinder AI"
          },
          timeout: 15e3
        }
      );
      if (response.data && response.data.choices && response.data.choices[0]?.message?.content) {
        const insight = response.data.choices[0].message.content.trim();
        if (insight) {
          return insight.replace(/^["']|["']$/g, "");
        }
      }
    } catch (e) {
      logger.warn(`OpenRouter API Insight generation failed: ${e.message || e}. Trying Gemini fallback...`);
    }
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim() !== "" && geminiKey !== "MY_GEMINI_API_KEY") {
    try {
      logger.info(`Generating AI Insight via Gemini for: '${lead.businessName}'`);
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      const insight = response.text ? response.text.trim() : "";
      if (insight) {
        return insight.replace(/^["']|["']$/g, "");
      }
    } catch (e) {
      logger.warn(`Gemini API Insight generation failed: ${e}. Falling back to rule-based engine.`);
    }
  }
  return getRuleBasedInsight(lead);
}
function getMonthsSinceDate(dateStr) {
  if (!dateStr || dateStr.trim() === "" || dateStr.trim() === "None") return "unknown time";
  const postDate = new Date(dateStr);
  const now = /* @__PURE__ */ new Date();
  if (isNaN(postDate.getTime())) return "unknown time";
  const diffMs = now.getTime() - postDate.getTime();
  const diffDays = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "1 day";
  if (diffDays < 30) return `${diffDays} days`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month";
  return `${diffMonths} months`;
}
function getRuleBasedInsight(lead) {
  const parts = [];
  if (lead.websiteStatus === "MISSING") {
    parts.push("Missing website!");
  } else if (lead.websiteStatus === "BROKEN") {
    parts.push("Website is broken/offline!");
  } else if (lead.websiteStatus === "OUTDATED") {
    parts.push("Having website but it is outdated and not mobile-responsive.");
  } else {
    parts.push("Having website!");
  }
  if (lead.instagramStatus === "NOT_FOUND") {
    parts.push("No Instagram account found.");
  } else {
    const lastPostStr = lead.instagramLastPost ? ` but ${getMonthsSinceDate(lead.instagramLastPost)} since last posted` : "";
    parts.push(`Having Instagram account (${lead.instagramStatus.toLowerCase()})${lastPostStr}.`);
  }
  if (lead.facebookStatus === "NOT_FOUND") {
    parts.push("No Facebook page found.");
  } else {
    const lastPostStr = lead.facebookLastPost ? ` but ${getMonthsSinceDate(lead.facebookLastPost)} since last posted` : "";
    parts.push(`Facebook page is ${lead.facebookStatus.toLowerCase()}${lastPostStr}.`);
  }
  if (lead.linkedinStatus === "NOT_FOUND") {
    parts.push("No LinkedIn company presence.");
  } else if (lead.linkedinStatus) {
    parts.push(`LinkedIn is ${lead.linkedinStatus.toLowerCase()}.`);
  }
  const summaryDraft = parts.join(" ");
  const recs = [];
  if (lead.websiteStatus === "MISSING") {
    recs.push("- Create a professional, mobile-responsive landing page to capture local search traffic.");
  } else if (lead.websiteStatus === "BROKEN") {
    recs.push("- Rebuild and restore the broken website immediately to avoid losing patient trust.");
  } else if (lead.websiteStatus === "OUTDATED") {
    recs.push("- Modernize the website layout and implement mobile responsiveness.");
  }
  if (lead.websiteStatus !== "MISSING" && lead.websiteStatus !== "BROKEN") {
    if (!lead.googleAnalyticsPresent) {
      recs.push("- Install Google Analytics (GA4) to track visitor traffic and page performance.");
    }
    if (!lead.metaPixelPresent) {
      recs.push("- Embed the Meta Pixel to run retargeting ads and trace ad conversions.");
    }
    if (!lead.whatsappPresent) {
      recs.push("- Add a direct WhatsApp chat button on the website for instant patient/client communication.");
    }
    if (!lead.appointmentSystem) {
      recs.push("- Integrate an automated online booking system (e.g., Calendly) to streamline appointments.");
    }
  }
  if (lead.instagramStatus === "INACTIVE" || lead.instagramStatus === "NOT_FOUND" || lead.facebookStatus === "INACTIVE" || lead.facebookStatus === "NOT_FOUND") {
    recs.push("- Revitalize social media branding by planning a consistent post schedule and utilizing automated posts.");
  }
  const recommendationsText = recs.length > 0 ? "\n\nRecommendations to Improve Business:\n" + recs.join("\n") : "\n\nDigital presence is solid! Maintain reputation and optimize local Google Maps ranking.";
  return `${summaryDraft}${recommendationsText}`;
}

// src/mapsScraper.ts
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function extractCoordinatesFromUrl(url) {
  if (!url) return null;
  const matchPlace = url.match(/!3d(-?[0-9.]+)!4d(-?[0-9.]+)/);
  if (matchPlace) {
    return {
      lat: parseFloat(matchPlace[1]),
      lng: parseFloat(matchPlace[2])
    };
  }
  const matchAt = url.match(/@(-?[0-9.]+),(-?[0-9.]+)/);
  if (matchAt) {
    return {
      lat: parseFloat(matchAt[1]),
      lng: parseFloat(matchAt[2])
    };
  }
  return null;
}
async function runScraper() {
  const query = `${CONFIG.businessType} in ${CONFIG.location}`;
  logger.info(`Starting lead search for: '${query}'`);
  const startTime = Date.now();
  let browser = null;
  let leadsFound = [];
  let scannedCount = 0;
  let withoutWebsiteCount = 0;
  let addedCount = 0;
  let failedCount = 0;
  try {
    const isHeadless = CONFIG.headless;
    logger.info(`Launching Chromium browser (headless: ${isHeadless}) with Playwright...`);
    browser = await chromium.launch({
      headless: isHeadless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800"
      ]
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US"
    });
    const page = await context.newPage();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    logger.info(`Navigating directly to Google Maps search page: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45e3 });
    logger.info("Checking for cookie consent / privacy screens...");
    try {
      const consentButtons = [
        "button[aria-label*='Accept all']",
        "button[aria-label*='Agree']",
        "button:has-text('Accept all')",
        "button:has-text('I agree')",
        "button[class*='VfP3Zd']"
        // German consent buttons classes
      ];
      for (const selector of consentButtons) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible()) {
          logger.info(`Clicking cookie/consent accept button matching: ${selector}`);
          await btn.click();
          await page.waitForTimeout(2e3);
          break;
        }
      }
    } catch (e) {
    }
    logger.info("Waiting for search results feed...");
    try {
      await page.waitForSelector("a[href*='/maps/place/']", { timeout: 15e3 });
    } catch (e) {
      logger.warn("Could not find place link results container. checking fallback list...");
    }
    logger.info("Scanning and scrolling business results panel...");
    const placeLinks = /* @__PURE__ */ new Set();
    let prevSize = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;
    while (placeLinks.size < CONFIG.maxResults && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
        return anchors.map((a) => a.href).filter(Boolean);
      });
      for (const link of links) {
        placeLinks.add(link);
      }
      logger.info(`Scrolling... Found ${placeLinks.size} business URLs so far...`);
      if (placeLinks.size >= CONFIG.maxResults) {
        logger.info(`Reached goal: extracted ${placeLinks.size} links.`);
        break;
      }
      await page.evaluate(() => {
        const findScrollContainer = () => {
          let el = document.querySelector('div[role="feed"]');
          if (el) return el;
          const link = document.querySelector('a[href*="/maps/place/"]');
          if (link) {
            let parent = link.parentElement;
            while (parent && parent !== document.body) {
              const style = window.getComputedStyle(parent);
              if (style.overflowY === "auto" || style.overflowY === "scroll") {
                return parent;
              }
              parent = parent.parentElement;
            }
          }
          return document.querySelector(".m67Bo") || document.querySelector('div[role="main"]');
        };
        const container = findScrollContainer();
        if (container) {
          container.scrollBy(0, 1e3);
        } else {
          window.scrollBy(0, 1e3);
        }
      });
      await page.waitForTimeout(1e3 + Math.random() * 1e3);
      const isEnd = await page.evaluate(() => {
        const endText = ["You've reached the end of the list.", "No more results", "End of list"];
        return endText.some((text) => document.body.innerText.includes(text));
      });
      if (isEnd) {
        logger.success("Google Maps matches complete. Reached the end of list.");
        break;
      }
      if (placeLinks.size === prevSize) {
        if (scrollAttempts > 8 && placeLinks.size > 0) {
          logger.info("Scroller paused. No new listings found after multiple attempts.");
          break;
        }
      }
      prevSize = placeLinks.size;
    }
    const targetUrls = Array.from(placeLinks).slice(0, CONFIG.maxResults);
    logger.success(`Extraction complete! Found ${targetUrls.length} total target URLs.`);
    if (targetUrls.length === 0) {
      logger.warn("No business listings extracted directly from Google Maps page.");
      if (CONFIG.enableSimulation) {
        logger.info("Piping fallback to high-fidelity AI simulation scanner to produce realistic local leads...");
        if (browser) {
          await browser.close();
          browser = null;
        }
        return await runSimulationScanner();
      } else {
        throw new Error("No businesses extracted. Headless mode might be blocked by Google Maps bot protection, or no results were found for the query.");
      }
    }
    for (const url of targetUrls) {
      scannedCount++;
      logger.info(`--- Processing [${scannedCount}/${targetUrls.length}] ---`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3e4 });
        try {
          await page.waitForSelector("h1", { timeout: 8e3 });
        } catch (e) {
        }
        await page.waitForTimeout(1e3 + Math.random() * 1e3);
        const details = await page.evaluate(() => {
          let name = "";
          const nameEl = document.querySelector("h1") || document.querySelector("h1.DUwDvf") || document.querySelector("div.x3b7o h1");
          if (nameEl) name = (nameEl.textContent || "").trim();
          let ratingNum = 0;
          let reviewsNum = 0;
          const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]') || document.querySelector("div.F7nice span span");
          if (ratingEl) {
            const match = ratingEl.textContent?.match(/([0-9]\.[0-9])/);
            if (match) {
              ratingNum = parseFloat(match[1]);
            } else {
              const clean = ratingEl.textContent?.replace(/[^0-9.]/g, "");
              if (clean) {
                const num = parseFloat(clean);
                if (!isNaN(num)) ratingNum = num;
              }
            }
          }
          const reviewsEl = document.querySelector('div.F7nice span[aria-label*="reviews"]') || document.querySelector('div.F7nice [aria-label*="reviews"]') || document.querySelector('[aria-label*="reviews"]');
          if (reviewsEl) {
            const ariaLabel = reviewsEl.getAttribute("aria-label");
            const matchLabel = ariaLabel?.replace(/[^0-9]/g, "");
            if (matchLabel) {
              reviewsNum = parseInt(matchLabel, 10);
            } else {
              const matchText = reviewsEl.textContent?.replace(/[^0-9]/g, "");
              if (matchText) reviewsNum = parseInt(matchText, 10);
            }
          } else {
            const spans = document.querySelectorAll("div.F7nice > span");
            if (spans.length > 1) {
              const matchText = spans[1].textContent?.replace(/[^0-9]/g, "");
              if (matchText) reviewsNum = parseInt(matchText, 10);
            }
          }
          let webUrl = "";
          const webEl = Array.from(document.querySelectorAll("a[href]")).find((a) => {
            const itemId = a.getAttribute("data-item-id") || "";
            const label = a.getAttribute("aria-label") || "";
            const tooltip = a.getAttribute("data-tooltip") || "";
            return itemId === "authority" || label.toLowerCase().includes("website") || tooltip.toLowerCase().includes("website");
          });
          if (webEl) webUrl = webEl.href;
          let phoneVal = "";
          const phoneEl = Array.from(document.querySelectorAll("*")).find((el) => {
            const itemId = el.getAttribute("data-item-id") || "";
            const label = el.getAttribute("aria-label") || "";
            return itemId.startsWith("phone:tel:") || label.startsWith("Phone:");
          });
          if (phoneEl) {
            const attr = phoneEl.getAttribute("aria-label") || phoneEl.getAttribute("data-item-id") || phoneEl.textContent || "";
            phoneVal = attr.replace("Phone:", "").replace("phone:tel:", "").trim();
          } else {
            const telLink = document.querySelector('a[href^="tel:"]');
            if (telLink) phoneVal = telLink.getAttribute("href")?.replace("tel:", "").trim() || "";
          }
          let addressVal = "";
          const addressEl = Array.from(document.querySelectorAll("*")).find((el) => {
            const itemId = el.getAttribute("data-item-id") || "";
            const label = el.getAttribute("aria-label") || "";
            const tooltip = el.getAttribute("data-tooltip") || "";
            return itemId === "address" || label.startsWith("Address:") || tooltip.toLowerCase().includes("copy address");
          });
          if (addressEl) {
            const attr = addressEl.getAttribute("aria-label") || addressEl.getAttribute("data-item-id") || addressEl.textContent || "";
            addressVal = attr.replace("Address:", "").replace("address", "").trim();
          }
          let catVal = "";
          const catEl = document.querySelector("button[jsaction*='category']");
          if (catEl) catVal = catEl.textContent?.trim() || "";
          return {
            businessName: name,
            rating: ratingNum,
            reviews: reviewsNum,
            website: webUrl,
            phone: phoneVal,
            address: addressVal,
            category: catVal
          };
        });
        let businessName = details.businessName;
        let rating = details.rating;
        let reviews = details.reviews;
        let website = details.website;
        let phone = details.phone;
        let address = details.address;
        let category = details.category || CONFIG.businessType;
        if (!businessName) {
          logger.warn("Skipping place: Missing business name.");
          continue;
        }
        if (!phone || phone.toLowerCase() === "not found" || phone.trim() === "") {
          logger.warn(`Skipped: '${businessName}' (Missing Phone Number)`);
          continue;
        }
        if (rating === 0) {
          logger.warn(`Skipped: '${businessName}' (No Ratings/Score)`);
          continue;
        }
        if (duplicateChecker.isDuplicate(businessName, address)) {
          logger.warn(`Skipped: '${businessName}' (Already processed in processed-leads.json)`);
          continue;
        }
        const coords = extractCoordinatesFromUrl(url);
        let leadLat = void 0;
        let leadLng = void 0;
        if (coords) {
          leadLat = coords.lat;
          leadLng = coords.lng;
          if (CONFIG.lat && CONFIG.lng && CONFIG.radius) {
            const distance = calculateDistance(CONFIG.lat, CONFIG.lng, coords.lat, coords.lng);
            if (distance > CONFIG.radius) {
              logger.warn(`Skipped: '${businessName}' (Out of search radius: ${distance.toFixed(2)} km, limit is ${CONFIG.radius} km)`);
              continue;
            } else {
              logger.info(`Within search radius: ${distance.toFixed(2)} km from search center.`);
            }
          }
        }
        logger.info(`Analyzing website indicators for '${businessName}'...`);
        const webAnalysis = await analyzeWebsite(browser, website);
        logger.info(`Analyzing Instagram presence for '${businessName}'...`);
        const instaAnalysis = await analyzeInstagram(browser, businessName);
        logger.info(`Analyzing Facebook presence for '${businessName}'...`);
        const fbAnalysis = await analyzeFacebook(browser, businessName);
        logger.info(`Analyzing LinkedIn presence for '${businessName}'...`);
        const liAnalysis = await analyzeLinkedIn(browser, businessName);
        if (webAnalysis.status !== "WORKING") {
          withoutWebsiteCount++;
        }
        const partialLead = {
          businessName,
          phone,
          address: address || CONFIG.location,
          rating,
          reviews,
          website: website || "",
          mapsUrl: url,
          category,
          websiteMissing: !website || website.trim() === "",
          lat: leadLat,
          lng: leadLng,
          websiteStatus: webAnalysis.status,
          instagramUrl: instaAnalysis.url,
          instagramStatus: instaAnalysis.status,
          instagramLastPost: instaAnalysis.lastPostDate,
          facebookUrl: fbAnalysis.url,
          facebookStatus: fbAnalysis.status,
          facebookLastPost: fbAnalysis.lastPostDate,
          whatsappPresent: webAnalysis.whatsappPresent,
          appointmentSystem: webAnalysis.appointmentSystem,
          emails: webAnalysis.emails,
          googleAnalyticsPresent: webAnalysis.googleAnalyticsPresent,
          metaPixelPresent: webAnalysis.metaPixelPresent,
          linkedinUrl: liAnalysis.url,
          linkedinStatus: liAnalysis.status
        };
        const scoreDetails = calculateDigitalPresenceScore(partialLead);
        const aiInsight = await generateSalesInsight({
          ...partialLead,
          leadScore: scoreDetails.score,
          leadPriority: scoreDetails.priority
        });
        const fullLead = {
          ...partialLead,
          leadScore: scoreDetails.score,
          leadPriority: scoreDetails.priority,
          aiInsight,
          dateAdded: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        };
        logger.log(`
Found:
${businessName}`);
        logger.log(`Website:
${webAnalysis.status}`);
        logger.log(`Emails:
${webAnalysis.emails.join(", ") || "None"}`);
        logger.log(`Google Analytics:
${webAnalysis.googleAnalyticsPresent ? "Present" : "Missing"}`);
        logger.log(`Meta Pixel:
${webAnalysis.metaPixelPresent ? "Present" : "Missing"}`);
        logger.log(`Instagram:
${instaAnalysis.status}`);
        logger.log(`Facebook:
${fbAnalysis.status}`);
        logger.log(`LinkedIn:
${liAnalysis.status}`);
        logger.log(`Lead Score:
${scoreDetails.score}`);
        logger.log(`Priority:
${scoreDetails.priority}
`);
        leadsFound.push(fullLead);
        const success = await sendLeadToWebhook(fullLead);
        if (success) {
          addedCount++;
          duplicateChecker.saveLead(fullLead);
          logger.success(`Added To Sheet`);
        } else {
          failedCount++;
          logger.warn(`Webhook delivery failed for '${businessName}'. Lead retained in failed cache for retry.`);
        }
      } catch (err) {
        logger.error(`Error extracting business coordinates for url: ${url}`, err);
      }
    }
  } catch (error) {
    logger.error("Scraper encountered a critical error during execution:", error);
    if (CONFIG.enableSimulation) {
      logger.warn("Piping fallback to high-fidelity AI simulation scanner...");
      return await runSimulationScanner();
    } else {
      throw error;
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  const durationMs = Date.now() - startTime;
  const minutes = Math.floor(durationMs / 6e4);
  const seconds = (durationMs % 6e4 / 1e3).toFixed(0);
  const executionTimeString = `${minutes}m ${seconds}s`;
  displaySummaryTable({
    scannedCount,
    withoutWebsiteCount,
    addedCount,
    failedCount,
    executionTime: executionTimeString
  });
  return {
    scannedCount,
    withoutWebsiteCount,
    addedCount,
    failedCount,
    leads: leadsFound
  };
}
async function runSimulationScanner() {
  const query = `${CONFIG.businessType} in ${CONFIG.location}`;
  logger.warn(`--- Running High-Fidelity Simulation Mode for '${query}' ---`);
  const startTime = Date.now();
  const simulatedLeads = getMockLeadsPool(CONFIG.businessType, CONFIG.location);
  let scannedCount = 0;
  let withoutWebsiteCount = 0;
  let addedCount = 0;
  let failedCount = 0;
  const leadsFound = [];
  for (const mock of simulatedLeads) {
    if (scannedCount >= CONFIG.maxResults) break;
    scannedCount++;
    logger.info(`Scanning: Google Maps place listing [${scannedCount}/${simulatedLeads.length}]`);
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (!mock.phone) {
      logger.warn(`Skipped: '${mock.businessName}' (Missing Phone Number)`);
      continue;
    }
    if (!mock.rating) {
      logger.warn(`Skipped: '${mock.businessName}' (Missing Rating Score)`);
      continue;
    }
    const centerLat = CONFIG.lat || 19.9975;
    const centerLng = CONFIG.lng || 73.7898;
    const radius = CONFIG.radius || 10;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const latOffset = distance / 111 * Math.sin(angle);
    const lngOffset = distance / (111 * Math.cos(centerLat * Math.PI / 180)) * Math.cos(angle);
    const mockLat = centerLat + latOffset;
    const mockLng = centerLng + lngOffset;
    if (duplicateChecker.isDuplicate(mock.businessName, mock.address)) {
      logger.warn(`Skipped: '${mock.businessName}' (Already processed in processed-leads.json)`);
      continue;
    }
    const websiteStatus = mock.websiteStatus || (mock.website ? "WORKING" : "MISSING");
    const instagramStatus = mock.instagramStatus || (mock.businessName?.includes("Elite") ? "INACTIVE" : "NOT_FOUND");
    const instagramUrl = mock.instagramUrl || (instagramStatus !== "NOT_FOUND" ? `https://instagram.com/${mock.businessName?.toLowerCase().replace(/[^a-z]/g, "")}` : "");
    const instagramLastPost = mock.instagramLastPost || (instagramStatus === "ACTIVE" ? "2026-05-15" : instagramStatus === "INACTIVE" ? "2025-08-10" : "");
    const facebookStatus = mock.facebookStatus || (mock.businessName?.includes("Smile") || mock.businessName?.includes("Harvest") ? "ACTIVE" : "NOT_FOUND");
    const facebookUrl = mock.facebookUrl || (facebookStatus !== "NOT_FOUND" ? `https://facebook.com/${mock.businessName?.toLowerCase().replace(/[^a-z]/g, "")}` : "");
    const facebookLastPost = mock.facebookLastPost || (facebookStatus === "ACTIVE" ? "2026-06-01" : facebookStatus === "INACTIVE" ? "2025-09-12" : "");
    const whatsappPresent = mock.whatsappPresent !== void 0 ? mock.whatsappPresent : websiteStatus === "WORKING" && mock.businessName.includes("Design");
    const appointmentSystem = mock.appointmentSystem !== void 0 ? mock.appointmentSystem : websiteStatus === "WORKING" && mock.businessName.includes("Care");
    const emails = mock.emails || (websiteStatus === "WORKING" ? [`info@${mock.businessName?.toLowerCase().replace(/[^a-z]/g, "")}.com`] : []);
    const googleAnalyticsPresent = mock.googleAnalyticsPresent !== void 0 ? mock.googleAnalyticsPresent : websiteStatus === "WORKING" && !mock.businessName.includes("Design");
    const metaPixelPresent = mock.metaPixelPresent !== void 0 ? mock.metaPixelPresent : websiteStatus === "WORKING" && mock.businessName.includes("Care");
    const linkedinStatus = mock.linkedinStatus || (mock.businessName?.includes("Elite") || mock.businessName?.includes("Hub") ? "ACTIVE" : "NOT_FOUND");
    const linkedinUrl = mock.linkedinUrl || (linkedinStatus !== "NOT_FOUND" ? `https://linkedin.com/company/${mock.businessName?.toLowerCase().replace(/[^a-z]/g, "")}` : "");
    if (websiteStatus !== "WORKING") {
      withoutWebsiteCount++;
    }
    const partialLead = {
      businessName: mock.businessName,
      phone: mock.phone,
      address: mock.address,
      rating: mock.rating,
      reviews: mock.reviews,
      website: mock.website || "",
      mapsUrl: mock.mapsUrl,
      category: mock.category,
      websiteMissing: !mock.website,
      lat: mockLat,
      lng: mockLng,
      websiteStatus,
      instagramUrl,
      instagramStatus,
      instagramLastPost,
      facebookUrl,
      facebookStatus,
      facebookLastPost,
      whatsappPresent,
      appointmentSystem,
      emails,
      googleAnalyticsPresent,
      metaPixelPresent,
      linkedinUrl,
      linkedinStatus
    };
    const scoreDetails = calculateDigitalPresenceScore(partialLead);
    const aiInsight = await generateSalesInsight({
      ...partialLead,
      leadScore: scoreDetails.score,
      leadPriority: scoreDetails.priority
    });
    const fullLead = {
      ...partialLead,
      leadScore: scoreDetails.score,
      leadPriority: scoreDetails.priority,
      aiInsight,
      dateAdded: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    };
    logger.log(`
Found:
${fullLead.businessName}`);
    logger.log(`Website:
${websiteStatus}`);
    logger.log(`Emails:
${fullLead.emails.join(", ") || "None"}`);
    logger.log(`Google Analytics:
${fullLead.googleAnalyticsPresent ? "Present" : "Missing"}`);
    logger.log(`Meta Pixel:
${fullLead.metaPixelPresent ? "Present" : "Missing"}`);
    logger.log(`Instagram:
${instagramStatus}`);
    logger.log(`Facebook:
${facebookStatus}`);
    logger.log(`LinkedIn:
${linkedinStatus}`);
    logger.log(`Lead Score:
${scoreDetails.score}`);
    logger.log(`Priority:
${scoreDetails.priority}
`);
    leadsFound.push(fullLead);
    const success = await sendLeadToWebhook(fullLead);
    if (success) {
      addedCount++;
      duplicateChecker.saveLead(fullLead);
      logger.success(`Added To Sheet`);
    } else {
      failedCount++;
      logger.warn(`Webhook delivery failed for '${fullLead.businessName}'. Lead retained in failed-leads.json for future retry.`);
    }
  }
  const durationMs = Date.now() - startTime;
  const minutes = Math.floor(durationMs / 6e4);
  const seconds = (durationMs % 6e4 / 1e3).toFixed(0);
  const executionTimeString = `${minutes}m ${seconds}s`;
  displaySummaryTable({
    scannedCount,
    withoutWebsiteCount,
    addedCount,
    failedCount,
    executionTime: executionTimeString
  });
  return {
    scannedCount,
    withoutWebsiteCount,
    addedCount,
    failedCount,
    leads: leadsFound
  };
}
function displaySummaryTable(data) {
  logger.log("\n================================\n");
  logger.log("SEARCH COMPLETE\n");
  logger.log(`Business Type:
${CONFIG.businessType}
`);
  logger.log(`Location:
${CONFIG.location}
`);
  logger.log(`Businesses Scanned:
${data.scannedCount}
`);
  logger.log(`Without Website:
${data.withoutWebsiteCount}
`);
  logger.log(`Added To Sheet:
${data.addedCount}
`);
  logger.log(`Failed:
${data.failedCount}
`);
  logger.log(`Execution Time:
${data.executionTime}
`);
  logger.log("================================\n");
}
function getMockLeadsPool(type, location) {
  const normalizedType = type.toLowerCase();
  if (normalizedType.includes("dental") || normalizedType.includes("dentist") || normalizedType.includes("dentistry")) {
    return [
      {
        businessName: "Smile Dental Design Clinic",
        phone: "+91 98123 45678",
        address: `12 Main St, Near Bank, ${location}`,
        rating: 4.8,
        reviews: 245,
        website: "",
        category: "Dental Clinic",
        mapsUrl: "https://maps.google.com/?cid=smile_dental"
      },
      {
        businessName: "Elite Multi-specialty Dental Care",
        phone: "+91 97234 56789",
        address: `A-401, Sapphire Complex, ${location}`,
        rating: 4.6,
        reviews: 180,
        website: "https://elitedental.com",
        category: "Dental Clinic",
        mapsUrl: "https://maps.google.com/?cid=elite_dental"
      },
      {
        businessName: "Healthy Teeth Orthodontic Center",
        phone: "+91 99345 67890",
        address: `Shop 5, Ground Floor, Plaza Bldg, ${location}`,
        rating: 4.9,
        reviews: 95,
        website: "",
        category: "Dentist",
        mapsUrl: "https://maps.google.com/?cid=healthy_teeth"
      },
      {
        businessName: "Perfect Smiles Pediatric Dentist",
        phone: "+91 96456 78901",
        address: `Upper Mall, Road No. 2, ${location}`,
        rating: 4.2,
        reviews: 320,
        website: "",
        category: "Dental Clinic",
        mapsUrl: "https://maps.google.com/?cid=perfect_smiles"
      },
      {
        businessName: "Sparkle Dental & Facial Hub",
        phone: "+91 95567 89012",
        address: `Green Row Villas, Sector B, ${location}`,
        rating: 4.7,
        reviews: 112,
        website: "",
        category: "Dental Clinic",
        mapsUrl: "https://maps.google.com/?cid=sparkle_dental"
      },
      {
        businessName: "Modern Dental implantology Group",
        phone: "+91 94678 90123",
        address: `Tower C, IT Hub Road, ${location}`,
        rating: 4.4,
        reviews: 55,
        website: "https://moderndentistry.org",
        category: "Dental Clinic",
        mapsUrl: "https://maps.google.com/?cid=modern_dental"
      },
      {
        businessName: "Grace Dental Clinic & Orthognathic Center",
        phone: "+91 91122 33445",
        address: `Corner Office, Lakeview St, ${location}`,
        rating: 4.5,
        reviews: 21,
        website: "",
        category: "Dentist",
        mapsUrl: "https://maps.google.com/?cid=grace_dental"
      },
      {
        businessName: "Alpha Dental Clinic",
        phone: "",
        // Will trigger filter skipped: Phone missing
        address: `Plot 56, Sector 4, ${location}`,
        rating: 4.8,
        reviews: 15,
        website: "",
        category: "Dental Clinic",
        mapsUrl: "https://maps.google.com/?cid=alpha"
      }
    ];
  } else if (normalizedType.includes("skin") || normalizedType.includes("derma") || normalizedType.includes("aesthetic") || normalizedType.includes("laser") || normalizedType.includes("cosmet")) {
    return [
      {
        businessName: "ClearSkin Dermatology & Laser Clinic",
        phone: "+91 98812 34567",
        address: `Sadar Bazar, Near Court Road, ${location}`,
        rating: 4.8,
        reviews: 215,
        website: "",
        category: "Skin Care Clinic",
        mapsUrl: "https://maps.google.com/?cid=clearskin_satara"
      },
      {
        businessName: "Dr. Patil's Skin & Hair Aesthetic Laser Centre",
        phone: "+91 97654 32109",
        address: `Radhika Road, Opp. Civil Hospital, ${location}`,
        rating: 4.6,
        reviews: 140,
        website: "https://drpatilskin.com",
        category: "Dermatologist",
        mapsUrl: "https://maps.google.com/?cid=drpatilskin"
      },
      {
        businessName: "Radiant Glow Skin Clinic & Cosmetology",
        phone: "+91 99234 56789",
        address: `Shop No. 4, Shahu Stadium Complex, ${location}`,
        rating: 4.9,
        reviews: 98,
        website: "",
        category: "Skin Care Clinic",
        mapsUrl: "https://maps.google.com/?cid=radiantglow"
      },
      {
        businessName: "Aura Laser & Hair Transplant Centre",
        phone: "+91 95456 78901",
        address: `Powai Naka, Commercial Arcade, ${location}`,
        rating: 4.3,
        reviews: 74,
        website: "",
        category: "Laser Clinic",
        mapsUrl: "https://maps.google.com/?cid=aurahair"
      },
      {
        businessName: "The Skin Artistry Clinic",
        phone: "+91 91586 78912",
        address: `Yashwant High School Road, ${location}`,
        rating: 4.7,
        reviews: 110,
        website: "",
        category: "Skin Care Clinic",
        mapsUrl: "https://maps.google.com/?cid=skinartistry"
      },
      {
        businessName: "Grace Advanced Skin Care & Salon",
        phone: "+91 94238 90123",
        address: `Karanje Turf, Near Maruti Mandir, ${location}`,
        rating: 4.4,
        reviews: 58,
        website: "https://graceskinclinic.org",
        category: "Skin Care Clinic",
        mapsUrl: "https://maps.google.com/?cid=graceskin"
      },
      {
        businessName: "Perfect Derma Care & Laser Center",
        phone: "+91 91122 55446",
        address: `Bombay Restaurant Chowk, NH4 bypass, ${location}`,
        rating: 4.5,
        reviews: 32,
        website: "",
        category: "Dermatologist",
        mapsUrl: "https://maps.google.com/?cid=perfectderma"
      },
      {
        businessName: "DermaElite Skin Clinic",
        phone: "",
        // Will trigger filter skipped: Phone missing
        address: `Plot 78, Guruwar Peth, ${location}`,
        rating: 4.8,
        reviews: 12,
        website: "",
        category: "Skin Care Clinic",
        mapsUrl: "https://maps.google.com/?cid=dermaelite"
      }
    ];
  } else if (normalizedType.includes("restaurant") || normalizedType.includes("hotel") || normalizedType.includes("cafe")) {
    return [
      {
        businessName: "The Local Harvest Bistro",
        phone: "+91 88123 45678",
        address: `Main Crossing Road, ${location}`,
        rating: 4.7,
        reviews: 350,
        website: "",
        category: "Restaurant",
        mapsUrl: "https://maps.google.com/?cid=local_harvest"
      },
      {
        businessName: "Aroma Cafe & Brewmaster",
        phone: "+91 87234 56789",
        address: `Lane 3, Behind Star Mall, ${location}`,
        rating: 4.4,
        reviews: 1200,
        website: "https://aromacafe.in",
        category: "Cafe",
        mapsUrl: "https://maps.google.com/?cid=aroma_cafe"
      },
      {
        businessName: "Royal Spice Family Restaurant",
        phone: "+91 85567 89012",
        address: `Dona Heights Building, ${location}`,
        rating: 4.6,
        reviews: 240,
        website: "",
        category: "Restaurant",
        mapsUrl: "https://maps.google.com/?cid=royal_spice"
      },
      {
        businessName: "The Golden Leaf Boutique Hotel",
        phone: "+91 82233 44556",
        address: `Hillside View Lane, ${location}`,
        rating: 4.9,
        reviews: 35,
        website: "",
        category: "Hotel",
        mapsUrl: "https://maps.google.com/?cid=golden_leaf"
      }
    ];
  } else {
    return [
      {
        businessName: `Pioneer ${type} Expert`,
        phone: "+91 99911 22334",
        address: `Central Market Plaza, ${location}`,
        rating: 4.8,
        reviews: 156,
        website: "",
        category: type,
        mapsUrl: "https://maps.google.com/?cid=pioneer"
      },
      {
        businessName: `Metro ${type} & Services`,
        phone: "+91 99922 33445",
        address: `Avenue Road Cross, ${location}`,
        rating: 4.2,
        reviews: 80,
        website: "https://metroservices.org",
        category: type,
        mapsUrl: "https://maps.google.com/?cid=metro"
      },
      {
        businessName: `${CONFIG.location} Elite ${type}`,
        phone: "+91 99933 44556",
        address: `Prime Arcade Suite 10, ${location}`,
        rating: 4.7,
        reviews: 210,
        website: "",
        category: type,
        mapsUrl: "https://maps.google.com/?cid=elite_place"
      },
      {
        businessName: `Apex ${type} Group`,
        phone: "+91 98844 55667",
        address: `Sector 12, Main Hub, ${location}`,
        rating: 4.5,
        reviews: 134,
        website: "",
        category: type,
        mapsUrl: "https://maps.google.com/?cid=apex"
      },
      {
        businessName: `Royal ${type} Hub`,
        phone: "+91 97755 66778",
        address: `Block B-3, Sapphire Square, ${location}`,
        rating: 4.9,
        reviews: 82,
        website: "",
        category: type,
        mapsUrl: "https://maps.google.com/?cid=royal"
      },
      {
        businessName: `Greenway ${type} Care`,
        phone: "+91 96666 77889",
        address: `Oakwood Avenue, Near City Park, ${location}`,
        rating: 4.3,
        reviews: 99,
        website: "",
        category: type,
        mapsUrl: "https://maps.google.com/?cid=greenway"
      },
      {
        businessName: `FirstChoice ${type} Clinic`,
        phone: "+91 95577 88990",
        address: `G-15, Royal Shopping Arcade, ${location}`,
        rating: 4.6,
        reviews: 45,
        website: "",
        category: type,
        mapsUrl: "https://maps.google.com/?cid=firstchoice"
      },
      {
        businessName: `Modern ${type} Solutions`,
        phone: "+91 94488 99001",
        address: `Tower B, Commercial Business Park, ${location}`,
        rating: 4.1,
        reviews: 29,
        website: "",
        category: type,
        mapsUrl: "https://maps.google.com/?cid=modern"
      }
    ];
  }
}

// src/outreachService.ts
import nodemailer from "nodemailer";
import pkg from "whatsapp-web.js";
import path4 from "path";
import fs4 from "fs";
var { Client, LocalAuth } = pkg;
async function sendEmailOutreach(to, subject, body) {
  const host = process.env.SMTP_HOST || "";
  const rawPort = process.env.SMTP_PORT || "587";
  const port = Math.min(parseInt(rawPort, 10) || 587, 65535);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || "";
  if (!host || !user || !pass) {
    logger.error("SMTP host, user, or password is not configured in .env. Cannot send email.");
    return false;
  }
  if (port <= 0 || port > 65535) {
    logger.error(`Invalid SMTP port: ${rawPort}. Port must be between 1 and 65535.`);
    return false;
  }
  try {
    logger.info(`Initializing SMTP Transporter for: ${host}:${port}...`);
    const isGmail = host.includes("gmail");
    const transportConfig = isGmail ? {
      service: "gmail",
      auth: { user, pass }
    } : {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    };
    const transporter = nodemailer.createTransport(transportConfig);
    logger.info(`Sending email outreach to: ${to}...`);
    await transporter.sendMail({
      from: from ? `"${from}" <${user}>` : `"Outreach Agent" <${user}>`,
      to,
      subject,
      text: body
    });
    logger.success(`Email outreach successfully sent to ${to}!`);
    return true;
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error}`);
    return false;
  }
}
var whatsappClient = null;
var whatsappQr = "";
var whatsappStatus = "DISCONNECTED";
function getWhatsAppStatus() {
  return {
    status: whatsappStatus,
    qr: whatsappQr
  };
}
function initializeWhatsApp() {
  if (whatsappClient) {
    logger.info("WhatsApp client already initialized or active.");
    return;
  }
  logger.info("Launching WhatsApp Web virtual browser session...");
  whatsappStatus = "CONNECTING";
  whatsappQr = "";
  try {
    whatsappClient = new Client({
      authStrategy: new LocalAuth({
        clientId: "leadfinder-outreach"
      }),
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
        strict: false
      },
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ]
      }
    });
    whatsappClient.on("qr", (qr) => {
      logger.info("WhatsApp QR Code received. Scan from settings panel.");
      whatsappQr = qr;
      whatsappStatus = "QR_READY";
    });
    whatsappClient.on("ready", () => {
      logger.success("WhatsApp Web Client authenticated and active!");
      whatsappStatus = "CONNECTED";
      whatsappQr = "";
    });
    whatsappClient.on("auth_failure", (msg) => {
      logger.error(`WhatsApp Web auth failure: ${msg}`);
      whatsappStatus = "DISCONNECTED";
      whatsappClient = null;
      whatsappQr = "";
    });
    whatsappClient.on("disconnected", (reason) => {
      logger.warn(`WhatsApp session was disconnected: ${reason}`);
      whatsappStatus = "DISCONNECTED";
      whatsappClient = null;
      whatsappQr = "";
    });
    whatsappClient.initialize();
  } catch (error) {
    logger.error("Failed to initialize WhatsApp Web Client:", error);
    whatsappStatus = "DISCONNECTED";
    whatsappClient = null;
  }
}
async function disconnectWhatsApp() {
  logger.info("Processing WhatsApp disconnect request...");
  if (whatsappClient) {
    try {
      logger.info("Logging out WhatsApp web client (3s timeout)...");
      await Promise.race([
        whatsappClient.logout(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3e3))
      ]);
      logger.info("WhatsApp soft logout completed.");
    } catch (err) {
      logger.warn("WhatsApp logout bypassed/failed: " + (err?.message || String(err)));
    }
    try {
      logger.info("Destroying WhatsApp browser session...");
      await Promise.race([
        whatsappClient.destroy(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3e3))
      ]);
      logger.info("WhatsApp browser destroyed.");
    } catch (err) {
      logger.warn("WhatsApp destroy failed: " + (err?.message || String(err)));
      if (whatsappClient.pupBrowser) {
        try {
          logger.info("Forcing closure of Puppeteer browser...");
          await whatsappClient.pupBrowser.close();
        } catch (closeErr) {
          logger.warn("Forcing browser close failed: " + (closeErr?.message || String(closeErr)));
        }
      }
    }
    whatsappClient = null;
  }
  try {
    const sessionPath = path4.join(process.cwd(), ".wwebjs_auth", "session-leadfinder-outreach");
    logger.info(`Session Path: ${sessionPath} | Exists: ${fs4.existsSync(sessionPath)}`);
    if (fs4.existsSync(sessionPath)) {
      logger.info("Wiping local session authentication directories...");
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      fs4.rmSync(sessionPath, { recursive: true, force: true });
      logger.success("Session credentials wiped from disk.");
    }
  } catch (err) {
    logger.warn("Failed to delete session files: " + (err?.message || String(err)));
  }
  whatsappStatus = "DISCONNECTED";
  whatsappQr = "";
  logger.success("WhatsApp disconnected successfully.");
  return true;
}
function formatWhatsAppJid(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.startsWith("910") && cleaned.length === 13) {
    cleaned = "91" + cleaned.substring(3);
  }
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  if (cleaned.length < 10 || cleaned.length > 15) {
    return null;
  }
  return `${cleaned}@c.us`;
}
async function sendWhatsAppMessage(phone, text) {
  if (whatsappStatus !== "CONNECTED" || !whatsappClient) {
    logger.error("WhatsApp client is not connected. Scan the QR code in the dashboard first.");
    return false;
  }
  try {
    const chatId = formatWhatsAppJid(phone);
    if (!chatId) {
      logger.error(`Invalid phone number format for WhatsApp delivery: ${phone}`);
      return false;
    }
    try {
      const isRegistered = await whatsappClient.isRegisteredUser(chatId);
      if (!isRegistered) {
        logger.warn(`WhatsApp number ${phone} (${chatId}) is NOT registered on WhatsApp. Skipping.`);
        return false;
      }
    } catch (validationErr) {
      logger.warn(`Could not verify WhatsApp registration for ${phone}: ${validationErr?.message || JSON.stringify(validationErr)}. Attempting send anyway...`);
    }
    logger.info(`Sending automated WhatsApp outreach message to: ${chatId}`);
    await whatsappClient.sendMessage(chatId, text);
    logger.success(`WhatsApp outreach successfully sent to ${phone}!`);
    return true;
  } catch (error) {
    const errorMsg = error?.message || (typeof error === "object" ? JSON.stringify(error) : String(error));
    logger.error(`Failed to send WhatsApp message to ${phone}: ${errorMsg}`);
    return false;
  }
}
async function sendWhatsAppTestMessage(phone) {
  if (whatsappStatus !== "CONNECTED" || !whatsappClient) {
    logger.error("WhatsApp client is not connected for sending test message.");
    return false;
  }
  try {
    let targetChatId = "";
    if (phone && phone.trim() !== "") {
      const formatted = formatWhatsAppJid(phone);
      if (!formatted) {
        logger.error(`Invalid phone number format for test message: ${phone}`);
        return false;
      }
      targetChatId = formatted;
    } else {
      if (whatsappClient.info && whatsappClient.info.wid) {
        targetChatId = whatsappClient.info.wid._serialized;
      } else {
        logger.error("No self number available and no test number provided.");
        return false;
      }
    }
    try {
      logger.info(`Validating if ${targetChatId} is registered on WhatsApp...`);
      const isRegistered = await whatsappClient.isRegisteredUser(targetChatId);
      if (!isRegistered) {
        logger.error(`WhatsApp target ${targetChatId} is NOT registered on WhatsApp. Cannot send test message.`);
        return false;
      }
      logger.info(`Target ${targetChatId} is a registered WhatsApp user.`);
    } catch (valErr) {
      logger.warn(`Could not verify WhatsApp registration for ${targetChatId}: ${valErr?.message || String(valErr)}. Sending anyway...`);
    }
    const text = "Hello from LeadFinder AI! This is a test outreach message verifying your gateway connection. \u{1F680}";
    logger.info(`Sending test WhatsApp message to: ${targetChatId}`);
    await whatsappClient.sendMessage(targetChatId, text);
    logger.success(`Test WhatsApp message successfully sent to ${targetChatId}!`);
    return true;
  } catch (error) {
    const errorMsg = error?.message || (typeof error === "object" ? JSON.stringify(error) : String(error));
    logger.error(`Failed to send test WhatsApp message: ${errorMsg}`);
    return false;
  }
}

// src/aiCopyGenerator.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";

// src/outreachCopy.ts
function generateOutreachCopy(lead) {
  const name = lead.businessName || "your clinic";
  const category = lead.category || "business";
  const aiInsight = lead.aiInsight || "";
  const rating = lead.rating || 0;
  const reviews = lead.reviews || 0;
  const lowerInsight = aiInsight.toLowerCase();
  const noWebsite = !lead.website || lead.website.trim() === "" || lead.websiteStatus === "MISSING" || lead.websiteMissing === true;
  const brokenWebsite = lead.websiteStatus === "BROKEN" || lowerInsight.includes("broken website") || lowerInsight.includes("website is down") || lowerInsight.includes("offline website") || lowerInsight.includes("rebuilding");
  const outdatedWebsite = lead.websiteStatus === "OUTDATED" || lowerInsight.includes("outdated website") || lowerInsight.includes("website refresh") || lowerInsight.includes("responsiveness") || lowerInsight.includes("mobile responsiveness");
  const noInstagram = lead.instagramStatus === "NOT_FOUND" || lowerInsight.includes("no instagram") || lowerInsight.includes("inactive instagram");
  const noFacebook = lead.facebookStatus === "NOT_FOUND" || lowerInsight.includes("no facebook") || lowerInsight.includes("inactive facebook");
  const noSocialMedia = noInstagram && noFacebook || lowerInsight.includes("no social presence") || lowerInsight.includes("lacking active social") || lowerInsight.includes("no social media");
  const noBooking = !lead.appointmentSystem || lowerInsight.includes("missing booking") || lowerInsight.includes("appointment system");
  const noWhatsappChat = !lead.whatsappPresent || lowerInsight.includes("whatsapp chat widget") || lowerInsight.includes("whatsapp automation");
  const noAnalytics = !lead.googleAnalyticsPresent || lowerInsight.includes("no google analytics") || lowerInsight.includes("lacks google analytics");
  const noMetaPixel = !lead.metaPixelPresent || lowerInsight.includes("no meta pixel") || lowerInsight.includes("missing meta pixel") || lowerInsight.includes("retargeting pixel");
  let whatsappMessage = "";
  if (noWebsite) {
    whatsappMessage = `Hey there! \u{1F44B}

I came across *${name}* on Google Maps \u2014 ${rating >= 4 ? `${rating}\u2B50 with ${reviews} reviews, that's really impressive!` : `and I can see you're building a great reputation.`}

I noticed you don't have a website yet. Honestly, that's a huge business problem \u2014 most people Google a ${category} before they visit, and if they can't find your official site, they just go to someone else who has one.

In today's AI era, getting online is incredibly simple. *I've instantly prepared a free live demo website for you* \u2014 completely on me, so you can see exactly how ${name} looks online right now with zero risk.

It includes:
\u2705 Mobile-responsive layout
\u2705 Instant online booking system
\u2705 Direct WhatsApp chat integration

Would you be open to seeing this instant demo? I can share the link immediately. \u{1F642}`;
  } else {
    let socialFocus = "";
    if (noInstagram && noFacebook) {
      socialFocus = "you don't have an active Instagram or Facebook page listed";
    } else if (noInstagram) {
      socialFocus = "your Instagram presence is missing or inactive";
    } else if (noFacebook) {
      socialFocus = "your Facebook page seems to be missing or inactive";
    } else {
      socialFocus = "your social media profiles could be automated for better visibility";
    }
    whatsappMessage = `Hi! \u{1F44B}

I came across *${name}* online \u2014 ${rating >= 4 ? `you have an impressive ${rating}\u2B50 rating with ${reviews} reviews on Google Maps!` : `you're clearly doing great work.`}

However, I noticed that ${socialFocus}. In today's digital landscape, the biggest business problem is that patients/clients look for active social proof before booking. If your profiles look quiet or missing, they hesitate and go to competitors.

In today's AI era, keeping your brand active and automated is easier than ever. We help ${category}s establish consistent social media branding using AI tools to schedule content and automate responses, without eating up your time.

*I have instantly put together a free social media branding roadmap and demo assets* for ${name} so you can see how it works right away. No commitment at all.

Would you be open to seeing these instant demo assets? I can share them right now! \u{1F60A}`;
  }
  let emailSubject = "";
  let emailBody = "";
  if (noWebsite) {
    emailSubject = `Instant demo website ready for ${name} \u2014 zero commitment`;
    emailBody = `Hi there,

I was searching for local ${category} services and came across ${name} on Google Maps${rating >= 4 ? ` \u2014 a ${rating}-star rating with ${reviews} reviews is really impressive` : ""}.

I noticed you don't currently have an official website. In today's market, this is a major business problem. Over 80% of customers search online before choosing a local provider. Without a website, you are losing these potential clients to competitors.

In today's AI era, establishing an online presence is fast and straightforward. *I have instantly prepared a free live demo website for ${name}* \u2014 completely on me, so you can see exactly how it looks immediately with zero risk.

What the instant demo includes:
\u2022 Professional, mobile-responsive layout
\u2022 Live online booking integration
\u2022 WhatsApp chat button
\u2022 Google Maps location embed

If you like what you see, we can talk about launching it. If not, there's absolutely no obligation.

Would you be open to seeing this instant demo? Just reply to this email and I will send over the link.

Warm regards,
Digital Branding Team`;
  } else {
    emailSubject = `Instant brand presence roadmap and demo assets for ${name}`;
    let emailSocialFocus = "";
    if (noInstagram && noFacebook) {
      emailSocialFocus = "you don't have an active Instagram or Facebook page listed";
    } else if (noInstagram) {
      emailSocialFocus = "your Instagram page seems to be missing or inactive";
    } else if (noFacebook) {
      emailSocialFocus = "your Facebook page seems to be missing or inactive";
    } else {
      emailSocialFocus = "your social media branding could be automated for greater local reach";
    }
    emailBody = `Hi there,

I took a look at ${name}'s online presence${rating >= 4 ? `, and your ${rating}-star rating on Google Maps shows your clients love your work` : ""}.

However, I noticed that ${emailSocialFocus}. A major business problem today is that clients expect active social proof and branding when evaluating local providers. If your pages are quiet or missing, it affects credibility and limits business growth.

In today's AI era, maintaining a consistent brand presence is simpler than ever. We help local ${category}s handle their social media branding by utilizing AI-powered scheduling and automated designs to keep their feeds fresh without consuming their valuable time.

Here is what we can do to help grow your business:
\u2022 Establish cohesive, high-quality social media branding
\u2022 Automate content calendars with industry-specific templates
\u2022 Set up automated response assistants for patient/client inquiries

*I have instantly prepared a free branding roadmap and custom demo assets* for ${name} so you can see the potential first-hand right away. Zero cost, zero obligation.

Would you be open to checking out these instant demo assets? Just reply to this email and I'll send them over.

Warm regards,
Digital Branding Team`;
  }
  return { emailSubject, emailBody, whatsappMessage };
}

// src/aiCopyGenerator.ts
async function generateAICopy(lead) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "MY_GEMINI_API_KEY") {
    logger.info(`Gemini API key not configured. Using rule-based copy for: '${lead.businessName}'`);
    return generateOutreachCopy(lead);
  }
  try {
    logger.info(`Generating personalized AI outreach copy via Gemini for: '${lead.businessName}'`);
    const ai = new GoogleGenAI2({ apiKey });
    const prompt = `You are a professional B2B digital presence and branding specialist. 
Write a highly personalized, human-sounding B2B outreach campaign copy for the business '${lead.businessName}'.
Analyze their digital presence audit details and craft messages targeting their specific needs:
- AI Insight from audit: "${lead.aiInsight || "No specific insight"}"
- Website Status: "${lead.websiteStatus || "MISSING"}" (Website URL: "${lead.website || "None"}")
- Instagram Status: "${lead.instagramStatus || "NOT_FOUND"}" (Instagram URL: "${lead.instagramUrl || "None"}")
- Facebook Status: "${lead.facebookStatus || "NOT_FOUND"}" (Facebook URL: "${lead.facebookUrl || "None"}")
- Rating: ${lead.rating || 0} (${lead.reviews || 0} reviews)
- Category: "${lead.category || "local business"}"
- Emails: "${lead.emails && lead.emails.length > 0 ? lead.emails.join(", ") : "None"}"

Copywriting Rules:
1. **Never use the word "marketing"** (neither in the email nor in the WhatsApp message). Call it "social media branding", "digital branding", "brand presence", "social proof", or "online brand setup".
2. **If they DO NOT have a website** (Website Status is MISSING, or website URL is empty/missing):
   - Pitch website creation. State that you have *instantly prepared a free live demo website* showing how their clinic/business would look with online booking and WhatsApp chat buttons so they can review it immediately with zero risk.
3. **If they DO have a website** (any website URL is present, regardless of whether Website Status is WORKING, OUTDATED, or BROKEN):
   - You MUST NOT pitch website creation, website redesign, website rebuilding, or any website services. Even if the Website Status says BROKEN or OUTDATED, or the AI Insight suggests website work, ignore website pitches completely.
   - Focus strictly on their **social media branding**. Check if they have Instagram/Facebook or if they are inactive.
   - Highlight the business trust problem (e.g., in today's digital world, patients/customers look for active social proof on Instagram/Facebook before booking; an inactive or missing profile makes them hesitate and go to competitors).
   - Reference today's **AI era** (e.g., "In today's AI era, keeping your brand active and automated doesn't have to be time-consuming; we use AI to create templates and automate responses/posts to grow your business").
   - State that you have *instantly prepared a free branding roadmap and custom demo assets* for their business to show the potential.
   - Offer these instant solutions to grow their business and build a strong local brand.
4. **Tone & Style**:
   - Talk like a real, helpful human (e.g. "Hey there! I came across your business on Google Maps...").
   - Keep paragraphs short and simple. No generic template speak.
   - Compliment their rating/reviews naturally if they have good ones.
   - For WhatsApp: Conversational, brief (under 800 characters), and use emojis very sparingly (2-3 max).
   - For Email: Professional but warm. The subject should be a short, highly personalized curiosity hook. The body should have clear bullet points detailing the solution/offer.

You MUST return the output in raw JSON format matching this schema:
{
  "emailSubject": "string",
  "emailBody": "string",
  "whatsappMessage": "string"
}
Return only the raw JSON.`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    const text = response.text ? response.text.trim() : "";
    if (text) {
      const cleanJsonStr = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleanJsonStr);
      if (parsed.emailSubject && parsed.emailBody && parsed.whatsappMessage) {
        logger.success(`Gemini successfully generated outreach copy for: '${lead.businessName}'`);
        return {
          emailSubject: parsed.emailSubject.trim(),
          emailBody: parsed.emailBody.trim(),
          whatsappMessage: parsed.whatsappMessage.trim()
        };
      }
    }
    throw new Error("Invalid response format received from Gemini.");
  } catch (error) {
    logger.warn(`AI copy generation failed: ${error.message || error}. Falling back to rule-based copy.`);
    return generateOutreachCopy(lead);
  }
}

// server.ts
dotenv.config();
var app = express();
var PORT = 3e3;
app.use(express.json());
var isScrapingRunning = false;
var scraperResult = null;
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
app.get("/api/config", (req, res) => {
  try {
    const configPath = path5.join(process.cwd(), "src/config.ts");
    if (fs5.existsSync(configPath)) {
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
    if (!businessType || !location || maxResults === void 0) {
      return res.status(400).json({ error: "Invalid parameters" });
    }
    const configPath = path5.join(process.cwd(), "src/config.ts");
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
  lat: ${lat !== void 0 && lat !== null ? parseFloat(lat) : "undefined"},
  lng: ${lng !== void 0 && lng !== null ? parseFloat(lng) : "undefined"},
  radius: ${radius !== void 0 && radius !== null ? parseFloat(radius) : "undefined"}
};
`;
    fs5.writeFileSync(configPath, newContent, "utf8");
    CONFIG.businessType = businessType;
    CONFIG.location = location;
    CONFIG.maxResults = parseInt(maxResults, 10);
    CONFIG.enableSimulation = Boolean(enableSimulation);
    CONFIG.headless = Boolean(headless);
    CONFIG.lat = lat !== void 0 && lat !== null ? parseFloat(lat) : void 0;
    CONFIG.lng = lng !== void 0 && lng !== null ? parseFloat(lng) : void 0;
    CONFIG.radius = radius !== void 0 && radius !== null ? parseFloat(radius) : void 0;
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
    const testLead = {
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
      dateAdded: (/* @__PURE__ */ new Date()).toISOString(),
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
    const processedPath = path5.join(process.cwd(), "processed-leads.json");
    const failedPath = path5.join(process.cwd(), "failed-leads.json");
    fs5.writeFileSync(processedPath, JSON.stringify([], null, 2), "utf8");
    fs5.writeFileSync(failedPath, JSON.stringify([], null, 2), "utf8");
    logger.clear();
    logger.success("Processed and Failed Lead Caches have been successfully reset!");
    res.json({ success: true, message: "Lead caches cleared successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset lead caches." });
  }
});
async function updateLeadOutreachStatus(businessName, channel, status, mapsUrl) {
  try {
    const leads = duplicateChecker.loadLeads();
    let targetLead = null;
    const updated = leads.map((lead) => {
      if (lead.businessName === businessName || mapsUrl && lead.mapsUrl === mapsUrl) {
        targetLead = lead;
        if (channel === "email") {
          lead.emailStatus = status;
          lead.emailSentDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        } else if (channel === "whatsapp") {
          lead.whatsappStatus = status;
          lead.whatsappSentDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        }
      }
      return lead;
    });
    const processedPath = path5.join(process.cwd(), "processed-leads.json");
    fs5.writeFileSync(processedPath, JSON.stringify(updated, null, 2), "utf8");
    const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    if (webhookUrl && webhookUrl.trim() !== "" && webhookUrl !== "YOUR_WEBHOOK_URL") {
      try {
        const payload = {
          action: "updateOutreach",
          businessName,
          mapsUrl: mapsUrl || (targetLead ? targetLead.mapsUrl : ""),
          emailStatus: channel === "email" ? status : void 0,
          emailSentDate: channel === "email" ? (/* @__PURE__ */ new Date()).toISOString().split("T")[0] : void 0,
          whatsappStatus: channel === "whatsapp" ? status : void 0,
          whatsappSentDate: channel === "whatsapp" ? (/* @__PURE__ */ new Date()).toISOString().split("T")[0] : void 0
        };
        const axios3 = (await import("axios")).default;
        await axios3.post(webhookUrl, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 8e3
        });
        logger.success(`Synchronized outreach status for '${businessName}' back to Google Sheet.`);
      } catch (err) {
        logger.warn(`Failed to sync outreach status back to Google Sheet: ${err.message || err}`);
      }
    }
  } catch (error) {
    console.error("Failed to update outreach status:", error);
  }
}
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
    const envPath = path5.join(process.cwd(), ".env");
    let envContent = "";
    if (fs5.existsSync(envPath)) {
      envContent = fs5.readFileSync(envPath, "utf8");
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
        envContent += `
${key}="${val}"`;
      }
      process.env[key] = String(val);
    }
    fs5.writeFileSync(envPath, envContent.trim() + "\n", "utf8");
    res.json({ success: true, message: "SMTP configuration updated successfully." });
  } catch (e) {
    res.status(500).json({ error: "Failed to write SMTP configurations." });
  }
});
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
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ error: error.message || String(error) });
  }
});
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
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});
app.post("/api/reset-data", (req, res) => {
  try {
    const processedPath = path5.join(process.cwd(), "processed-leads.json");
    const failedPath = path5.join(process.cwd(), "failed-leads.json");
    const scraperLogPath = path5.join(process.cwd(), "scraper-log.txt");
    fs5.writeFileSync(processedPath, JSON.stringify([], null, 2), "utf8");
    fs5.writeFileSync(failedPath, JSON.stringify([], null, 2), "utf8");
    fs5.writeFileSync(scraperLogPath, "LeadFinder System reset successfully.\nReady.", "utf8");
    logger.clear();
    logger.success("Dashboard database has been completely wiped and reset!");
    isCampaignRunning = false;
    campaignCancelRequested = true;
    res.json({ success: true, message: "System data completely reset." });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset system data." });
  }
});
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
  } catch (error) {
    res.status(500).json({ error: error.message || String(error) });
  }
});
var isCampaignRunning = false;
var campaignCancelRequested = false;
var campaignProgress = {
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
async function runCampaignLoop(delaySeconds = 30, enableEmail = true, enableWhatsapp = true, dryRun = false) {
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
  let leads = await fetchLeadsFromGoogleSheet();
  if (!leads || leads.length === 0) {
    logger.error("Outreach campaign aborted: Failed to fetch leads from Google Sheet, or the sheet is empty.");
    campaignProgress.status = "Aborted: Failed to fetch leads from sheet";
    isCampaignRunning = false;
    return;
  }
  const targetLeads = leads.filter((lead) => {
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
    if (i < targetLeads.length - 1 && !campaignCancelRequested) {
      logger.info(`Time gap: Waiting ${delaySeconds} seconds before dispatching the next lead...`);
      for (let sec = delaySeconds; sec > 0; sec--) {
        if (campaignCancelRequested) break;
        campaignProgress.secondsRemaining = sec;
        await new Promise((resolve) => setTimeout(resolve, 1e3));
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
app.post("/api/campaign/start", (req, res) => {
  if (isCampaignRunning) {
    return res.status(400).json({ error: "Campaign is already running." });
  }
  const { delaySeconds, enableEmail, enableWhatsapp, dryRun } = req.body;
  const delaySec = parseInt(delaySeconds, 10) || 30;
  const mailActive = enableEmail !== void 0 ? Boolean(enableEmail) : true;
  const waActive = enableWhatsapp !== void 0 ? Boolean(enableWhatsapp) : true;
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
  runCampaignLoop(delaySec, mailActive, waActive, simulated).catch((err) => {
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path5.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path5.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LeadFinder AI Server running on http://localhost:${PORT}`);
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
