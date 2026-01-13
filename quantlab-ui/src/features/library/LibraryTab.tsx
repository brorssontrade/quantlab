import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { INDICATOR_LIBRARY, STRATEGY_LIBRARY, FUNDAMENTAL_METRIC_LIBRARY, normalizeMetricKey, METRIC_FACT_MAP } from "./libraryData";
import type { MetricLibraryItem } from "./libraryData";

type LibrarySection = "strategier" | "indikatorer";

export default function LibraryTab() {
  const [activeSection, setActiveSection] = useState<LibrarySection>("strategier");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [metricFilter, setMetricFilter] = useState("");
  const [metricKey, setMetricKey] = useState<string>(FUNDAMENTAL_METRIC_LIBRARY[0]?.key ?? "");

  const librarySearchTerm = libraryQuery.trim().toLowerCase();

  const libraryItems = useMemo(() => {
    const source = activeSection === "strategier" ? STRATEGY_LIBRARY : INDICATOR_LIBRARY;
    if (!librarySearchTerm) return source;
    return source.filter((item) => {
      const haystack = [
        item.name,
        item.summary,
        item.style,
        item.timeframe,
        ...(item.tags ?? []),
        ...(item.strengths ?? []),
        ...(item.watchouts ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(librarySearchTerm);
    });
  }, [activeSection, librarySearchTerm]);

  const selectedMetric: MetricLibraryItem | null = useMemo(() => {
    if (!metricKey) return null;
    const normalized = normalizeMetricKey(metricKey);
    return METRIC_FACT_MAP[normalized] ?? FUNDAMENTAL_METRIC_LIBRARY.find((metric) => metric.key === metricKey) ?? null;
  }, [metricKey]);

  const filteredMetricCards = useMemo(() => {
    const term = metricFilter.trim().toLowerCase();
    if (!term) return FUNDAMENTAL_METRIC_LIBRARY;
    return FUNDAMENTAL_METRIC_LIBRARY.filter((metric) => {
      const haystack = [metric.label, metric.description, metric.good, metric.whyItMatters, metric.caution ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [metricFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Strategi- & indikatorbibliotek</CardTitle>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2">
              <Button
                variant={activeSection === "strategier" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveSection("strategier")}
              >
                Strategier
              </Button>
              <Button
                variant={activeSection === "indikatorer" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveSection("indikatorer")}
              >
                Indikatorer
              </Button>
            </div>
            <div className="w-full md:w-72">
              <Label htmlFor="library-search" className="text-xs uppercase text-slate-500">
                Sök
              </Label>
              <Input
                id="library-search"
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Filtrera på namn, stil, taggar..."
                className="mt-1"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {libraryItems.length === 0 ? (
            <p className="text-sm text-slate-500">Inga poster matchade sökningen.</p>
          ) : (
            libraryItems.map((item) => (
              <div key={item.id} className="space-y-3 rounded border border-slate-200 bg-white/80 p-4 dark:border-slate-700/40 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-slate-800 dark:text-slate-100">{item.name}</div>
                    <div className="text-xs uppercase text-slate-500">
                      {item.style} • {item.timeframe}
                    </div>
                  </div>
                  <Badge variant="outline">{item.category === "strategi" ? "Strategi" : "Indikator"}</Badge>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{item.summary}</p>
                {item.defaults && item.defaults.length > 0 && (
                  <div className="text-xs text-slate-500">
                    <strong>Standardinställningar:</strong> {item.defaults.join(" • ")}
                  </div>
                )}
                {item.strengths && item.strengths.length > 0 && (
                  <div>
                    <div className="text-xs uppercase text-emerald-600 dark:text-emerald-300">Styrkor</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
                      {item.strengths.map((text, index) => (
                        <li key={`strength-${item.id}-${index}`}>{text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.watchouts && item.watchouts.length > 0 && (
                  <div>
                    <div className="text-xs uppercase text-rose-600 dark:text-rose-300">Att bevaka</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
                      {item.watchouts.map((text, index) => (
                        <li key={`watchout-${item.id}-${index}`}>{text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    {item.tags.map((tag) => (
                      <Badge key={`${item.id}-${tag}`} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Fundamentala mätvärden</CardTitle>
          <p className="text-sm text-slate-500">Välj ett nyckeltal för att se vad det betyder och vilka nivåer som anses starka.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="metric-select">Välj mätvärde</Label>
              <select
                id="metric-select"
                className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
                value={metricKey}
                onChange={(event) => setMetricKey(event.target.value)}
              >
                {FUNDAMENTAL_METRIC_LIBRARY.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="metric-search">Filtrera topp 10</Label>
              <Input
                id="metric-search"
                placeholder="Sök inom beskrivning..."
                value={metricFilter}
                onChange={(event) => setMetricFilter(event.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          {selectedMetric ? (
            <div className="space-y-3 rounded border border-slate-200 bg-white/80 p-4 dark:border-slate-700/40 dark:bg-slate-800/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{selectedMetric.label}</div>
                  <div className="text-xs uppercase text-slate-500">{selectedMetric.key}</div>
                </div>
                <Badge variant="outline">Kvalitetsprofil</Badge>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{selectedMetric.description}</p>
              <div className="rounded bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200">
                <div className="font-semibold">Varför det spelar roll</div>
                <p className="mt-1">{selectedMetric.whyItMatters}</p>
              </div>
              <div className="rounded bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-900/30 dark:text-slate-200">
                <div className="font-semibold">Bra nivåer</div>
                <p className="mt-1">{selectedMetric.good}</p>
              </div>
              {selectedMetric.caution && (
                <div className="rounded bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                  <div className="font-semibold">Att tänka på</div>
                  <p className="mt-1">{selectedMetric.caution}</p>
                </div>
              )}
              {selectedMetric.formula && (
                <div className="rounded bg-slate-100 p-3 text-xs font-mono text-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                  {selectedMetric.formula}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Välj ett mätvärde ovan för att se detaljer.</p>
          )}

          <div>
            <Label className="text-xs uppercase text-slate-500">Snabb översikt</Label>
            {filteredMetricCards.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">Inga mätvärden matchade filtret.</p>
            ) : (
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {filteredMetricCards.map((metric) => (
                  <div key={`metric-card-${metric.key}`} className="space-y-1 rounded border border-slate-200 p-3 text-xs dark:border-slate-700/40">
                    <div className="font-semibold text-slate-700 dark:text-slate-100">{metric.label}</div>
                    <p className="text-slate-500 dark:text-slate-300">{metric.good}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
