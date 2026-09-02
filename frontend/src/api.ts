import type { ReportDetail, ReportSummary, SectionName } from "./types";

export type AppError = {
  title: string;
  points: string[];
};

export type ResearchStreamEvent =
  | { type: "section"; section: SectionName; status: "started" | "complete" | "error"; data: unknown }
  | { type: "complete"; reportId: number };

const emptyFinancials = {
  revenue: null,
  employee_count: null,
  market_cap: null,
  yoy_growth: null
};

export const emptyReportData = () => ({
  overview: null,
  key_people: [],
  news: [],
  financials: { ...emptyFinancials },
  risks: []
});

export async function fetchReports(): Promise<ReportSummary[]> {
  const response = await fetch("/api/reports");
  if (!response.ok) throw toAppError("Could not load report history.", ["Refresh the page and try again."]);
  return response.json();
}

export async function fetchReport(id: number): Promise<ReportDetail> {
  const response = await fetch(`/api/reports/${id}`);
  if (!response.ok) throw toAppError("Could not load that report.", ["The report may have been deleted.", "Refresh the history list and try again."]);
  return response.json();
}

export async function deleteReport(id: number): Promise<void> {
  const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
  if (!response.ok) throw toAppError("Could not delete that report.", ["The report may have already been removed.", "Refresh the page and try again."]);
}

export async function streamResearch(
  companyName: string,
  signal: AbortSignal,
  onEvent: (event: ResearchStreamEvent) => void
): Promise<number> {
  const response = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_name: companyName }),
    signal
  });

  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null);
    throw normalizeErrorDetail(detail?.detail, "Research could not be started.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reportId = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const eventText of events) {
      const event = parseSseEvent(eventText);
      if (event.type === "section") {
        onEvent({
          type: "section",
          section: event.data.section,
          status: event.data.status,
          data: event.data.data
        });
      }
      if (event.type === "complete") {
        reportId = event.data.report_id;
        onEvent({ type: "complete", reportId });
      }
      if (event.type === "error") {
        throw normalizeErrorDetail(event.data, "The research stream failed.");
      }
    }
  }

  return reportId;
}

function toAppError(title: string, points: string[]): AppError {
  return { title, points };
}

export function normalizeErrorDetail(detail: unknown, fallbackTitle: string): AppError {
  if (typeof detail === "object" && detail !== null && "title" in detail && "points" in detail) {
    const structured = detail as { title: unknown; points: unknown };
    if (typeof structured.title === "string" && Array.isArray(structured.points)) {
      return {
        title: structured.title,
        points: structured.points.map(String)
      };
    }
  }
  if (typeof detail === "string" && detail.trim()) {
    return { title: fallbackTitle, points: [humanizeRawError(detail)] };
  }
  return { title: fallbackTitle, points: ["Please try again in a moment."] };
}

function humanizeRawError(message: string): string {
  if (message.includes("Failed to fetch")) return "The frontend could not reach the backend. Make sure the backend server is running.";
  if (message.includes("Payment Required")) return "The selected provider model needs credits or a free model setting.";
  if (message.includes("Not Found")) return "The requested provider model or report could not be found.";
  return message;
}

function parseSseEvent(raw: string): { type: string; data: any } {
  const lines = raw.split("\n");
  const type = lines.find((line) => line.startsWith("event:"))?.replace("event:", "").trim() || "message";
  const data = lines.find((line) => line.startsWith("data:"))?.replace("data:", "").trim() || "{}";
  return { type, data: JSON.parse(data) };
}
