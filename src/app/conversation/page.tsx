"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SpeakButton } from "@/components/speak-button";

interface Message { role: "user" | "assistant"; text: string; feedback?: string }
interface Target { id: number; french: string; english: string; used: boolean }

export default function ConversationPage() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const call = async (body: object) => { const r = await fetch("/api/conversation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };
  const start = async () => { setBusy(true); setError(null); try { const d = await call({ action: "start" }); setSessionId(d.sessionId); setMessages([{ role: "assistant", text: d.reply }]); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const send = async () => { if (!sessionId || !input.trim()) return; const text = input.trim(); setInput(""); setMessages((m) => [...m, { role: "user", text }]); setBusy(true); try { const d = await call({ action: "turn", sessionId, message: text }); setMessages((m) => [...m, { role: "assistant", text: d.reply, feedback: d.feedback }]); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const finish = async () => { if (!sessionId) return; setBusy(true); try { const d = await call({ action: "finish", sessionId }); setTargets(d.targets); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  return <main className="container max-w-2xl py-6">
    <Link href="/" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Home</Link>
    <h1 className="text-2xl font-semibold">Conversation practice</h1><p className="mb-5 text-sm text-muted-foreground">A short A2 chat that quietly works in your weak French.</p>
    {!sessionId ? <Card><CardContent className="space-y-4 py-10 text-center"><MessageSquare className="mx-auto h-9 w-9"/><p>Your target phrases stay hidden until the end, so the conversation remains natural.</p><Button onClick={start} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin"/>}Start in French</Button>{error && <p className="text-sm text-destructive">{error}</p>}</CardContent></Card> : <>
      <Card><CardContent className="space-y-3 p-4">
        {messages.map((m, i) => <div key={i} className={`max-w-[88%] rounded-xl px-4 py-3 text-sm ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}><div className="flex items-start gap-2"><p className="flex-1">{m.text}</p>{m.role === "assistant" && <SpeakButton text={m.text}/>}</div>{m.feedback && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{m.feedback}</p>}</div>)}
        {busy && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/>}
        {!targets && <div className="flex gap-2 pt-2"><Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Réponds en français…" disabled={busy}/><Button size="icon" onClick={send} disabled={busy || !input.trim()}><Send className="h-4 w-4"/></Button></div>}
      </CardContent></Card>
      {!targets ? <Button variant="outline" className="mt-3 w-full" onClick={finish} disabled={busy || messages.length < 3}>Finish and reveal targets</Button> : <Card className="mt-3"><CardContent className="p-5"><h2 className="font-semibold">Hidden targets</h2><div className="mt-3 space-y-2">{targets.map((t) => <div key={t.id} className="flex gap-3 text-sm"><span>{t.used ? "Used" : "Not yet"}</span><span className="font-medium">{t.french}</span><span className="text-muted-foreground">{t.english}</span></div>)}</div><p className="mt-4 text-xs text-muted-foreground">AI conversation use is practice only. Real tutor use is recorded in Tutor Mode.</p></CardContent></Card>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </>}
  </main>;
}
