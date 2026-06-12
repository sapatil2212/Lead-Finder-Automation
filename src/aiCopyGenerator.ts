/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { Lead } from "./types";
import { generateOutreachCopy, OutreachTemplate } from "./outreachCopy";
import { logger } from "./logger";

/**
 * Generates custom, human-like outreach messages (WhatsApp + Email) 
 * for a lead using the Gemini API. Falls back to a rule-based engine 
 * if Gemini is not configured or fails.
 */
export async function generateAICopy(lead: Lead): Promise<OutreachTemplate> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === "" || apiKey === "MY_GEMINI_API_KEY") {
    logger.info(`Gemini API key not configured. Using rule-based copy for: '${lead.businessName}'`);
    return generateOutreachCopy(lead);
  }

  try {
    logger.info(`Generating personalized AI outreach copy via Gemini for: '${lead.businessName}'`);
    const ai = new GoogleGenAI({ apiKey });
    
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
1. **Extreme Brevity & Zero Complexity**: Keep messages very short (2-3 short, clear sentences max). No lecturing, preaching, or complex business talk. No generic template speak.
2. **Never use the word "marketing"** (neither in the email nor in the WhatsApp message). Call it "digital presence", "social media", "website", or "branding".
3. **Response-Focused CTA**: End the message with a simple, friendly, low-friction question asking permission to send value (e.g. "Can I send you the link to check it out?" or "Can I send over the sample designs to check out?"). The goal is strictly to start a conversation and get them to reply.
4. **If they DO NOT have a website** (Website Status is MISSING, or website URL is empty/missing):
   - Pitch website. State that you created a quick, free demo website for their business, it's completely ready, and ask if you can send the link.
5. **If they DO have a website** (any website URL is present, regardless of whether Website Status is WORKING, OUTDATED, or BROKEN):
   - You MUST NOT pitch website services. Focus on social media/branding.
   - State that you noticed their Instagram or Facebook page is missing or inactive, you created some free sample designs and a quick branding roadmap for their business, and ask if you can send them over.
6. **Tone & Style**:
   - Talk like a helpful, friendly, local human. No corporate jargon.
   - For WhatsApp: Extremely short, conversational, and direct (under 300 characters). Use 1-2 emojis max.
   - For Email: Warm and concise. The subject should be a simple curiosity hook (e.g., "Quick question about businessName" or "Quick design idea"). The body should be very brief, asking permission to share the demo link or designs.

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
      // Parse the JSON output
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
  } catch (error: any) {
    logger.warn(`AI copy generation failed: ${error.message || error}. Falling back to rule-based copy.`);
    return generateOutreachCopy(lead);
  }
}
