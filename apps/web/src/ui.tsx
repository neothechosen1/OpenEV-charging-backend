import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Zap, X } from "lucide-react";
import QRCode from "qrcode";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-11";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-raised px-4 py-2.5 text-sm font-medium text-ink hover:bg-sunken disabled:opacity-50 transition-colors min-h-11";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-danger/30 bg-raised px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-50 transition-colors min-h-11";

type Tone = "ok" | "warn" | "danger" | "neutral" | "info";
const toneClasses: Record<Tone, string> = {
  ok: "bg-success/10 text-success",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-sunken text-muted",
  info: "bg-primary-soft text-primary",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export const sessionTone: Record<string, Tone> = {
  charging: "ok",
  completed: "neutral",
  authorized: "info",
  stopping: "warn",
  pending_payment: "warn",
  failed: "danger",
  expired: "neutral",
};

export const sessionLabel: Record<string, string> = {
  charging: "Charging",
  completed: "Completed",
  authorized: "Starting",
  stopping: "Stopping",
  pending_payment: "Awaiting payment",
  failed: "Failed",
  expired: "Canceled",
};

export function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={cx(
        "inline-block size-2 rounded-full",
        on ? "bg-success" : "bg-line-strong",
      )}
    />
  );
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx("rounded-xl border border-line bg-raised shadow-sm", className)}
    >
      {title && (
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-raised p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-subtle">
        {label}
      </div>
      <div className="tnum mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-raised">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-white">
              <Zap size={15} strokeWidth={2.5} />
            </span>
            <span className="font-display text-xl">OpenEV</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/" className="rounded-lg px-3 py-2 text-muted hover:bg-sunken hover:text-ink">
              Stations
            </Link>
            <Link
              to="/admin"
              className="rounded-lg px-3 py-2 text-muted hover:bg-sunken hover:text-ink"
            >
              Dashboard
            </Link>
            <Link
              to="/tools"
              className="rounded-lg px-3 py-2 text-muted hover:bg-sunken hover:text-ink"
            >
              Agent tools
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-sunken", className)} />;
}

export function QrModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2 }).then(setDataUrl);
  }, [url]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-raised p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-sunken" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Print this code and stick it on the charger. Drivers scan it to pay and start.
        </p>
        {dataUrl ? (
          <img src={dataUrl} alt="Charger QR code" className="mx-auto mt-3 w-64 rounded-lg border border-line" />
        ) : (
          <Skeleton className="mx-auto mt-3 h-64 w-64" />
        )}
        <div className="mt-3 flex gap-2">
          <button
            className={cx(btnGhost, "flex-1 text-xs")}
            onClick={() => {
              void navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a className={cx(btnGhost, "flex-1 text-xs")} href={url} target="_blank" rel="noreferrer">
            Open page
          </a>
        </div>
      </div>
    </div>
  );
}
