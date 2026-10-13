export type Role = "client" | "analyst" | "admin";

export type User = {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
};

export type IncidentPriority = "p1" | "p2" | "p3" | "p4";

export type Incident = {
  id: number;
  reporter_id: number;
  assigned_analyst_id: number | null;
  incident_type: string;
  title: string;
  description: string;
  evidence_reference: string | null;
  threat_category: string;
  priority: IncidentPriority;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AuthMode = "login" | "register";

export const STATUSES = [
  "submitted",
  "assigned",
  "investigating",
  "escalated",
  "waiting",
  "resolved",
  "closed",
] as const;

export type IncidentStatus = (typeof STATUSES)[number];

export type IncidentUpdatePayload = {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  assigned_analyst_id?: number | null;
};

export type UrlAnalysisResponse = {
  url: string;
  prediction: "phishing" | "legitimate" | "uncertain" | string;
  phishing_probability: number;
  confidence: number;
  risk_level: "high" | "medium" | "low" | "uncertain" | string;
  model_name: string;
  model_mode: "experimental-demo" | "production";
  decision_threshold: number;
  low_score_threshold: number;
  signals: string[];
  explanation_note: string;
};

export type View = "overview" | "incidents" | "analyzer";

export type QueueScope = "all" | "open" | "unassigned" | "mine";

export const incidentTypes = [
  { value: "suspicious_email", label: "Suspicious email" },
  { value: "suspicious_url", label: "Suspicious URL" },
  { value: "suspicious_message", label: "Suspicious message" },
  { value: "suspicious_file", label: "Suspicious file" },
  { value: "suspicious_screenshot", label: "Suspicious screenshot" },
  { value: "other", label: "Other security incident" },
];

export const PRIORITIES: {
  value: IncidentPriority;
  label: string;
  blurb: string;
}[] = [
  { value: "p1", label: "Critical", blurb: "Severe outage or major compromise" },
  { value: "p2", label: "High", blurb: "Possible account compromise or multiple users" },
  { value: "p3", label: "Medium", blurb: "Suspicious activity to investigate" },
  { value: "p4", label: "Low", blurb: "Low-impact or informational concern" },
];
