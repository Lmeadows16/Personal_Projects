"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeWeightedGrade, formatPct } from "@/lib/grades";
import Link from "next/link";

type Course = { id: string; name: string; term: string | null };
type Category = {
  id: string;
  course_id: string;
  name: string;
  weight: number;
  drop_lowest: number;
};
type Assignment = {
  id: string;
  course_id: string;
  category_id: string;
  title: string;
  points_earned: number | null;
  points_possible: number | null;
  status: any;
};

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    (async () => {
      const c = await supabase
        .from("courses")
        .select("*")
        .order("created_at", { ascending: false });
      const cat = await supabase.from("categories").select("*");
      const a = await supabase.from("assignments").select("*");
      setCourses((c.data as any) ?? []);
      setCategories((cat.data as any) ?? []);
      setAssignments((a.data as any) ?? []);
    })();
  }, [session]);

  const gradesByCourse = useMemo(() => {
    const map: Record<string, string> = {};
    for (const course of courses) {
      const cats = categories.filter((x) => x.course_id === course.id);
      const as = assignments.filter((x) => x.course_id === course.id);
      const { overallPct } = computeWeightedGrade(
        cats.map((c) => ({
          id: c.id,
          name: c.name,
          weight: Number(c.weight),
          drop_lowest: c.drop_lowest,
        })),
        as.map((a) => ({
          id: a.id,
          category_id: a.category_id,
          title: a.title,
          points_earned: a.points_earned,
          points_possible: a.points_possible,
          status: a.status,
        })),
      );
      map[course.id] = formatPct(overallPct);
    }
    return map;
  }, [courses, categories, assignments]);

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });
    if (error) alert(error.message);
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password: pw });
    if (error) alert(error.message);
    else alert("Check your email to confirm (if confirmations enabled).");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function createCourse() {
    const name = prompt("Course name?");
    if (!name) return;
    const term = prompt("Term? (optional)") || null;
    const user_id = session.user.id;
    const { error } = await supabase
      .from("courses")
      .insert({ name, term, user_id });
    if (error) alert(error.message);
    else {
      const c = await supabase
        .from("courses")
        .select("*")
        .order("created_at", { ascending: false });
      setCourses((c.data as any) ?? []);
    }
  }

  if (!session) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h1>Grade Tracker</h1>
        <p>Sign in to start tracking weighted grades.</p>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={signIn} style={{ padding: 10, flex: 1 }}>
            Sign In
          </button>
          <button onClick={signUp} style={{ padding: 10, flex: 1 }}>
            Sign Up
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>Dashboard</h1>
        <button onClick={signOut} style={{ padding: 10 }}>
          Sign Out
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={createCourse} style={{ padding: 10 }}>
          + New Course
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {courses.map((c) => (
          <Link
            key={c.id}
            href={`/course/${c.id}`}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 14,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</div>
            <div style={{ opacity: 0.7 }}>{c.term ?? "—"}</div>
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 800 }}>
              {gradesByCourse[c.id] ?? "—"}
            </div>
            <div style={{ opacity: 0.7, marginTop: 4 }}>
              Current weighted grade
            </div>
          </Link>
        ))}
        {courses.length === 0 && (
          <div style={{ opacity: 0.7 }}>
            Create your first course to get started.
          </div>
        )}
      </div>
    </main>
  );
}
