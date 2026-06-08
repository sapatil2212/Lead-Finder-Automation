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
