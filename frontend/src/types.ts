export type SectionName = "overview" | "key_people" | "news" | "financials" | "risks";

export type Person = {
  name: string;
  title: string;
};

export type Financials = {
  revenue: string | null;
  employee_count: string | null;
  market_cap: string | null;
  yoy_growth: string | null;
};

export type ReportData = {
  overview: string | null;
  key_people: Person[];
  news: string[];
  financials: Financials;
  risks: string[];
};

export type ReportSummary = {
  id: number;
  company_name: string;
  created_at: string;
};

export type ReportDetail = ReportSummary & {
  data: ReportData;
};

export type StreamStatus = "idle" | "streaming" | "complete" | "error";
