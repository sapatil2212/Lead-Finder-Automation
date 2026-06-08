// ============================================
// Google Apps Script for LeadFinder AI Web App
// PASTE THIS ENTIRE CODE IN YOUR APPS SCRIPT
// Then: Deploy → New deployment → Web app
// ============================================

// Column header mapping (JSON key → Sheet column name)
var HEADER_MAP = {
  "businessName": "Business Name",
  "phone": "Phone Number",
  "address": "Address",
  "rating": "Rating",
  "reviews": "Reviews",
  "website": "Website",
  "websiteStatus": "Website Status",
  "instagramUrl": "Instagram URL",
  "instagramStatus": "Instagram Status",
  "instagramLastPost": "Instagram Last Post",
  "facebookUrl": "Facebook URL",
  "facebookStatus": "Facebook Status",
  "facebookLastPost": "Facebook Last Post",
  "linkedinUrl": "LinkedIn URL",
  "linkedinStatus": "LinkedIn Status",
  "emails": "Emails",
  "googleAnalyticsPresent": "Google Analytics",
  "metaPixelPresent": "Meta Pixel",
  "whatsappPresent": "WhatsApp Present",
  "appointmentSystem": "Appointment System",
  "mapsUrl": "Google Maps URL",
  "leadScore": "Lead Score",
  "leadPriority": "Lead Priority",
  "dateAdded": "Date Added",
  "aiInsight": "AI Insight",
  "category": "Category",
  "websiteMissing": "Website Missing",
  "emailStatus": "Email Status",
  "emailSentDate": "Email Sent Date",
  "whatsappStatus": "WhatsApp Status",
  "whatsappSentDate": "WhatsApp Sent Date"
};

// Reverse map: Sheet column name → JSON key (used by doGet)
var REVERSE_HEADER_MAP = {};
for (var key in HEADER_MAP) {
  REVERSE_HEADER_MAP[HEADER_MAP[key]] = key;
}

// Helper to prevent Google Sheets from interpreting "+" or "=" as formulas
function sanitizeForSheet(val) {
  if (val === null || val === undefined) return "";
  var str = String(val);
  if (str.indexOf('+') === 0 || str.indexOf('=') === 0) {
    return "\u200B" + str;
  }
  return val;
}

// ==========================================
// doPost — Receives new leads & status updates
// ==========================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Auto-append headers if the sheet is completely empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Business Name", 
        "Phone Number", 
        "Address", 
        "Rating", 
        "Reviews", 
        "Website", 
        "Website Status",
        "Instagram URL",
        "Instagram Status",
        "Instagram Last Post",
        "Facebook URL",
        "Facebook Status",
        "Facebook Last Post",
        "LinkedIn URL",
        "LinkedIn Status",
        "Emails",
        "Google Analytics",
        "Meta Pixel",
        "WhatsApp Present",
        "Appointment System",
        "Google Maps URL", 
        "Lead Score", 
        "Lead Priority",
        "Date Added",
        "AI Insight",
        "Category",
        "Website Missing",
        "Email Status",
        "Email Sent Date",
        "WhatsApp Status",
        "WhatsApp Sent Date"
      ]);
    }
    
    // Format the Phone Number column as Plain Text
    try {
      sheet.getRange(1, 2, sheet.getMaxRows(), 1).setNumberFormat("@");
    } catch (e) {}
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // ── Handle outreach status updates ──
    if (data.action === "updateOutreach") {
      var mapsUrlCol = headers.indexOf("Google Maps URL");
      if (mapsUrlCol === -1) mapsUrlCol = headers.indexOf("Maps URL");
      var nameCol = headers.indexOf("Business Name");
      var targetRow = -1;
      
      if (mapsUrlCol !== -1 || nameCol !== -1) {
        var rows = sheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (mapsUrlCol !== -1 && data.mapsUrl && rows[i][mapsUrlCol] === data.mapsUrl) {
            targetRow = i + 1;
            break;
          }
          if (nameCol !== -1 && rows[i][nameCol] === data.businessName) {
            targetRow = i + 1;
            break;
          }
        }
      }
      
      if (targetRow !== -1) {
        var updates = {
          "Email Status": data.emailStatus,
          "Email Sent Date": data.emailSentDate,
          "WhatsApp Status": data.whatsappStatus,
          "WhatsApp Sent Date": data.whatsappSentDate
        };
        
        for (var hName in updates) {
          var colIdx = headers.indexOf(hName);
          if (colIdx !== -1 && updates[hName] !== undefined) {
            sheet.getRange(targetRow, colIdx + 1).setValue(updates[hName]);
          }
        }
        return ContentService.createTextOutput(JSON.stringify({ "status": "success", "message": "Outreach status updated." }))
                             .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": "Lead not found in sheet." }))
                             .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // ── Append new lead data ──
    sheet.appendRow([
      sanitizeForSheet(data.businessName),
      sanitizeForSheet(data.phone),
      sanitizeForSheet(data.address),
      data.rating,
      data.reviews,
      data.website || "",
      data.websiteStatus || "MISSING",
      data.instagramUrl || "",
      data.instagramStatus || "NOT_FOUND",
      data.instagramLastPost || "",
      data.facebookUrl || "",
      data.facebookStatus || "NOT_FOUND",
      data.facebookLastPost || "",
      data.linkedinUrl || "",
      data.linkedinStatus || "NOT_FOUND",
      data.emails ? data.emails.join(", ") : "",
      data.googleAnalyticsPresent ? "Yes" : "No",
      data.metaPixelPresent ? "Yes" : "No",
      data.whatsappPresent ? "Yes" : "No",
      data.appointmentSystem ? "Yes" : "No",
      data.mapsUrl,
      data.leadScore,
      data.leadPriority || "COLD",
      data.dateAdded,
      data.aiInsight || "",
      data.category || "",
      data.websiteMissing ? "Yes" : "No",
      "",  // Email Status (empty for new leads)
      "",  // Email Sent Date
      "",  // WhatsApp Status
      ""   // WhatsApp Sent Date
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ "status": "success" }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// doGet — Returns all leads as JSON array
// (This is what the campaign uses to fetch leads)
// ==========================================
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var rows = sheet.getDataRange().getValues();
    
    if (rows.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    var headers = rows[0];
    var leads = [];
    
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var lead = {};
      
      for (var j = 0; j < headers.length; j++) {
        var headerName = String(headers[j]).trim();
        var key = REVERSE_HEADER_MAP[headerName] || headerName;
        var val = row[j];
        
        // Type conversions
        if (key === "rating" || key === "reviews" || key === "leadScore") {
          val = parseFloat(val) || 0;
        } else if (key === "googleAnalyticsPresent" || key === "metaPixelPresent" || key === "whatsappPresent" || key === "appointmentSystem" || key === "websiteMissing") {
          val = (val === "Yes" || val === true || val === "true");
        } else if (key === "emails") {
          val = val ? String(val).split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [];
        } else if (key === "phone") {
          val = String(val);  // Ensure phone is always a string
        } else if (typeof val === "string" && val.indexOf("\u200B") === 0) {
          val = val.substring(1);  // Remove sanitization prefix
        }
        
        lead[key] = val;
      }
      
      // Only include rows that have a business name
      if (lead.businessName) {
        leads.push(lead);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(leads))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
