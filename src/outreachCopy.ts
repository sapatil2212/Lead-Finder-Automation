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

  // ── WhatsApp Message (conversational, human, under 1000 chars) ──
  let whatsappMessage = "";

  if (noWebsite) {
    // WEBSITE PITCH (Free demo website)
    whatsappMessage = `Hey there! 👋

I came across *${name}* on Google Maps — ${rating >= 4.0 ? `${rating}⭐ with ${reviews} reviews, that's really impressive!` : `and I can see you're building a great reputation.`}

I noticed you don't have a website yet. Honestly, that's a huge business problem — most people Google a ${category} before they visit, and if they can't find your official site, they just go to someone else who has one.

In today's AI era, getting online is incredibly simple. *I've instantly prepared a free live demo website for you* — completely on me, so you can see exactly how ${name} looks online right now with zero risk.

It includes:
✅ Mobile-responsive layout
✅ Instant online booking system
✅ Direct WhatsApp chat integration

Would you be open to seeing this instant demo? I can share the link immediately. 🙂`;

  } else {
    // SOCIAL MEDIA BRANDING PITCH
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

    whatsappMessage = `Hi! 👋

I came across *${name}* online — ${rating >= 4.0 ? `you have an impressive ${rating}⭐ rating with ${reviews} reviews on Google Maps!` : `you're clearly doing great work.`}

However, I noticed that ${socialFocus}. In today's digital landscape, the biggest business problem is that patients/clients look for active social proof before booking. If your profiles look quiet or missing, they hesitate and go to competitors.

In today's AI era, keeping your brand active and automated is easier than ever. We help ${category}s establish consistent social media branding using AI tools to schedule content and automate responses, without eating up your time.

*I have instantly put together a free social media branding roadmap and demo assets* for ${name} so you can see how it works right away. No commitment at all.

Would you be open to seeing these instant demo assets? I can share them right now! 😊`;
  }

  // ── Email Subject & Body ──
  let emailSubject = "";
  let emailBody = "";

  if (noWebsite) {
    emailSubject = `Instant demo website ready for ${name} — zero commitment`;
    emailBody = `Hi there,

I was searching for local ${category} services and came across ${name} on Google Maps${rating >= 4.0 ? ` — a ${rating}-star rating with ${reviews} reviews is really impressive` : ""}.

I noticed you don't currently have an official website. In today's market, this is a major business problem. Over 80% of customers search online before choosing a local provider. Without a website, you are losing these potential clients to competitors.

In today's AI era, establishing an online presence is fast and straightforward. *I have instantly prepared a free live demo website for ${name}* — completely on me, so you can see exactly how it looks immediately with zero risk.

What the instant demo includes:
• Professional, mobile-responsive layout
• Live online booking integration
• WhatsApp chat button
• Google Maps location embed

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

I took a look at ${name}'s online presence${rating >= 4.0 ? `, and your ${rating}-star rating on Google Maps shows your clients love your work` : ""}.

However, I noticed that ${emailSocialFocus}. A major business problem today is that clients expect active social proof and branding when evaluating local providers. If your pages are quiet or missing, it affects credibility and limits business growth.

In today's AI era, maintaining a consistent brand presence is simpler than ever. We help local ${category}s handle their social media branding by utilizing AI-powered scheduling and automated designs to keep their feeds fresh without consuming their valuable time.

Here is what we can do to help grow your business:
• Establish cohesive, high-quality social media branding
• Automate content calendars with industry-specific templates
• Set up automated response assistants for patient/client inquiries

*I have instantly prepared a free branding roadmap and custom demo assets* for ${name} so you can see the potential first-hand right away. Zero cost, zero obligation.

Would you be open to checking out these instant demo assets? Just reply to this email and I'll send them over.

Warm regards,
Digital Branding Team`;
  }

  return { emailSubject, emailBody, whatsappMessage };
}
