/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lead } from "./types";

export interface OutreachTemplate {
  emailSubject: string;
  emailBody: string;
  whatsappMessage: string;
}

/**
 * Analyzes a lead's digital gaps and generates a personalized,
 * human-sounding outreach copy that reads like a real conversation —
 * not a spam template.
 */
export function generateOutreachCopy(lead: Lead): OutreachTemplate {
  const name = lead.businessName || "your clinic";
  const category = lead.category || "business";
  const aiInsight = lead.aiInsight || "";
  const rating = lead.rating || 0;
  const reviews = lead.reviews || 0;

  const lowerInsight = aiInsight.toLowerCase();

  const noWebsite = !lead.website || 
                    lead.website.trim() === "" || 
                    lead.websiteStatus === "MISSING" || 
                    lead.websiteMissing === true;

  const brokenWebsite = lead.websiteStatus === "BROKEN" || 
                        lowerInsight.includes("broken website") || 
                        lowerInsight.includes("website is down") || 
                        lowerInsight.includes("offline website") || 
                        lowerInsight.includes("rebuilding");

  const outdatedWebsite = lead.websiteStatus === "OUTDATED" || 
                          lowerInsight.includes("outdated website") || 
                          lowerInsight.includes("website refresh") || 
                          lowerInsight.includes("responsiveness") || 
                          lowerInsight.includes("mobile responsiveness");

  const noInstagram = lead.instagramStatus === "NOT_FOUND" || 
                      lowerInsight.includes("no instagram") || 
                      lowerInsight.includes("inactive instagram");

  const noFacebook = lead.facebookStatus === "NOT_FOUND" || 
                     lowerInsight.includes("no facebook") || 
                     lowerInsight.includes("inactive facebook");

  const noSocialMedia = (noInstagram && noFacebook) || 
                        lowerInsight.includes("no social presence") || 
                        lowerInsight.includes("lacking active social") ||
                        lowerInsight.includes("no social media");

  const noBooking = !lead.appointmentSystem || 
                    lowerInsight.includes("missing booking") || 
                    lowerInsight.includes("appointment system");

  const noWhatsappChat = !lead.whatsappPresent || 
                         lowerInsight.includes("whatsapp chat widget") || 
                         lowerInsight.includes("whatsapp automation");

  const noAnalytics = !lead.googleAnalyticsPresent || 
                      lowerInsight.includes("no google analytics") || 
                      lowerInsight.includes("lacks google analytics");

  const noMetaPixel = !lead.metaPixelPresent || 
                      lowerInsight.includes("no meta pixel") || 
                      lowerInsight.includes("missing meta pixel") || 
                      lowerInsight.includes("retargeting pixel");

  // ── WhatsApp Message (conversational, brief, response-focused) ──
  let whatsappMessage = "";

  if (noWebsite) {
    whatsappMessage = `Hi there! 👋

I was looking at *${name}* on Google Maps and noticed you don't have a website listed.

To help out, I went ahead and created a quick, free demo website for your clinic. It takes less than 30 seconds to look at, and it's completely ready.

Can I send you the link to check it out? (No cost or catch at all!)`;
  } else {
    let socialFocus = "";
    if (noInstagram && noFacebook) {
      socialFocus = "you don't have an active Instagram or Facebook page listed";
    } else if (noInstagram) {
      socialFocus = "your Instagram page is missing or inactive";
    } else if (noFacebook) {
      socialFocus = "your Facebook page seems to be missing or inactive";
    } else {
      socialFocus = "your social media branding could be automated to get more local reach";
    }

    whatsappMessage = `Hi! 👋

I was looking at *${name}* on Google Maps and noticed that ${socialFocus}.

I actually put together a free digital branding roadmap and some sample templates specifically for your business to show you how you can attract more local clients.

Can I send over the sample designs to check out? (No cost or catch at all!)`;
  }

  // ── Email Subject & Body ──
  let emailSubject = "";
  let emailBody = "";

  if (noWebsite) {
    emailSubject = `Quick question about ${name}`;
    emailBody = `Hi there,

I came across ${name} on Google Maps and noticed you don't currently have a website listed.

I actually went ahead and built a quick, free demo website for your business to show you how you can easily get more bookings online. It's completely ready for you to look at.

Would it be okay if I sent you the link to check it out?

Best regards,
Digital Branding Team`;
  } else {
    emailSubject = `Quick branding idea for ${name}`;
    
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

I came across ${name} on Google Maps and noticed that ${emailSocialFocus}.

I've put together a quick, free branding roadmap and some sample post designs specifically for your business to show you how you can attract more local clients.

Would you be open to checking out the sample designs? I can reply with them right away.

Best regards,
Digital Branding Team`;
  }

  return { emailSubject, emailBody, whatsappMessage };
}
