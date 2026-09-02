import { CheckCircle2, Clock, Loader2, Search, Trash2, XCircle } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AppError, deleteReport, emptyReportData, fetchReport, fetchReports, streamResearch } from "./api";
import type { ReportData, ReportSummary, SectionName, StreamStatus } from "./types";

const sectionLabels: Record<SectionName, string> = {
  overview: "Company Overview",
  key_people: "Key People",
  news: "Recent News",
  financials: "Financial Highlights",
  risks: "Risk Factors"
};

export function App() {
  const [companyName, setCompanyName] = useState("");
  const [history, setHistory] = useState<ReportSummary[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportSummary | null>(null);
  const [reportData, setReportData] = useState<ReportData>(emptyReportData());
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [activeSection, setActiveSection] = useState<SectionName | null>(null);
  const [completedSections, setCompletedSections] = useState<Set<SectionName>>(new Set());
  const [error, setError] = useState<AppError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    refreshHistory();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const hasReportContent = useMemo(
    () => Boolean(reportData.overview || reportData.key_people.length || reportData.news.length || reportData.risks.length),
    [reportData]
  );

  async function refreshHistory() {
    try {
      setHistory(await fetchReports());
    } catch {
      setHistory([]);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = companyName.trim();
    if (!/[A-Za-z0-9]/.test(trimmed) || trimmed.length < 2) {
      setError({
        title: "Check the company name",
        points: ["Enter a real company name, such as Stripe or Microsoft."]
      });
      setStatus("error");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setStatus("streaming");
    setSelectedReport({ id: 0, company_name: trimmed, created_at: new Date().toISOString() });
    setReportData(emptyReportData());
    setCompletedSections(new Set());

    try {
      const id = await streamResearch(trimmed, controller.signal, (event) => {
        if (event.type === "section" && event.status === "started") {
          setActiveSection(event.section);
        }
        if (event.type === "section" && event.status === "complete" && event.data !== null) {
          setActiveSection(event.section);
          setCompletedSections((current) => new Set(current).add(event.section));
          setReportData((current) => ({ ...current, [event.section]: event.data }));
        }
      });
      setStatus("complete");
      setActiveSection(null);
      await refreshHistory();
      if (id) {
        const saved = await fetchReport(id);
        setSelectedReport(saved);
        setReportData(saved.data);
        setCompletedSections(new Set(Object.keys(sectionLabels) as SectionName[]));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStatus("error");
      setActiveSection(null);
      setError(toDisplayError(err));
    }
  }

  async function loadHistoryItem(id: number) {
    abortRef.current?.abort();
    setError(null);
    try {
      setStatus("complete");
      const detail = await fetchReport(id);
      setSelectedReport(detail);
      setReportData(detail.data);
      setActiveSection(null);
      setCompletedSections(new Set(Object.keys(sectionLabels) as SectionName[]));
    } catch (err) {
      setStatus("error");
      setError(toDisplayError(err));
    }
  }

  async function removeHistoryItem(id: number) {
    try {
      await deleteReport(id);
      await refreshHistory();
      if (selectedReport?.id === id) {
        setSelectedReport(null);
        setReportData(emptyReportData());
        setStatus("idle");
        setActiveSection(null);
        setCompletedSections(new Set());
      }
    } catch (err) {
      setStatus("error");
      setError(toDisplayError(err));
    }
  }

  return (
    <div className="app-shell">
      <aside className="history-panel">
        <div className="history-heading">
          <h1>Briefings</h1>
          <span>{history.length}</span>
        </div>
        {history.length === 0 ? (
          <p className="muted">No saved reports yet. Research a company to build your first briefing.</p>
        ) : (
          <ul className="history-list">
            {history.map((item) => (
              <li key={item.id} className={selectedReport?.id === item.id ? "selected" : ""}>
                <button onClick={() => loadHistoryItem(item.id)}>
                  <strong>{item.company_name}</strong>
                  <span>{relativeTime(item.created_at)}</span>
                </button>
                <button className="icon-button" aria-label={`Delete ${item.company_name}`} onClick={() => removeHistoryItem(item.id)}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="workspace">
        <form className="search-bar" onSubmit={handleSubmit}>
          <Search size={20} />
          <input ref={inputRef} value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Research a company..." />
          {status === "streaming" && (
            <button type="button" className="secondary" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          )}
          <button type="submit" disabled={status === "streaming"}>
            Research
          </button>
        </form>

        {error && (
          <div className="error-banner">
            <XCircle size={18} />
            <div>
              <strong>{error.title}</strong>
              <ul>
                {error.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {!hasReportContent && status === "idle" ? (
          <section className="empty-state">
            <h2>Walk into the next call prepared.</h2>
            <p>Enter a company name to generate a concise sales briefing with leadership, news, financials, and risks.</p>
          </section>
        ) : (
          <ReportView
            companyName={selectedReport?.company_name || companyName}
            data={reportData}
            status={status}
            activeSection={activeSection}
            completedSections={completedSections}
          />
        )}
      </main>
    </div>
  );
}

function ReportView({
  companyName,
  data,
  status,
  activeSection,
  completedSections
}: {
  companyName: string;
  data: ReportData;
  status: StreamStatus;
  activeSection: SectionName | null;
  completedSections: Set<SectionName>;
}) {
  return (
    <section className="report">
      <div className="report-header">
        <div>
          <p className="eyebrow">Sales Briefing</p>
          <h2>{companyName}</h2>
        </div>
        {status === "streaming" && (
          <span className="streaming">
            <Loader2 size={16} /> {activeSection ? `Fetching ${sectionLabels[activeSection]}` : "Starting research"}
          </span>
        )}
      </div>

      {status === "streaming" && <Progress completed={completedSections.size} activeSection={activeSection} />}

      <Section name="overview" active={activeSection === "overview"} complete={completedSections.has("overview")}>
        {data.overview ? <p>{data.overview}</p> : <Skeleton label="Building overview" />}
      </Section>
      <Section name="key_people" active={activeSection === "key_people"} complete={completedSections.has("key_people")}>
        {data.key_people.length ? data.key_people.map((person) => <p key={`${person.name}-${person.title}`}><strong>{person.name}</strong> - {person.title}</p>) : <Skeleton label="Finding leadership" />}
      </Section>
      <Section name="news" active={activeSection === "news"} complete={completedSections.has("news")}>
        {data.news.length ? <BulletList items={data.news} /> : <Skeleton label="Checking current news" />}
      </Section>
      <Section name="financials" active={activeSection === "financials"} complete={completedSections.has("financials")}>
        {completedSections.has("financials") || status !== "streaming" ? (
          <div className="metrics">
            <Metric label="Revenue" value={data.financials.revenue} />
            <Metric label="Employees" value={data.financials.employee_count} />
            <Metric label="Market Cap" value={data.financials.market_cap} />
            <Metric label="YoY Growth" value={data.financials.yoy_growth} />
          </div>
        ) : (
          <Skeleton label="Looking up financial signals" />
        )}
      </Section>
      <Section name="risks" active={activeSection === "risks"} complete={completedSections.has("risks")}>
        {data.risks.length ? <BulletList items={data.risks} /> : <Skeleton label="Assessing risks" />}
      </Section>
    </section>
  );
}

function Progress({ completed, activeSection }: { completed: number; activeSection: SectionName | null }) {
  return (
    <div className="progress-panel" aria-live="polite">
      <div className="progress-track">
        <div style={{ width: `${(completed / 5) * 100}%` }} />
      </div>
      <div className="progress-label">
        <Clock size={15} />
        {activeSection ? `Please wait while we fetch ${sectionLabels[activeSection].toLowerCase()}.` : "Please wait while research starts."}
      </div>
    </div>
  );
}

function Section({ name, active, complete, children }: { name: SectionName; active: boolean; complete: boolean; children: ReactNode }) {
  return (
    <article className={`report-section ${active ? "active" : ""}`}>
      <h3>
        {sectionLabels[name]}
        {active && <Loader2 size={16} />}
        {complete && !active && <CheckCircle2 size={16} />}
      </h3>
      {children}
    </article>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="bullets">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Unavailable"}</strong>
    </div>
  );
}

function Skeleton({ label }: { label: string }) {
  return <p className="skeleton">{label}...</p>;
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function toDisplayError(err: unknown): AppError {
  if (typeof err === "object" && err !== null && "title" in err && "points" in err) {
    return err as AppError;
  }
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return {
      title: "Backend is unreachable",
      points: ["Make sure the FastAPI backend is running on port 8000.", "Restart the backend and try again."]
    };
  }
  return {
    title: "Something went wrong",
    points: ["The request could not be completed.", "Please try again in a moment."]
  };
}
