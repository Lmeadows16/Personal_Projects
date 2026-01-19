"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Course = { id: string; name: string; term: string | null };

type Assignment = {
  id: string;
  course_id: string;
  status: "planned" | "submitted" | "graded" | "missing";
};

export default function AssignmentsSummary() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string>("All");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const syncTerm = () =>
      setSelectedTerm(localStorage.getItem("selectedTerm") ?? "All");

    syncTerm();
    window.addEventListener("storage", syncTerm);
    window.addEventListener("term-change", syncTerm);
    return () => {
      window.removeEventListener("storage", syncTerm);
      window.removeEventListener("term-change", syncTerm);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const syncMobile = () => setIsMobile(mediaQuery.matches);
    syncMobile();
    mediaQuery.addEventListener("change", syncMobile);
    return () => mediaQuery.removeEventListener("change", syncMobile);
  }, []);

  async function loadData() {
    const courseRows = await supabase
      .from("courses")
      .select("id,name,term")
      .order("created_at", { ascending: false });
    const assignmentRows = await supabase
      .from("assignments")
      .select("id,course_id,status");

    setCourses((courseRows.data ?? []) as Course[]);
    setAssignments((assignmentRows.data ?? []) as Assignment[]);
  }

  useEffect(() => {
    loadData();
  }, []);


  const visibleCourses = useMemo(() => {
    if (selectedTerm === "All") return [];
    return courses.filter((course) => (course.term ?? "—") === selectedTerm);
  }, [courses, selectedTerm]);

  const countsByCourse = useMemo(() => {
    const map = new Map<string, { graded: number; ungraded: number }>();
    assignments.forEach((assignment) => {
      const existing = map.get(assignment.course_id) ?? {
        graded: 0,
        ungraded: 0,
      };
      if (assignment.status === "graded") {
        existing.graded += 1;
      } else {
        existing.ungraded += 1;
      }
      map.set(assignment.course_id, existing);
    });
    return map;
  }, [assignments]);

  const tabBase: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    textDecoration: "none",
    fontSize: 14,
  };

  const cardTitleSize = isMobile ? 16 : 14;
  const cardMetaSize = isMobile ? 14 : 13;
  const cardStatsSize = isMobile ? 14 : 13;

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: isMobile ? "20px auto" : "40px auto",
        padding: isMobile ? 12 : 16,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        <span
          style={{
            ...tabBase,
            background: "var(--table-head-bg)",
            borderColor: "var(--border)",
            fontWeight: 600,
          }}
        >
          Summary
        </span>
        <Link href="/assignments/breakdown" style={tabBase}>
          Breakdown
        </Link>
      </div>

      <div style={{ marginBottom: isMobile ? 12 : 16 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28 }}>
          Assignments summary
        </h1>
        <div style={{ opacity: 0.7, marginTop: 6 }}>
          Showing: <strong>{selectedTerm}</strong>
        </div>
      </div>

      {selectedTerm === "All" ? (
        <div style={{ opacity: 0.7 }}>
          Select a term in the sidebar to view assignments.
        </div>
      ) : null}

      {selectedTerm !== "All" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "repeat(auto-fit, minmax(160px, 1fr))"
              : "repeat(auto-fit, minmax(220px, 1fr))",
            gap: isMobile ? 10 : 12,
          }}
        >
          {visibleCourses.map((course) => {
            const counts = countsByCourse.get(course.id) ?? {
              graded: 0,
              ungraded: 0,
            };
            return (
              <Link
                key={course.id}
                href={`/course/${course.id}?tab=assignments`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: isMobile ? 14 : 16,
                  display: "block",
                  minHeight: isMobile ? 120 : undefined,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: cardTitleSize }}>
                  {course.name}
                </div>
                <div
                  style={{
                    opacity: 0.7,
                    marginTop: 2,
                    fontSize: cardMetaSize,
                  }}
                >
                  {course.term ?? "—"}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: cardStatsSize,
                    opacity: 0.85,
                    display: "grid",
                    gap: 6,
                    lineHeight: isMobile ? 1.3 : 1.2,
                  }}
                >
                  <div>
                    <strong>{counts.ungraded}</strong> ungraded
                  </div>
                  <div>
                    <strong>{counts.graded}</strong> graded
                  </div>
                </div>
              </Link>
            );
          })}

          {visibleCourses.length === 0 ? (
            <div style={{ opacity: 0.7 }}>
              No classes in this term yet.
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
