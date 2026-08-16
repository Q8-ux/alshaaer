"use client";

import { ArrowRight, AudioLines, Feather, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Verse = { sadr: string; ajz: string };
type ArchiveItem = {
  id: string;
  storyText: string;
  requestText: string | null;
  poemTitle: string | null;
  meter: string | null;
  state: string;
  hasAudio: boolean;
  createdAt: string;
  poem: { title?: string; verses?: Verse[] } | null;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ar-KW", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );

export default function UserArchive({ displayName }: { displayName: string }) {
  const [archive, setArchive] = useState<ArchiveItem[] | null>(null);
  const [error, setError] = useState("");

  const loadArchive = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/archive", { cache: "no-store" });
      const result = (await response.json()) as { archive?: ArchiveItem[]; error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تحميل الأرشيف.");
      setArchive(result.archive || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذّر تحميل الأرشيف.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadArchive(), 0);
    return () => window.clearTimeout(timer);
  }, [loadArchive]);

  return (
    <main className="dashboard-shell user-archive-shell">
      <header className="dashboard-topbar">
        <div>
          <div className="dashboard-kicker"><Feather size={17} /> أرشيفي الشعري</div>
          <h1>قصص وقصائد {displayName}</h1>
          <p>كل ما كتبته أو سجلته، مع القصائد الناتجة، محفوظ هنا في حسابك.</p>
        </div>
        <div className="dashboard-top-actions">
          <button type="button" className="secondary-button" onClick={() => void loadArchive()}><RefreshCw size={16} /> تحديث</button>
          <Link className="secondary-button" href="/">العودة للتطبيق <ArrowRight size={16} /></Link>
        </div>
      </header>

      {error && <div className="error-box dashboard-error">{error}</div>}
      {!archive ? (
        <div className="dashboard-loading">جارٍ تحميل أرشيفك…</div>
      ) : archive.length === 0 ? (
        <div className="dashboard-card empty-archive">
          <Feather size={34} />
          <h2>أرشيفك ينتظر قصتك الأولى</h2>
          <p>ارجع إلى التطبيق، اكتب قصتك أو سجّلها، ثم اطلب القصيدة.</p>
          <Link className="primary-button" href="/">ابدأ الآن</Link>
        </div>
      ) : (
        <section className="archive-list personal-archive-list">
          {archive.map((item) => (
            <article className="dashboard-card personal-archive-item" key={item.id}>
              <div className="personal-archive-head">
                <div className="archive-icon">{item.hasAudio ? <AudioLines size={19} /> : <FileText size={19} />}</div>
                <div><h2>{item.poemTitle || "قصة قيد التحويل"}</h2><span>{formatDate(item.createdAt)} {item.meter ? `• بحر ${item.meter}` : ""}</span></div>
              </div>
              <div className="archive-block"><h3>قصتك</h3><p>{item.storyText}</p></div>
              {item.requestText && <div className="archive-block compact"><h3>طلبك</h3><p>{item.requestText}</p></div>}
              {item.hasAudio && <div className="archive-audio"><div><AudioLines size={18} /> التسجيل الأصلي</div><audio controls preload="none" src={`/api/audio/${item.id}`} /></div>}
              {item.poem?.verses?.length ? (
                <div className="archive-poem">
                  <h3>{item.poem.title || item.poemTitle}</h3>
                  {item.poem.verses.map((verse, index) => (
                    <div className="archive-verse" key={`${item.id}-${index}`}><span>{verse.sadr}</span><i>◆</i><span>{verse.ajz}</span></div>
                  ))}
                </div>
              ) : <div className="archive-pending">لم تُكتب القصيدة لهذا السجل بعد.</div>}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
