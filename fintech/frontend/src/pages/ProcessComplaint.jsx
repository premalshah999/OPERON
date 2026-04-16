import { useEffect, useRef, useState } from "react";
import AgentPipeline from "../components/AgentPipeline";
import RiskGauge from "../components/RiskGauge";
import {
  getApiBaseUrl,
  getSampleComplaints,
  submitComplaint,
} from "../lib/api";

const initialForm = {
  narrative: "",
  product: "",
  channel: "web",
  customer_state: "",
  tags: [],
};

const resolutionTabs = [
  { id: "action_plan", label: "Action Plan" },
  { id: "customer_response", label: "Customer Response" },
  { id: "preventive_recommendations", label: "Prevention" },
];

function normalizeTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function ProcessComplaint() {
  const [samples, setSamples] = useState([]);
  const [selectedSample, setSelectedSample] = useState("");
  const [formState, setFormState] = useState(initialForm);
  const [events, setEvents] = useState([]);
  const [result, setResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("action_plan");
  const [submitting, setSubmitting] = useState(false);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSamples() {
      try {
        const payload = await getSampleComplaints();
        if (!cancelled) {
          setSamples(payload.samples ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    loadSamples();
    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
    };
  }, []);

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
  }

  function applySample(sampleId) {
    setSelectedSample(sampleId);
    const sample = samples.find((item) => item.id === sampleId);
    if (!sample) {
      setFormState(initialForm);
      return;
    }
    setFormState({
      narrative: sample.narrative,
      product: sample.product ?? "",
      channel: sample.channel ?? "web",
      customer_state: sample.customer_state ?? "",
      tags: sample.tags ?? [],
    });
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formState.narrative.trim()) {
      setError("Complaint narrative is required.");
      return;
    }

    eventSourceRef.current?.close();
    setEvents([]);
    setResult(null);
    setStatusMessage("Submitting complaint for analysis...");
    setError("");
    setSubmitting(true);

    try {
      const payload = await submitComplaint({
        narrative: formState.narrative,
        product: formState.product || null,
        channel: formState.channel,
        customer_state: formState.customer_state || null,
        tags: formState.tags,
      });

      setStatusMessage(`Complaint ${payload.complaint_id} submitted. Streaming agent progress...`);

      const eventSource = new EventSource(
        `${getApiBaseUrl()}/api/complaints/analyze/${payload.complaint_id}/stream`,
      );
      eventSourceRef.current = eventSource;
      let streamFinished = false;

      eventSource.addEventListener("agent_update", (streamEvent) => {
        const parsed = JSON.parse(streamEvent.data);
        setEvents((current) => [...current, parsed]);
        setStatusMessage(parsed.message ?? "Agent update received.");
      });

      eventSource.addEventListener("analysis_complete", (streamEvent) => {
        const parsed = JSON.parse(streamEvent.data);
        setResult(parsed);
        setStatusMessage("Analysis complete.");
        setSubmitting(false);
        streamFinished = true;
        eventSource.close();
      });

      eventSource.addEventListener("timeout", () => {
        setError("The streaming request timed out before the pipeline finished.");
        setSubmitting(false);
        streamFinished = true;
        eventSource.close();
      });

      eventSource.onerror = () => {
        if (streamFinished) {
          return;
        }
        setError("The SSE stream disconnected. Check that the backend is running.");
        setSubmitting(false);
        streamFinished = true;
        eventSource.close();
      };
    } catch (submitError) {
      setError(submitError.message);
      setStatusMessage("");
      setSubmitting(false);
    }
  }

  const classification = result?.classification;
  const compliance = result?.compliance_risk;
  const routing = result?.routing;
  const resolution = result?.resolution;
  const qa = result?.qa_validation;

  return (
    <div className="process-layout">
      <section className="panel process-layout__input">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Input</p>
            <h2>Submit a complaint narrative</h2>
          </div>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Load a sample complaint</span>
            <select
              value={selectedSample}
              onChange={(event) => applySample(event.target.value)}
            >
              <option value="">Choose a curated CFPB-style sample</option>
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.id} · {sample.product}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Narrative</span>
            <textarea
              name="narrative"
              value={formState.narrative}
              onChange={handleFieldChange}
              rows={12}
              placeholder="Describe the consumer complaint..."
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Product</span>
              <input
                name="product"
                value={formState.product}
                onChange={handleFieldChange}
                placeholder="Optional pre-labeled product"
              />
            </label>
            <label className="field">
              <span>Channel</span>
              <select
                name="channel"
                value={formState.channel}
                onChange={handleFieldChange}
              >
                <option value="web">Web</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="cfpb">CFPB</option>
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Customer state</span>
              <input
                name="customer_state"
                value={formState.customer_state}
                onChange={handleFieldChange}
                placeholder="CA"
              />
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                value={formState.tags.join(", ")}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    tags: normalizeTags(event.target.value),
                  }))
                }
                placeholder="Older American, Servicemember"
              />
            </label>
          </div>

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Processing..." : "Analyze Complaint"}
          </button>
          {statusMessage ? <p className="helper-text">{statusMessage}</p> : null}
          {error ? <p className="helper-text helper-text--error">{error}</p> : null}
        </form>
      </section>

      <section className="panel process-layout__pipeline">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Pipeline</p>
            <h2>Specialist agent progress</h2>
          </div>
        </div>
        <AgentPipeline events={events} />
      </section>

      <section className="panel process-layout__results">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Results</p>
            <h2>Resolution package</h2>
          </div>
        </div>

        {result ? (
          <div className="result-stack">
            <div className="result-hero">
              <div>
                <p className="pill">{classification?.product ?? "Unknown product"}</p>
                <h3>{classification?.issue ?? "Issue unavailable"}</h3>
                <p>{classification?.reasoning}</p>
              </div>
              <RiskGauge score={compliance?.risk_score ?? 0} />
            </div>

            <div className="result-grid">
              <article className="mini-panel">
                <p className="section-kicker">Routing</p>
                <h4>{routing?.assigned_team ?? "Pending"}</h4>
                <p>{routing?.priority ?? "Unknown priority"}</p>
                <small>{routing?.reasoning}</small>
              </article>
              <article className="mini-panel">
                <p className="section-kicker">QA score</p>
                <h4>
                  {typeof qa?.overall_score === "number"
                    ? `${Math.round(qa.overall_score * 100)}%`
                    : "N/A"}
                </h4>
                <p>{qa?.passed ? "Passed" : "Needs review"}</p>
                <small>{qa?.reasoning}</small>
              </article>
            </div>

            <div className="tab-strip">
              {resolutionTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? "tab-strip__button is-active" : "tab-strip__button"}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "action_plan" ? (
              <ol className="result-list">
                {(resolution?.action_plan ?? []).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}

            {activeTab === "customer_response" ? (
              <article className="response-card">
                <pre>{resolution?.customer_response ?? "No response generated."}</pre>
              </article>
            ) : null}

            {activeTab === "preventive_recommendations" ? (
              <ul className="result-list result-list--plain">
                {(resolution?.preventive_recommendations ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="empty-state">
            Run a complaint through the pipeline to see classification, compliance, routing, resolution, and QA output here.
          </p>
        )}
      </section>
    </div>
  );
}
