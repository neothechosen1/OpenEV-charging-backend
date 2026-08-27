import { useMemo, useState } from "react";
import { Bot, Play } from "lucide-react";
import { convexClient } from "../lib/client";
import { buildTools, webMcpActive } from "../webmcp";
import { Badge, Card, Shell, btnGhost } from "../ui";

// Playground for the site's agent-facing tools: shows what an AI agent sees,
// and lets a human invoke each tool directly to verify behavior.
export default function Tools() {
  const tools = useMemo(() => buildTools(convexClient), []);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string) => {
    const tool = tools.find((t) => t.name === name)!;
    setBusy(name);
    try {
      let input: unknown = {};
      const raw = args[name]?.trim();
      if (raw) input = JSON.parse(raw);
      const result = await tool.execute(input as never);
      setResults((r) => ({ ...r, [name]: result.content[0]?.text ?? "" }));
    } catch (err) {
      setResults((r) => ({ ...r, [name]: `Error: ${String(err)}` }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Bot size={20} className="text-primary" />
              Agent tools
            </h1>
            <p className="mt-1 text-sm text-muted">
              This site exposes its actions as WebMCP tools, so an in-browser AI
              agent can find a charger, start charging, and get the receipt.
              Try them by hand below.
            </p>
          </div>
          <Badge tone={webMcpActive() ? "ok" : "neutral"}>
            {webMcpActive()
              ? "Registered with this browser's agent"
              : "No agent detected in this browser"}
          </Badge>
        </div>

        <div className="mt-6 space-y-4">
          {tools.map((tool) => (
            <Card key={tool.name}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <code className="font-mono text-sm font-semibold text-primary">
                    {tool.name}
                  </code>
                  <p className="mt-1 text-sm text-muted">{tool.description}</p>
                </div>
                <button
                  className={`${btnGhost} px-3 py-2 text-xs`}
                  disabled={busy !== null}
                  onClick={() => void run(tool.name)}
                >
                  <Play size={13} />
                  {busy === tool.name ? "Running…" : "Run"}
                </button>
              </div>
              <label className="mt-3 block">
                <span className="text-xs font-medium text-subtle">
                  Arguments (JSON)
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="{}"
                  value={args[tool.name] ?? ""}
                  onChange={(e) =>
                    setArgs((a) => ({ ...a, [tool.name]: e.target.value }))
                  }
                />
              </label>
              {results[tool.name] && (
                <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-sunken p-3 text-xs">
                  {results[tool.name]}
                </pre>
              )}
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}
