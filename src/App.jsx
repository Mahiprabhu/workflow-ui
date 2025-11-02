// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ------------------ Status model ------------------ */
const STATUSES = [
  "complaint_unallocated",
  "ch_review",
  "pick_up",
  "ch_complaint_closed",
  "ref_to_bo_uk",
  "ref_to_bo_ind",
  "ref_to_finance",
  "ref_to_aps",
  "ref_to_cuw",
  "ref_to_fct",
  "ref_to_client",
  "ref_to_rs",
  "ref_to_ph",
  "ch_referral_complete",
  "rwol_product",
  "ref_to_timeline_update",
];

const LABEL = {
  complaint_unallocated: "Complaint Unallocated",
  ch_review: "CH Review",
  pick_up: "Pick up",
  ch_complaint_closed: "CH Complaint Closed",
  ref_to_bo_uk: "Ref to BO UK",
  ref_to_bo_ind: "Ref to BO Ind",
  ref_to_finance: "Ref to Finance",
  ref_to_aps: "Ref to APS",
  ref_to_cuw: "Ref to C&UW",
  ref_to_fct: "Ref to FCT",
  ref_to_client: "Ref to Client",
  ref_to_rs: "Ref to RS",
  ref_to_ph: "Ref to PH",
  ch_referral_complete: "CH Referral Complete",
  rwol_product: "RWOL Product",
  ref_to_timeline_update: "Ref to Timeline Update",
};

const DESC = {
  complaint_unallocated: "Complaint request is yet to be allocated to CH for review",
  ch_review: "Complaint allocated to CH for review",
  pick_up: "Complaint Request is picked up for processing",
  ch_complaint_closed: "Complaint is closed by the CH",
  ref_to_bo_uk: "Ref to UK Backoffice for further action",
  ref_to_bo_ind: "Ref to India Backoffice for further action",
  ref_to_finance: "Ref to Finance for further action",
  ref_to_aps: "Ref to APS for calculations and pending action",
  ref_to_cuw: "Ref to Claims & Underwriting team",
  ref_to_fct: "Ref to Financial Crime Team for decision/guidance",
  ref_to_client: "Ref to Client for direction or decision",
  ref_to_rs: "Awaiting details from the Receiving Scheme",
  ref_to_ph: "Awaiting details/documents from Policy Holder",
  ch_referral_complete: "Returned to complaint handler post referral actions",
  rwol_product: "Complaints related to RWOL Product",
  ref_to_timeline_update: "Referred to India team for Timeline updation",
};

/* ------------------ Transition rules ------------------ */
const ALLOWED_NEXT = {
  complaint_unallocated: ["ch_review"],
  ch_review: ["pick_up"],
  pick_up: [
    "ch_complaint_closed",
    "ref_to_bo_uk",
    "ref_to_bo_ind",
    "ref_to_finance",
    "ref_to_aps",
    "ref_to_cuw",
    "ref_to_fct",
    "ref_to_client",
    "ref_to_rs",
    "ref_to_ph",
    "rwol_product",
    "ref_to_timeline_update",
  ],
  ref_to_bo_uk: ["ch_referral_complete"],
  ref_to_bo_ind: ["ch_referral_complete"],
  ref_to_finance: ["ch_referral_complete"],
  ref_to_aps: ["ch_referral_complete"],
  ref_to_cuw: ["ch_referral_complete"],
  ref_to_fct: ["ch_referral_complete"],
  ref_to_client: ["ch_referral_complete"],
  ref_to_rs: ["ch_referral_complete"],
  ref_to_ph: ["ch_referral_complete"],
  ch_referral_complete: ["ch_review", "pick_up"],
  ch_complaint_closed: [],
  rwol_product: ["ch_review", "pick_up"],
  ref_to_timeline_update: ["ch_referral_complete"],
};
const canTransition = (from, to) => ALLOWED_NEXT[from]?.includes(to);

/* ------------------ Helpers ------------------ */
const fmtDate = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString("en-GB", { month: "short" });
  const yr = d.getFullYear();
  return `${day}-${mon}-${yr}`;
};
const fmtDateTime = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
const fmtDuration = (ms) => {
  if (!ms || ms < 1000) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}h ` : ""}${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
};
const currentElapsedMs = (it) =>
  it.startTime && !it.endTime ? Date.now() - it.startTime : it.startTime && it.endTime ? it.endTime - it.startTime : 0;
const totalSpentMs = (it) => {
  const active = it.status === "pick_up" && it.startTime && !it.endTime ? Date.now() - it.startTime : 0;
  return (it.spentMs || 0) + active;
};

// parse helpers for filters
const parseDateOnly = (val) => (val ? new Date(`${val}T00:00:00`).getTime() : null);
const parseDateTimeLocal = (val) => (val ? new Date(val).getTime() : null);

/* ------------------ API ------------------ */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5174/api";

const api = {
  async listItems() {
    const r = await fetch(`${API_BASE}/items`);
    if (!r.ok) throw new Error(`List failed: ${r.status}`);
    return r.json();
  },
  async updateItem(id, patch) {
    const r = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`Update failed: ${r.status}`);
    return r.json();
  },
  async createItem(payload) {
    const r = await fetch(`${API_BASE}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Create failed: ${r.status}`);
    return r.json();
  },
  async deleteItem(id) {
    const r = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) throw new Error(`Delete failed: ${r.status}`);
  },
};

/* ------------------ UI atoms ------------------ */
function Toasts({ toasts, remove }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-3 py-2 rounded-xl shadow text-sm ${
            t.type === "error" ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900"
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="font-medium">{t.type === "error" ? "Error" : "Success"}</div>
            <div className="opacity-80">{t.msg}</div>
            <button className="ml-2 opacity-60 hover:opacity-100" onClick={() => remove(t.id)}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ title, value, gradient, onClick, active = false }) {
  const g = {
    blue: "from-sky-500 to-blue-600 ring-sky-700/30",
    amber: "from-amber-500 to-orange-600 ring-amber-700/30",
    green: "from-emerald-500 to-green-600 ring-emerald-700/30",
  }[gradient];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br ${g} text-left text-white shadow-lg ring-1 transition
        hover:translate-y-[-1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white/60
        ${active ? "ring-2 ring-white/70" : ""}`}
      title={title}
    >
      <div className="p-5">
        <div className="text-xs uppercase tracking-wider/loose opacity-90">{title}</div>
        <div className="mt-1 text-4xl font-bold drop-shadow-sm">{value}</div>
      </div>
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute right-6 top-6 h-6 w-6 rounded-full bg-white/25 group-hover:bg-white/35 transition" />
    </button>
  );
}

function Modal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-lg font-medium">{title}</h3>
          <button className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function CommentsCell({ item, onAdd, onViewAll }) {
  const c = item.comments || [];
  const latest = c[c.length - 1];
  return (
    <div className="min-w-[260px]">
      {c.length > 0 ? (
        <div className="text-xs">
          <div className="mb-0.5 text-slate-500">({c.length}) latest</div>
          <div className="text-slate-800">
            {latest ? (latest.text.length > 40 ? latest.text.slice(0, 40) + "…" : latest.text) : ""}
          </div>
          <div className="text-slate-500">{latest ? fmtDateTime(latest.ts) : ""}</div>
        </div>
      ) : (
        <span className="text-xs text-slate-400">No comments</span>
      )}
      <div className="mt-1 flex gap-2">
        <button type="button" className="rounded-lg bg-slate-900 px-2 py-0.5 text-xs text-white" onClick={onAdd}>
          Add
        </button>
        <button
          type="button"
          className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-800 hover:bg-slate-200"
          onClick={onViewAll}
          disabled={c.length === 0}
        >
          View all
        </button>
      </div>
    </div>
  );
}

/* ------------------ App ------------------ */
export default function App() {
  const currentUser = "mahi";

  // Tabs + roll-up quick filter (affects Manager grid only)
  const [tab, setTab] = useState("manager"); // 'manager' | 'user' | 'referrals'
  const [managerQuick, setManagerQuick] = useState("all"); // 'all' | 'pipeline' | 'completed'

  // Data + loading
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const pushToast = (msg, type = "success") =>
    setToasts((ts) => [...ts, { id: Math.random().toString(36).slice(2), msg, type }]);
  const removeToast = (id) => setToasts((ts) => ts.filter((t) => t.id !== id));

  // Tick to refresh timers
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Inputs refs for keyboard shortcuts (already supported by your codebase if you had it)
  const managerSearchRef = useRef(null);
  const userSearchRef = useRef(null);
  const refSearchRef = useRef(null);

  // Fetch on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await api.listItems();
        setItems(data);
      } catch (e) {
        pushToast(e.message || "Failed to load items", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------- Sorting & Filtering State (per grid) ---------- */
  // A small helper for sort state:
  // { key: 'id'|'title'|... , dir: 'asc'|'desc'|null }
  const [mgrSort, setMgrSort] = useState({ key: null, dir: null });
  const [usrSort, setUsrSort] = useState({ key: null, dir: null });
  const [refSort, setRefSort] = useState({ key: null, dir: null });

  // Inline per-column filters
  const emptyFilter = {
    id: "",
    title: "",
    recFrom: "",
    recTo: "",
    logFrom: "",
    logTo: "",
    assignee: "",
    status: "",
    startFrom: "",
    startTo: "",
    endFrom: "",
    endTo: "",
    timeMin: "",
    timeMax: "",
    comments: "",
  };
  const [mgrFilter, setMgrFilter] = useState({ ...emptyFilter });
  const [usrFilter, setUsrFilter] = useState({ ...emptyFilter });
  const [refFilter, setRefFilter] = useState({ ...emptyFilter });

  /* ---------- Derived: summary & totals ---------- */
  const summary = useMemo(() => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const it of items) counts[it.status]++;
    return counts;
  }, [items, tick]); // tick so 'pick_up' timing doesn't affect counts; harmless

  const totals = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === "ch_complaint_closed").length;
    const pipeline = total - completed;
    return { total, pipeline, completed };
  }, [items]);

  /* ---------- Filters & Sorting Utilities ---------- */
  const applyColumnFilters = (rows, f) => {
    // Text contains matches:
    const contains = (v, needle) => String(v ?? "").toLowerCase().includes(needle.trim().toLowerCase());

    // Date / datetime ranges:
    const withinRange = (ts, fromTs, toTs, endOfDay = false) => {
      if (!ts) return false;
      if (fromTs && ts < fromTs) return false;
      if (toTs) {
        const limit = endOfDay ? toTs + 24 * 60 * 60 * 1000 - 1 : toTs;
        if (ts > limit) return false;
      }
      return true;
    };

    const recFromTs = parseDateOnly(f.recFrom);
    const recToTs = parseDateOnly(f.recTo);
    const logFromTs = parseDateOnly(f.logFrom);
    const logToTs = parseDateOnly(f.logTo);

    const startFromTs = parseDateTimeLocal(f.startFrom);
    const startToTs = parseDateTimeLocal(f.startTo);
    const endFromTs = parseDateTimeLocal(f.endFrom);
    const endToTs = parseDateTimeLocal(f.endTo);

    const timeMinMs = f.timeMin ? Number(f.timeMin) * 1000 : null; // seconds → ms
    const timeMaxMs = f.timeMax ? Number(f.timeMax) * 1000 : null;

    return rows.filter((it) => {
      if (f.id && !contains(it.id, f.id)) return false;
      if (f.title && !contains(it.title, f.title)) return false;
      if (f.assignee && !contains(it.assignee ?? "", f.assignee)) return false;
      if (f.status && !contains(LABEL[it.status] ?? it.status, f.status)) return false;

      if (f.recFrom || f.recTo) {
        if (!withinRange(it.receivedDate, recFromTs, recToTs, true)) return false;
      }
      if (f.logFrom || f.logTo) {
        if (!withinRange(it.loggedDate, logFromTs, logToTs, true)) return false;
      }
      if (f.startFrom || f.startTo) {
        if (!withinRange(it.startTime, startFromTs, startToTs)) return false;
      }
      if (f.endFrom || f.endTo) {
        if (!withinRange(it.endTime, endFromTs, endToTs)) return false;
      }

      if (f.timeMin || f.timeMax) {
        const t = totalSpentMs(it);
        if (timeMinMs != null && t < timeMinMs) return false;
        if (timeMaxMs != null && t > timeMaxMs) return false;
      }

      if (f.comments) {
        const joined = (it.comments ?? []).map((c) => c.text).join(" | ");
        if (!contains(joined, f.comments)) return false;
      }

      return true;
    });
  };

  const applySort = (rows, sort) => {
    if (!sort.key || !sort.dir) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;

    const getVal = (it) => {
      switch (sort.key) {
        case "id":
          return it.id;
        case "title":
          return it.title;
        case "receivedDate":
          return it.receivedDate ?? 0;
        case "loggedDate":
          return it.loggedDate ?? 0;
        case "assignee":
          return it.assignee ?? "";
        case "status":
          return LABEL[it.status] ?? it.status;
        case "startTime":
          return it.startTime ?? 0;
        case "endTime":
          return it.endTime ?? 0;
        case "timeSpent":
          return totalSpentMs(it);
        default:
          return "";
      }
    };

    const copy = [...rows];
    copy.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return copy;
  };

  const cycleSort = (current, key) => {
    // Asc -> Desc -> None
    if (current.key !== key) return { key, dir: "asc" };
    if (current.dir === "asc") return { key, dir: "desc" };
    return { key: null, dir: null };
  };

  /* ---------- Quick filters for Manager (roll-up tiles) ---------- */
  const applyManagerQuick = (rows) => {
    if (managerQuick === "pipeline") return rows.filter((r) => r.status !== "ch_complaint_closed");
    if (managerQuick === "completed") return rows.filter((r) => r.status === "ch_complaint_closed");
    return rows; // all
  };

  /* ---------- Derived rows for each grid ---------- */
  // Manager
  const managerRows = useMemo(() => {
    const filtered = applyColumnFilters(items, mgrFilter);
    const quick = applyManagerQuick(filtered);
    return applySort(quick, mgrSort);
  }, [items, mgrFilter, mgrSort, managerQuick, tick]);

  // User
  const userRows = useMemo(() => {
    const mine = items.filter(
      (i) => i.assignee === currentUser || (i.assignee == null && i.status === "complaint_unallocated")
    );
    const filtered = applyColumnFilters(mine, usrFilter);
    return applySort(filtered, usrSort);
  }, [items, usrFilter, usrSort, tick, currentUser]);

  // Referrals
  const referralRows = useMemo(() => {
    const refs = items.filter((i) => i.status.startsWith("ref_to_"));
    const filtered = applyColumnFilters(refs, refFilter);
    return applySort(filtered, refSort);
  }, [items, refFilter, refSort, tick]);

  /* ---------- Actions (persist via API) ---------- */
  const [pending, setPending] = useState({}); // per-item action

  const setItemLocal = (updated) =>
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));

  async function handleAllocate(item, handlerName) {
    setPending((p) => ({ ...p, [item.id]: "allocate" }));
    try {
      if (!canTransition(item.status, "ch_review")) throw new Error("Cannot allocate from current status.");
      const updated = { ...item, assignee: handlerName, status: "ch_review" };
      const saved = await api.updateItem(item.id, updated);
      setItemLocal(saved);
      pushToast(`Allocated ${item.id} to ${handlerName}`);
    } catch (e) {
      pushToast(e.message || "Failed to allocate", "error");
    } finally {
      setPending((p) => ({ ...p, [item.id]: null }));
    }
  }

  const youHaveActive = useMemo(
    () => items.some((i) => i.assignee === currentUser && i.status === "pick_up"),
    [items, currentUser]
  );

  async function handlePickUp(item) {
    setPending((p) => ({ ...p, [item.id]: "pickup" }));
    try {
      if (youHaveActive && !(item.assignee === currentUser && item.status === "pick_up")) {
        throw new Error("You already have an active item. Complete or refer it before picking another.");
      }
      if (!canTransition(item.status, "pick_up")) throw new Error("Invalid transition to Pick up.");
      const updated = {
        ...item,
        assignee: currentUser,
        status: "pick_up",
        startTime: item.startTime ?? Date.now(),
        endTime: null,
      };
      const saved = await api.updateItem(item.id, updated);
      setItemLocal(saved);
      pushToast(`Picked up ${item.id}`);
    } catch (e) {
      pushToast(e.message || "Failed to pick up", "error");
    } finally {
      setPending((p) => ({ ...p, [item.id]: null }));
    }
  }

  async function handleMove(item, next) {
    setPending((p) => ({ ...p, [item.id]: next }));
    try {
      if (!canTransition(item.status, next)) {
        throw new Error(`Invalid transition from ${LABEL[item.status]} to ${LABEL[next]}.`);
      }
      const leavingPick = item.status === "pick_up" && next !== "pick_up";
      let updated = { ...item, status: next };
      if (leavingPick && item.startTime) {
        const now = Date.now();
        const session = now - item.startTime;
        updated = {
          ...updated,
          endTime: now,
          startTime: null,
          spentMs: (item.spentMs || 0) + Math.max(0, session),
        };
      }
      const saved = await api.updateItem(item.id, updated);
      setItemLocal(saved);
      pushToast(`${item.id} → ${LABEL[next]}`);
    } catch (e) {
      pushToast(e.message || "Failed to move status", "error");
    } finally {
      setPending((p) => ({ ...p, [item.id]: null }));
    }
  }

  function handleAddComment(item) {
    const text = window.prompt(`Add comment for ${item.id}:`);
    if (!text || !text.trim()) return;
    const note = { ts: Date.now(), author: currentUser, text: text.trim() };
    const next = { ...item, comments: [...(item.comments ?? []), note] };
    setPending((p) => ({ ...p, [item.id]: "comment" }));
    api
      .updateItem(item.id, next)
      .then((saved) => {
        setItemLocal(saved);
        pushToast(`Added comment on ${item.id}`);
      })
      .catch((e) => pushToast(e.message || "Failed to add comment", "error"))
      .finally(() => setPending((p) => ({ ...p, [item.id]: null })));
  }

  /* ---------- Small UI helpers ---------- */
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
  const TABLE_HEAD_GRADIENT = "bg-gradient-to-r from-indigo-50 via-sky-50 to-cyan-50 text-slate-700";
  const pill = (status) =>
    ({
      complaint_unallocated: "bg-gray-100 text-gray-800",
      ch_review: "bg-blue-100 text-blue-800",
      pick_up: "bg-amber-100 text-amber-800",
      ch_complaint_closed: "bg-emerald-100 text-emerald-800",
      ref_to_bo_uk: "bg-purple-100 text-purple-800",
      ref_to_bo_ind: "bg-purple-100 text-purple-800",
      ref_to_finance: "bg-purple-100 text-purple-800",
      ref_to_aps: "bg-purple-100 text-purple-800",
      ref_to_cuw: "bg-purple-100 text-purple-800",
      ref_to_fct: "bg-purple-100 text-purple-800",
      ref_to_client: "bg-purple-100 text-purple-800",
      ref_to_rs: "bg-purple-100 text-purple-800",
      ref_to_ph: "bg-purple-100 text-purple-800",
      ch_referral_complete: "bg-indigo-100 text-indigo-800",
      rwol_product: "bg-pink-100 text-pink-800",
      ref_to_timeline_update: "bg-purple-100 text-purple-800",
    }[status]);

  const referralTargets = [
    "ref_to_bo_uk",
    "ref_to_bo_ind",
    "ref_to_finance",
    "ref_to_aps",
    "ref_to_cuw",
    "ref_to_fct",
    "ref_to_client",
    "ref_to_rs",
    "ref_to_ph",
    "ref_to_timeline_update",
  ];

  // comments modal
  const [commentsItem, setCommentsItem] = useState(null);

  // allocate dropdown state per row (manager)
  const [allocSelect, setAllocSelect] = useState({});
  const [referSelect, setReferSelect] = useState({});

  /* ---------- Column Header (Label + Sort) ---------- */
  const SortLabel = ({ grid, sort, setSort, colKey, children }) => {
    const isActive = sort.key === colKey && sort.dir;
    const arrow = isActive ? (sort.dir === "asc" ? "▲" : "▼") : "⇵";
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium"
        title="Click to sort (Asc → Desc → None)"
        onClick={() => {
          if (grid === "mgr") setMgrSort((s) => cycleSort(s, colKey));
          if (grid === "usr") setUsrSort((s) => cycleSort(s, colKey));
          if (grid === "ref") setRefSort((s) => cycleSort(s, colKey));
        }}
      >
        <span>{children}</span>
        <span className="text-xs opacity-60">{arrow}</span>
      </button>
    );
  };

  /* ========================= RENDER ========================= */
  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Complaints Workflow Tracker</h1>
          <p className="text-sm text-slate-600">Simplified Workflow Engine</p>
        </header>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-2xl bg-gradient-to-r from-sky-50 via-indigo-50 to-cyan-50 p-2 shadow-sm ring-1 ring-slate-200">
          <button
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md ${
              tab === "manager"
                ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow"
                : "bg-white/70 text-slate-700 hover:bg-white"
            }`}
            onClick={() => setTab("manager")}
          >
            Manager Console
          </button>
          <button
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md ${
              tab === "user"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow"
                : "bg-white/70 text-slate-700 hover:bg-white"
            }`}
            onClick={() => setTab("user")}
          >
            User Console
          </button>
          <button
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md ${
              tab === "referrals"
                ? "bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow"
                : "bg-white/70 text-slate-700 hover:bg-white"
            }`}
            onClick={() => setTab("referrals")}
          >
            Referral Teams
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow">Loading…</div>
        ) : (
          <>
            {/* ---------- Manager Console ---------- */}
            {tab === "manager" && (
              <section className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
                {/* Rollups */}
                <div className="grid gap-4 md:col-span-4 lg:col-span-6 sm:grid-cols-3">
                  <StatCard
                    title="Total complaints received"
                    value={totals.total}
                    gradient="blue"
                    onClick={() => setManagerQuick("all")}
                    active={managerQuick === "all"}
                  />
                  <StatCard
                    title="Total complaints in pipeline"
                    value={totals.pipeline}
                    gradient="amber"
                    onClick={() => setManagerQuick("pipeline")}
                    active={managerQuick === "pipeline"}
                  />
                  <StatCard
                    title="Total complaints completed"
                    value={totals.completed}
                    gradient="green"
                    onClick={() => setManagerQuick("completed")}
                    active={managerQuick === "completed"}
                  />
                </div>

                {/* Status tiles */}
                {STATUSES.map((s) => (
                  <div
                    key={s}
                    className="rounded-2xl bg-white p-4 shadow ring-1 ring-slate-100 transition hover:shadow-md"
                    title={DESC[s]}
                  >
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{LABEL[s]}</div>
                    <div className="mt-1 text-3xl font-bold">{summary[s]}</div>
                  </div>
                ))}

                {/* Grid */}
                <div className="mt-2 rounded-2xl bg-white p-4 shadow md:col-span-6">
                  <h2 className="mb-3 text-lg font-medium">All Work Items</h2>

                  <div className="overflow-auto rounded-2xl ring-1 ring-slate-100 transition hover:ring-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className={TABLE_HEAD_GRADIENT + " border-b border-slate-200"}>
                        <tr className="text-left align-bottom">
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="id">
                              ID
                            </SortLabel>
                            <input
                              className="mt-1 w-28 rounded border px-2 py-1 text-xs"
                              placeholder="Filter…"
                              value={mgrFilter.id}
                              onChange={(e) => setMgrFilter({ ...mgrFilter, id: e.target.value })}
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="title">
                              Title
                            </SortLabel>
                            <input
                              className="mt-1 w-56 rounded border px-2 py-1 text-xs"
                              placeholder="Filter…"
                              value={mgrFilter.title}
                              onChange={(e) => setMgrFilter({ ...mgrFilter, title: e.target.value })}
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="receivedDate">
                              Complaint Received
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={mgrFilter.recFrom}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, recFrom: e.target.value })}
                              />
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={mgrFilter.recTo}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, recTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="loggedDate">
                              Complaint Logged
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={mgrFilter.logFrom}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, logFrom: e.target.value })}
                              />
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={mgrFilter.logTo}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, logTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="assignee">
                              Assignee
                            </SortLabel>
                            <input
                              className="mt-1 w-32 rounded border px-2 py-1 text-xs"
                              placeholder="Filter…"
                              value={mgrFilter.assignee}
                              onChange={(e) => setMgrFilter({ ...mgrFilter, assignee: e.target.value })}
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="status">
                              Status
                            </SortLabel>
                            <input
                              className="mt-1 w-36 rounded border px-2 py-1 text-xs"
                              placeholder="Filter…"
                              value={mgrFilter.status}
                              onChange={(e) => setMgrFilter({ ...mgrFilter, status: e.target.value })}
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="startTime">
                              Start
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={mgrFilter.startFrom}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, startFrom: e.target.value })}
                              />
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={mgrFilter.startTo}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, startTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="endTime">
                              End
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={mgrFilter.endFrom}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, endFrom: e.target.value })}
                              />
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={mgrFilter.endTo}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, endTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="mgr" sort={mgrSort} setSort={setMgrSort} colKey="timeSpent">
                              Total Time Spent
                            </SortLabel>
                            <div className="mt-1 flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                className="w-20 rounded border px-2 py-1 text-xs"
                                placeholder="Min s"
                                value={mgrFilter.timeMin}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, timeMin: e.target.value })}
                              />
                              <input
                                type="number"
                                min="0"
                                className="w-20 rounded border px-2 py-1 text-xs"
                                placeholder="Max s"
                                value={mgrFilter.timeMax}
                                onChange={(e) => setMgrFilter({ ...mgrFilter, timeMax: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">Comments
                            <input
                              className="mt-1 w-40 rounded border px-2 py-1 text-xs"
                              placeholder="Search comments…"
                              value={mgrFilter.comments}
                              onChange={(e) => setMgrFilter({ ...mgrFilter, comments: e.target.value })}
                            />
                          </th>
                          <th className="py-2 pr-4">Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {managerRows.map((it) => (
                          <tr key={it.id} className="align-top border-t border-slate-100">
                            <td className="py-2 pr-4 font-mono">{it.id}</td>
                            <td className="py-2 pr-4">{it.title}</td>
                            <td className="py-2 pr-4">{fmtDate(it.receivedDate)}</td>
                            <td className="py-2 pr-4">{fmtDate(it.loggedDate)}</td>
                            <td className="py-2 pr-4">{it.assignee ?? "—"}</td>
                            <td className="py-2 pr-4">
                              <span className={`rounded-full px-2 py-1 text-xs ${pill(it.status)}`} title={DESC[it.status]}>
                                {LABEL[it.status]}
                              </span>
                            </td>
                            <td className="py-2 pr-4">{fmt(it.startTime)}</td>
                            <td className="py-2 pr-4">{fmt(it.endTime)}</td>
                            <td className="py-2 pr-4">{fmtDuration(totalSpentMs(it))}</td>
                            <td className="py-2 pr-4">
                              <CommentsCell item={it} onAdd={() => handleAddComment(it)} onViewAll={() => setCommentsItem(it)} />
                            </td>
                            <td className="min-w-[320px] py-2 pr-4">
                              {it.status === "complaint_unallocated" ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    className="rounded-xl border px-2 py-1"
                                    value={allocSelect[it.id] ?? "Alice"}
                                    onChange={(e) => setAllocSelect((s) => ({ ...s, [it.id]: e.target.value }))}
                                    title="Choose Complaint Handler"
                                  >
                                    {["Alice", "Bob", "Charlie", "Deepa", "Ehsan", "mahi"].map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className={`rounded-xl px-3 py-1 ${
                                      pending[it.id] === "allocate" ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"
                                    }`}
                                    onClick={() => handleAllocate(it, allocSelect[it.id] ?? "Alice")}
                                    disabled={pending[it.id] === "allocate"}
                                    title="Allocate to selected CH (moves to CH Review)"
                                  >
                                    {pending[it.id] === "allocate" ? "Allocating…" : "Allocate"}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ---------- User Console ---------- */}
            {tab === "user" && (
              <section className="grid gap-4">
                <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow">
                  <div>
                    <h2 className="text-lg font-medium">Mahi&apos;s Queue</h2>
                    <p className="text-sm text-slate-500">
                      Signed in as <span className="font-medium">{currentUser}</span>
                    </p>
                  </div>
                  {youHaveActive ? (
                    <div className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">You have an active item</div>
                  ) : (
                    <div className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">No active item</div>
                  )}
                </div>

                <div className="rounded-2xl bg-white p-4 shadow">
                  <div className="overflow-auto rounded-2xl ring-1 ring-slate-100 transition hover:ring-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className={TABLE_HEAD_GRADIENT + " border-b border-slate-200"}>
                        <tr className="text-left align-bottom">
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="id">
                              ID
                            </SortLabel>
                            <input
                              className="mt-1 w-28 rounded border px-2 py-1 text-xs"
                              value={usrFilter.id}
                              onChange={(e) => setUsrFilter({ ...usrFilter, id: e.target.value })}
                              placeholder="Filter…"
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="title">
                              Title
                            </SortLabel>
                            <input
                              className="mt-1 w-56 rounded border px-2 py-1 text-xs"
                              value={usrFilter.title}
                              onChange={(e) => setUsrFilter({ ...usrFilter, title: e.target.value })}
                              placeholder="Filter…"
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="receivedDate">
                              Complaint Received
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={usrFilter.recFrom}
                                onChange={(e) => setUsrFilter({ ...usrFilter, recFrom: e.target.value })}
                              />
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={usrFilter.recTo}
                                onChange={(e) => setUsrFilter({ ...usrFilter, recTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="loggedDate">
                              Complaint Logged
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={usrFilter.logFrom}
                                onChange={(e) => setUsrFilter({ ...usrFilter, logFrom: e.target.value })}
                              />
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={usrFilter.logTo}
                                onChange={(e) => setUsrFilter({ ...usrFilter, logTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="assignee">
                              Assignee
                            </SortLabel>
                            <input
                              className="mt-1 w-32 rounded border px-2 py-1 text-xs"
                              value={usrFilter.assignee}
                              onChange={(e) => setUsrFilter({ ...usrFilter, assignee: e.target.value })}
                              placeholder="Filter…"
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="status">
                              Status
                            </SortLabel>
                            <input
                              className="mt-1 w-36 rounded border px-2 py-1 text-xs"
                              value={usrFilter.status}
                              onChange={(e) => setUsrFilter({ ...usrFilter, status: e.target.value })}
                              placeholder="Filter…"
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="startTime">
                              Start
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={usrFilter.startFrom}
                                onChange={(e) => setUsrFilter({ ...usrFilter, startFrom: e.target.value })}
                              />
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={usrFilter.startTo}
                                onChange={(e) => setUsrFilter({ ...usrFilter, startTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="endTime">
                              End
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={usrFilter.endFrom}
                                onChange={(e) => setUsrFilter({ ...usrFilter, endFrom: e.target.value })}
                              />
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={usrFilter.endTo}
                                onChange={(e) => setUsrFilter({ ...usrFilter, endTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="usr" sort={usrSort} setSort={setUsrSort} colKey="timeSpent">
                              Elapsed / Spent
                            </SortLabel>
                            <div className="mt-1 flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                className="w-20 rounded border px-2 py-1 text-xs"
                                placeholder="Min s"
                                value={usrFilter.timeMin}
                                onChange={(e) => setUsrFilter({ ...usrFilter, timeMin: e.target.value })}
                              />
                              <input
                                type="number"
                                min="0"
                                className="w-20 rounded border px-2 py-1 text-xs"
                                placeholder="Max s"
                                value={usrFilter.timeMax}
                                onChange={(e) => setUsrFilter({ ...usrFilter, timeMax: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">Comments
                            <input
                              className="mt-1 w-40 rounded border px-2 py-1 text-xs"
                              placeholder="Search comments…"
                              value={usrFilter.comments}
                              onChange={(e) => setUsrFilter({ ...usrFilter, comments: e.target.value })}
                            />
                          </th>
                          <th className="py-2 pr-4">Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {userRows.map((it) => (
                          <tr key={it.id} className="align-top border-t border-slate-100">
                            <td className="py-2 pr-4 font-mono">{it.id}</td>
                            <td className="py-2 pr-4">{it.title}</td>
                            <td className="py-2 pr-4">{fmtDate(it.receivedDate)}</td>
                            <td className="py-2 pr-4">{fmtDate(it.loggedDate)}</td>
                            <td className="py-2 pr-4">{it.assignee ?? "—"}</td>
                            <td className="py-2 pr-4">
                              <span className={`rounded-full px-2 py-1 text-xs ${pill(it.status)}`} title={DESC[it.status]}>
                                {LABEL[it.status]}
                              </span>
                            </td>
                            <td className="py-2 pr-4">{fmt(it.startTime)}</td>
                            <td className="py-2 pr-4">{fmt(it.endTime)}</td>
                            <td className="py-2 pr-4">{fmtDuration(currentElapsedMs(it))}</td>
                            <td className="py-2 pr-4">
                              <CommentsCell item={it} onAdd={() => handleAddComment(it)} onViewAll={() => setCommentsItem(it)} />
                            </td>
                            <td className="min-w-[360px] py-2 pr-4">
                              <div className="flex flex-wrap items-center gap-2">
                                {it.status === "ch_review" && it.assignee === currentUser && (
                                  <button
                                    type="button"
                                    disabled={pending[it.id] === "pickup"}
                                    className={`rounded-xl px-3 py-1 ${
                                      pending[it.id] === "pickup" ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"
                                    }`}
                                    onClick={() => handlePickUp(it)}
                                    title="Pick up and start processing"
                                  >
                                    {pending[it.id] === "pickup" ? "Picking…" : "Pick up"}
                                  </button>
                                )}

                                {it.status === "pick_up" && it.assignee === currentUser && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <select
                                        className="rounded-xl border px-2 py-1"
                                        value={referSelect[it.id] ?? "ref_to_bo_uk"}
                                        onChange={(e) => setReferSelect((s) => ({ ...s, [it.id]: e.target.value }))}
                                        title="Choose referral destination"
                                      >
                                        {referralTargets.map((next) => (
                                          <option key={next} value={next}>
                                            {LABEL[next]}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        disabled={pending[it.id] === "referring"}
                                        className={`rounded-xl px-3 py-1 ${
                                          pending[it.id] === "referring" ? "bg-slate-200 text-slate-400" : "bg-purple-600 text-white"
                                        }`}
                                        onClick={() => {
                                          const next = referSelect[it.id] ?? referralTargets[0];
                                          setPending((p) => ({ ...p, [it.id]: "referring" }));
                                          handleMove(it, next).finally(() =>
                                            setPending((p) => ({ ...p, [it.id]: null }))
                                          );
                                        }}
                                        title={DESC[referSelect[it.id] ?? referralTargets[0]]}
                                      >
                                        Refer
                                      </button>
                                    </div>

                                    {/* Close */}
                                    <button
                                      type="button"
                                      disabled={pending[it.id] === "ch_complaint_closed"}
                                      className={`rounded-xl px-3 py-1 ${
                                        pending[it.id] === "ch_complaint_closed"
                                          ? "bg-slate-200 text-slate-400"
                                          : "bg-emerald-600 text-white"
                                      }`}
                                      onClick={() => handleMove(it, "ch_complaint_closed")}
                                      title="Close complaint"
                                    >
                                      {pending[it.id] === "ch_complaint_closed" ? "Closing…" : "Close"}
                                    </button>
                                  </>
                                )}

                                {it.status.startsWith("ref_to_") && (
                                  <span className="text-xs text-slate-400">Waiting on referral team…</span>
                                )}

                                {it.status === "ch_referral_complete" && it.assignee === currentUser && (
                                  <button
                                    type="button"
                                    disabled={pending[it.id] === "pick_up"}
                                    className={`rounded-xl px-3 py-1 ${
                                      pending[it.id] === "pick_up" ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"
                                    }`}
                                    onClick={() => handleMove(it, "pick_up")}
                                    title="Re-pick and continue processing"
                                  >
                                    {pending[it.id] === "pick_up" ? "Picking…" : "Re-pick"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ---------- Referral Teams Console ---------- */}
            {tab === "referrals" && (
              <section className="grid gap-4">
                <div className="rounded-2xl bg-white p-4 shadow">
                  <h2 className="mb-3 text-lg font-medium">Referral Queue</h2>

                  <div className="overflow-auto rounded-2xl ring-1 ring-slate-100 transition hover:ring-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className={TABLE_HEAD_GRADIENT + " border-b border-slate-200"}>
                        <tr className="text-left align-bottom">
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="id">
                              ID
                            </SortLabel>
                            <input
                              className="mt-1 w-28 rounded border px-2 py-1 text-xs"
                              value={refFilter.id}
                              onChange={(e) => setRefFilter({ ...refFilter, id: e.target.value })}
                              placeholder="Filter…"
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="title">
                              Title
                            </SortLabel>
                            <input
                              className="mt-1 w-56 rounded border px-2 py-1 text-xs"
                              value={refFilter.title}
                              onChange={(e) => setRefFilter({ ...refFilter, title: e.target.value })}
                              placeholder="Filter…"
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="receivedDate">
                              Complaint Received
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={refFilter.recFrom}
                                onChange={(e) => setRefFilter({ ...refFilter, recFrom: e.target.value })}
                              />
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={refFilter.recTo}
                                onChange={(e) => setRefFilter({ ...refFilter, recTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="loggedDate">
                              Complaint Logged
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={refFilter.logFrom}
                                onChange={(e) => setRefFilter({ ...refFilter, logFrom: e.target.value })}
                              />
                              <input
                                type="date"
                                className="w-32 rounded border px-2 py-1 text-xs"
                                value={refFilter.logTo}
                                onChange={(e) => setRefFilter({ ...refFilter, logTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="assignee">
                              Assignee
                            </SortLabel>
                            <input
                              className="mt-1 w-32 rounded border px-2 py-1 text-xs"
                              value={refFilter.assignee}
                              onChange={(e) => setRefFilter({ ...refFilter, assignee: e.target.value })}
                              placeholder="Filter…"
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="status">
                              Status
                            </SortLabel>
                            <input
                              className="mt-1 w-36 rounded border px-2 py-1 text-xs"
                              value={refFilter.status}
                              onChange={(e) => setRefFilter({ ...refFilter, status: e.target.value })}
                              placeholder="Filter…"
                            />
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="startTime">
                              Start
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={refFilter.startFrom}
                                onChange={(e) => setRefFilter({ ...refFilter, startFrom: e.target.value })}
                              />
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={refFilter.startTo}
                                onChange={(e) => setRefFilter({ ...refFilter, startTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="endTime">
                              End
                            </SortLabel>
                            <div className="mt-1 flex gap-1">
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={refFilter.endFrom}
                                onChange={(e) => setRefFilter({ ...refFilter, endFrom: e.target.value })}
                              />
                              <input
                                type="datetime-local"
                                className="w-44 rounded border px-2 py-1 text-xs"
                                value={refFilter.endTo}
                                onChange={(e) => setRefFilter({ ...refFilter, endTo: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">
                            <SortLabel grid="ref" sort={refSort} setSort={setRefSort} colKey="timeSpent">
                              Elapsed
                            </SortLabel>
                            <div className="mt-1 flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                className="w-20 rounded border px-2 py-1 text-xs"
                                placeholder="Min s"
                                value={refFilter.timeMin}
                                onChange={(e) => setRefFilter({ ...refFilter, timeMin: e.target.value })}
                              />
                              <input
                                type="number"
                                min="0"
                                className="w-20 rounded border px-2 py-1 text-xs"
                                placeholder="Max s"
                                value={refFilter.timeMax}
                                onChange={(e) => setRefFilter({ ...refFilter, timeMax: e.target.value })}
                              />
                            </div>
                          </th>
                          <th className="py-2 pr-4">Comments
                            <input
                              className="mt-1 w-40 rounded border px-2 py-1 text-xs"
                              placeholder="Search comments…"
                              value={refFilter.comments}
                              onChange={(e) => setRefFilter({ ...refFilter, comments: e.target.value })}
                            />
                          </th>
                          <th className="py-2 pr-4">Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {referralRows.length === 0 && (
                          <tr>
                            <td colSpan={11} className="py-6 text-center text-slate-500">
                              No items in referral queues.
                            </td>
                          </tr>
                        )}
                        {referralRows.map((it) => (
                          <tr key={it.id} className="align-top border-t border-slate-100">
                            <td className="py-2 pr-4 font-mono">{it.id}</td>
                            <td className="py-2 pr-4">{it.title}</td>
                            <td className="py-2 pr-4">{fmtDate(it.receivedDate)}</td>
                            <td className="py-2 pr-4">{fmtDate(it.loggedDate)}</td>
                            <td className="py-2 pr-4">{it.assignee ?? "—"}</td>
                            <td className="py-2 pr-4">
                              <span className={`rounded-full px-2 py-1 text-xs ${pill(it.status)}`} title={DESC[it.status]}>
                                {LABEL[it.status]}
                              </span>
                            </td>
                            <td className="py-2 pr-4">{fmt(it.startTime)}</td>
                            <td className="py-2 pr-4">{fmt(it.endTime)}</td>
                            <td className="py-2 pr-4">{fmtDuration(currentElapsedMs(it))}</td>
                            <td className="py-2 pr-4">
                              <CommentsCell item={it} onAdd={() => handleAddComment(it)} onViewAll={() => setCommentsItem(it)} />
                            </td>
                            <td className="min-w-[240px] py-2 pr-4">
                              <button
                                type="button"
                                disabled={pending[it.id] === "ch_referral_complete"}
                                className={`rounded-xl px-3 py-1 ${
                                  pending[it.id] === "ch_referral_complete"
                                    ? "bg-slate-200 text-slate-400"
                                    : "bg-indigo-600 text-white"
                                }`}
                                onClick={() => handleMove(it, "ch_referral_complete")}
                                title="Return to CH (Referral Complete)"
                              >
                                {pending[it.id] === "ch_referral_complete" ? "Completing…" : "Mark Referral Complete"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Comments History Modal */}
      <Modal
        open={Boolean(commentsItem)}
        onClose={() => setCommentsItem(null)}
        title={commentsItem ? `Comments — ${commentsItem.id} • ${commentsItem.title}` : "Comments"}
      >
        {commentsItem && (commentsItem.comments?.length ?? 0) > 0 ? (
          <div className="space-y-3">
            {commentsItem.comments
              .slice()
              .sort((a, b) => a.ts - b.ts)
              .map((c, idx) => (
                <div key={c.ts + "-" + idx} className="rounded-xl border p-3">
                  <div className="mb-1 text-sm text-slate-500">
                    <span className="font-medium">{c.author}</span> · {fmtDateTime(c.ts)}
                  </div>
                  <div className="text-slate-900">{c.text}</div>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">No comments yet.</div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
          <button className="rounded-xl bg-slate-100 px-3 py-1 text-slate-800 hover:bg-slate-200" onClick={() => setCommentsItem(null)}>
            Close
          </button>
          <button
            className="rounded-xl bg-slate-900 px-3 py-1 text-white"
            onClick={() => {
              const txt = window.prompt("Add a comment:");
              if (!txt || !txt.trim()) return;
              const note = { ts: Date.now(), author: currentUser, text: txt.trim() };
              setItems((prev) =>
                prev.map((it) => (it.id === commentsItem.id ? { ...it, comments: [...(it.comments ?? []), note] } : it))
              );
              // persist too
              api.updateItem(commentsItem.id, {
                ...commentsItem,
                comments: [...(commentsItem.comments ?? []), note],
              });
            }}
          >
            Add comment
          </button>
        </div>
      </Modal>

      <Toasts toasts={toasts} remove={removeToast} />
    </div>
  );
}
