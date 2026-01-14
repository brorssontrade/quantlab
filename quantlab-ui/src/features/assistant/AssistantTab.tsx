import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type IncludeKey = "report" | "signals" | "journal" | "fundamentals" | "chart";

interface AssistantTabProps {
  apiBase: string;
  lastRunId?: number | null;
  lastSymbol?: string | null;
}

interface AssistantHealth {
  mode: "local" | "remote" | "none";
  host?: string | null;
  url?: string | null;
  model?: string | null;
  ok: boolean;
  details: string;
}

const QUICK_ACTIONS: Array<{
  label: string;
  question: string;
  include: IncludeKey[];
  chartBar?: string;
}> = [
  {
    label: "Daily wrap-up",
    question: "Ge mig en kort dagsrapport och avsluta med BUY/WATCH/SELL.",
    include: ["report", "signals", "journal"],
  },
  {
    label: "Signals snapshot",
    question: "Vilka toppsignaler har vi just nu? Summera i tre punkter.",
    include: ["signals"],
  },
  {
    label: "Fundamental check",
    question: "Summera fundamenta och risker för symbolen.",
    include: ["fundamentals", "chart"],
    chartBar: "D",
  },
];

const LOCAL_HELP = `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:11434/api/pull -ContentType "application/json" -Body '{"name":"llama3.1:8b"}'
$env:OLLAMA_HOST = "http://127.0.0.1:11434"
$env:LLM_MODEL   = "llama3.1:8b"
python -m uvicorn app.main:app --reload`;

const REMOTE_HELP = `$env:LLM_API_URL = "https://ollama.com/api/chat"
$env:LLM_API_KEY = "<din_api_nyckel>"
$env:LLM_MODEL   = "gpt-oss:120b"
python -m uvicorn app.main:app --reload`;

export default function AssistantTab({ apiBase, lastRunId, lastSymbol }: AssistantTabProps) {
  const [question, setQuestion] = useState<string>(
    "Give me a concise daily wrap-up with a BUY/WATCH/SELL recommendation.",
  );
  const [includeSources, setIncludeSources] = useState<Record<IncludeKey, boolean>>({
    report: true,
    signals: true,
    journal: true,
    fundamentals: true,
    chart: false,
  });
  const [runIdInput, setRunIdInput] = useState<string>(lastRunId ? String(lastRunId) : "");
  const [symbol, setSymbol] = useState<string>(lastSymbol ?? "");
  const [chartBar, setChartBar] = useState<string>("D");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [health, setHealth] = useState<AssistantHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(false);
  const [pulling, setPulling] = useState<boolean>(false);

  const selectedInclude = useMemo(() => {
    const entries: IncludeKey[] = [];
    for (const [key, value] of Object.entries(includeSources) as Array<[IncludeKey, boolean]>) {
      if (value) entries.push(key);
    }
    return entries;
  }, [includeSources]);

  const runId = useMemo(() => {
    if (!runIdInput) return undefined;
    const parsed = Number(runIdInput);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [runIdInput]);

  const handleQuickAction = (action: typeof QUICK_ACTIONS[number]) => {
    setQuestion(action.question);
    const update: Record<IncludeKey, boolean> = {
      report: false,
      signals: false,
      journal: false,
      fundamentals: false,
      chart: false,
    };
    action.include.forEach((key) => {
      update[key] = true;
    });
    setIncludeSources(update);
    if (action.chartBar) {
      setChartBar(action.chartBar);
    }
  };

  const toggleInclude = (key: IncludeKey) => {
    setIncludeSources((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const diagnosticsJson = useMemo(
    () => JSON.stringify(health ?? { mode: "none", ok: false, details: "No diagnostics yet." }, null, 2),
    [health],
  );

  const copyDiagnostics = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsJson);
      toast.success("Diagnostics copied to clipboard.");
    } catch (error) {
      toast.error(`Failed to copy diagnostics: ${error instanceof Error ? error.message : error}`);
    }
  }, [diagnosticsJson]);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/assistant/health`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as AssistantHealth;
      setHealth(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to fetch assistant health: ${message}`);
      setHealth({
        mode: "none",
        ok: false,
        details: message,
      });
    } finally {
      setHealthLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  const pullModel = useCallback(async () => {
    if (health?.mode !== "local") {
      toast.info("Model pull is only available in local Ollama mode.");
      return;
    }
    setPulling(true);
    try {
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/assistant/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: health.model }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      toast.success("Model pull started. This can take a few minutes on first download.");
      await refreshHealth();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to pull model: ${message}`);
    } finally {
      setPulling(false);
    }
  }, [apiBase, health, refreshHealth]);

  const askAssistant = async () => {
    if (!question.trim()) {
      toast.error("Question cannot be empty.");
      return;
    }
    if (selectedInclude.includes("report") && !runId) {
      toast.error("Run ID is required when including report data.");
      return;
    }
    if ((selectedInclude.includes("fundamentals") || selectedInclude.includes("chart")) && !symbol.trim()) {
      toast.error("Symbol is required for fundamentals/chart.");
      return;
    }

    const payload: Record<string, unknown> = {
      question: question.trim(),
      include: selectedInclude,
      chart_bar: chartBar,
    };
    if (runId) payload.run_id = runId;
    if (symbol.trim()) payload.symbol = symbol.trim();

    setLoading(true);
    try {
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/assistant/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      if (!data.ok) {
        toast.error(data.error || "Assistant did not return a response.");
        setAnswer("");
      } else {
        setAnswer(typeof data.answer === "string" ? data.answer : JSON.stringify(data.answer, null, 2));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      setAnswer("");
      await refreshHealth();
    } finally {
      setLoading(false);
      await refreshHealth();
    }
  };

  const healthBadge = useMemo(() => {
    if (!health) return { text: "Checking…", variant: "outline" as const };
    if (!health.ok) return { text: "Not configured", variant: "destructive" as const };
    if (health.mode === "local") return { text: "Local model ready", variant: "default" as const };
    if (health.mode === "remote") return { text: "Remote model ready", variant: "secondary" as const };
    return { text: "Not configured", variant: "destructive" as const };
  }, [health]);

  const showHelpCard = !health?.ok;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Assistant</CardTitle>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={healthBadge.variant}>{healthBadge.text}</Badge>
              <span className="text-xs text-slate-500">
                {healthLoading ? "Checking assistant health…" : health?.details || "No diagnostics yet."}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={refreshHealth} disabled={healthLoading}>
                {healthLoading ? "Refreshing…" : "Refresh health"}
              </Button>
              {health?.mode === "local" && (
                <Button variant="outline" size="sm" onClick={pullModel} disabled={pulling}>
                  {pulling ? "Pulling…" : "Pull local model"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={copyDiagnostics}>
                Copy diagnostics
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button key={action.label} variant="outline" size="sm" onClick={() => handleQuickAction(action)}>
                {action.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showHelpCard && (
            <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-100">
              <div className="font-semibold">Assistant not ready</div>
              <p>
                Configure either a local Ollama instance or a remote LLM endpoint. Use the commands below as a starting
                point.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-200">Local model</div>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-900 p-2 text-xs text-slate-100">{LOCAL_HELP}</pre>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-200">Remote API</div>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-900 p-2 text-xs text-slate-100">{REMOTE_HELP}</pre>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <Label htmlFor="assistant-question">Question</Label>
              <textarea
                id="assistant-question"
                className="mt-1 w-full min-h-[80px] resize-vertical rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="assistant-run-id">Run ID (report)</Label>
              <Input
                id="assistant-run-id"
                type="number"
                inputMode="numeric"
                value={runIdInput}
                onChange={(event) => setRunIdInput(event.target.value)}
                placeholder="Latest run"
              />
            </div>
            <div>
              <Label htmlFor="assistant-symbol">Symbol (fundamentals/chart)</Label>
              <Input
                id="assistant-symbol"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="ABB.ST"
              />
            </div>
            <div>
              <Label htmlFor="assistant-chart">Chart bar size</Label>
              <select
                id="assistant-chart"
                className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                value={chartBar}
                onChange={(event) => setChartBar(event.target.value)}
              >
                <option value="D">Daily</option>
                <option value="W">Weekly</option>
                <option value="M">Monthly</option>
                <option value="4h">4h</option>
                <option value="1h">1h</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            {(["report", "signals", "journal", "fundamentals", "chart"] as IncludeKey[]).map((key) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeSources[key]}
                  onChange={() => toggleInclude(key)}
                  className="h-4 w-4"
                />
                <span className="capitalize">{key}</span>
              </label>
            ))}
          </div>

          <Button onClick={askAssistant} disabled={loading}>
            {loading ? "Generating…" : "Ask assistant"}
          </Button>

          <div>
            <Label>Answer</Label>
            <pre className="mt-1 max-h-[400px] overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              {answer || "—"}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

