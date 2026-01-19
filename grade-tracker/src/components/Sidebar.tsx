"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";

type Course = { term: string | null };
type Term = { id: string; name: string; position: number; archived: boolean };

type SidebarProps = {
  onToggle?: () => void;
};

export default function Sidebar({ onToggle }: SidebarProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string>("All");

  const [termModalOpen, setTermModalOpen] = useState(false);
  const [newTermName, setNewTermName] = useState("");

  useEffect(() => {
    const syncTerm = () =>
      setSelectedTerm(localStorage.getItem("selectedTerm") ?? "All");

    syncTerm();
    window.addEventListener("storage", syncTerm);
    return () => window.removeEventListener("storage", syncTerm);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const syncMobile = () => setIsMobile(mediaQuery.matches);
    syncMobile();
    mediaQuery.addEventListener("change", syncMobile);
    return () => mediaQuery.removeEventListener("change", syncMobile);
  }, []);

  useEffect(() => {
    localStorage.setItem("selectedTerm", selectedTerm);
    window.dispatchEvent(new Event("term-change"));
  }, [selectedTerm]);

  async function loadCourses() {
    const { data } = await supabase.from("courses").select("term");
    setCourses((data ?? []) as Course[]);
  }

  async function loadTerms() {
    const { data } = await supabase
      .from("terms")
      .select("id,name,position,archived")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    setTerms((data ?? []) as Term[]);
  }

  useEffect(() => {
    loadCourses();
    loadTerms();

    const ch = supabase
      .channel("sidebar-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courses" },
        () => loadCourses(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "terms" },
        () => loadTerms(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const termOptions = useMemo(() => {
    const fromCourses = new Set<string>();
    for (const c of courses) fromCourses.add(c.term ?? "—");

    const archivedNames = new Set(
      terms.filter((t) => t.archived).map((t) => t.name),
    );
    const explicit = terms.filter((t) => !t.archived).map((t) => t.name);
    const legacy = Array.from(fromCourses).filter(
      (t) => t !== "—" && !explicit.includes(t) && !archivedNames.has(t),
    );

    return ["All", ...explicit, ...legacy];
  }, [terms, courses]);

  useEffect(() => {
    if (selectedTerm === "All") return;
    if (!termOptions.includes(selectedTerm)) {
      setSelectedTerm("All");
    }
  }, [selectedTerm, termOptions]);

  async function createTerm() {
    const name = newTermName.trim();
    if (!name) return;

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      alert("Please log in first.");
      return;
    }

    const position = terms.length;

    const { error } = await supabase.from("terms").insert({
      user_id: user.id,
      name,
      position,
      archived: false,
    });

    if (error) {
      alert(error.message);
      return;
    }

    await loadTerms();
    await loadCourses();
    setTermModalOpen(false);
    setNewTermName("");
    setSelectedTerm(name);
  }

  async function deleteSelectedTerm() {
    const name = selectedTerm;
    if (name === "All") return;

    const termRow = terms.find((t) => t.name === name);
    if (!termRow) {
      alert(
        "That term is not in the terms table (it may be coming from existing courses).",
      );
      return;
    }

    if (
      !confirm(
        `Archive term "${name}"? (Courses stay intact, but the term moves to Archived.)`,
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("terms")
      .update({ archived: true })
      .eq("id", termRow.id);
    if (error) {
      alert(error.message);
      return;
    }

    await loadTerms();
    await loadCourses();
    setSelectedTerm("All");
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="sidebar">
      <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 12 }}>
        See My Grades
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 8 }}>Term</div>
        <select
          value={selectedTerm}
          onChange={(e) => setSelectedTerm(e.target.value)}
          style={{
            width: "100%",
            padding: 12,
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "inherit",
          }}
        >
          {termOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <button
            onClick={() => {
              setNewTermName("");
              setTermModalOpen(true);
            }}
            style={{ padding: "10px 12px", flex: 1, fontSize: 15 }}
          >
            + Term
          </button>

          <button
            onClick={deleteSelectedTerm}
            disabled={selectedTerm === "All"}
            style={{
              padding: "10px 12px",
              flex: 1,
              fontSize: 15,
              opacity: selectedTerm === "All" ? 0.5 : 1,
            }}
          >
            Archive
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Link
          href="/"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            textDecoration: "none",
            fontSize: 16,
          }}
        >
          Dashboard
        </Link>

        <Link
          href="/archived"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            textDecoration: "none",
            fontSize: 16,
          }}
        >
          Archived
        </Link>

        <Link
          href="/assignments"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            textDecoration: "none",
            fontSize: 16,
          }}
        >
          Assignments
        </Link>

        <Link
          href="/settings"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            textDecoration: "none",
            fontSize: 16,
          }}
        >
          Settings
        </Link>

        <button
          onClick={logout}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "inherit",
            textAlign: "left",
            fontSize: 16,
          }}
        >
          Logout
        </button>

        {onToggle && isMobile ? (
          <button
            onClick={onToggle}
            className="sidebar-toggle"
            style={{ textAlign: "left" }}
          >
            Hide menu
          </button>
        ) : null}
      </div>

      <Modal
        open={termModalOpen}
        title="Add term"
        onClose={() => setTermModalOpen(false)}
      >
        <div className="row">
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 14 }}>Term name</label>
            <input
              value={newTermName}
              onChange={(e) => setNewTermName(e.target.value)}
              placeholder="Spring 2026"
              style={{ padding: 12, fontSize: 16, borderRadius: 12 }}
            />
          </div>
        </div>
        <div className="actions">
          <button onClick={() => setTermModalOpen(false)}>Cancel</button>
          <button onClick={createTerm}>Add</button>
        </div>
      </Modal>
    </aside>
  );
}
