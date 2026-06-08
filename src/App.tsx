/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal as TerminalIcon, 
  Settings, 
  Play, 
  RefreshCw, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  Database,
  Search,
  BookOpen,
  Info,
  Trash2,
  Mail,
  Send,
  Smartphone,
  X,
  LayoutDashboard,
  Compass,
  MapPin,
  Map,
  Sliders,
  Check,
  AlertTriangle,
  LogOut,
  ChevronRight,
  Shield,
  Loader2,
  Sparkles
} from "lucide-react";
import { Lead } from "./types";
import { generateOutreachCopy } from "./outreachCopy";

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<"dashboard" | "finder" | "leads" | "settings">("dashboard");

  // Config state
  const [businessType, setBusinessType] = useState("Dental Clinic");
  const [location, setLocation] = useState("Baner Pune");
  const [maxResults, setMaxResults] = useState(10);
  const [enableSimulation, setEnableSimulation] = useState(false);
  const [headless, setHeadless] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);

  // Geocoding Coordinates and radius
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(5); // Default 5km
  const [mapSearchText, setMapSearchText] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Scraper status
  const [isRunning, setIsRunning] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  // Data logs & results
  const [terminalLogs, setTerminalLogs] = useState("Initializing LeadFinder AI Terminal...\nReady.");
  const [processedLeads, setProcessedLeads] = useState<Lead[]>([]);
  const [failedLeads, setFailedLeads] = useState<Lead[]>([]);
  
  // UI preferences (Persisted)
  const [activeDataView, setActiveDataView] = useState<"logs" | "processed" | "failed" | "webhook">(() => {
    const saved = localStorage.getItem("leadfinder_activeDataView");
    return (saved as any) || "logs";
  });
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [selectedLeadDetails, setSelectedLeadDetails] = useState<Lead | null>(null);

  // WhatsApp & SMTP Configurations
  const [whatsappStatus, setWhatsappStatus] = useState({ status: "DISCONNECTED", qr: "" });
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [smtpSuccess, setSmtpSuccess] = useState(false);
  const [isDisconnectingWa, setIsDisconnectingWa] = useState(false);
  const [isSendingTestMsg, setIsSendingTestMsg] = useState(false);

  // Outreach Campaign parameters
  const [campaignDelay, setCampaignDelay] = useState(30);
  const [campaignEnableEmail, setCampaignEnableEmail] = useState(true);
  const [campaignEnableWhatsapp, setCampaignEnableWhatsapp] = useState(true);
  const [campaignDryRun, setCampaignDryRun] = useState(false);
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [previewCopy, setPreviewCopy] = useState<{ emailSubject: string; emailBody: string; whatsappMessage: string } | null>(null);
  const [isLoadingPreviewCopy, setIsLoadingPreviewCopy] = useState(false);

  // Outreach Modal
  const [selectedLeadForOutreach, setSelectedLeadForOutreach] = useState<Lead | null>(null);
  const [outreachEmailSubject, setOutreachEmailSubject] = useState("");
  const [outreachEmailBody, setOutreachEmailBody] = useState("");
  const [outreachWhatsappMsg, setOutreachWhatsappMsg] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);

  // Campaign State
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState({
    current: 0,
    total: 0,
    status: "Idle",
    secondsRemaining: 0
  });
  const [isStartingCampaign, setIsStartingCampaign] = useState(false);
  const [isStoppingCampaign, setIsStoppingCampaign] = useState(false);
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(() => {
    const saved = localStorage.getItem("leadfinder_autoScrollLogs");
    return saved === null ? true : saved === "true";
  });

  // Map refs
  const finderMapInstance = useRef<any>(null);
  const finderMarker = useRef<any>(null);
  const finderCircle = useRef<any>(null);
  const overviewMapInstance = useRef<any>(null);
  const overviewMarkers = useRef<any[]>([]);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  const filteredLeads = processedLeads.filter(lead => {
    const matchesSearch = 
      lead.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.category && lead.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.aiInsight && lead.aiInsight.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.emails && lead.emails.some(e => e.toLowerCase().includes(searchTerm.toLowerCase())));
      
    const matchesPriority = priorityFilter === "ALL" || lead.leadPriority === priorityFilter;
    
    return matchesSearch && matchesPriority;
  });

  const downloadCSV = () => {
    if (filteredLeads.length === 0) return;
    
    const headers = [
      "Business Name", "Phone Number", "Address", "Rating", "Reviews", "Website", "Website Status",
      "Instagram URL", "Instagram Status", "Instagram Last Post", "Facebook URL", "Facebook Status",
      "Facebook Last Post", "LinkedIn URL", "LinkedIn Status", "Emails", "Google Analytics Present",
      "Meta Pixel Present", "WhatsApp Present", "Appointment System", "Google Maps URL", "Lead Score",
      "Lead Priority", "Date Added", "AI Insight"
    ];

    const rows = filteredLeads.map(lead => [
      lead.businessName, lead.phone, lead.address, lead.rating, lead.reviews, lead.website, lead.websiteStatus,
      lead.instagramUrl, lead.instagramStatus, lead.instagramLastPost, lead.facebookUrl, lead.facebookStatus,
      lead.facebookLastPost, lead.linkedinUrl, lead.linkedinStatus, lead.emails ? lead.emails.join("; ") : "",
      lead.googleAnalyticsPresent ? "Yes" : "No", lead.metaPixelPresent ? "Yes" : "No", lead.whatsappPresent ? "Yes" : "No",
      lead.appointmentSystem ? "Yes" : "No", lead.mapsUrl, lead.leadScore, lead.leadPriority, lead.dateAdded, lead.aiInsight
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => {
        const str = String(val === null || val === undefined ? "" : val);
        if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes(";")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `leadfinder_leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Fetch all states from the server
  const fetchData = async () => {
    try {
      // 1. Fetch config
      const configRes = await fetch("/api/config");
      if (configRes.ok) {
        const config = await configRes.json();
        setBusinessType(config.businessType || "Dental Clinic");
        setLocation(config.location || "Baner Pune");
        setMaxResults(config.maxResults || 10);
        setEnableSimulation(config.enableSimulation || false);
        setHeadless(config.headless || false);
        setLat(config.lat || 19.9975); // Fallback to Nashik Center
        setLng(config.lng || 73.7898);
        setRadius(config.radius || 5);
      }

      // 2. Fetch Status
      const statusRes = await fetch("/api/status");
      if (statusRes.ok) {
        const status = await statusRes.json();
        setIsRunning(status.isRunning);
        setWebhookConfigured(status.webhookUrlConfigured);
        setLastResult(status.lastResult);
      }

      // 3. Fetch logs
      const logsRes = await fetch("/api/logs");
      if (logsRes.ok) {
        const data = await logsRes.json();
        setTerminalLogs(data.logs);
      }

      // 4. Fetch processed leads
      const processedRes = await fetch("/api/processed");
      if (processedRes.ok) {
        const data = await processedRes.json();
        setProcessedLeads(data);
      }

      // 5. Fetch failed leads
      const failedRes = await fetch("/api/failed");
      if (failedRes.ok) {
        const data = await failedRes.json();
        setFailedLeads(data);
      }

      // 6. Fetch SMTP settings
      const smtpRes = await fetch("/api/config/smtp");
      if (smtpRes.ok) {
        const smtp = await smtpRes.json();
        setSmtpHost(smtp.host || "");
        setSmtpPort(smtp.port || "587");
        setSmtpUser(smtp.user || "");
        setSmtpFrom(smtp.from || "");
        if (smtp.hasPassword) {
          setSmtpPass("••••••••");
        }
      }

      // 7. Fetch WhatsApp status
      const waRes = await fetch("/api/whatsapp/status");
      if (waRes.ok) {
        const wa = await waRes.json();
        setWhatsappStatus(wa);
      }

      // 8. Fetch Campaign status
      const campaignRes = await fetch("/api/campaign/status");
      if (campaignRes.ok) {
        const campaign = await campaignRes.json();
        setCampaignRunning(campaign.isRunning);
        setCampaignProgress(campaign.progress);
      }
    } catch (e) {
      console.error("Failed to connect to the Express background server.", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchStatusAndLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatusAndLogs = async () => {
    try {
      const statusRes = await fetch("/api/status");
      if (statusRes.ok) {
        const status = await statusRes.json();
        setIsRunning(status.isRunning);
        setWebhookConfigured(status.webhookUrlConfigured);
        setLastResult(status.lastResult);
      }

      const logsRes = await fetch("/api/logs");
      if (logsRes.ok) {
        const data = await logsRes.json();
        setTerminalLogs(data.logs);
      }

      const processedRes = await fetch("/api/processed");
      if (processedRes.ok) {
        const data = await processedRes.json();
        setProcessedLeads(data);
      }
      
      const failedRes = await fetch("/api/failed");
      if (failedRes.ok) {
        const data = await failedRes.json();
        setFailedLeads(data);
      }

      const waRes = await fetch("/api/whatsapp/status");
      if (waRes.ok) {
        const wa = await waRes.json();
        setWhatsappStatus(wa);
      }

      const campaignRes = await fetch("/api/campaign/status");
      if (campaignRes.ok) {
        const campaign = await campaignRes.json();
        setCampaignRunning(campaign.isRunning);
        setCampaignProgress(campaign.progress);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (autoScrollLogs && terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalLogs, autoScrollLogs]);

  useEffect(() => {
    localStorage.setItem("leadfinder_activeDataView", activeDataView);
  }, [activeDataView]);

  useEffect(() => {
    localStorage.setItem("leadfinder_autoScrollLogs", String(autoScrollLogs));
  }, [autoScrollLogs]);

  // Leaflet map setup for Geo Lead Finder tab
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !document.getElementById("finder-map") || activeTab !== "finder") {
      if (finderMapInstance.current) {
        finderMapInstance.current.remove();
        finderMapInstance.current = null;
        finderMarker.current = null;
        finderCircle.current = null;
      }
      return;
    }

    if (finderMapInstance.current) return;

    const initialLat = lat || 19.9975;
    const initialLng = lng || 73.7898;

    const map = L.map("finder-map").setView([initialLat, initialLng], 12);
    finderMapInstance.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
    finderMarker.current = marker;

    const circle = L.circle([initialLat, initialLng], {
      color: '#6366f1',
      fillColor: '#6366f1',
      fillOpacity: 0.15,
      radius: radius * 1000
    }).addTo(map);
    finderCircle.current = circle;

    marker.on("dragend", async () => {
      const pos = marker.getLatLng();
      setLat(pos.lat);
      setLng(pos.lng);
      circle.setLatLng(pos);
      await reverseGeocode(pos.lat, pos.lng);
    });

    map.on("click", async (e: any) => {
      const pos = e.latlng;
      marker.setLatLng(pos);
      circle.setLatLng(pos);
      setLat(pos.lat);
      setLng(pos.lng);
      await reverseGeocode(pos.lat, pos.lng);
    });
  }, [activeTab]);

  // Update circle radius on slider change
  useEffect(() => {
    if (finderCircle.current) {
      finderCircle.current.setRadius(radius * 1000);
    }
  }, [radius]);

  // Sync map center, marker, and circle when coordinates change
  useEffect(() => {
    if (finderMapInstance.current && lat && lng) {
      const currentCenter = finderMapInstance.current.getCenter();
      if (Math.abs(currentCenter.lat - lat) > 0.0001 || Math.abs(currentCenter.lng - lng) > 0.0001) {
        finderMapInstance.current.setView([lat, lng]);
      }
      if (finderMarker.current) {
        finderMarker.current.setLatLng([lat, lng]);
      }
      if (finderCircle.current) {
        finderCircle.current.setLatLng([lat, lng]);
      }
    }
  }, [lat, lng]);

  // Leaflet map setup for Dashboard Overview tab
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !document.getElementById("overview-map") || activeTab !== "dashboard" || processedLeads.length === 0) {
      if (overviewMapInstance.current) {
        overviewMapInstance.current.remove();
        overviewMapInstance.current = null;
        overviewMarkers.current = [];
      }
      return;
    }

    if (overviewMapInstance.current) {
      overviewMarkers.current.forEach(m => m.remove());
      overviewMarkers.current = [];
    } else {
      const firstValid = processedLeads.find(l => l.lat && l.lng);
      const centerLat = firstValid?.lat || lat || 19.9975;
      const centerLng = firstValid?.lng || lng || 73.7898;

      const map = L.map("overview-map").setView([centerLat, centerLng], 12);
      overviewMapInstance.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);
    }

    processedLeads.forEach(lead => {
      if (lead.lat && lead.lng) {
        const color = lead.leadPriority === "HOT" ? "#ef4444" : lead.leadPriority === "WARM" ? "#f59e0b" : "#64748b";
        const marker = L.circleMarker([lead.lat, lead.lng], {
          radius: 8,
          fillColor: color,
          color: "#ffffff",
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(overviewMapInstance.current);

        marker.bindPopup(`
          <div class="text-slate-900 font-sans p-1">
            <h4 class="font-bold text-xs border-b pb-1 mb-1">${lead.businessName}</h4>
            <p class="text-[10px] my-0.5"><b>Category:</b> ${lead.category || "N/A"}</p>
            <p class="text-[10px] my-0.5"><b>Rating:</b> ${lead.rating} ⭐ (${lead.reviews} reviews)</p>
            <p class="text-[10px] my-0.5"><b>Lead Score:</b> <span class="font-bold text-indigo-600">${lead.leadScore}</span> (${lead.leadPriority})</p>
            <p class="text-[9px] text-slate-500 mt-1 truncate">${lead.address}</p>
          </div>
        `);
        overviewMarkers.current.push(marker);
      }
    });
  }, [activeTab, processedLeads]);

  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${latitude}&lon=${longitude}`);
      if (res.ok) {
        const data = await res.json();
        const addr = data.address;
        const sub = addr.suburb || addr.neighbourhood || addr.village || addr.quarter || addr.residential || addr.road || "";
        const city = addr.city || addr.town || addr.municipality || "";
        const formatted = sub && city ? `${sub}, ${city}` : data.display_name ? data.display_name.split(",").slice(0, 3).join(",").trim() : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        setLocation(formatted);
      }
    } catch (e) {
      console.error("Reverse geocoding error:", e);
    }
  };

  const handleSearchAreaGeocode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapSearchText.trim()) return;
    setIsGeocoding(true);
    try {
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(mapSearchText)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const item = data[0];
          const newLat = parseFloat(item.lat);
          const newLng = parseFloat(item.lon);
          setLat(newLat);
          setLng(newLng);
          setLocation(mapSearchText);
          
          if (finderMapInstance.current) {
            finderMapInstance.current.setView([newLat, newLng], 12);
          }
          if (finderMarker.current) {
            finderMarker.current.setLatLng([newLat, newLng]);
          }
          if (finderCircle.current) {
            finderCircle.current.setLatLng([newLat, newLng]);
          }
        } else {
          alert("Location not found. Try adding a city name (e.g. Gangapur Road, Nashik).");
        }
      }
    } catch (err) {
      alert("Error finding location.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setConfigSuccess(false);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType, location, maxResults, enableSimulation, headless, lat, lng, radius }),
      });

      if (res.ok) {
        setConfigSuccess(true);
        setTimeout(() => setConfigSuccess(false), 3000);
        fetchData();
      }
    } catch (e) {
      alert("Error saving configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleStartScraper = async () => {
    if (isRunning) return;
    try {
      setTerminalLogs(prev => prev + "\n[SYSTEM] Synchronizing search area parameters... saving config...\n");
      
      const saveRes = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType, location, maxResults, enableSimulation, headless, lat, lng, radius }),
      });

      if (!saveRes.ok) {
        setTerminalLogs(prev => prev + "[WARN] Parameter autosave failed. Proceeding with existing server settings...\n");
      } else {
        setTerminalLogs(prev => prev + "[SYSTEM] Search parameters synchronized successfully.\n");
      }

      setTerminalLogs(prev => prev + "[SYSTEM] Localizing Chromium Driver... Launching scraper environment thread...\n");
      const res = await fetch("/api/run-scraper", { method: "POST" });
      if (res.ok) {
        setIsRunning(true);
        setActiveDataView("logs");
      } else {
        const errorData = await res.json();
        setTerminalLogs(prev => prev + `[ERROR] Failed to start scraper: ${errorData.error || "Unknown error"}\n`);
      }
    } catch (e) {
      alert("Error triggering scraper agent.");
    }
  };

  const handleRetryFailed = async () => {
    if (isRetryingFailed) return;
    setIsRetryingFailed(true);
    try {
      const res = await fetch("/api/retry-failed", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(`Finished Retrying! Succeeded: ${data.succeeded}, Failed: ${data.failed}`);
        fetchData();
      }
    } catch (e) {
      alert("Error executing retry script.");
    } finally {
      setIsRetryingFailed(false);
    }
  };

  const handleResetData = async () => {
    if (!window.confirm("CAUTION: This will permanently wipe all harvested leads, reset scraper logs, and stop active campaigns. Proceed?")) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await fetch("/api/reset-data", { method: "POST" });
      if (res.ok) {
        alert("Lead database and logs completely wiped!");
        setSelectedLeadDetails(null);
        fetchData();
      } else {
        alert("Server failed to wipe database.");
      }
    } catch (e) {
      alert("Error calling reset API.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleTestWebhook = async () => {
    if (isTestingWebhook) return;
    setIsTestingWebhook(true);
    try {
      const res = await fetch("/api/test-webhook", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("🎉 Connection Success!\n\nYour Google Sheets Webhook is verified and active! A mock lead has been successfully dispatched and appended to your spreadsheet.");
      } else {
        alert(`❌ Connection Failed:\n\n${data.error || "Google Apps Script rejected the request."}\n\nREMEDY CHECKLIST:\n1. Open your Google Sheets document.\n2. Click "Extensions" > "Apps Script".\n3. Click the blue "Deploy" button at the top-right > "Manage deployments".\n4. Locate your active Web App deployment and click the Edit (pencil) icon.\n5. Under "Configuration", ensure:\n   - "Execute as": "Me" (your email)\n   - "Who has access": "Anyone" (Anonymous/public access is mandatory)\n6. IMPORTANT: Select "New version" from the version dropdown. (Google will NOT update permissions on your old link without a new version release!)\n7. Click "Deploy", copy the new Web App URL, paste it in your .env, and try again!`);
      }
      fetchData();
    } catch (e) {
      alert("Error trying to trigger the webhook test API.");
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSmtp(true);
    setSmtpSuccess(false);
    try {
      const res = await fetch("/api/config/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          pass: smtpPass === "••••••••" ? "" : smtpPass,
          from: smtpFrom
        })
      });
      if (res.ok) {
        setSmtpSuccess(true);
        setTimeout(() => setSmtpSuccess(false), 3000);
        fetchData();
      } else {
        alert("Failed to save SMTP configuration.");
      }
    } catch (err) {
      alert("Error saving SMTP configuration.");
    } finally {
      setIsSavingSmtp(false);
    }
  };

  const handleInitializeWhatsApp = async () => {
    try {
      const res = await fetch("/api/whatsapp/initialize", { method: "POST" });
      if (res.ok) {
        setWhatsappStatus(prev => ({ ...prev, status: "CONNECTING" }));
      }
    } catch (err) {
      alert("Error initializing WhatsApp.");
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!window.confirm("Disconnect WhatsApp session? This will log out the client and terminate active scans.")) return;
    setIsDisconnectingWa(true);
    // Optimistically transition the UI to connecting/generating new QR
    setWhatsappStatus({ status: "CONNECTING", qr: "" });
    try {
      const res = await fetch("/api/whatsapp/disconnect", { method: "POST" });
      if (res.ok) {
        fetchData();
      } else {
        alert("Failed to disconnect WhatsApp.");
        fetchData();
      }
    } catch (err) {
      alert("Error disconnecting WhatsApp session.");
      fetchData();
    } finally {
      setIsDisconnectingWa(false);
    }
  };

  const handleSendTestMessage = async () => {
    const phone = window.prompt("Enter phone number with country code (e.g. 919876543210) to send a test message, or leave blank to send to yourself:");
    if (phone === null) return; // user cancelled
    
    setIsSendingTestMsg(true);
    try {
      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() })
      });
      if (res.ok) {
        alert("Test message sent successfully!");
      } else {
        const data = await res.json();
        alert("Failed to send test message: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      alert("Error sending test message.");
    } finally {
      setIsSendingTestMsg(false);
    }
  };

  const handleOpenOutreach = async (lead: Lead) => {
    setSelectedLeadForOutreach(lead);
    setOutreachEmailSubject("Generating AI pitch...");
    setOutreachEmailBody("Drafting customized outreach campaign pitch based on AI insights...\n\nPlease wait a moment.");
    setOutreachWhatsappMsg("Drafting customized message...");
    
    try {
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead })
      });
      if (res.ok) {
        const copy = await res.json();
        setOutreachEmailSubject(copy.emailSubject);
        setOutreachEmailBody(copy.emailBody);
        setOutreachWhatsappMsg(copy.whatsappMessage);
      } else {
        const copy = generateOutreachCopy(lead);
        setOutreachEmailSubject(copy.emailSubject);
        setOutreachEmailBody(copy.emailBody);
        setOutreachWhatsappMsg(copy.whatsappMessage);
      }
    } catch (e) {
      const copy = generateOutreachCopy(lead);
      setOutreachEmailSubject(copy.emailSubject);
      setOutreachEmailBody(copy.emailBody);
      setOutreachWhatsappMsg(copy.whatsappMessage);
    }
  };

  const handleSendEmail = async () => {
    if (!selectedLeadForOutreach) return;
    setIsSendingEmail(true);
    try {
      const recipient = selectedLeadForOutreach.emails && selectedLeadForOutreach.emails.length > 0 
        ? selectedLeadForOutreach.emails[0] 
        : "";
      if (!recipient) {
        alert("This lead does not have any emails detected. Please enter or verify recipient email.");
        setIsSendingEmail(false);
        return;
      }

      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: selectedLeadForOutreach.businessName,
          to: recipient,
          subject: outreachEmailSubject,
          body: outreachEmailBody
        })
      });
      if (res.ok) {
        alert("Email sent successfully!");
        setProcessedLeads(prev => prev.map(lead => {
          if (lead.businessName === selectedLeadForOutreach.businessName) {
            return {
              ...lead,
              emailStatus: "SENT",
              emailSentDate: new Date().toISOString().split("T")[0]
            };
          }
          return lead;
        }));
        setSelectedLeadForOutreach(prev => prev ? { ...prev, emailStatus: "SENT" } : null);
      } else {
        const errorData = await res.json();
        alert(`Failed to send email: ${errorData.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Error sending email.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendWhatsapp = async () => {
    if (!selectedLeadForOutreach) return;
    setIsSendingWhatsapp(true);
    try {
      const phone = selectedLeadForOutreach.phone;
      if (!phone) {
        alert("This lead does not have a phone number.");
        setIsSendingWhatsapp(false);
        return;
      }

      const res = await fetch("/api/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: selectedLeadForOutreach.businessName,
          phone: phone,
          message: outreachWhatsappMsg
        })
      });
      if (res.ok) {
        alert("WhatsApp message sent successfully!");
        setProcessedLeads(prev => prev.map(lead => {
          if (lead.businessName === selectedLeadForOutreach.businessName) {
            return {
              ...lead,
              whatsappStatus: "SENT",
              whatsappSentDate: new Date().toISOString().split("T")[0]
            };
          }
          return lead;
        }));
        setSelectedLeadForOutreach(prev => prev ? { ...prev, whatsappStatus: "SENT" } : null);
      } else {
        const errorData = await res.json();
        alert(`Failed to send WhatsApp message: ${errorData.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Error sending WhatsApp message.");
    } finally {
      setIsSendingWhatsapp(false);
    }
  };

  const handleStartCampaign = async () => {
    setIsStartingCampaign(true);
    try {
      const res = await fetch("/api/campaign/start", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delaySeconds: campaignDelay,
          enableEmail: campaignEnableEmail,
          enableWhatsapp: campaignEnableWhatsapp,
          dryRun: campaignDryRun
        })
      });
      if (res.ok) {
        setCampaignRunning(true);
      } else {
        const err = await res.json();
        alert(`Failed to start campaign: ${err.error || "Unknown error"}`);
      }
    } catch (e) {
      alert("Error starting campaign.");
    } finally {
      setIsStartingCampaign(false);
    }
  };

  const handleSelectPreviewLead = async (lead: Lead) => {
    setPreviewLead(lead);
    setPreviewCopy(null);
    setIsLoadingPreviewCopy(true);
    try {
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead })
      });
      if (res.ok) {
        const copy = await res.json();
        setPreviewCopy(copy);
      } else {
        setPreviewCopy(generateOutreachCopy(lead));
      }
    } catch (e) {
      setPreviewCopy(generateOutreachCopy(lead));
    } finally {
      setIsLoadingPreviewCopy(false);
    }
  };

  const handleStopCampaign = async () => {
    setIsStoppingCampaign(true);
    try {
      const res = await fetch("/api/campaign/stop", { method: "POST" });
      if (res.ok) {
        alert("Campaign abort request successfully received.");
      } else {
        const err = await res.json();
        alert(`Failed to stop campaign: ${err.error || "Unknown error"}`);
      }
    } catch (e) {
      alert("Error stopping campaign.");
    } finally {
      setIsStoppingCampaign(false);
    }
  };

  // Helper stats for dashboard
  const hotLeads = processedLeads.filter(l => l.leadPriority === "HOT").length;
  const warmLeads = processedLeads.filter(l => l.leadPriority === "WARM").length;
  const coldLeads = processedLeads.filter(l => l.leadPriority === "COLD").length;
  const totalProcessed = processedLeads.length;

  const scorePoor = processedLeads.filter(l => l.leadScore <= 50).length;
  const scoreNeedsWork = processedLeads.filter(l => l.leadScore > 50 && l.leadScore <= 100).length;
  const scoreGood = processedLeads.filter(l => l.leadScore > 100 && l.leadScore <= 150).length;
  const scoreExcellent = processedLeads.filter(l => l.leadScore > 150).length;

  const maxScoreCount = Math.max(scorePoor, scoreNeedsWork, scoreGood, scoreExcellent, 1);

  return (
    <div className="flex h-screen bg-[#020617] text-[#e2e8f0] font-sans overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#090d16] border-r border-[#1e293b] flex flex-col justify-between h-full z-20 shrink-0">
        <div>
          {/* Logo Brand */}
          <div className="h-16 flex items-center gap-3 px-6 border-b border-[#1e293b]/60">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/30">
              <Compass className="h-5 w-5 text-white animate-spin-slow" />
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 -top-0.5 -right-0.5 animate-pulse"></span>
            </div>
            <div>
              <h1 className="text-sm font-black text-white font-mono tracking-wider">LEADFINDER AI</h1>
              <span className="text-[9px] text-indigo-400 font-mono tracking-widest uppercase">Maps Outreach</span>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-4 space-y-1">
            <button 
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                activeTab === "dashboard" 
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold" 
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <LayoutDashboard className="h-4.5 w-4.5" /> Dashboard Overview
              </span>
              <ChevronRight className="h-3 w-3 opacity-60" />
            </button>

            <button 
              onClick={() => setActiveTab("finder")}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                activeTab === "finder" 
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold" 
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <MapPin className="h-4.5 w-4.5" /> Geo Lead Finder
              </span>
              {isRunning && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>}
              {!isRunning && <ChevronRight className="h-3 w-3 opacity-60" />}
            </button>

            <button 
              onClick={() => setActiveTab("leads")}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                activeTab === "leads" 
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold" 
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Database className="h-4.5 w-4.5" /> Leads Database
              </span>
              <span className="text-[10px] bg-[#1e293b] text-slate-300 px-2 py-0.5 rounded-full font-sans">
                {totalProcessed}
              </span>
            </button>

            <button 
              onClick={() => setActiveTab("outreach")}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                activeTab === "outreach" 
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold" 
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Send className="h-4.5 w-4.5" /> Outreach Campaign
              </span>
              {campaignRunning && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>}
              {!campaignRunning && <ChevronRight className="h-3 w-3 opacity-60" />}
            </button>

            <button 
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                activeTab === "settings" 
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold" 
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Settings className="h-4.5 w-4.5" /> Integrations
              </span>
              <ChevronRight className="h-3 w-3 opacity-60" />
            </button>
          </nav>
        </div>

        {/* Sidebar Status Footer */}
        <div className="p-4 border-t border-[#1e293b]/60 font-mono text-[9px] text-slate-500 space-y-2">
          <div className="flex items-center justify-between">
            <span>WhatsApp Connection:</span>
            <span className={`font-bold flex items-center gap-1 ${
              whatsappStatus.status === "CONNECTED" ? "text-emerald-400" : "text-amber-500"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                whatsappStatus.status === "CONNECTED" ? "bg-emerald-400" : "bg-amber-500"
              }`}></span>
              {whatsappStatus.status === "CONNECTED" ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Webhook delivery:</span>
            <span className={webhookConfigured ? "text-emerald-400 font-bold" : "text-slate-500"}>
              {webhookConfigured ? "Active" : "Not Set"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Autobulk Campaign:</span>
            <span className={campaignRunning ? "text-emerald-400 font-bold animate-pulse" : "text-slate-500"}>
              {campaignRunning ? "Running" : "Idle"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Panel Area */}
      <div className="flex-grow flex flex-col h-full overflow-hidden">
        
        {/* Main Panel Header */}
        <header className="h-16 bg-[#090d16]/70 border-b border-[#1e293b]/60 px-8 flex items-center justify-between z-10 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            {activeTab === "dashboard" && <LayoutDashboard className="h-5 w-5 text-indigo-400" />}
            {activeTab === "finder" && <MapPin className="h-5 w-5 text-indigo-400" />}
            {activeTab === "leads" && <Database className="h-5 w-5 text-indigo-400" />}
            {activeTab === "outreach" && <Send className="h-5 w-5 text-indigo-400" />}
            {activeTab === "settings" && <Settings className="h-5 w-5 text-indigo-400" />}
            <span className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              {activeTab === "dashboard" && "Dashboard Overview"}
              {activeTab === "finder" && "Geo Lead Finder"}
              {activeTab === "leads" && "Leads Database console"}
              {activeTab === "outreach" && "Outreach Campaign Panel"}
              {activeTab === "settings" && "Outreach & Integrations"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full font-mono font-bold tracking-widest uppercase border border-indigo-500/20">
              V2.0 Production Active
            </span>
            <button 
              onClick={fetchData}
              className="p-1.5 rounded-lg border border-[#1e293b] hover:bg-slate-800/50 text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Reload Statuses"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Active Tab View Frame */}
        <div className="flex-grow overflow-y-auto p-8 relative">
          
          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              
              {/* KPI Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-slate-900 to-[#111827] border border-[#1e293b] rounded-2xl p-5 hover:border-indigo-500/20 transition-all shadow-md relative group overflow-hidden">
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 w-20 h-20 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all"></div>
                  <span className="text-[10px] font-bold text-slate-400 font-mono tracking-widest uppercase">Total Harvested</span>
                  <div className="my-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white font-mono tracking-tight">{totalProcessed}</span>
                    <span className="text-xs text-slate-400 font-mono">leads</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Retained in local database</span>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-[#111827] border border-[#ef4444]/20 rounded-2xl p-5 hover:border-ef4444/30 transition-all shadow-md relative group overflow-hidden">
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 w-20 h-20 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all"></div>
                  <span className="text-[10px] font-bold text-rose-400 font-mono tracking-widest uppercase">Hot Candidates</span>
                  <div className="my-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-rose-500 font-mono tracking-tight">{hotLeads}</span>
                    <span className="text-xs text-rose-400/80 font-mono">HOT</span>
                  </div>
                  <span className="text-[10px] text-rose-400/60 font-mono">Critical digital presence gaps</span>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-[#111827] border border-amber-500/20 rounded-2xl p-5 hover:border-amber-500/30 transition-all shadow-md relative group overflow-hidden">
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 w-20 h-20 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all"></div>
                  <span className="text-[10px] font-bold text-amber-400 font-mono tracking-widest uppercase">Warm Opportunities</span>
                  <div className="my-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-amber-500 font-mono tracking-tight">{warmLeads}</span>
                    <span className="text-xs text-amber-400/80 font-mono">WARM</span>
                  </div>
                  <span className="text-[10px] text-amber-400/60 font-mono">Partial social or tracking gaps</span>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-[#111827] border border-[#1e293b] rounded-2xl p-5 hover:border-slate-500/20 transition-all shadow-md relative group overflow-hidden">
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 w-20 h-20 bg-slate-500/5 rounded-full blur-xl group-hover:bg-slate-500/10 transition-all"></div>
                  <span className="text-[10px] font-bold text-slate-400 font-mono tracking-widest uppercase">Pending Sync Queue</span>
                  <div className="my-2 flex items-baseline gap-1">
                    <span className={`text-3xl font-black font-mono tracking-tight ${failedLeads.length > 0 ? "text-amber-500" : "text-emerald-400"}`}>
                      {failedLeads.length}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">leads</span>
                  </div>
                  {failedLeads.length > 0 ? (
                    <button 
                      onClick={handleRetryFailed}
                      disabled={isRetryingFailed}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-mono underline cursor-pointer border-0 bg-transparent p-0 block"
                    >
                      {isRetryingFailed ? "Syncing..." : "Click to flush failed webhook list"}
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">Google sheet data synchronized</span>
                  )}
                </div>
              </div>

              {/* Map & Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Leads Interactive Map */}
                <div className="md:col-span-8 bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 flex flex-col justify-between min-h-[450px]">
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1e293b]/60">
                    <div className="flex items-center gap-2">
                      <Map className="h-4.5 w-4.5 text-indigo-400" />
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">Harvested Leads Geolocations</h3>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono">Pins colored by priority classification</span>
                  </div>
                  
                  {processedLeads.length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center border border-dashed border-[#1e293b] rounded-xl py-20 bg-slate-950/20 text-slate-500">
                      <Map className="h-10 w-10 mb-3 text-slate-600 animate-pulse" />
                      <p className="text-xs font-mono">No mapped leads available.</p>
                      <p className="text-[10px] text-slate-600 mt-1 font-sans">Run a localized scan in the "Geo Lead Finder" tab.</p>
                    </div>
                  ) : (
                    <div id="overview-map" className="flex-grow rounded-xl overflow-hidden border border-[#1e293b] z-0 h-[380px]"></div>
                  )}
                </div>

                {/* SVG Visual Statistics */}
                <div className="md:col-span-4 space-y-6">
                  
                  {/* Lead Priority Distribution */}
                  <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 flex flex-col justify-between h-fit">
                    <div className="pb-3 border-b border-[#1e293b]/60 mb-5">
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">Priority Distribution</h3>
                    </div>
                    
                    <div className="space-y-4">
                      {/* HOT bar */}
                      <div>
                        <div className="flex justify-between text-[10px] font-mono mb-1.5">
                          <span className="text-rose-400 font-bold flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-rose-500"></span> HOT ({hotLeads})
                          </span>
                          <span className="text-slate-400">
                            {totalProcessed > 0 ? ((hotLeads / totalProcessed) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className="h-full bg-rose-500 transition-all duration-1000 shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
                            style={{ width: `${totalProcessed > 0 ? (hotLeads / totalProcessed) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* WARM bar */}
                      <div>
                        <div className="flex justify-between text-[10px] font-mono mb-1.5">
                          <span className="text-amber-400 font-bold flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500"></span> WARM ({warmLeads})
                          </span>
                          <span className="text-slate-400">
                            {totalProcessed > 0 ? ((warmLeads / totalProcessed) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className="h-full bg-amber-500 transition-all duration-1000 shadow-[0_0_8px_rgba(245,158,11,0.5)]" 
                            style={{ width: `${totalProcessed > 0 ? (warmLeads / totalProcessed) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* COLD bar */}
                      <div>
                        <div className="flex justify-between text-[10px] font-mono mb-1.5">
                          <span className="text-slate-400 font-bold flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-slate-500"></span> COLD ({coldLeads})
                          </span>
                          <span className="text-slate-400">
                            {totalProcessed > 0 ? ((coldLeads / totalProcessed) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className="h-full bg-slate-500 transition-all duration-1000" 
                            style={{ width: `${totalProcessed > 0 ? (coldLeads / totalProcessed) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Digital Presence Score Distribution (SVG vertical chart) */}
                  <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6">
                    <div className="pb-3 border-b border-[#1e293b]/60 mb-5">
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">Score Distribution</h3>
                    </div>

                    <div className="flex items-end justify-between h-[180px] pt-4 font-mono text-[9px] text-slate-400 border-b border-slate-800 pb-2">
                      {/* Bar 1: Poor */}
                      <div className="flex flex-col items-center gap-2 w-1/4">
                        <span className="text-slate-300 font-bold">{scorePoor}</span>
                        <div className="w-8 bg-slate-900 border border-slate-800 rounded-t-md relative h-[120px] flex items-end">
                          <div 
                            className="w-full bg-[#64748b] rounded-t-sm hover:brightness-110 transition-all"
                            style={{ height: `${(scorePoor / maxScoreCount) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-[8px] truncate max-w-full">0-50</span>
                      </div>

                      {/* Bar 2: Needs Work */}
                      <div className="flex flex-col items-center gap-2 w-1/4">
                        <span className="text-slate-300 font-bold">{scoreNeedsWork}</span>
                        <div className="w-8 bg-slate-900 border border-slate-800 rounded-t-md relative h-[120px] flex items-end">
                          <div 
                            className="w-full bg-amber-500/70 rounded-t-sm hover:brightness-110 transition-all"
                            style={{ height: `${(scoreNeedsWork / maxScoreCount) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-[8px] truncate max-w-full">51-100</span>
                      </div>

                      {/* Bar 3: Good */}
                      <div className="flex flex-col items-center gap-2 w-1/4">
                        <span className="text-slate-300 font-bold">{scoreGood}</span>
                        <div className="w-8 bg-slate-900 border border-slate-800 rounded-t-md relative h-[120px] flex items-end">
                          <div 
                            className="w-full bg-indigo-500/70 rounded-t-sm hover:brightness-110 transition-all"
                            style={{ height: `${(scoreGood / maxScoreCount) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-[8px] truncate max-w-full">101-150</span>
                      </div>

                      {/* Bar 4: Excellent */}
                      <div className="flex flex-col items-center gap-2 w-1/4">
                        <span className="text-slate-300 font-bold">{scoreExcellent}</span>
                        <div className="w-8 bg-slate-900 border border-slate-800 rounded-t-md relative h-[120px] flex items-end">
                          <div 
                            className="w-full bg-emerald-500/80 rounded-t-sm hover:brightness-110 transition-all"
                            style={{ height: `${(scoreExcellent / maxScoreCount) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-[8px] truncate max-w-full">151-200</span>
                      </div>
                    </div>
                    <div className="text-center mt-3 text-[9px] text-slate-500 font-mono">
                      Digital Presence Score Ranges (out of 200)
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

          {/* TAB 2: GEO LEAD FINDER */}
          {activeTab === "finder" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Left Area selector Map */}
                <div className="md:col-span-7 bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 flex flex-col justify-between min-h-[460px]">
                  <div>
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1e293b]/60">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4.5 w-4.5 text-indigo-400" />
                        <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">Select Target Locality</h3>
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">Geocode or click map to drop search center</span>
                    </div>

                    {/* Geocoding Input Bar */}
                    <form onSubmit={handleSearchAreaGeocode} className="flex gap-2 mb-4">
                      <div className="relative flex-grow">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input 
                          type="text" 
                          placeholder="Search neighborhood (e.g. Gangapur Road, Nashik)"
                          value={mapSearchText}
                          onChange={(e) => setMapSearchText(e.target.value)}
                          className="w-full text-xs bg-[#030712] border border-[#1e293b] rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isGeocoding || isRunning}
                        className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/25 text-xs font-mono font-bold rounded-lg cursor-pointer flex items-center gap-1.5 transition-all"
                      >
                        {isGeocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Center Map"}
                      </button>
                    </form>
                  </div>

                  {/* Leaflet instance element */}
                  <div id="finder-map" className="flex-grow rounded-xl overflow-hidden border border-[#1e293b] z-0 h-[280px]"></div>

                  {/* Lat Lng display */}
                  <div className="mt-3 font-mono text-[10px] text-slate-400 flex items-center justify-between bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-indigo-400" /> Coordinates:</span>
                    <span>Lat: {lat?.toFixed(6) || "N/A"} | Lng: {lng?.toFixed(6) || "N/A"}</span>
                  </div>
                </div>

                {/* Right Form settings parameters */}
                <div className="md:col-span-5 bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[#1e293b]/60">
                      <Sliders className="h-4.5 w-4.5 text-indigo-400" />
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">Scan Parameters</h3>
                    </div>

                    <form onSubmit={handleSaveConfig} className="space-y-4">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1 font-mono">Business Type</label>
                        <input 
                          type="text" 
                          value={businessType}
                          onChange={(e) => setBusinessType(e.target.value)}
                          placeholder="e.g. Dental Clinic"
                          disabled={isRunning || isSavingConfig}
                          className="w-full text-xs bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1 font-mono">Area Locality Name</label>
                        <input 
                          type="text" 
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Gangapur Road, Nashik"
                          disabled={isRunning || isSavingConfig}
                          className="w-full text-xs bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50"
                          required
                        />
                      </div>

                      {/* Slider radius */}
                      <div>
                        <div className="flex justify-between text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1 font-mono">
                          <span>Search Radius Limit</span>
                          <span className="text-indigo-400 text-xs font-black lowercase">{radius}km radius</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input 
                            type="range" 
                            min="1"
                            max="15"
                            value={radius}
                            onChange={(e) => setRadius(parseInt(e.target.value) || 5)}
                            disabled={isRunning || isSavingConfig}
                            className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1 font-mono">Limit leads</label>
                          <input 
                            type="number" 
                            min="1"
                            max="100"
                            value={maxResults}
                            onChange={(e) => setMaxResults(parseInt(e.target.value, 10) || 10)}
                            disabled={isRunning || isSavingConfig}
                            className="w-full text-xs bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50"
                            required
                          />
                        </div>
                        <div className="flex flex-col justify-end gap-1 pb-1">
                          <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer select-none font-mono">
                            <input 
                              type="checkbox"
                              checked={headless}
                              onChange={(e) => setHeadless(e.target.checked)}
                              disabled={isRunning || isSavingConfig}
                              className="rounded border-[#1e293b] bg-[#030712] text-indigo-600 focus:ring-indigo-500/20"
                            />
                            <span>Headless browser</span>
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer select-none font-mono">
                            <input 
                              type="checkbox"
                              checked={enableSimulation}
                              onChange={(e) => setEnableSimulation(e.target.checked)}
                              disabled={isRunning || isSavingConfig}
                              className="rounded border-[#1e293b] bg-[#030712] text-indigo-600 focus:ring-indigo-500/20"
                            />
                            <span>Simulation mode</span>
                          </label>
                        </div>
                      </div>

                      <div className="pt-2 flex gap-2">
                        <button
                          type="submit"
                          disabled={isRunning || isSavingConfig}
                          className="flex-grow text-xs font-semibold font-mono py-2 rounded-lg border border-indigo-500/30 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 focus:outline-none transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {isSavingConfig ? "Saving..." : configSuccess ? "Config Written ✅" : "Save parameters"}
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="pt-6 border-t border-[#1e293b]/60 space-y-3">
                    <button
                      onClick={handleStartScraper}
                      disabled={isRunning}
                      className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10 focus:outline-none transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Play className="h-4.5 w-4.5 fill-white" />
                      {isRunning ? "Agent Scraping Locality..." : "Run LeadFinder Agent"}
                    </button>
                  </div>
                </div>

              </div>

              {/* Log Terminal underneath */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]/60 mb-4">
                  <div className="flex items-center gap-2">
                    <TerminalIcon className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">Execution logs console</h3>
                  </div>
                  <label className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={autoScrollLogs}
                      onChange={(e) => setAutoScrollLogs(e.target.checked)}
                      className="rounded border-[#1e293b] bg-[#030712]"
                    />
                    <span>Auto-scroll</span>
                  </label>
                </div>
                
                <div 
                  ref={terminalContainerRef}
                  className="w-full h-60 bg-black/90 border border-slate-900 rounded-lg p-4 font-mono text-xs overflow-y-auto leading-relaxed text-[#10b981] whitespace-pre-wrap select-text scrollbar-thin"
                >
                  {terminalLogs}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LEADS CONSOLE */}
          {activeTab === "leads" && (
            <div className="space-y-6">
              
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-[#090d16] border border-[#1e293b] rounded-2xl p-4">
                
                {/* Search / Filters */}
                <div className="flex flex-grow w-full md:w-auto items-center gap-3">
                  <div className="relative flex-grow md:max-w-xs">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Search leads database..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full text-xs bg-[#030712] border border-[#1e293b] rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="text-xs bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
                  >
                    <option value="ALL">All Priorities</option>
                    <option value="HOT">HOT Priority</option>
                    <option value="WARM">WARM Priority</option>
                    <option value="COLD">COLD Priority</option>
                  </select>
                </div>

                {/* Operations Buttons */}
                <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
                  {campaignRunning ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600/10 border border-rose-500/20 text-rose-400 font-mono text-xs">
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
                      Auto Campaign active
                      <button 
                        onClick={handleStopCampaign}
                        disabled={isStoppingCampaign}
                        className="ml-2 font-black text-rose-300 hover:text-white underline cursor-pointer bg-transparent border-0 p-0"
                      >
                        {isStoppingCampaign ? "Stopping..." : "Stop Loop"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleStartCampaign}
                      disabled={isStartingCampaign || processedLeads.length === 0}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      Start Bulk Campaign
                    </button>
                  )}

                  <button
                    onClick={downloadCSV}
                    disabled={filteredLeads.length === 0}
                    className="px-4 py-2 bg-[#030712] hover:bg-slate-800/40 text-slate-300 border border-[#1e293b] text-xs font-mono rounded-lg cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" /> Export CSV
                  </button>

                  <button
                    onClick={handleResetData}
                    disabled={isClearing}
                    className="px-4 py-2 bg-rose-950/20 hover:bg-rose-900/10 text-rose-400 border border-rose-500/20 text-xs font-mono rounded-lg cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Wipe Cache
                  </button>
                </div>

              </div>

              {/* Layout for Table & Details Split */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Leads Table Container */}
                <div className={`bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 ${
                  selectedLeadDetails ? "lg:col-span-8" : "lg:col-span-12"
                }`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-[#1e293b]/60 text-[10px] text-slate-400 uppercase tracking-wider">
                          <th className="pb-3 pr-2">Lead Name</th>
                          <th className="pb-3 px-2 text-center">Score</th>
                          <th className="pb-3 px-2 text-center">Priority</th>
                          <th className="pb-3 px-2">Website status</th>
                          <th className="pb-3 px-2 text-center">Socials</th>
                          <th className="pb-3 pl-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e293b]/40 text-xs">
                        {filteredLeads.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-500">
                              No leads match active search filter guidelines.
                            </td>
                          </tr>
                        ) : (
                          filteredLeads.map((lead, idx) => {
                            const isSelected = selectedLeadDetails?.businessName === lead.businessName;
                            
                            const scoreColor = lead.leadScore <= 50 ? "text-[#64748b]" : lead.leadScore <= 100 ? "text-amber-500" : lead.leadScore <= 150 ? "text-indigo-400" : "text-emerald-400";
                            const priorityBg = lead.leadPriority === "HOT" ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : lead.leadPriority === "WARM" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-slate-500/10 border-slate-500/20 text-slate-400";

                            const hasInsta = lead.instagramStatus !== "NOT_FOUND";
                            const hasFb = lead.facebookStatus !== "NOT_FOUND";
                            const hasLi = lead.linkedinStatus !== "NOT_FOUND";

                            return (
                              <tr 
                                key={idx}
                                onClick={() => setSelectedLeadDetails(isSelected ? null : lead)}
                                className={`hover:bg-slate-800/20 transition-all cursor-pointer ${
                                  isSelected ? "bg-indigo-600/5 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-3.5 pr-2 font-sans">
                                  <div className="font-bold text-white leading-snug">{lead.businessName}</div>
                                  <div className="text-[10px] text-slate-500 mt-1 max-w-[280px] truncate">{lead.address}</div>
                                </td>
                                
                                <td className={`py-3.5 px-2 text-center font-black ${scoreColor}`}>{lead.leadScore}</td>
                                
                                <td className="py-3.5 px-2 text-center">
                                  <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-full ${priorityBg}`}>
                                    {lead.leadPriority}
                                  </span>
                                </td>
                                
                                <td className="py-3.5 px-2">
                                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                                    lead.websiteStatus === "WORKING" ? "bg-emerald-500/10 text-emerald-400" : 
                                    lead.websiteStatus === "BROKEN" ? "bg-rose-500/10 text-rose-400 font-bold" : 
                                    lead.websiteStatus === "OUTDATED" ? "bg-amber-500/10 text-amber-400" : 
                                    "bg-slate-500/10 text-slate-400"
                                  }`}>
                                    {lead.websiteStatus}
                                  </span>
                                </td>

                                <td className="py-3.5 px-2 text-center text-slate-500 font-sans">
                                  <div className="flex items-center justify-center gap-1">
                                    <span className={hasInsta ? "text-indigo-400 font-bold text-[10px]" : "opacity-30 text-[9px]"}>IG</span>
                                    <span>•</span>
                                    <span className={hasFb ? "text-indigo-400 font-bold text-[10px]" : "opacity-30 text-[9px]"}>FB</span>
                                    <span>•</span>
                                    <span className={hasLi ? "text-indigo-400 font-bold text-[10px]" : "opacity-30 text-[9px]"}>LN</span>
                                  </div>
                                </td>

                                <td className="py-3.5 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => handleOpenOutreach(lead)}
                                    className="px-2.5 py-1 text-[10px] font-bold text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/25 rounded-md cursor-pointer transition-all"
                                  >
                                    Outreach
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Lead Details Console Panel (Right Drawer) */}
                {selectedLeadDetails && (
                  <div className="lg:col-span-4 bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 space-y-5 relative">
                    <button 
                      onClick={() => setSelectedLeadDetails(null)}
                      className="absolute top-4 right-4 p-1 rounded hover:bg-slate-800 text-slate-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    
                    <div className="border-b border-[#1e293b]/60 pb-3">
                      <h3 className="font-bold text-sm text-white font-sans pr-6 leading-tight">
                        {selectedLeadDetails.businessName}
                      </h3>
                      <span className="text-[10px] font-mono text-slate-400 mt-1 block">{selectedLeadDetails.category}</span>
                    </div>

                    <div className="space-y-4 text-xs font-mono">
                      
                      {/* AI Hooks */}
                      <div className="bg-[#6366f1]/5 border border-[#6366f1]/25 p-3.5 rounded-xl">
                        <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">Sales Insight hook</h4>
                        <p className="text-[11px] text-slate-200 font-sans leading-relaxed">
                          "{selectedLeadDetails.aiInsight || "No specific gaps recorded."}"
                        </p>
                      </div>

                      {/* Technical audit checklist */}
                      <div className="space-y-2 border-b border-[#1e293b]/60 pb-4">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Technical Indicators</h4>
                        
                        <div className="flex items-center justify-between">
                          <span>Google Rating:</span>
                          <span className="text-white font-sans">{selectedLeadDetails.rating} ⭐ ({selectedLeadDetails.reviews} revs)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Website Status:</span>
                          <span className={`text-[10px] font-bold uppercase ${
                            selectedLeadDetails.websiteStatus === "WORKING" ? "text-emerald-400" : "text-rose-400"
                          }`}>
                            {selectedLeadDetails.websiteStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Emails Discovered:</span>
                          <span className="text-white font-sans truncate max-w-[180px]">
                            {selectedLeadDetails.emails && selectedLeadDetails.emails.length > 0 
                              ? selectedLeadDetails.emails[0] 
                              : "None"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Google Analytics:</span>
                          <span className={selectedLeadDetails.googleAnalyticsPresent ? "text-emerald-400" : "text-slate-500"}>
                            {selectedLeadDetails.googleAnalyticsPresent ? "Active" : "Missing"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Meta Retargeting Pixel:</span>
                          <span className={selectedLeadDetails.metaPixelPresent ? "text-emerald-400" : "text-slate-500"}>
                            {selectedLeadDetails.metaPixelPresent ? "Active" : "Missing"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Direct Booking System:</span>
                          <span className={selectedLeadDetails.appointmentSystem ? "text-emerald-400" : "text-slate-500"}>
                            {selectedLeadDetails.appointmentSystem ? "Detected" : "Missing"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>WhatsApp Widget:</span>
                          <span className={selectedLeadDetails.whatsappPresent ? "text-emerald-400" : "text-slate-500"}>
                            {selectedLeadDetails.whatsappPresent ? "Present" : "Missing"}
                          </span>
                        </div>
                      </div>

                      {/* Social Presence check */}
                      <div className="space-y-2 pb-1">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Social Channels Presence</h4>
                        
                        <div className="flex items-center justify-between">
                          <span>Instagram status:</span>
                          <span className={`text-[10px] font-bold ${
                            selectedLeadDetails.instagramStatus === "ACTIVE" ? "text-emerald-400" : "text-slate-500"
                          }`}>
                            {selectedLeadDetails.instagramStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Facebook status:</span>
                          <span className={`text-[10px] font-bold ${
                            selectedLeadDetails.facebookStatus === "ACTIVE" ? "text-emerald-400" : "text-slate-500"
                          }`}>
                            {selectedLeadDetails.facebookStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>LinkedIn status:</span>
                          <span className={`text-[10px] font-bold ${
                            selectedLeadDetails.linkedinStatus === "ACTIVE" ? "text-emerald-400" : "text-slate-500"
                          }`}>
                            {selectedLeadDetails.linkedinStatus}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 flex gap-2">
                        <a 
                          href={selectedLeadDetails.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 py-2 px-3 border border-[#1e293b] hover:bg-slate-800/40 text-slate-300 rounded-lg text-center flex items-center justify-center gap-1.5 select-none"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> View on Maps
                        </a>
                      </div>

                    </div>
                  </div>
                )}

              </div>

            </div>
          )}

          {/* TAB 4: INTEGRATIONS & OUTREACH SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-4xl">
              
              {/* Row 1: WhatsApp scan settings */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]/60">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-indigo-400" />
                    <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">WhatsApp Device Gateway</h3>
                  </div>
                  
                  {whatsappStatus.status === "CONNECTED" && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleSendTestMessage}
                        disabled={isSendingTestMsg}
                        className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/25 font-bold font-mono text-[10px] rounded-lg cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isSendingTestMsg ? "Sending Test..." : "Send Test Message"}
                      </button>
                      <button 
                        onClick={handleDisconnectWhatsApp}
                        disabled={isDisconnectingWa}
                        className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/25 font-bold font-mono text-[10px] rounded-lg cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isDisconnectingWa ? "Disconnecting..." : "Disconnect WhatsApp"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col md:flex-row items-center gap-8 py-2">
                  <div className="flex-1 space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Connect your phone via WhatsApp Web. Once authenticated, the outreach agent runs automated campaigns and delivers customized pitches to business lines directly.
                    </p>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-slate-400">Connection status:</span>
                        <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                          whatsappStatus.status === "CONNECTED" ? "bg-emerald-500/10 text-emerald-400" :
                          whatsappStatus.status === "CONNECTING" ? "bg-indigo-500/10 text-indigo-400 animate-pulse" :
                          whatsappStatus.status === "QR_READY" ? "bg-amber-500/10 text-amber-400" :
                          "bg-slate-500/10 text-slate-400"
                        }`}>
                          {whatsappStatus.status === "CONNECTED" ? "ACTIVE" : whatsappStatus.status}
                        </span>
                      </div>
                    </div>

                    {whatsappStatus.status === "DISCONNECTED" && (
                      <button
                        onClick={handleInitializeWhatsApp}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition-all shadow-md shadow-indigo-600/10"
                      >
                        Generate QR Link Code
                      </button>
                    )}

                    {whatsappStatus.status === "QR_READY" && (
                      <button
                        onClick={handleInitializeWhatsApp}
                        className="px-4 py-2 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-500/20 text-xs font-mono font-bold rounded-lg cursor-pointer transition-all"
                      >
                        Regenerate / Reload QR Code
                      </button>
                    )}
                  </div>

                  {/* QR Image View */}
                  {whatsappStatus.status !== "CONNECTED" && (
                    <div className="shrink-0 flex items-center justify-center p-4 bg-white rounded-xl border border-slate-200 w-48 h-48 shadow-lg relative">
                      {whatsappStatus.qr ? (
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(whatsappStatus.qr)}`} 
                          alt="WhatsApp Scan QR" 
                          className="w-40 h-40"
                        />
                      ) : (
                        <div className="text-slate-400 text-center font-mono text-[10px]">
                          {whatsappStatus.status === "CONNECTING" ? (
                            <div className="space-y-2 flex flex-col items-center">
                              <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
                              <span>{isDisconnectingWa ? "Re-initializing session..." : "Booting headless client..."}</span>
                            </div>
                          ) : (
                            "Click 'Generate QR Link' to prompt scan connection."
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {whatsappStatus.status === "CONNECTED" && (
                    <div className="shrink-0 flex flex-col items-center justify-center p-6 bg-slate-900/50 border border-emerald-500/20 rounded-xl w-48 h-48 text-emerald-400 font-mono text-xs">
                      <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-2 animate-bounce" />
                      <span className="font-bold text-center">Session Verified</span>
                      <span className="text-[10px] text-slate-500 mt-1">Active Gateway</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: SMTP configs */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[#1e293b]/60">
                  <Mail className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">SMTP Mail configuration</h3>
                </div>

                <form onSubmit={handleSaveSmtp} className="space-y-4 font-mono text-xs max-w-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1">SMTP Server Host</label>
                      <input 
                        type="text" 
                        value={smtpHost} 
                        onChange={(e) => setSmtpHost(e.target.value)} 
                        placeholder="e.g. smtp.gmail.com"
                        className="w-full bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1">SMTP Port</label>
                      <input 
                        type="number" 
                        value={smtpPort} 
                        onChange={(e) => setSmtpPort(e.target.value)} 
                        placeholder="e.g. 587"
                        className="w-full bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1">Authorized SMTP User</label>
                      <input 
                        type="email" 
                        value={smtpUser} 
                        onChange={(e) => setSmtpUser(e.target.value)} 
                        placeholder="user@gmail.com"
                        className="w-full bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1">SMTP User Password</label>
                      <input 
                        type="password" 
                        value={smtpPass} 
                        onChange={(e) => setSmtpPass(e.target.value)} 
                        placeholder="••••••••"
                        className="w-full bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase mb-1">Display Sender Name (From Header)</label>
                    <input 
                      type="text" 
                      value={smtpFrom} 
                      onChange={(e) => setSmtpFrom(e.target.value)} 
                      placeholder="e.g. Digital Branding Team"
                      className="w-full bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Gmail Advisory warning */}
                  <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-amber-400/90 font-sans leading-relaxed">
                    <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-amber-500" />
                    <div>
                      <span className="font-bold block text-amber-400 mb-1">Using Gmail SMTP?</span>
                      To avoid Google authentication blocks, do NOT use your standard account password. You MUST set up a 16-character <strong className="text-white">Google App Password</strong> under your Account settings page (2-Step Verification) and paste it here.
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSavingSmtp}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      {isSavingSmtp ? "Saving Configurations..." : smtpSuccess ? "SMTP Verified ✅" : "Save SMTP credentials"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Row 3: Sheet webhook setups */}
              <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[#1e293b]/60">
                  <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">Google Sheet Webhook Sync</h3>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Synchronize your lead harvests live into your Google Sheets document. Deploy the Apps Script below in your spreadsheet and paste the Web App URL into your local `.env` configuration file (`GOOGLE_SHEET_WEBHOOK_URL`).
                </p>

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Spreadsheet Webhook Connection:</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      webhookConfigured ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    }`}>
                      {webhookConfigured ? "Sync Configured" : "Sync Disabled"}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={handleTestWebhook}
                      disabled={isTestingWebhook}
                      className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/25 font-bold rounded-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      {isTestingWebhook ? "Ping Verification..." : "Test Webhook Connection"}
                    </button>

                    <button 
                      onClick={() => {
                        const code = `// Google Apps Script endpoint script
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Business Name", "Phone Number", "Address", "Rating", "Reviews", "Website", "Website Status",
        "Instagram URL", "Instagram Status", "Instagram Last Post", "Facebook URL", "Facebook Status",
        "Facebook Last Post", "LinkedIn URL", "LinkedIn Status", "Emails", "Google Analytics",
        "Meta Pixel", "WhatsApp Present", "Appointment System", "Google Maps URL", "Lead Score", 
        "Lead Priority", "Date Added", "AI Insight"
      ]);
    }
    
    sheet.appendRow([
      data.businessName || "",
      data.phone || "",
      data.address || "",
      data.rating || 0,
      data.reviews || 0,
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
      data.googleAnalyticsPresent ? "Present" : "Missing",
      data.metaPixelPresent ? "Present" : "Missing",
      data.whatsappPresent ? "Present" : "Missing",
      data.appointmentSystem ? "Present" : "Missing",
      data.mapsUrl || "",
      data.leadScore || 0,
      data.leadPriority || "COLD",
      data.dateAdded || "",
      data.aiInsight || ""
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
                        navigator.clipboard.writeText(code);
                        setCopiedScript(true);
                        setTimeout(() => setCopiedScript(false), 2000);
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg cursor-pointer transition-all"
                    >
                      {copiedScript ? "Copy success!" : "Copy Apps Script Code"}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: OUTREACH CAMPAIGN PANEL */}
          {activeTab === "outreach" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
              
              {/* Left Column - Setup & Progress / Logs & List (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Campaign Action & Settings Card */}
                <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]/60">
                    <div className="flex items-center gap-2">
                      <Send className="h-5 w-5 text-indigo-400" />
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">
                        Campaign Dispatch Controller
                      </h3>
                    </div>
                    {campaignRunning && (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-400 animate-pulse border border-indigo-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
                        {campaignProgress.status.includes("Simulation") ? "SIMULATION ACTIVE" : "LIVE CAMPAIGN"}
                      </span>
                    )}
                  </div>

                  {campaignRunning ? (
                    /* Running View */
                    <div className="space-y-4 font-mono text-xs">
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Dispatching Progress:</span>
                          <span className="text-white font-bold">
                            {campaignProgress.current} / {campaignProgress.total} Leads
                          </span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                          <div 
                            className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${campaignProgress.total > 0 ? (campaignProgress.current / campaignProgress.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 py-2 text-center text-[10px]">
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-900">
                          <div className="text-emerald-400 font-bold text-xs">
                            {(campaignProgress.emailsSent || 0) + (campaignProgress.whatsappSent || 0)}
                          </div>
                          <div className="text-slate-500 mt-0.5">Dispatched</div>
                        </div>
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-900">
                          <div className="text-rose-400 font-bold text-xs">
                            {(campaignProgress.emailsFailed || 0) + (campaignProgress.whatsappFailed || 0)}
                          </div>
                          <div className="text-slate-500 mt-0.5">Delivery Errors</div>
                        </div>
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-900">
                          <div className="text-amber-500 font-bold text-xs">
                            {campaignProgress.skipped || 0}
                          </div>
                          <div className="text-slate-500 mt-0.5">Skipped (No Info)</div>
                        </div>
                      </div>

                      <div className="bg-indigo-500/5 border border-indigo-500/10 p-3 rounded-xl flex items-center justify-between text-indigo-400">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span className="text-[10px] truncate max-w-[280px]">
                            {campaignProgress.status}
                          </span>
                        </div>
                        {campaignProgress.secondsRemaining > 0 && (
                          <span className="font-bold text-[10px] whitespace-nowrap bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                            Gap: {campaignProgress.secondsRemaining}s
                          </span>
                        )}
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={handleStopCampaign}
                          disabled={isStoppingCampaign}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer transition-all shadow-md shadow-rose-600/10 flex items-center gap-1.5"
                        >
                          <X className="h-3.5 w-3.5" /> Stop Outreach Campaign
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Setup & Config View (Robust Feature 1: Safety & Configuration settings) */
                    <div className="space-y-4 font-mono text-xs">
                      <p className="text-slate-400 leading-relaxed font-sans text-xs">
                        Configure spacing constraints and messaging channels before launching bulk campaigns to avoid antispam detection.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* Spacing & Delay controls */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[10px] tracking-wider uppercase font-bold">Safety Dispatch Spacing:</span>
                            <span className="text-indigo-400 font-bold">{campaignDelay} seconds</span>
                          </div>
                          <input 
                            type="range"
                            min="10"
                            max="120"
                            step="5"
                            value={campaignDelay}
                            onChange={(e) => setCampaignDelay(parseInt(e.target.value, 10))}
                            className="w-full accent-indigo-500 h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer border border-slate-800"
                          />
                          <span className="text-[9px] text-slate-500 block font-sans">
                            Recommended spacing: 30s+ to mimic human messaging patterns.
                          </span>
                        </div>

                        {/* Channels selection & dry-run */}
                        <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-900">
                          <span className="text-slate-400 text-[10px] tracking-wider uppercase font-bold block mb-1">
                            Active Dispatch Channels:
                          </span>
                          <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                              <input 
                                type="checkbox"
                                checked={campaignEnableEmail}
                                onChange={(e) => setCampaignEnableEmail(e.target.checked)}
                                className="rounded border-[#1e293b] text-indigo-600 focus:ring-indigo-500 bg-[#030712] h-3.5 w-3.5"
                              />
                              <span>Email Outreach (SMTP)</span>
                            </label>
                            <label className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                              <input 
                                type="checkbox"
                                checked={campaignEnableWhatsapp}
                                onChange={(e) => setCampaignEnableWhatsapp(e.target.checked)}
                                className="rounded border-[#1e293b] text-indigo-600 focus:ring-indigo-500 bg-[#030712] h-3.5 w-3.5"
                              />
                              <span>WhatsApp Gateway Outreach</span>
                            </label>
                            <label className="flex items-center gap-2 text-amber-400/90 hover:text-amber-300 cursor-pointer select-none mt-1 border-t border-slate-800/60 pt-1.5">
                              <input 
                                type="checkbox"
                                checked={campaignDryRun}
                                onChange={(e) => setCampaignDryRun(e.target.checked)}
                                className="rounded border-[#1e293b] text-amber-500 focus:ring-amber-500 bg-[#030712] h-3.5 w-3.5"
                              />
                              <span className="font-bold">Simulation (Dry-run) Mode</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={handleStartCampaign}
                          disabled={isStartingCampaign}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg cursor-pointer transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1.5"
                        >
                          <Play className="h-3.5 w-3.5" /> Start Outreach Campaign
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Campaign Progress Logs console */}
                <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]/60">
                    <div className="flex items-center gap-2">
                      <TerminalIcon className="h-4.5 w-4.5 text-indigo-400" />
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">
                        Outreach Dispatch Console
                      </h3>
                    </div>
                  </div>
                  <div className="h-[180px] bg-[#030712] border border-[#1e293b] rounded-xl p-4 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1.5 leading-relaxed">
                    {terminalLogs.split("\n").filter(line => 
                      line.includes("Campaign") || 
                      line.includes("outreach") || 
                      line.includes("WhatsApp outreach") || 
                      line.includes("Email outreach") || 
                      line.includes("SUCCESS:") ||
                      line.includes("Wiping") ||
                      line.includes("disconnect")
                    ).length > 0 ? (
                      terminalLogs.split("\n").filter(line => 
                        line.includes("Campaign") || 
                        line.includes("outreach") || 
                        line.includes("WhatsApp outreach") || 
                        line.includes("Email outreach") || 
                        line.includes("SUCCESS:") ||
                        line.includes("Wiping") ||
                        line.includes("disconnect")
                      ).map((log, i) => (
                        <div key={i} className={
                          log.includes("SUCCESS") ? "text-emerald-400" :
                          log.includes("ERROR") || log.includes("Aborted") ? "text-rose-400" :
                          log.includes("WARNING") || log.includes("Skipping") ? "text-amber-400" :
                          log.includes("SIMULATION") ? "text-indigo-400" : "text-slate-300"
                        }>
                          {log}
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500 italic text-center pt-12">No active outreach campaign logs generated. Start campaign to view console output.</div>
                    )}
                  </div>
                </div>

                {/* Campaign Checklist Table (Robust Feature 2) */}
                <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#1e293b]/60">
                    <div className="flex items-center gap-2">
                      <Database className="h-4.5 w-4.5 text-indigo-400" />
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">
                        Outreach Target List
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {processedLeads.filter(l => (l.emails && l.emails.length > 0 && l.emailStatus !== "SENT") || (l.phone && l.whatsappStatus !== "SENT")).length} Pending Leads
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left border-collapse font-sans text-xs">
                      <thead>
                        <tr className="border-b border-[#1e293b]/40 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                          <th className="py-2.5 font-normal">Business Details</th>
                          <th className="py-2.5 font-normal">Email status</th>
                          <th className="py-2.5 font-normal">WhatsApp status</th>
                          <th className="py-2.5 text-right font-normal">Preview</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e293b]/20">
                        {processedLeads.map((lead, idx) => {
                          const hasEmail = lead.emails && lead.emails.length > 0;
                          const hasPhone = !!lead.phone;
                          return (
                            <tr key={idx} className="hover:bg-slate-900/20 transition-all">
                              <td className="py-2.5">
                                <div className="font-bold text-white truncate max-w-[200px]">{lead.businessName}</div>
                                <div className="text-[10px] text-slate-500 truncate max-w-[200px] mt-0.5">{lead.address}</div>
                              </td>
                              <td className="py-2.5">
                                {hasEmail ? (
                                  <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    lead.emailStatus === "SENT" ? "bg-emerald-500/10 text-emerald-400" :
                                    lead.emailStatus === "FAILED" ? "bg-rose-500/10 text-rose-400" :
                                    "bg-slate-500/10 text-slate-400"
                                  }`}>
                                    {lead.emailStatus || "PENDING"}
                                  </span>
                                ) : (
                                  <span className="text-slate-600 text-[10px] italic">No Email</span>
                                )}
                              </td>
                              <td className="py-2.5">
                                {hasPhone ? (
                                  <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    lead.whatsappStatus === "SENT" ? "bg-emerald-500/10 text-emerald-400" :
                                    lead.whatsappStatus === "FAILED" ? "bg-rose-500/10 text-rose-400" :
                                    "bg-slate-500/10 text-slate-400"
                                  }`}>
                                    {lead.whatsappStatus || "PENDING"}
                                  </span>
                                ) : (
                                  <span className="text-slate-600 text-[10px] italic">No Phone</span>
                                )}
                              </td>
                              <td className="py-2.5 text-right">
                                <button
                                  onClick={() => handleSelectPreviewLead(lead)}
                                  className="px-2 py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono font-bold rounded cursor-pointer transition-all"
                                >
                                  View Pitch
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {processedLeads.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-500 italic">
                              No processed leads in the database. Scan coordinates first.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Right Column - Pitch Previewer (5 cols) */}
              <div className="lg:col-span-5">
                <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl p-6 space-y-4 sticky top-6">
                  <div className="pb-3 border-b border-[#1e293b]/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
                      <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">
                        AI Copy Previewer
                      </h3>
                    </div>
                  </div>

                  {isLoadingPreviewCopy ? (
                    <div className="py-24 text-center space-y-3 font-mono text-xs text-indigo-400">
                      <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mx-auto" />
                      <span>Generating AI pitch tailored to lead profile...</span>
                    </div>
                  ) : previewLead ? (
                    <div className="space-y-4 font-mono text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Target:</div>
                        <div className="text-sm font-bold text-white mt-1 leading-snug">{previewLead.businessName}</div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">{previewLead.address}</div>
                      </div>

                      <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900 space-y-1 text-[10px] text-slate-400">
                        <div><strong className="text-indigo-400">Priority:</strong> {previewLead.leadPriority}</div>
                        <div><strong className="text-indigo-400">Digital Score:</strong> {previewLead.leadScore} pts</div>
                        <div className="truncate"><strong className="text-indigo-400">AI Insight:</strong> {previewLead.aiInsight}</div>
                      </div>

                      <div className="space-y-3 border-t border-slate-800/50 pt-4">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <Smartphone className="h-3.5 w-3.5 text-indigo-400" /> WhatsApp Message Copy
                        </span>
                        <textarea
                          readOnly
                          value={previewCopy?.whatsappMessage || ""}
                          className="w-full min-h-[120px] bg-[#030712] border border-[#1e293b] rounded-xl p-3 text-[11px] leading-relaxed text-slate-300 focus:outline-none focus:border-indigo-500 resize-none font-sans"
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              if (previewCopy) {
                                navigator.clipboard.writeText(previewCopy.whatsappMessage);
                                alert("WhatsApp pitch copied to clipboard!");
                              }
                            }}
                            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10px] font-bold rounded cursor-pointer transition-all flex items-center gap-1"
                          >
                            <Copy className="h-3 w-3" /> Copy WhatsApp Pitch
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 border-t border-slate-800/50 pt-4">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5 text-indigo-400" /> Email Pitch Copy
                        </span>
                        <div className="space-y-2">
                          <div className="text-[10px] text-slate-400 bg-slate-950/30 p-2 rounded border border-slate-900 truncate">
                            <strong>Subject:</strong> {previewCopy?.emailSubject || ""}
                          </div>
                          <textarea
                            readOnly
                            value={previewCopy?.emailBody || ""}
                            className="w-full min-h-[160px] bg-[#030712] border border-[#1e293b] rounded-xl p-3 text-[11px] leading-relaxed text-slate-300 focus:outline-none focus:border-indigo-500 resize-none font-sans"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              if (previewCopy) {
                                navigator.clipboard.writeText(previewCopy.emailBody);
                                alert("Email pitch body copied to clipboard!");
                              }
                            }}
                            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10px] font-bold rounded cursor-pointer transition-all flex items-center gap-1"
                          >
                            <Copy className="h-3 w-3" /> Copy Email Pitch
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-24 text-center space-y-3 font-mono text-xs text-slate-500">
                      <BookOpen className="h-8 w-8 text-slate-600 mx-auto opacity-50" />
                      <span>Select a lead from the checklist on the left to preview customized AI copy.</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* OUTREACH CONSOLE MODAL */}
      {selectedLeadForOutreach && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#090d16] border border-[#1e293b] rounded-2xl w-full max-w-4xl shadow-2xl relative flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#1e293b]/60 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Send className="h-5 w-5 text-indigo-400" /> Lead Outreach Console
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Drafting outreach pitches for <strong className="text-white">{selectedLeadForOutreach.businessName}</strong>
                </p>
              </div>
              <button 
                onClick={() => setSelectedLeadForOutreach(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* WhatsApp message editor */}
              <div className="space-y-4 flex flex-col h-full">
                <div className="flex items-center justify-between pb-2 border-b border-[#1e293b]/40">
                  <span className="text-xs font-bold font-mono text-indigo-400 flex items-center gap-1">
                    <Smartphone className="h-4 w-4" /> WhatsApp Message Pitch
                  </span>
                  
                  <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded ${
                    selectedLeadForOutreach.whatsappStatus === "SENT" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                  }`}>
                    {selectedLeadForOutreach.whatsappStatus || "PENDING"}
                  </span>
                </div>

                <textarea
                  value={outreachWhatsappMsg}
                  onChange={(e) => setOutreachWhatsappMsg(e.target.value)}
                  className="flex-grow w-full min-h-[320px] bg-[#030712] border border-[#1e293b] rounded-xl p-4 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500 resize-y"
                  placeholder="Customized WhatsApp outreach text..."
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500 font-mono">
                    Recipient: <strong className="text-white">{selectedLeadForOutreach.phone || "No phone number"}</strong>
                  </span>
                  
                  <button
                    onClick={handleSendWhatsapp}
                    disabled={isSendingWhatsapp || !selectedLeadForOutreach.phone || whatsappStatus.status !== "CONNECTED"}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition-all shadow-md shadow-indigo-600/10"
                  >
                    {isSendingWhatsapp ? "Delivering message..." : "Send WhatsApp message"}
                  </button>
                </div>
              </div>

              {/* Email message editor */}
              <div className="space-y-4 flex flex-col h-full">
                <div className="flex items-center justify-between pb-2 border-b border-[#1e293b]/40">
                  <span className="text-xs font-bold font-mono text-indigo-400 flex items-center gap-1">
                    <Mail className="h-4 w-4" /> Email Pitch Details
                  </span>
                  <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded ${
                    selectedLeadForOutreach.emailStatus === "SENT" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                  }`}>
                    {selectedLeadForOutreach.emailStatus || "PENDING"}
                  </span>
                </div>

                <div className="space-y-3 flex-grow flex flex-col">
                  <div>
                    <label className="block text-[9px] font-bold font-mono text-slate-500 mb-1">Subject Header</label>
                    <input
                      type="text"
                      value={outreachEmailSubject}
                      onChange={(e) => setOutreachEmailSubject(e.target.value)}
                      className="w-full bg-[#030712] border border-[#1e293b] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                      placeholder="Email subject..."
                    />
                  </div>

                  <div className="flex-grow flex flex-col">
                    <label className="block text-[9px] font-bold font-mono text-slate-500 mb-1">Message Body</label>
                    <textarea
                      value={outreachEmailBody}
                      onChange={(e) => setOutreachEmailBody(e.target.value)}
                      className="flex-grow w-full min-h-[240px] bg-[#030712] border border-[#1e293b] rounded-xl p-4 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500 resize-y"
                      placeholder="Customized B2B pitch email body..."
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">
                    To: <strong className="text-white">{selectedLeadForOutreach.emails && selectedLeadForOutreach.emails.length > 0 ? selectedLeadForOutreach.emails[0] : "No email detected"}</strong>
                  </span>
                  
                  <button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !selectedLeadForOutreach.emails || selectedLeadForOutreach.emails.length === 0 || !smtpHost || !smtpUser}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition-all shadow-md shadow-indigo-600/10"
                  >
                    {isSendingEmail ? "Transmitting..." : "Send Outreach Email"}
                  </button>
                </div>
              </div>

            </div>

            {/* Modal Footer warning */}
            <div className="px-6 py-3 border-t border-[#1e293b]/60 flex items-center justify-between bg-slate-950/40 font-mono text-[9px] text-slate-500">
              <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-indigo-400" /> Production Safeguard Active</span>
              <span>Delay: 30s spacing loop in campaign. Single messages deliver instantly.</span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
