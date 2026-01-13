"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  computeWeightedGrade,
  formatPct,
  type Assignment as GradeAssignment,
  type Category as GradeCategory,
} from "@/lib/grades";
import Modal from "@/components/Modal";

type Course = { id: string; name: string; term: string | null };
type Term = { id: string; name: string; archived: boolean };
type Profile = { first_name: string | null };
type Category = GradeCategory & { course_id: string };
type Assignment = GradeAssignment & { course_id: string };

function computeUnweighted(assignments: Assignment[]) {
  let earned = 0;
  let possible = 0;
  for (const a of assignments) {
    if (a.points_earned == null || a.points_possible == null) continue;
    if (a.points_possible <= 0) continue;
    earned += Number(a.points_earned);
    possible += Number(a.points_possible);
  }
  return { earned, possible, pct: possible > 0 ? earned / possible : null };
}

export default function Dashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [firstName, setFirstName] = useState<string | null>(null);

  // Sidebar controls term via localStorage
  const [selectedTerm, setSelectedTerm] = useState<string>("All");

  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setAuthReady(true);
    });
  }, []);

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

  async function loadData() {
    const c = await supabase
      .from("courses")
      .select("id,name,term")
      .order("created_at", { ascending: false });
    const termRows = await supabase
      .from("terms")
      .select("id,name,archived")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    const cat = await supabase
      .from("categories")
      .select("id,course_id,name,weight,drop_lowest");
    const a = await supabase
      .from("assignments")
      .select(
        "id,course_id,category_id,title,points_earned,points_possible,status",
      );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (user) {
      const metadataFirstName =
        typeof user.user_metadata?.first_name === "string"
          ? user.user_metadata.first_name
          : null;
      setFirstName(metadataFirstName);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const profileFirstName = (profileData as Profile | null)?.first_name ?? null;
      if (profileFirstName) setFirstName(profileFirstName);
    }

    setCourses((c.data ?? []) as Course[]);
    setTerms((termRows.data ?? []) as Term[]);
    setCategories((cat.data ?? []) as Category[]);
    setAssignments((a.data ?? []) as Assignment[]);
  }

  useEffect(() => {
    if (!authReady) return;
    loadData();
  }, [authReady]);

  const visibleCourses = useMemo(() => {
    if (selectedTerm === "All") return courses;
    return courses.filter((c) => (c.term ?? "—") === selectedTerm);
  }, [courses, selectedTerm]);

  // Precompute grades per course
  const gradesByCourse = useMemo(() => {
    const map: Record<
      string,
      { weighted: number | null; unweighted: number | null; pts: string }
    > = {};

    for (const course of courses) {
      const cats: GradeCategory[] = categories
        .filter((c) => c.course_id === course.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          weight: Number(c.weight),
          drop_lowest: Number(c.drop_lowest) || 0,
        }));

      const asg: GradeAssignment[] = assignments
        .filter((a) => a.course_id === course.id)
        .map((a) => ({
          id: a.id,
          category_id: a.category_id,
          title: a.title,
          points_earned: a.points_earned,
          points_possible: a.points_possible,
          status: a.status,
        }));

      const weighted = cats.length
        ? computeWeightedGrade(cats, asg).overallPct
        : null;
      const uw = computeUnweighted(
        assignments.filter((a) => a.course_id === course.id),
      );

      map[course.id] = {
        weighted,
        unweighted: uw.pct,
        pts: `${uw.earned}/${uw.possible}`,
      };
    }

    return map;
  }, [courses, categories, assignments]);

  async function createCourse() {
    const name = courseName.trim();
    if (!name) {
      alert("Class name required.");
      return;
    }
    if (selectedTerm === "All") {
      alert("Select a term first.");
      return;
    }

    setCreatingCourse(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        alert("Please log in first.");
        return;
      }

      const termValue = selectedTerm === "—" ? null : selectedTerm;
      const { error } = await supabase.from("courses").insert({
        user_id: user.id,
        name,
        term: termValue,
      });

      if (error) {
        alert(error.message);
        return;
      }

      setCourseModalOpen(false);
      setCourseName("");
      await loadData();
    } finally {
      setCreatingCourse(false);
    }
  }

  async function archiveSelectedTerm() {
    if (selectedTerm === "All") {
      alert("Select a term to archive.");
      return;
    }

    const termRow = terms.find(
      (term) => term.name === selectedTerm && !term.archived,
    );

    if (!termRow) {
      alert("That term is not available to archive.");
      return;
    }

    if (!confirm(`Archive term "${termRow.name}"?`)) return;

    const { error } = await supabase
      .from("terms")
      .update({ archived: true })
      .eq("id", termRow.id);

    if (error) {
      alert(error.message);
      return;
    }

    localStorage.setItem("selectedTerm", "All");
    window.dispatchEvent(new Event("term-change"));
    setSelectedTerm("All");
    await loadData();
  }

  if (!authReady) return null;

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>
        {firstName ? `Hello, ${firstName}` : "Dashboard"}
      </h1>

      <div style={{ opacity: 0.7, marginBottom: 14 }}>
        Showing: <strong>{selectedTerm}</strong>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => {
            setCourseName("");
            setCourseModalOpen(true);
          }}
          disabled={selectedTerm === "All"}
          style={{
            padding: "8px 12px",
            opacity: selectedTerm === "All" ? 0.5 : 1,
          }}
        >
          + Class
        </button>
        <button
          onClick={archiveSelectedTerm}
          disabled={selectedTerm === "All"}
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid rgba(220, 38, 38, 0.6)",
            color: "#dc2626",
            background: "transparent",
            fontWeight: 600,
            opacity: selectedTerm === "All" ? 0.5 : 1,
          }}
        >
          Archive term
        </button>
        {selectedTerm === "All" ? (
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            Select a term to add classes.
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {visibleCourses.map((c) => {
          const g = gradesByCourse[c.id] ?? {
            weighted: null,
            unweighted: null,
            pts: "0/0",
          };

          return (
            <Link
              key={c.id}
              href={`/course/${c.id}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                display: "block",
              }}
            >
              <div style={{ fontWeight: 800 }}>{c.name}</div>
              <div style={{ opacity: 0.7, marginTop: 2 }}>{c.term ?? "—"}</div>

              <div style={{ marginTop: 10, fontSize: 14, opacity: 0.85 }}>
                <div>
                  <strong>Weighted:</strong> {formatPct(g.weighted)}
                </div>
                <div style={{ marginTop: 4 }}>
                  <strong>Unweighted:</strong> {formatPct(g.unweighted)}{" "}
                  <span style={{ opacity: 0.7 }}>({g.pts})</span>
                </div>
              </div>
            </Link>
          );
        })}

        {visibleCourses.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No classes in this term yet.</div>
        ) : null}
      </div>

      <Modal
        open={courseModalOpen}
        title="Add class"
        onClose={() => setCourseModalOpen(false)}
      >
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Class name</label>
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Biology"
            />
          </div>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Term</label>
            <input value={selectedTerm} disabled />
          </div>
        </div>
        <div className="actions">
          <button onClick={() => setCourseModalOpen(false)}>Cancel</button>
          <button onClick={createCourse} disabled={creatingCourse}>
            {creatingCourse ? "Adding..." : "Add"}
          </button>
        </div>
      </Modal>
    </main>
  );
}
