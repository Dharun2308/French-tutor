"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpeakButton } from "@/components/speak-button";
import {
  TENSES,
  TENSE_LABELS,
  PERSON_PRONOUNS,
  LEVELS,
  VERB_GROUPS,
  type Tense,
} from "@/types";

interface Verb {
  id: number;
  infinitive: string;
  english: string;
  group: string;
  level: string;
  auxiliary: string;
  frequencyRank: number;
  conjugations: Array<{
    id: number;
    tense: string;
    person: string;
    form: string;
    isIrregular: boolean;
  }>;
}

export default function LibraryPage() {
  const [tense, setTense] = useState<Tense>("present");
  const [level, setLevel] = useState<string>("");
  const [group, setGroup] = useState<string>("");
  const [verbs, setVerbs] = useState<Verb[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("tense", tense);
      if (level) params.set("level", level);
      if (group) params.set("group", group);
      const res = await fetch(`/api/verbs?${params.toString()}`);
      const data = await res.json();
      setVerbs(data.verbs ?? []);
      setLoading(false);
    })();
  }, [tense, level, group]);

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-muted-foreground">
          Browse every verb and its conjugations.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1">
          {TENSES.map((t) => (
            <Button
              key={t}
              variant={tense === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTense(t)}
            >
              {TENSE_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2"
        >
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2"
        >
          <option value="">All groups</option>
          {VERB_GROUPS.map((g) => (
            <option key={g} value={g}>
              Group {g}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      )}

      {!loading && (
        <div className="grid gap-3">
          {verbs.map((v) => (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <div>
                      <div className="text-xl font-serif">{v.infinitive}</div>
                      <div className="text-sm text-muted-foreground">
                        {v.english}
                      </div>
                    </div>
                    <SpeakButton text={v.infinitive} className="ml-1" />
                  </div>
                  <div className="flex gap-1">
                    <Badge variant="outline">{v.level}</Badge>
                    <Badge variant="secondary">
                      {v.group === "irregular" ? "irr." : `gr. ${v.group}`}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      aux {v.auxiliary === "etre" ? "être" : "avoir"}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 font-serif text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {v.conjugations
                    .sort((a, b) => {
                      const order = ["1s", "2s", "3s", "1p", "2p", "3p"];
                      return (
                        order.indexOf(a.person) - order.indexOf(b.person)
                      );
                    })
                    .map((c) => {
                      const pronoun =
                        PERSON_PRONOUNS[c.person as keyof typeof PERSON_PRONOUNS];
                      const speakPronoun =
                        pronoun === "il/elle"
                          ? "il"
                          : pronoun === "ils/elles"
                            ? "ils"
                            : pronoun;
                      return (
                        <div key={c.id} className="group flex items-center gap-2">
                          <span className="w-12 text-muted-foreground">
                            {pronoun}
                          </span>
                          <span
                            className={c.isIrregular ? "font-semibold" : ""}
                          >
                            {c.form}
                          </span>
                          <SpeakButton
                            text={c.form}
                            withPronoun={speakPronoun}
                            className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          ))}
          {verbs.length === 0 && (
            <div className="text-center text-muted-foreground">
              No verbs match these filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
