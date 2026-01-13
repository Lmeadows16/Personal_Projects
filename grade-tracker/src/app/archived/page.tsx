"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Term = { id: string; name: string; position: number; archived: boolean };
type Course = { id: string; term: string | null };

export default function ArchivedPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  async function loadArchived() {
    const { data: termData } = await supabase
      .from("terms")
      .select("id,name,position,archived")
      .eq("archived", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    const { data: courseData } = await supabase
      .from("courses")
      .select("id,term");

    setTerms((termData ?? []) as Term[]);
    setCourses((courseData ?? []) as Course[]);
  }

  useEffect(() => {
    loadArchived();
  }, []);

  const courseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const course of courses) {
      const name = course.term ?? "—";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [courses]);

  async function unarchiveTerm(term: Term) {
    const { error } = await supabase
      .from("terms")
      .update({ archived: false })
      .eq("id", term.id);
    if (error) {
      alert(error.message);
      return;
    }

    await loadArchived();
    window.location.reload();
  }

  async function deleteTermForever(term: Term) {
    if (!confirm(`Delete term "${term.name}" forever? This cannot be undone.`)) {
      return;
    }

    const { error } = await supabase
      .from("terms")
      .delete()
      .eq("id", term.id);
    if (error) {
      alert(error.message);
      return;
    }

    await loadArchived();
  }

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Archived Terms</h1>
      <div style={{ opacity: 0.7, marginBottom: 14 }}>
        Restore terms or delete them permanently.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {terms.map((term) => (
          <div
            key={term.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800 }}>{term.name}</div>
            <div style={{ opacity: 0.7, marginTop: 4 }}>
              Courses: {courseCounts.get(term.name) ?? 0}
            </div>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button onClick={() => unarchiveTerm(term)}>Unarchive</button>
              <button onClick={() => deleteTermForever(term)}>Delete forever</button>
            </div>
          </div>
        ))}

        {terms.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No archived terms yet.</div>
        ) : null}
      </div>
    </main>
  );
}
