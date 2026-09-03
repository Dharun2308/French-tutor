"use client";
// Import Lesson Notes — photograph the notebook (or paste text), send it to
// the extractor, then hand off to /import/review for approval. Nothing is
// saved to learning_items from this page.
//
// Phone-first: this runs right after an iTalki lesson, camera in hand.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Images,
  Loader2,
  ScanText,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProviderStrip } from "@/components/provider-status";

const MAX_IMAGES = 6;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

interface Picked {
  id: string;
  dataUrl: string;
  kb: number;
}

interface BatchSummary {
  id: number;
  createdAt: string;
  sourceKind: string;
  status: "pending" | "reviewed" | "discarded";
  itemCount: number;
  label: string | null;
  imageCount: number;
  failed?: boolean;
}

function loadImageEl(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

/**
 * Downscale to MAX_EDGE on the long side and re-encode as JPEG. Phone photos
 * are 3–5 MB; this lands around 300 KB and the model reads it just as well.
 * Honours EXIF orientation where the browser supports it.
 */
async function downscale(file: File): Promise<Picked> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await loadImageEl(file);
  }
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    dataUrl,
    kb: Math.round((dataUrl.length * 3) / 4 / 1024),
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function ImportPage() {
  const router = useRouter();
  const [images, setImages] = useState<Picked[]>([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"resizing" | "extracting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<BatchSummary[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/import/batches", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { batches: [] }))
      .then((d) => setRecent(d.batches ?? []))
      .catch(() => {});
  }, []);

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy("resizing");
    try {
      const room = Math.max(0, MAX_IMAGES - images.length);
      const files = Array.from(list).slice(0, room);
      const picked: Picked[] = [];
      for (const f of files) picked.push(await downscale(f));
      setImages((prev) => [...prev, ...picked]);
      if (list.length > room) {
        setError(`Only ${MAX_IMAGES} photos per import — extra ones were skipped.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (camRef.current) camRef.current.value = "";
      if (galRef.current) galRef.current.value = "";
    }
  };

  const canSubmit = !busy && (images.length > 0 || text.trim().length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy("extracting");
    setError(null);
    try {
      const res = await fetch("/api/import/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          images: images.map((i) => i.dataUrl),
          text: text.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      // A failed extraction still has a batch (photos stored) — the review
      // page shows the error and offers Retry, so go there either way.
      if (!res.ok && !data.batchId) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/import/review?batch=${data.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Import Lesson Notes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photograph your notebook after a lesson. The tutor proposes 5–15
          items; you approve them on the next screen. Nothing is saved until
          you do.
        </p>
      </div>

      <ProviderStrip />

      {/* ── Photos ── */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notebook photos</CardTitle>
          <CardDescription className="text-xs">
            Up to {MAX_IMAGES} pages. Good light, page flat, one lesson at a
            time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <input
            ref={galRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              variant="outline"
              disabled={busy !== null || images.length >= MAX_IMAGES}
              onClick={() => camRef.current?.click()}
            >
              <Camera className="h-5 w-5" />
              Camera
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={busy !== null || images.length >= MAX_IMAGES}
              onClick={() => galRef.current?.click()}
            >
              <Images className="h-5 w-5" />
              Photo library
            </Button>
          </div>

          {images.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div
                  key={img.id}
                  className="relative aspect-[3/4] overflow-hidden rounded-md border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt={`Page ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove page ${i + 1}`}
                    onClick={() =>
                      setImages((prev) => prev.filter((p) => p.id !== img.id))
                    }
                    className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {i + 1} · {img.kb} KB
                  </span>
                </div>
              ))}
            </div>
          )}
          {busy === "resizing" && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Preparing photos…
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Text ── */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Or paste notes</CardTitle>
          <CardDescription className="text-xs">
            Typed notes, a chat log from the tutor, anything. Optional if you
            added photos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="à le restaurant → au restaurant&#10;j'ai besoin de + inf.&#10;…"
            rows={5}
            disabled={busy !== null}
          />
        </CardContent>
      </Card>

      <div className="mb-6">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Lesson context (optional) — e.g. iTalki with Marie, passé composé"
          maxLength={300}
          disabled={busy !== null}
        />
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={!canSubmit}
        onClick={submit}
      >
        {busy === "extracting" ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Reading your notes… 20–60 s
          </>
        ) : (
          <>
            <ScanText className="h-5 w-5" />
            Extract items
          </>
        )}
      </Button>

      {/* ── Recent imports ── */}
      {recent.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Recent imports</h2>
          <ul className="mt-3 divide-y rounded-md border">
            {recent.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/import/review?batch=${b.id}`}
                  className="flex items-center gap-3 px-3 py-3 hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {b.label ?? `Import #${b.id}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(b.createdAt)}
                      {b.imageCount > 0 && ` · ${b.imageCount} photo${b.imageCount === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  {b.status === "pending" && b.failed && (
                    <Badge variant="destructive">Failed — retry</Badge>
                  )}
                  {b.status === "pending" && !b.failed && (
                    <Badge variant="default">Needs review</Badge>
                  )}
                  {b.status === "reviewed" && (
                    <Badge variant="success">{b.itemCount} saved</Badge>
                  )}
                  {b.status === "discarded" && (
                    <Badge variant="secondary">Discarded</Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
