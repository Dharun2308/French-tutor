"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type GoogleConnectionState = "connected" | "needs-reconnect" | "unavailable";
type ClientType = "desktop" | "web";
type Status = {
  connection: GoogleConnectionState;
  clientType: ClientType | null;
  redirectUri?: string;
  lastImport: { result: "success" | "failed" | "running" | "never" | "unknown"; at: string | null };
};
type Connection = { authorizationUrl: string; clientType: ClientType; redirectUri?: string };
type Props = {
  onConnected?: () => void;
  onConnectionChange?: (connection: GoogleConnectionState) => void;
};

const PENDING_KEY = "french-google-reconnect-pending";
const CHANNEL = "french-google-reconnected";
const MAX_AGE = 10 * 60 * 1000;

// Only the start time is persisted. The pasted address stays in this form.
function rememberPending(started: number | null) {
  try {
    if (started === null) sessionStorage.removeItem(PENDING_KEY);
    else sessionStorage.setItem(PENDING_KEY, String(started));
  } catch { /* Private browsing can disable storage. */ }
}

function importLabel(result: Status["lastImport"]["result"]) {
  return {
    success: "Last import succeeded",
    failed: "Last import failed",
    running: "Import running",
    never: "No import yet",
    unknown: "Last import unavailable",
  }[result];
}

export function GoogleConnection({ onConnected, onConnectionChange }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [flow, setFlow] = useState<Connection | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<"starting" | "connecting" | null>(null);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState(false);
  const [copied, setCopied] = useState(false);
  const callbacks = useRef({ onConnected, onConnectionChange });
  callbacks.current = { onConnected, onConnectionChange };
  const channel = useRef<BroadcastChannel | null>(null);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const addressId = useId();
  const instructionId = useId();
  const clientType = flow?.clientType ?? status?.clientType;
  const redirectUri = flow?.redirectUri ?? status?.redirectUri;

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/google/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Status unavailable");
      const value: Status = await response.json();
      if (!mounted.current) return;
      setStatus(value);
      callbacks.current.onConnectionChange?.(value.connection);
    } catch {
      if (!mounted.current) return;
      setStatus(previous => ({
        connection: "unavailable",
        clientType: previous?.clientType ?? null,
        lastImport: previous?.lastImport ?? { result: "unknown", at: null },
      }));
      callbacks.current.onConnectionChange?.("unavailable");
    }
  }, []);

  const connected = useCallback((broadcast = true) => {
    rememberPending(null);
    setPending(null);
    setFlow(null);
    setAddress("");
    setError("");
    setFallback(false);
    setStatus(previous => previous ? { ...previous, connection: "connected" } : previous);
    callbacks.current.onConnectionChange?.("connected");
    callbacks.current.onConnected?.();
    if (broadcast) channel.current?.postMessage("connected");
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    mounted.current = true;
    try {
      const started = Number(sessionStorage.getItem(PENDING_KEY));
      if (started > 0 && started <= Date.now() && Date.now() - started < MAX_AGE) setPending(started);
      else rememberPending(null);
    } catch { /* The flow still works without persistence. */ }
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(CHANNEL);
      channel.current.onmessage = event => {
        if (event.data === "connected") connected(false);
      };
    }
    const url = new URL(window.location.href);
    const callback = url.searchParams.get("google");
    if (callback === "connected" || callback === "failed") {
      url.searchParams.delete("google");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      if (callback === "connected") connected();
      else {
        rememberPending(null);
        setPending(null);
        setError("Google was not reconnected. Please try again.");
        void loadStatus();
      }
    } else void loadStatus();
    return () => {
      mounted.current = false;
      channel.current?.close();
      channel.current = null;
    };
  }, [connected, loadStatus]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      rememberPending(null);
      setPending(null);
      setFlow(null);
      setAddress("");
      setFallback(false);
      setError("This request expired. Reconnect Google to try again.");
    }, Math.max(0, pending + MAX_AGE - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pending]);

  async function start() {
    if (busyRef.current) return;
    busyRef.current = true;
    // Open during the tap, before awaiting fetch, so Safari allows the tab.
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setBusy("starting");
    setError("");
    setAddress("");
    setPending(null);
    setFlow(null);
    rememberPending(null);
    setFallback(false);
    setCopied(false);
    try {
      const response = await fetch("/api/google/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Could not open Google. Please try again.");
      const next: Connection = value;
      const started = Date.now();
      rememberPending(started);
      setPending(started);
      setFlow(next);
      try {
        if (!popup || popup.closed) setFallback(true);
        else popup.location.replace(next.authorizationUrl);
      } catch { setFallback(true); }
    } catch (cause) {
      popup?.close();
      setError(cause instanceof Error ? cause.message : "Could not open Google. Please try again.");
    } finally {
      setBusy(null);
      busyRef.current = false;
    }
  }

  async function finish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !address.trim()) return;
    busyRef.current = true;
    setBusy("connecting");
    setError("");
    const submitted = address.trim();
    setAddress("");
    try {
      const response = await fetch("/api/google/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: submitted }),
      });
      const value = await response.json();
      if (!response.ok || value.connected !== true) {
        throw new Error(value.error || "Google was not reconnected. Please try again.");
      }
      connected();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google was not reconnected. Please try again.");
    } finally {
      setBusy(null);
      busyRef.current = false;
    }
  }

  function cancel() {
    rememberPending(null);
    setPending(null);
    setFlow(null);
    setAddress("");
    setFallback(false);
    setError("");
  }

  async function copyRedirect() {
    if (!redirectUri) return;
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
    } catch {
      setError("Select and copy the redirect URI below.");
    }
  }

  const connectionLabel = !status ? "Checking connection…" : {
    connected: "Connected",
    "needs-reconnect": "Reconnect needed",
    unavailable: "Connection unavailable",
  }[status.connection];
  const color = status?.connection === "connected" ? "bg-emerald-500"
    : status?.connection === "needs-reconnect" ? "bg-amber-500" : "bg-muted-foreground/50";
  const importedAt = status?.lastImport.at ? new Date(status.lastImport.at) : null;
  const validDate = importedAt && !Number.isNaN(importedAt.getTime()) ? importedAt : null;

  return <section aria-label="Google connection" className="mb-5 border-b pb-5">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-medium">Google</h2>
        <p role="status" className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
          {connectionLabel}
        </p>
      </div>
      <Button type="button" variant="outline" className="shrink-0" disabled={Boolean(busy)} onClick={start}>
        {busy === "starting" && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
        Reconnect Google
      </Button>
    </div>
    {status && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
      {importLabel(status.lastImport.result)}
      {validDate && <> · <time dateTime={status.lastImport.at!}>{validDate.toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })}</time></>}
    </p>}
    {pending && <div className="mt-4 rounded-lg border bg-muted/30 p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p id={instructionId} className="text-sm leading-relaxed">
          {clientType === "desktop"
            ? "After approving in Google, copy the address from the tab that cannot load."
            : "Finish connecting in the Google tab."}
        </p>
        <Button type="button" variant="ghost" size="icon" aria-label="Cancel reconnect" className="-mr-1 -mt-1 h-8 w-8 shrink-0" disabled={Boolean(busy)} onClick={cancel}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      {fallback && flow && <Button asChild variant="outline" className="mb-3">
        <a href={flow.authorizationUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          Open Google <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      </Button>}
      {clientType === "desktop" && <form onSubmit={finish}>
        <label htmlFor={addressId} className="mb-1.5 block text-sm font-medium">Paste the full address</label>
        <input id={addressId} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
          aria-describedby={instructionId} value={address} onChange={event => setAddress(event.target.value)}
          placeholder="http://127.0.0.1:8767/…" disabled={Boolean(busy)} maxLength={12000}
          className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
        <Button type="submit" className="mt-3 w-full sm:w-auto" disabled={Boolean(busy) || !address.trim()}>
          {busy === "connecting" && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {busy === "connecting" ? "Connecting…" : "Connect"}
        </Button>
      </form>}
      {clientType === "web" && redirectUri && <div className="mt-3 border-t pt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Redirect URI</span>
          <Button type="button" size="sm" variant="ghost" onClick={copyRedirect}>
            {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <code className="block select-all break-all text-xs leading-relaxed">{redirectUri}</code>
      </div>}
    </div>}
    {error && <p role="alert" className="mt-3 break-words text-sm text-destructive">{error}</p>}
  </section>;
}
