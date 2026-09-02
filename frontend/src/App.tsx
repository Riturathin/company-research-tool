import { CheckCircle2, Clock, Loader2, Search, Trash2, XCircle } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AppError, deleteReport, emptyReportData, fetchReport, fetchReports, retryReportSection, streamResearch } from "./api";
import type { ReportData, ReportDetail, ReportSummary, SectionName, StreamStatus } from "./types";

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
  const [retryingSections, setRetryingSections] = useState<Set<SectionName>>(new Set());
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
      setRetryingSections(new Set());

    try {
      const id = await streamResearch(trimmed, controller.signal, (event) => {
        if (event.type === "report") {
          setSelectedReport((current) => ({ id: event.reportId, company_name: current?.company_name || trimmed, created_at: current?.created_at || new Date().toISOString() }));
          setHistory((current) => [
            { id: event.reportId, company_name: trimmed, created_at: new Date().toISOString() },
            ...current.filter((item) => item.id !== event.reportId)
          ]);
        }
        if (event.type === "section" && event.status === "started") {
          setActiveSection(event.section);
        }
        if (event.type === "section" && event.status === "complete" && event.data !== null) {
          setActiveSection(event.section);
          setCompletedSections((current) => new Set(current).add(event.section));
          setReportData((current) => {
            const sectionErrors = { ...current.section_errors };
            if (event.message) {
              sectionErrors[event.section] = event.message;
            } else {
              delete sectionErrors[event.section];
            }
            return { ...current, [event.section]: event.data, section_errors: sectionErrors };
          });
        }
      });
      setStatus("complete");
      setActiveSection(null);
      if (id) {
        const saved = await fetchReport(id);
        setSelectedReport(saved);
        setReportData(saved.data);
        setCompletedSections(completedFromReport(saved.data));
        setHistory((current) => [
          { id: saved.id, company_name: saved.company_name, created_at: saved.created_at },
          ...current.filter((item) => item.id !== saved.id)
        ]);
      }
      await refreshHistory();
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
      setCompanyName(detail.company_name);
      setSelectedReport(detail);
      setReportData(detail.data);
      setActiveSection(null);
      setCompletedSections(completedFromReport(detail.data));
      retryFailedSections(detail);
    } catch (err) {
      setStatus("error");
      setError(toDisplayError(err));
    }
  }

  async function retryFailedSections(report: ReportDetail) {
    const sections = Object.keys(report.data.section_errors) as SectionName[];
    await Promise.all(
      sections.map(async (section) => {
        setRetryingSections((current) => new Set(current).add(section));
        try {
          const updated = await retryReportSection(report.id, section);
          setReportData(updated.data);
          setCompletedSections(completedFromReport(updated.data));
        } catch (err) {
          setError(toDisplayError(err));
        } finally {
          setRetryingSections((current) => {
            const next = new Set(current);
            next.delete(section);
            return next;
          });
        }
      })
    );
  }

  async function removeHistoryItem(id: number) {
    try {
      await deleteReport(id);
      await refreshHistory();
      if (selectedReport?.id === id) {
        setSelectedReport(null);
        setReportData(emptyReportData());
        setCompanyName("");
        setStatus("idle");
        setActiveSection(null);
        setCompletedSections(new Set());
        setRetryingSections(new Set());
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
            <p>
              <strong>{error.title}:</strong> {formatError(error)}
            </p>
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
            retryingSections={retryingSections}
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
  completedSections,
  retryingSections
}: {
  companyName: string;
  data: ReportData;
  status: StreamStatus;
  activeSection: SectionName | null;
  completedSections: Set<SectionName>;
  retryingSections: Set<SectionName>;
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

      <Section name="overview" active={activeSection === "overview" || retryingSections.has("overview")} complete={completedSections.has("overview")} error={data.section_errors.overview}>
        {data.overview ? <p>{data.overview}</p> : <Skeleton label="Building overview" />}
      </Section>
      <Section name="key_people" active={activeSection === "key_people" || retryingSections.has("key_people")} complete={completedSections.has("key_people")} error={data.section_errors.key_people}>
        {data.key_people.length ? data.key_people.map((person) => <p key={`${person.name}-${person.title}`}><strong>{person.name}</strong> - {person.title}</p>) : <Skeleton label="Finding leadership" />}
      </Section>
      <Section name="news" active={activeSection === "news" || retryingSections.has("news")} complete={completedSections.has("news")} error={data.section_errors.news}>
        {data.news.length ? <BulletList items={data.news} /> : <Skeleton label="Checking current news" />}
      </Section>
      <Section name="financials" active={activeSection === "financials" || retryingSections.has("financials")} complete={completedSections.has("financials")} error={data.section_errors.financials}>
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
      <Section name="risks" active={activeSection === "risks" || retryingSections.has("risks")} complete={completedSections.has("risks")} error={data.section_errors.risks}>
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

function Section({ name, active, complete, error, children }: { name: SectionName; active: boolean; complete: boolean; error?: string; children: ReactNode }) {
  const stateClass = active ? "active" : error ? "failed" : complete ? "complete" : "pending";
  return (
    <article className={`report-section ${stateClass}`}>
      <h3>
        {sectionLabels[name]}
        {active && <Loader2 size={16} />}
        {complete && !active && <CheckCircle2 size={16} />}
      </h3>
      {error && <p className="section-error">{error}</p>}
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

function formatError(error: AppError) {
  return error.points.join(" ");
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

function completedFromReport(data: ReportData) {
  return new Set((Object.keys(sectionLabels) as SectionName[]).filter((section) => !data.section_errors[section]));
}
