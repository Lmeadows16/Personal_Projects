"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Course = { id: string; name: string; term: string | null };

type Assignment = {
  id: string;
  course_id: string;
  title: string;
  status: "planned" | "submitted" | "graded" | "missing";
  due_date: string | null;
  due_time: string | null;
};

type AssignmentRow = {
  assignment: Assignment;
  course: Course | null;
};

function normalizeDateInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function normalizeTimeInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function dateFromInput(value: string | null) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function formatDueDate(value: string | null, timeValue: string | null) {
  const date = dateFromInput(value);
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
      return { ...base, background: "rgba(0, 200, 0, 0.28)" };
    case "submitted":
      return { ...base, background: "rgba(0, 120, 255, 0.28)" };
    case "missing":
      return { ...base, background: "rgba(255, 0, 0, 0.32)" };
    case "planned":
    default:
      return { ...base, background: "rgba(255, 255, 255, 0.18)" };
  }
}

function toAssignmentRows(
  assignments: Assignment[],
  courses: Course[],
): AssignmentRow[] {
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  return assignments.map((assignment) => ({
    assignment,
    course: courseMap.get(assignment.course_id) ?? null,
  }));
}

function sortRows(rows: AssignmentRow[]) {
  return [...rows].sort((a, b) => {
    const aTime = dateFromInput(a.assignment.due_date)?.getTime() ?? Infinity;
    const bTime = dateFromInput(b.assignment.due_date)?.getTime() ?? Infinity;
    return aTime - bTime;
  });
}

function sortNoDateRows(rows: AssignmentRow[]) {
  return [...rows].sort((a, b) => {
    const courseNameA = a.course?.name ?? "";
    const courseNameB = b.course?.name ?? "";
    const courseSort = courseNameA.localeCompare(courseNameB);
    if (courseSort !== 0) return courseSort;
    return a.assignment.title.localeCompare(b.assignment.title);
  });
}

function isOverdue(
  assignment: Assignment,
  dueDate: Date | null,
  today: Date,
) {
  if (!dueDate) return false;
  if (assignment.status === "submitted" || assignment.status === "graded") {
    return false;
  }
  return dueDate.getTime() < today.getTime();
}

function isDueTodayDate(dueDate: Date | null, today: Date) {
  if (!dueDate) return false;
  return dueDate.getTime() === today.getTime();
}

function isUpcoming(dueDate: Date | null, today: Date) {
  if (!dueDate) return false;
  const weekFromToday = new Date(today);
  weekFromToday.setDate(today.getDate() + 7);
  return (
    dueDate.getTime() > today.getTime() &&
    dueDate.getTime() <= weekFromToday.getTime()
  );
}

export default function AssignmentsBreakdown() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string>("All");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(
    null,
  );
  const [formTitle, setFormTitle] = useState("");
  const [formCourseId, setFormCourseId] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formDueTime, setFormDueTime] = useState("");
  const [formStatus, setFormStatus] = useState<Assignment["status"]>("planned");
  const [formError, setFormError] = useState<string | null>(null);

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
      .select("id,course_id,title,status,due_date,due_time");

    setCourses((courseRows.data ?? []) as Course[]);
    setAssignments((assignmentRows.data ?? []) as Assignment[]);
  }

  function resetForm() {
    setFormTitle("");
    setFormCourseId("");
    setFormDueDate("");
    setFormDueTime("");
    setFormStatus("planned");
    setFormError(null);
    setEditingAssignment(null);
  }

  function openCreateDrawer() {
    resetForm();
    setIsDrawerOpen(true);
  }

  function openEditDrawer(assignment: Assignment) {
    setEditingAssignment(assignment);
    setFormTitle(assignment.title);
    setFormCourseId(assignment.course_id);
    setFormDueDate(normalizeDateInput(assignment.due_date));
    setFormDueTime(normalizeTimeInput(assignment.due_time));
    setFormStatus(assignment.status === "missing" ? "planned" : assignment.status);
    setFormError(null);
    setIsDrawerOpen(true);
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formTitle.trim()) {
      setFormError("Assignment title is required.");
      return;
    }
    if (!formCourseId) {
      setFormError("Select a course.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const payload = {
      title: formTitle.trim(),
      course_id: formCourseId,
      status: formStatus,
      due_date: formDueDate ? `${formDueDate}T00:00:00` : null,
      due_time: formDueTime ? normalizeTimeInput(formDueTime) : null,
    };

    const { error } = editingAssignment
      ? await supabase
          .from("assignments")
          .update(payload)
          .eq("id", editingAssignment.id)
      : await supabase.from("assignments").insert(payload);

    if (error) {
      setFormError(error.message);
      setIsSaving(false);
      return;
    }

    await loadData();
    setIsSaving(false);
    resetForm();
    setIsDrawerOpen(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const visibleCourses = useMemo(() => {
    if (selectedTerm === "All") return [];
    return courses.filter((course) => (course.term ?? "—") === selectedTerm);
  }, [courses, selectedTerm]);

  const rows = useMemo(() => {
    const visibleCourseIds = new Set(visibleCourses.map((course) => course.id));
    const filteredAssignments = assignments.filter(
      (assignment) =>
        visibleCourseIds.has(assignment.course_id) &&
        assignment.status !== "submitted" &&
        assignment.status !== "graded",
    );
    return toAssignmentRows(filteredAssignments, visibleCourses);
  }, [assignments, visibleCourses]);

  const todayDate = useMemo(() => startOfDay(new Date()), []);

  const columnsByCourse = useMemo(() => {
    return visibleCourses.map((course) => {
      const courseRows = rows.filter(
        (row) => row.assignment.course_id === course.id,
      );
      const overdue: AssignmentRow[] = [];
      const todayRows: AssignmentRow[] = [];
      const week: AssignmentRow[] = [];
      const noDate: AssignmentRow[] = [];

      courseRows.forEach((row) => {
        const dueDate = dateFromInput(row.assignment.due_date);
        if (!dueDate) {
          noDate.push(row);
          return;
        }
        const normalizedDueDate = startOfDay(dueDate);
        if (isOverdue(row.assignment, normalizedDueDate, todayDate)) {
          overdue.push(row);
          return;
        }
        if (isDueTodayDate(normalizedDueDate, todayDate)) {
          todayRows.push(row);
          return;
        }
        if (isUpcoming(normalizedDueDate, todayDate)) {
          week.push(row);
          return;
        }
        noDate.push(row);
      });

      return {
        course,
        overdue: sortRows(overdue),
        today: sortRows(todayRows),
        week: sortRows(week),
        noDate: sortNoDateRows(noDate),
      };
    });
  }, [rows, todayDate, visibleCourses]);

  const totalNoDateRows = useMemo(() => {
    const noDateRows = rows.filter((row) => !row.assignment.due_date);
    return sortNoDateRows(noDateRows);
  }, [rows]);

  const tabBase: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    textDecoration: "none",
    fontSize: 14,
  };

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
        <Link href="/assignments" style={tabBase}>
          Summary
        </Link>
        <span
          style={{
            ...tabBase,
            background: "var(--table-head-bg)",
            borderColor: "var(--border)",
            fontWeight: 600,
          }}
        >
          Breakdown
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28 }}>
            Assignments board
          </h1>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Showing: <strong>{selectedTerm}</strong>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreateDrawer}
          disabled={selectedTerm === "All"}
          style={{
            borderRadius: 999,
            border: "1px solid #111",
            padding: "10px 16px",
            background: selectedTerm === "All" ? "#eee" : "#111",
            color: selectedTerm === "All" ? "#666" : "#fff",
            cursor: selectedTerm === "All" ? "not-allowed" : "pointer",
            width: isMobile ? "100%" : "auto",
          }}
        >
          Add assignment
        </button>
      </div>

      {selectedTerm === "All" ? (
        <div style={{ opacity: 0.7 }}>
          Select a term in the sidebar to view assignments.
        </div>
      ) : null}

      {isDrawerOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--backdrop)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 20,
          }}
          onClick={() => {
            if (!isSaving) {
              resetForm();
              setIsDrawerOpen(false);
            }
          }}
        >
          <div
            style={{
              width: "min(420px, 100%)",
              height: "100%",
              background: "var(--modal-bg)",
              color: "var(--modal-fg)",
              padding: isMobile ? 18 : 24,
              boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.12)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              borderLeft: isMobile ? "none" : "1px solid var(--border)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {editingAssignment ? "Edit assignment" : "New assignment"}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  {selectedTerm === "All"
                    ? "Select a term to add assignments."
                    : `Adding to ${selectedTerm}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSaving) {
                    resetForm();
                    setIsDrawerOpen(false);
                  }
                }}
                style={{
                  border: "1px solid #ddd",
                  background: "transparent",
                  borderRadius: 8,
                  padding: "4px 10px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                }}
              >
                Close
              </button>
            </div>

            <form
              onSubmit={handleCreateAssignment}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Assignment title
                </span>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(event) => setFormTitle(event.target.value)}
                  placeholder="Essay draft"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                  }}
                />
              </label>

              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>Course</span>
                <select
                  value={formCourseId}
                  onChange={(event) => setFormCourseId(event.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                  }}
                  disabled={selectedTerm === "All"}
                >
                  <option value="">Select a course</option>
                  {visibleCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 12,
                }}
              >
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Due date
                  </span>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(event) => setFormDueDate(event.target.value)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                    }}
                  />
                </label>

                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Due time
                  </span>
                  <input
                    type="time"
                    value={formDueTime}
                    onChange={(event) => setFormDueTime(event.target.value)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                    }}
                  />
                </label>
              </div>

              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>Status</span>
                <select
                  value={formStatus}
                  onChange={(event) =>
                    setFormStatus(event.target.value as Assignment["status"])
                  }
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                  }}
                >
                  <option value="planned">Planned</option>
                  <option value="submitted">Submitted</option>
                  <option value="graded">Graded</option>
                </select>
              </label>

              {formError ? (
                <div style={{ color: "#b91c1c", fontSize: 13 }}>
                  {formError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSaving}
                style={{
                  borderRadius: 10,
                  border: "1px solid #111",
                  padding: "10px 16px",
                  background: "#111",
                  color: "#fff",
                  cursor: isSaving ? "not-allowed" : "pointer",
                }}
              >
                {isSaving
                  ? "Saving..."
                  : editingAssignment
                    ? "Update assignment"
                    : "Save assignment"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {selectedTerm !== "All" ? (
        <div style={{ display: "grid", gap: 24 }}>
          {visibleCourses.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No classes in this term yet.</div>
          ) : null}

          {columnsByCourse.map(({ course, overdue, today, week }) => (
            <section
              key={course.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 16,
                padding: isMobile ? 12 : 16,
                background: "rgba(15, 23, 42, 0.01)",
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: isMobile ? 16 : 18 }}>
                  {course.name}
                </div>
                <Link
                  href={`/course/${course.id}`}
                  style={{ textDecoration: "none", fontSize: 13, opacity: 0.7 }}
                >
                  Open course
                </Link>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                {[
                  { key: "today", label: "Today", rows: today },
                  { key: "week", label: "This week", rows: week },
                  { key: "overdue", label: "Overdue", rows: overdue },
                ].map(({ key, label, rows }) => (
                  <div
                    key={key}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                      background:
                        key === "overdue"
                          ? "rgba(254, 226, 226, 0.3)"
                          : "rgba(255, 255, 255, 0.45)",
                      minHeight: 120,
                      display: "grid",
                      gap: 10,
                      alignContent: "start",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{label}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {rows.length}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {rows.map((row) => {
                        const dueDate = dateFromInput(row.assignment.due_date);
                        const normalizedDueDate = dueDate
                          ? startOfDay(dueDate)
                          : null;
                        const overdueStatus = normalizedDueDate
                          ? isOverdue(row.assignment, normalizedDueDate, todayDate)
                          : false;
                        const resolvedStatus = overdueStatus
                          ? "missing"
                          : row.assignment.status === "missing"
                            ? "planned"
                            : row.assignment.status;
                        return (
                          <div
                            key={row.assignment.id}
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: 12,
                              padding: 12,
                              background: "var(--sidebar-bg)",
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: isMobile ? 15 : 14,
                                }}
                              >
                                {row.assignment.title}
                              </div>
                              <button
                                type="button"
                                onClick={() => openEditDrawer(row.assignment)}
                                style={{
                                  borderRadius: 8,
                                  border: "1px solid var(--border)",
                                  padding: "4px 8px",
                              background: "rgba(255, 255, 255, 0.55)",

                                  color: "var(--sidebar-fg)",
                                  cursor: "pointer",
                                }}
                              >
                                Edit
                              </button>
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              {formatDueDate(
                                row.assignment.due_date,
                                row.assignment.due_time,
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <span style={statusBadgeStyle(resolvedStatus)}>
                                {resolvedStatus}
                              </span>
                              {overdueStatus ? (
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#b91c1c",
                                  }}
                                >
                                  Past due
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {rows.length === 0 ? (
                        <div style={{ fontSize: 13, opacity: 0.6 }}>
                          No assignments.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: 16,
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
              Assignments without due dates
            </div>
            <div
              style={{
                display: isMobile ? "none" : "grid",
                gridTemplateColumns: "1.4fr 1.1fr 1fr 90px",
                gap: 0,
                fontWeight: 700,
                padding: 10,
                background: "var(--table-head-bg)",
                color: "var(--table-head-fg)",
              }}
            >
              <div>Assignment</div>
              <div>Course</div>
              <div>Status</div>
              <div></div>
            </div>

            {totalNoDateRows.map(({ assignment, course }) => {
              const resolvedStatus =
                assignment.status === "missing" ? "planned" : assignment.status;
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
                        }
                      : {
                          display: "grid",
                          gridTemplateColumns: "1.4fr 1.1fr 1fr 90px",
                          padding: 10,
                          borderTop: "1px solid #eee",
                          alignItems: "center",
                        }
                  }
                >
                  <div style={{ fontWeight: 600, fontSize: isMobile ? 15 : 14 }}>
                    {assignment.title}
                  </div>
                  <div style={isMobile ? { fontSize: 13, opacity: 0.7 } : {}}>
                    {isMobile ? "Course" : null}
                    <div style={{ marginTop: isMobile ? 4 : 0 }}>
                      {course ? (
                        <Link
                          href={`/course/${course.id}`}
                          style={{ textDecoration: "none" }}
                        >
                          {course.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                  <div>
                    {isMobile ? (
                      <span style={{ fontSize: 13, opacity: 0.7 }}>Status</span>
                    ) : null}
                    <div style={{ marginTop: isMobile ? 4 : 0 }}>
                      <span style={statusBadgeStyle(resolvedStatus)}>
                        {resolvedStatus}
                      </span>
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => openEditDrawer(assignment)}
                      style={{
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        padding: isMobile ? "8px 12px" : "4px 10px",
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

            {totalNoDateRows.length === 0 ? (
              <div style={{ padding: 10, opacity: 0.7 }}>
                No assignments without a due date.
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
