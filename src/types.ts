/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Lead {
  businessName: string;
  phone: string;
  address: string;
  rating: number;
  reviews: number;
  website: string;
  mapsUrl: string;
  category: string;
  websiteMissing: boolean;
  leadScore: number;
  dateAdded: string;
  sheetName?: string;

  // Digital Presence fields
  websiteStatus: "MISSING" | "WORKING" | "BROKEN" | "OUTDATED";
  instagramUrl: string;
  instagramStatus: "NOT_FOUND" | "ACTIVE" | "INACTIVE";
  instagramLastPost: string;
  facebookUrl: string;
  facebookStatus: "NOT_FOUND" | "ACTIVE" | "INACTIVE";
  facebookLastPost: string;
  whatsappPresent: boolean;
  appointmentSystem: boolean;
  leadPriority: "HOT" | "WARM" | "COLD";
  aiInsight: string;

  // Expanded Auditing fields
  emails: string[];
  linkedinUrl: string;
  linkedinStatus: "NOT_FOUND" | "ACTIVE";
  googleAnalyticsPresent: boolean;
  metaPixelPresent: boolean;

  // Outreach tracking fields
  emailStatus?: "PENDING" | "SENT" | "FAILED";
  whatsappStatus?: "PENDING" | "SENT" | "FAILED";
  emailSentDate?: string;
  whatsappSentDate?: string;
  lat?: number;
  lng?: number;
}

export interface Config {
  businessType: string;
  location: string;
  maxResults: number;
  enableSimulation: boolean;
  headless: boolean;
  lat?: number;
  lng?: number;
  radius?: number;
}
