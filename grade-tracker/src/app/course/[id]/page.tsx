"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeWeightedGrade, formatPct } from "@/lib/grades";
import { useParams } from "next/navigation";
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
  category_id: string;
  course_id: string;
  title: string;
  points_earned: number | null;
  points_possible: number | null;
  status: any;
  due_date: string | null;
};

export default function CoursePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;

  const [course, setCourse] = useState<Course | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [as, setAs] = useState<Assignment[]>([]);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  async function refresh() {
    const c = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .single();
    const cat = await supabase
      .from("categories")
      .select("*")
      .eq("course_id", courseId);
    const a = await supabase
      .from("assignments")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });
    setCourse((c.data as any) ?? null);
    setCats((cat.data as any) ?? []);
    setAs((a.data as any) ?? []);
  }

  useEffect(() => {
    if (!courseId) return;
    refresh();
  }, [courseId]);

  const grade = useMemo(() => {
    const { overallPct, byCategory } = computeWeightedGrade(
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
    return { overallPct, byCategory };
  }, [cats, as]);

  async function addCategory() {
    if (!session) return;
    const name = prompt("Category name? (e.g., Exams)");
    if (!name) return;
    const weightStr = prompt("Weight (%)? (e.g., 40)");
    if (!weightStr) return;
    const weight = Number(weightStr);
    const dropStr = prompt("Drop lowest how many? (0 for none)") ?? "0";
    const drop_lowest = Math.max(0, Number(dropStr) || 0);

    const { error } = await supabase.from("categories").insert({
      user_id: session.user.id,
      course_id: courseId,
      name,
      weight,
      drop_lowest,
    });
    if (error) alert(error.message);
    else refresh();
  }

  async function addAssignment() {
    if (!session) return;
    if (cats.length === 0) {
      alert("Add a category first.");
      return;
    }
    const title = prompt("Assignment title?");
    if (!title) return;

    const categoryName = prompt(
      `Category? Choose one:\n${cats.map((c) => `- ${c.name}`).join("\n")}`,
    );
    const cat = cats.find(
      (c) => c.name.toLowerCase() === (categoryName ?? "").toLowerCase(),
    );
    if (!cat) {
      alert("Category not found (match the name exactly).");
      return;
    }

    const earnedStr = prompt("Points earned? (blank if not graded)") ?? "";
    const possibleStr = prompt("Points possible? (blank if not graded)") ?? "";
    const points_earned = earnedStr.trim() === "" ? null : Number(earnedStr);
    const points_possible =
      possibleStr.trim() === "" ? null : Number(possibleStr);

    const { error } = await supabase.from("assignments").insert({
      user_id: session.user.id,
      course_id: courseId,
      category_id: cat.id,
      title,
      points_earned,
      points_possible,
      status: points_earned == null ? "planned" : "graded",
    });
    if (error) alert(error.message);
    else refresh();
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <Link href="/" style={{ textDecoration: "none" }}>
        ← Back
      </Link>

      <h1 style={{ marginTop: 10 }}>{course?.name ?? "Course"}</h1>
      <div style={{ opacity: 0.7 }}>{course?.term ?? "—"}</div>

      <div style={{ marginTop: 14, fontSize: 28, fontWeight: 800 }}>
        {formatPct(grade.overallPct)}
        <span style={{ fontSize: 14, opacity: 0.7, marginLeft: 10 }}>
          current weighted grade
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={addCategory} style={{ padding: 10 }}>
          + Category
        </button>
        <button onClick={addAssignment} style={{ padding: 10 }}>
          + Assignment
        </button>
      </div>

      <h2 style={{ marginTop: 26 }}>Categories</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {cats.map((c) => (
          <div
            key={c.id}
            style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}
          >
            <div style={{ fontWeight: 800 }}>{c.name}</div>
            <div style={{ opacity: 0.7 }}>
              {c.weight}% • drop lowest {c.drop_lowest}
            </div>
            <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800 }}>
              {formatPct(grade.byCategory[c.id] ?? null)}
            </div>
          </div>
        ))}
        {cats.length === 0 && (
          <div style={{ opacity: 0.7 }}>No categories yet.</div>
        )}
      </div>

      <h2 style={{ marginTop: 26 }}>Recent assignments</h2>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 0,
            fontWeight: 700,
            padding: 10,
            background: "#fafafa",
          }}
        >
          <div>Title</div>
          <div>Category</div>
          <div>Score</div>
          <div>Status</div>
        </div>
        {as.map((a) => {
          const catName = cats.find((c) => c.id === a.category_id)?.name ?? "—";
          const score =
            a.points_earned == null || a.points_possible == null
              ? "—"
              : `${a.points_earned}/${a.points_possible}`;
          return (
            <div
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                padding: 10,
                borderTop: "1px solid #eee",
              }}
            >
              <div>{a.title}</div>
              <div>{catName}</div>
              <div>{score}</div>
              <div>{a.status}</div>
            </div>
          );
        })}
        {as.length === 0 && (
          <div style={{ padding: 10, opacity: 0.7 }}>No assignments yet.</div>
        )}
      </div>
    </main>
  );
}
