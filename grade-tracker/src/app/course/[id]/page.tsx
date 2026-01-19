"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeWeightedGrade, formatPct } from "@/lib/grades";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Modal from "@/components/Modal";
import DragList from "@/components/DragList";
import type { Session } from "@supabase/supabase-js";

type Course = { id: string; name: string; term: string | null };
type Category = {
  id: string;
  course_id: string;
  name: string;
  weight: number;
  drop_lowest: number;
  position?: number | null;
};
type Assignment = {
  id: string;
  category_id: string;
  course_id: string;
  title: string;
  points_earned: number | null;
  points_possible: number | null;
  status: "planned" | "submitted" | "graded" | "missing";
  due_date: string | null;
  due_time: string | null;
  position?: number | null;
};

function safeNum(x: string): number | null {
  const t = x.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function sumPoints(assignments: Assignment[]) {
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

function statusBadgeStyle(status: Assignment["status"]) {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid var(--border)",
    textTransform: "lowercase",
  };

  switch (status) {
    case "graded":
      return { ...base, background: "rgba(0, 200, 0, 0.12)" };
    case "submitted":
      return { ...base, background: "rgba(0, 120, 255, 0.12)" };
    case "missing":
      return { ...base, background: "rgba(255, 0, 0, 0.14)" };
    case "planned":
    default:
      return { ...base, background: "rgba(255, 255, 255, 0.06)" };
  }
}

function normalizeDateInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function dateFromInput(value: string | null) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeTimeInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function formatDueDate(dueDate: string | null, timeValue: string | null) {
  const date = dateFromInput(dueDate);
  if (!date) return "No due date";
  const time = normalizeTimeInput(timeValue);
  if (!time) return date.toLocaleDateString();
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes))
    return date.toLocaleDateString();
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return `${date.toLocaleDateString()} · ${combined.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function isDueToday(dueDate: string | null) {
  const normalized = normalizeDateInput(dueDate);
  if (!normalized) return false;
  const today = normalizeDateInput(new Date().toISOString());
  return normalized === today;
}

export default function CoursePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const courseId = params.id;

  const [course, setCourse] = useState<Course | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [as, setAs] = useState<Assignment[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<"grades" | "assignments">(
    "grades",
  );
  const [isMobile, setIsMobile] = useState(false);

  // Modals
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [asgModalOpen, setAsgModalOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "assignments") {
      setActiveTab("assignments");
    } else if (tab === "grades") {
      setActiveTab("grades");
    }
  }, [searchParams]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const syncMobile = () => setIsMobile(mediaQuery.matches);
    syncMobile();
    mediaQuery.addEventListener("change", syncMobile);
    return () => mediaQuery.removeEventListener("change", syncMobile);
  }, []);

  // Category form state
  const [catName, setCatName] = useState("");
  const [catWeight, setCatWeight] = useState("0");
  const [catDrop, setCatDrop] = useState("0");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );

  // Assignment form state (for add/edit)
  const [editId, setEditId] = useState<string | null>(null);
  const [asgTitle, setAsgTitle] = useState("");
  const [asgCategoryId, setAsgCategoryId] = useState("");
  const [asgEarned, setAsgEarned] = useState("");
  const [asgPossible, setAsgPossible] = useState("");
  const [asgStatus, setAsgStatus] = useState<Assignment["status"]>("planned");
  const [asgDueDate, setAsgDueDate] = useState("");
  const [asgDueTime, setAsgDueTime] = useState("");

  // What-if (non-permanent)
  const [whatIfCategoryId, setWhatIfCategoryId] = useState("");
  const [whatIfEarned, setWhatIfEarned] = useState("");
  const [whatIfPossible, setWhatIfPossible] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        // token refresh issues: reset to logged-out state gracefully
        supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(data.session);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!courseId) return;

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
      .eq("course_id", courseId);

    setCourse((c.data ?? null) as Course | null);

    const catsData = (cat.data ?? []) as Category[];
    // If position exists, prefer it; otherwise keep your old weight-sorted behavior later
    setCats(catsData);

    const asData = (a.data ?? []) as Assignment[];
    setAs(asData);
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Categories ordering:
  // 1) If positions exist (non-null), sort by that
  // 2) Otherwise sort by weight desc (your requested behavior)
  const orderedCats = useMemo(() => {
    const hasPositions = cats.some((c) => c.position != null);
    const copy = [...cats];
    if (hasPositions) {
      return copy.sort(
        (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
      );
    }
    return copy.sort((a, b) => Number(b.weight) - Number(a.weight));
  }, [cats]);

  // Assignments ordering (for grade math: keep position ordering if available)
  const orderedAssignments = useMemo(() => {
    const hasPositions = as.some((x) => x.position != null);
    const copy = [...as];
    if (hasPositions) {
      return copy.sort(
        (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
      );
    }
    return copy;
  }, [as]);

  const assignmentsByDueDate = useMemo(() => {
    return [...as].sort((a, b) => {
      const aTime = dateFromInput(a.due_date)?.getTime() ?? Infinity;
      const bTime = dateFromInput(b.due_date)?.getTime() ?? Infinity;
      return aTime - bTime;
    });
  }, [as]);

  const [ungradedAssignmentsByStatus, gradedAssignmentsByStatus] = useMemo(() => {
    const graded: Assignment[] = [];
    const ungraded: Assignment[] = [];
    assignmentsByDueDate.forEach((assignment) => {
      if (assignment.status === "graded") {
        graded.push(assignment);
      } else {
        ungraded.push(assignment);
      }
    });
    return [ungraded, graded];
  }, [assignmentsByDueDate]);

  // Apply what-if virtually (does NOT write to DB)
  const effectiveAssignmentsForGrade = useMemo(() => {
    const earned = safeNum(whatIfEarned);
    const possible = safeNum(whatIfPossible);

    if (!whatIfOpen) return orderedAssignments;

    if (
      !whatIfCategoryId ||
      earned == null ||
      possible == null ||
      possible <= 0
    ) {
      return orderedAssignments;
    }

    const virtual: Assignment = {
      id: "__what_if__",
      course_id: courseId,
      category_id: whatIfCategoryId,
      title: "WHAT-IF",
      points_earned: earned,
      points_possible: possible,
      status: "graded",
      due_date: null,
      due_time: null,
    };

    return [...orderedAssignments, virtual];
  }, [
    whatIfOpen,
    whatIfCategoryId,
    whatIfEarned,
    whatIfPossible,
    orderedAssignments,
    courseId,
  ]);

  const grade = useMemo(() => {
    const { overallPct, byCategory } = computeWeightedGrade(
      orderedCats.map((c) => ({
        id: c.id,
        name: c.name,
        weight: Number(c.weight),
        drop_lowest: c.drop_lowest,
      })),
      effectiveAssignmentsForGrade.map((a) => ({
        id: a.id,
        category_id: a.category_id,
        title: a.title,
        points_earned: a.points_earned,
        points_possible: a.points_possible,
        status: a.status,
      })),
    );
    return { overallPct, byCategory };
  }, [orderedCats, effectiveAssignmentsForGrade]);

  // Overall unweighted (points earned / possible) using *real* assignments only (not what-if)
  const gradedAssignments = useMemo(() => {
    return orderedAssignments.filter((assignment) => {
      return (
        assignment.status === "graded" &&
        assignment.points_earned != null &&
        assignment.points_possible != null
      );
    });
  }, [orderedAssignments]);

  const overallUnweighted = useMemo(() => {
    return sumPoints(gradedAssignments);
  }, [gradedAssignments]);

  // Category unweighted scores (per category) using graded assignments only
  const categoryUnweighted = useMemo(() => {
    const map: Record<
      string,
      { earned: number; possible: number; pct: number | null }
    > = {};
    for (const c of orderedCats) {
      const pts = sumPoints(
        gradedAssignments.filter((a) => a.category_id === c.id),
      );
      map[c.id] = pts;
    }
    return map;
  }, [orderedCats, gradedAssignments]);

  const categoryWeighted = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const c of orderedCats) {
      const avg = grade.byCategory[c.id];
      if (avg == null) {
        map[c.id] = null;
        continue;
      }
      map[c.id] = avg * (Number(c.weight) / 100);
    }
    return map;
  }, [orderedCats, grade.byCategory]);

  // ---------- Modals open helpers ----------
  function openAddCategory() {
    setCatName("");
    setCatWeight("0");
    setCatDrop("0");
    setEditingCategoryId(null);
    setCatModalOpen(true);
  }

  function openEditCategory(category: Category) {
    setCatName(category.name);
    setCatWeight(String(category.weight));
    setCatDrop(String(category.drop_lowest));
    setEditingCategoryId(category.id);
    setCatModalOpen(true);
  }

  function closeCategoryModal() {
    setCatModalOpen(false);
    setEditingCategoryId(null);
  }

  function openAddAssignment() {
    if (orderedCats.length === 0) {
      alert("Add a category first.");
      return;
    }
    setEditId(null);
    setAsgTitle("");
    setAsgCategoryId(orderedCats[0].id);
    setAsgEarned("");
    setAsgPossible("");
    setAsgStatus("planned");
    setAsgDueDate("");
    setAsgDueTime("");
    setAsgModalOpen(true);
  }


  function openEditAssignment(a: Assignment) {
    setEditId(a.id);
    setAsgTitle(a.title);
    setAsgCategoryId(a.category_id);
    setAsgEarned(a.points_earned == null ? "" : String(a.points_earned));
    setAsgPossible(a.points_possible == null ? "" : String(a.points_possible));
    setAsgStatus(a.status ?? "planned");
    setAsgDueDate(normalizeDateInput(a.due_date));
    setAsgDueTime(normalizeTimeInput(a.due_time));
    setAsgModalOpen(true);
  }

  // ---------- DB actions ----------
  async function saveCategory() {
    if (!session) return;

    const name = catName.trim();
    const weight = Number(catWeight);
    const drop_lowest = Math.max(0, Number(catDrop) || 0);

    if (!name) {
      alert("Category name required.");
      return;
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      alert("Weight must be between 0 and 100.");
      return;
    }

    // position defaults to end if column exists
    const nextPos = orderedCats.length;

    if (editingCategoryId) {
      const { error } = await supabase
        .from("categories")
        .update({ name, weight, drop_lowest })
        .eq("id", editingCategoryId);

      if (error) alert(error.message);
      else {
        setCatModalOpen(false);
        setEditingCategoryId(null);
        refresh();
      }
      return;
    }

    const { error } = await supabase.from("categories").insert({
      user_id: session.user.id,
      course_id: courseId,
      name,
      weight,
      drop_lowest,
      position: nextPos,
    });

    if (error) alert(error.message);
    else {
      setCatModalOpen(false);
      refresh();
    }
  }

  async function saveAssignment() {
    if (!session) return;
    const title = asgTitle.trim();
    if (!title) {
      alert("Title required.");
      return;
    }
    if (!asgCategoryId) {
      alert("Category required.");
      return;
    }

    const earned = safeNum(asgEarned);
    const possible = safeNum(asgPossible);

    const dueDateValue = normalizeDateInput(asgDueDate.trim());
    const payload = {
      user_id: session.user.id,
      course_id: courseId,
      category_id: asgCategoryId,
      title,
      points_earned: earned,
      points_possible: possible,
      status: asgStatus,
      due_date: dueDateValue || null,
      due_time: asgDueTime ? normalizeTimeInput(asgDueTime) : null,
    };

    // If editing, update by id
    if (editId) {
      const { error } = await supabase
        .from("assignments")
        .update(payload)
        .eq("id", editId);
      if (error) alert(error.message);
      else {
        setAsgModalOpen(false);
        refresh();
      }
      return;
    }

    // If adding: override same title+category via UPSERT
    // Requires unique constraint on (user_id, course_id, category_id, title)
    const { error } = await supabase
      .from("assignments")
      .upsert(payload, { onConflict: "user_id,course_id,category_id,title" });

    if (error) alert(error.message);
    else {
      setAsgModalOpen(false);
      refresh();
    }
  }

  async function deleteAssignment(id: string) {
    if (!confirm("Delete this assignment?")) return;
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    if (error) alert(error.message);
    else refresh();
  }

  async function deleteCourse() {
    if (!courseId) return;
    if (!confirm("Delete this class and all its data?")) return;

    const { error: assignmentError } = await supabase
      .from("assignments")
      .delete()
      .eq("course_id", courseId);

    if (assignmentError) {
      alert(assignmentError.message);
      return;
    }

    const { error: categoryError } = await supabase
      .from("categories")
      .delete()
      .eq("course_id", courseId);

    if (categoryError) {
      alert(categoryError.message);
      return;
    }

    const { error: courseError } = await supabase
      .from("courses")
      .delete()
      .eq("id", courseId);

    if (courseError) {
      alert(courseError.message);
      return;
    }

    window.location.href = "/";
  }

  // Drag/persist categories ordering
  async function persistCategoryOrder(next: Category[]) {
    // write position = index (only if column exists)
    // (safe even if position column not present? Supabase will error; so we try and ignore)
    const updates = next.map((c, idx) => ({ id: c.id, position: idx }));
    const { error } = await supabase
      .from("categories")
      .upsert(updates, { onConflict: "id" });
    if (error) {
      // Don't alert constantly; only console
      console.warn("Category order persist failed:", error.message);
    }
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: isMobile ? "20px auto" : "40px auto",
        padding: isMobile ? 12 : 16,
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        ← Back
      </Link>

      <h1 style={{ marginTop: 10, fontSize: isMobile ? 22 : 28 }}>
        {course?.name ?? "Course"}
      </h1>
      <div style={{ opacity: 0.7 }}>{course?.term ?? "—"}</div>

      <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => setActiveTab("grades")}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: activeTab === "grades" ? "var(--table-head-bg)" : "transparent",
            fontWeight: activeTab === "grades" ? 700 : 500,
          }}
        >
          Grades
        </button>
        <button
          onClick={() => setActiveTab("assignments")}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background:
              activeTab === "assignments" ? "var(--table-head-bg)" : "transparent",
            fontWeight: activeTab === "assignments" ? 700 : 500,
          }}
        >
          Assignments
        </button>
      </div>

      {activeTab === "grades" ? (
        <>
          <div style={{ marginTop: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>
              {formatPct(grade.overallPct)}
              <span style={{ fontSize: 14, opacity: 0.7, marginLeft: 10 }}>
                weighted
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>
              {formatPct(overallUnweighted.pct)}
              <span style={{ fontSize: 14, opacity: 0.7, marginLeft: 10 }}>
                unweighted ({overallUnweighted.earned}/{overallUnweighted.possible})
              </span>
            </div>
          </div>

          <div
            style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}
          >
            <button onClick={openAddCategory} style={{ padding: 10 }}>
              + Category
            </button>
            <button onClick={openAddAssignment} style={{ padding: 10 }}>
              + Assignment
            </button>
            <button onClick={() => setWhatIfOpen(true)} style={{ padding: 10 }}>
              What-if
            </button>
            {whatIfOpen ? (
              <button
                onClick={() => {
                  setWhatIfOpen(false);
                  setWhatIfCategoryId("");
                  setWhatIfEarned("");
                  setWhatIfPossible("");
                }}
                style={{ padding: 10 }}
              >
                Clear what-if
              </button>
            ) : null}
          </div>

          <h2 style={{ marginTop: 26 }}>Categories</h2>

      <DragList
        items={orderedCats}
        setItems={setCats}
        onPersist={persistCategoryOrder}
        render={(c: Category, { dragHandleProps }) => (
          <div
            key={c.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 800 }}>{c.name}</div>
            <div
              {...dragHandleProps}
              title="Drag to reorder"
              style={{
                float: "right",
                cursor: "grab",
                opacity: 0.6,
                userSelect: "none",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "2px 8px",
                fontSize: 12,
              }}
            >
              ☰
            </div>
            <div style={{ opacity: 0.7 }}>
              {c.weight}% • drop lowest {c.drop_lowest}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 14, opacity: 0.8 }}>
                unweighted:{" "}
                <strong>
                  {formatPct(categoryUnweighted[c.id]?.pct ?? null)}
                </strong>
                {categoryUnweighted[c.id]?.possible ? (
                  <span style={{ opacity: 0.7 }}>
                    {" "}
                    ({categoryUnweighted[c.id].earned}/
                    {categoryUnweighted[c.id].possible})
                  </span>
                ) : null}
              </div>

              <div style={{ fontSize: 14, opacity: 0.8 }}>
                weighted:{" "}
                <strong>{formatPct(categoryWeighted[c.id] ?? null)}</strong>
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => openEditCategory(c)}
                style={{ padding: "6px 10px" }}
              >
                Edit
              </button>
            </div>
          </div>
        )}
      />


          {orderedCats.length === 0 && (
            <div style={{ opacity: 0.7 }}>No categories yet.</div>
          )}
        </>
      ) : (
        <>
          <div
            style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}
          >
            <button onClick={openAddAssignment} style={{ padding: 10 }}>
              + Assignment
            </button>
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                marginTop: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  fontWeight: 700,
                  background: "rgba(15, 23, 42, 0.06)",
                  borderBottom: "1px solid #eee",
                }}
              >
                Ungraded
              </div>
              <div
                style={{
                  display: isMobile ? "none" : "grid",
                  gridTemplateColumns: "1.7fr 1.1fr 1.4fr 0.8fr 90px",
                  gap: 0,
                  fontWeight: 700,
                  padding: 10,
                  background: "var(--table-head-bg)",
                  color: "var(--table-head-fg)",
                }}
              >
                <div>Assignment</div>
                <div style={{ paddingRight: 12 }}>Category</div>
                <div style={{ paddingLeft: 30 }}>Due</div>
                <div>Status</div>
                <div></div>
              </div>

              {ungradedAssignmentsByStatus.map((assignment) => {
                const dueToday = isDueToday(assignment.due_date);
                const categoryName =
                  orderedCats.find((c) => c.id === assignment.category_id)?.name ?? "—";
                return (
                  <div
                    key={assignment.id}
                    style={
                      isMobile
                        ? {
                            display: "grid",
                            gap: 8,
                            padding: 12,
                            borderTop: "1px solid #eee",
                            background: dueToday
                              ? "rgba(255, 235, 59, 0.18)"
                              : "transparent",
                          }
                        : {
                            display: "grid",
                            gridTemplateColumns: "1.7fr 1.1fr 1.4fr 0.8fr 90px",
                            padding: 10,
                            borderTop: "1px solid #eee",
                            alignItems: "center",
                            background: dueToday
                              ? "rgba(255, 235, 59, 0.18)"
                              : "transparent",
                          }
                    }
                  >
                    <div
                      style={
                        isMobile
                          ? {
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }
                          : undefined
                      }
                    >
                      <div
                        style={{ fontWeight: 600, fontSize: isMobile ? 16 : 14 }}
                      >
                        {assignment.title}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{categoryName}</div>
                      {dueToday ? (
                        <div
                          style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}
                        >
                          Due today
                        </div>
                      ) : null}
                    </div>
                    <div
                      style={
                        isMobile
                          ? { fontSize: 13, opacity: 0.7 }
                          : { paddingRight: 12 }
                      }
                    >
                      {isMobile ? "Category" : null}
                      <div style={{ marginTop: isMobile ? 4 : 0 }}>
                        {categoryName}
                      </div>
                    </div>
                    <div
                      style={
                        isMobile
                          ? { fontSize: 13, opacity: 0.7 }
                          : { paddingLeft: 30 }
                      }
                    >
                      {isMobile ? "Due" : null}
                      <div style={{ marginTop: isMobile ? 4 : 0 }}>
                        {formatDueDate(assignment.due_date, assignment.due_time)}
                      </div>
                    </div>
                    <div
                      style={
                        isMobile
                          ? { display: "flex", alignItems: "center", gap: 8 }
                          : undefined
                      }
                    >
                      {isMobile ? (
                        <span style={{ fontSize: 13, opacity: 0.7 }}>Status</span>
                      ) : null}
                      <span style={statusBadgeStyle(assignment.status)}>
                        {assignment.status}
                      </span>
                    </div>
                    <div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditAssignment(assignment);
                        }}
                        style={{
                          padding: isMobile ? "8px 12px" : "4px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--sidebar-bg)",
                          color: "var(--sidebar-fg)",
                          cursor: "pointer",
                          width: isMobile ? "100%" : "auto",
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}

              {ungradedAssignmentsByStatus.length === 0 ? (
                <div style={{ padding: 10, opacity: 0.7 }}>
                  No ungraded assignments.
                </div>
              ) : null}
            </section>

            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  fontWeight: 700,
                  background: "rgba(15, 23, 42, 0.06)",
                  borderBottom: "1px solid #eee",
                }}
              >
                Graded
              </div>
              <div
                style={{
                  display: isMobile ? "none" : "grid",
                  gridTemplateColumns: "1.7fr 1.1fr 1.4fr 0.8fr 90px",
                  gap: 0,
                  fontWeight: 700,
                  padding: 10,
                  background: "var(--table-head-bg)",
                  color: "var(--table-head-fg)",
                }}
              >
                <div>Assignment</div>
                <div style={{ paddingRight: 12 }}>Category</div>
                <div style={{ paddingLeft: 30 }}>Due</div>
                <div>Status</div>
                <div></div>
              </div>

              {gradedAssignmentsByStatus.map((assignment) => {
                const dueToday = isDueToday(assignment.due_date);
                const categoryName =
                  orderedCats.find((c) => c.id === assignment.category_id)?.name ?? "—";
                return (
                  <div
                    key={assignment.id}
                    style={
                      isMobile
                        ? {
                            display: "grid",
                            gap: 8,
                            padding: 12,
                            borderTop: "1px solid #eee",
                            background: dueToday
                              ? "rgba(255, 235, 59, 0.18)"
                              : "transparent",
                          }
                        : {
                            display: "grid",
                            gridTemplateColumns: "1.7fr 1.1fr 1.4fr 0.8fr 90px",
                            padding: 10,
                            borderTop: "1px solid #eee",
                            alignItems: "center",
                            background: dueToday
                              ? "rgba(255, 235, 59, 0.18)"
                              : "transparent",
                          }
                    }
                  >
                    <div
                      style={
                        isMobile
                          ? {
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }
                          : undefined
                      }
                    >
                      <div
                        style={{ fontWeight: 600, fontSize: isMobile ? 16 : 14 }}
                      >
                        {assignment.title}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{categoryName}</div>
                      {dueToday ? (
                        <div
                          style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}
                        >
                          Due today
                        </div>
                      ) : null}
                    </div>
                    <div
                      style={
                        isMobile
                          ? { fontSize: 13, opacity: 0.7 }
                          : { paddingRight: 12 }
                      }
                    >
                      {isMobile ? "Category" : null}
                      <div style={{ marginTop: isMobile ? 4 : 0 }}>
                        {categoryName}
                      </div>
                    </div>
                    <div
                      style={
                        isMobile
                          ? { fontSize: 13, opacity: 0.7 }
                          : { paddingLeft: 30 }
                      }
                    >
                      {isMobile ? "Due" : null}
                      <div style={{ marginTop: isMobile ? 4 : 0 }}>
                        {formatDueDate(assignment.due_date, assignment.due_time)}
                      </div>
                    </div>
                    <div
                      style={
                        isMobile
                          ? { display: "flex", alignItems: "center", gap: 8 }
                          : undefined
                      }
                    >
                      {isMobile ? (
                        <span style={{ fontSize: 13, opacity: 0.7 }}>Status</span>
                      ) : null}
                      <span style={statusBadgeStyle(assignment.status)}>
                        {assignment.status}
                      </span>
                    </div>
                    <div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditAssignment(assignment);
                        }}
                        style={{
                          padding: isMobile ? "8px 12px" : "4px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--sidebar-bg)",
                          color: "var(--sidebar-fg)",
                          cursor: "pointer",
                          width: isMobile ? "100%" : "auto",
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}

              {gradedAssignmentsByStatus.length === 0 ? (
                <div style={{ padding: 10, opacity: 0.7 }}>
                  No graded assignments.
                </div>
              ) : null}
            </section>
          </div>
        </>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          onClick={deleteCourse}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(220, 38, 38, 0.6)",
            color: "#dc2626",
            background: "transparent",
            fontWeight: 600,
          }}
        >
          Delete class
        </button>
      </div>

      {/* Category modal */}
      <Modal
        open={catModalOpen}
        title={editingCategoryId ? "Edit category" : "Add category"}
        onClose={closeCategoryModal}
      >
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Name</label>
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Exams"
            />
          </div>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Weight (%)</label>
            <input
              value={catWeight}
              onChange={(e) => setCatWeight(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Drop lowest</label>
            <input
              value={catDrop}
              onChange={(e) => setCatDrop(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>
        <div className="actions">
          <button onClick={closeCategoryModal}>Cancel</button>
          <button onClick={saveCategory}>
            {editingCategoryId ? "Save changes" : "Save"}
          </button>
        </div>
      </Modal>

      {/* Assignment modal */}
      <Modal
        open={asgModalOpen}
        title={editId ? "Edit assignment" : "Add assignment"}
        onClose={() => setAsgModalOpen(false)}
      >
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Title</label>
            <input
              value={asgTitle}
              onChange={(e) => setAsgTitle(e.target.value)}
              placeholder="Midterm 1"
            />
          </div>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Category</label>
            <select
              value={asgCategoryId}
              onChange={(e) => setAsgCategoryId(e.target.value)}
            >
              {orderedCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Status</label>
            <select
              value={asgStatus}
              onChange={(e) =>
                setAsgStatus(e.target.value as Assignment["status"])
              }
            >
              <option value="planned">planned</option>
              <option value="submitted">submitted</option>
              <option value="graded">graded</option>
              <option value="missing">missing</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Points earned (blank = planned)</label>
            <input
              value={asgEarned}
              onChange={(e) => setAsgEarned(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Points possible (blank = planned)</label>
            <input
              value={asgPossible}
              onChange={(e) => setAsgPossible(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Due date</label>
            <input
              type="date"
              value={asgDueDate}
              onChange={(e) => setAsgDueDate(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Due time</label>
            <input
              type="time"
              value={asgDueTime}
              onChange={(e) => setAsgDueTime(e.target.value)}
            />
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
          Tip: Adding an assignment with the same{" "}
          <strong>title + category</strong> will override the old one.
        </div>

        <div className="actions">
          <button onClick={() => setAsgModalOpen(false)}>Cancel</button>
          <button onClick={saveAssignment}>
            {editId ? "Save changes" : "Add"}
          </button>
        </div>
      </Modal>

      {/* What-if modal */}
      <Modal
        open={whatIfOpen}
        title="What-if (not saved)"
        onClose={() => setWhatIfOpen(false)}
      >
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Category</label>
            <select
              value={whatIfCategoryId}
              onChange={(e) => setWhatIfCategoryId(e.target.value)}
            >
              <option value="">Select…</option>
              {orderedCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Points earned</label>
            <input
              value={whatIfEarned}
              onChange={(e) => setWhatIfEarned(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Points possible</label>
            <input
              value={whatIfPossible}
              onChange={(e) => setWhatIfPossible(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          This temporarily affects the grade display only. Nothing is written to
          the database.
        </div>

        <div className="actions">
          <button onClick={() => setWhatIfOpen(false)}>Close</button>
        </div>
      </Modal>

    </main>
  );
}
