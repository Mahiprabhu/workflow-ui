import React, { useMemo, useState, useEffect, useRef } from "react";

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

function canTransition(from, to) {
  return ALLOWED_NEXT[from]?.includes(to);
}

/* ------------------ Helpers ------------------ */
function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString("en-GB", { month: "short" });
  const yr = d.getFullYear();
  return `${day}-${mon}-${yr}`;
}
function fmtDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}
function randomDateDaysAgo(minDays = 1, maxDays = 30) {
  const days = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}
function fmtDuration(ms) {
  if (!ms || ms < 1000) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m || h) parts.push(`${String(m).padStart(2, "0")}m`);
  parts.push(`${String(sec).padStart(2, "0")}s`);
  return parts.join(" ");
}
function currentElapsedMs(it) {
  if (it.startTime && !it.endTime) return Date.now() - it.startTime;
  if (it.startTime && it.endTime) return it.endTime - it.startTime;
  return 0;
}
function totalSpentMs(it) {
  const active = it.status === "pick_up" && it.startTime && !it.endTime ? Date.now() - it.startTime : 0;
  return (it.spentMs || 0) + active;
}
function matchesFilter(it, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase().replace(/\*/g, "");
  if (!needle) return true;
  const haystack = [
    it.id,
    it.title,
    it.assignee || "",
    LABEL[it.status],
    ...(it.comments || []).map((c) => c.text),
  ]
    .join(" | ")
    .toLowerCase();
  return haystack.includes(needle);
}

/* ------------------ Sorting / Column Filters helpers ------------------ */
function getFieldForSort(item, key) {
  switch (key) {
    case "id": return item.id;
    case "title": return item.title;
    case "receivedDate": return item.receivedDate || 0;
    case "loggedDate": return item.loggedDate || 0;
    case "assignee": return item.assignee || "";
    case "status": return LABEL[item.status] || item.status;
    case "start": return item.startTime || 0;
    case "end": return item.endTime || 0;
    case "comments": {
      const latest = item.comments?.[item.comments.length - 1];
      return latest ? latest.text : "";
    }
    case "spent": return totalSpentMs(item) || 0;
    default: return "";
  }
}
function sortRows(rows, sort) {
  if (!sort?.key || !sort?.dir) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = getFieldForSort(a, sort.key);
    const vb = getFieldForSort(b, sort.key);
    if (va < vb) return -1 * dir;
    if (va > vb) return  1 * dir;
    return 0;
  });
}
function applyColumnFilters(rows, filters) {
  const fh = (v) => (v ?? "").toString().toLowerCase();
  const inc = (val, q) => fh(val).includes(fh(q));
  return rows.filter((it) => {
    const latestComment = it.comments?.[it.comments.length - 1]?.text ?? "";
    const checks = [
      inc(it.id, filters.id),
      inc(it.title, filters.title),
      inc(fmtDate(it.receivedDate), filters.receivedDate),
      inc(fmtDate(it.loggedDate), filters.loggedDate),
      inc(it.assignee ?? "", filters.assignee),
      inc(LABEL[it.status] ?? it.status, filters.status),
      inc(it.startTime ? new Date(it.startTime).toLocaleString() : "", filters.start),
      inc(it.endTime ? new Date(it.endTime).toLocaleString() : "", filters.end),
      inc(fmtDuration(totalSpentMs(it)), filters.spent),
      inc(latestComment, filters.comments),
    ];
    return checks.every(Boolean);
  });
}

/* ------------------ Sample data ------------------ */
const seedItems = [
  { id: "W-201", title: "Address change complaint", assignee: null,  status: "complaint_unallocated", startTime: null, endTime: null, spentMs: 0, comments: [] },
  { id: "W-202", title: "Chargeback follow-up",     assignee: "mahi", status: "ch_review",             startTime: null, endTime: null, spentMs: 0, comments: [] },
  {
    id: "W-203",
    title: "Refund case - #7781",
    assignee: "mahi",
    status: "pick_up",
    startTime: Date.now() - 5 * 60 * 1000,
    endTime: null,
    spentMs: 0,
    comments: [{ ts: Date.now() - 10 * 60 * 1000, author: "mahi", text: "Initial review started." }],
  },
  { id: "W-204", title: "Vendor onboarding",        assignee: "bob",   status: "ref_to_finance", startTime: Date.now() - 60 * 60 * 1000, endTime: null, spentMs: 0, comments: [] },
  { id: "W-205", title: "Policy docs missing",      assignee: "alice", status: "ch_review",      startTime: null, endTime: null, spentMs: 0, comments: [] },
];
const initialItems = seedItems.map((it) => {
  const received = randomDateDaysAgo(5, 30);
  const logged = received + Math.floor(Math.random() * 4) * 24 * 60 * 60 * 1000; // 0–3 days after
  return { ...it, receivedDate: received, loggedDate: logged };
});
const CH_NAMES = ["Alice", "Bob", "Charlie", "Deepa", "Ehsan", "mahi"];

/* ------------------ Simulated API (UI-only) ------------------ */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function apiAllocateToCH(item, handlerName) {
  await delay(500 + Math.random() * 400);
  if (!canTransition(item.status, "ch_review")) throw new Error("Cannot allocate from current status.");
  return { ...item, assignee: handlerName, status: "ch_review" };
}
async function apiPickUp(item, { currentUser, mahiHaveActive }) {
  await delay(600 + Math.random() * 400);
  if (mahiHaveActive && !(item.assignee === currentUser && item.status === "pick_up")) {
    throw new Error("mahi already have an active item. Complete or refer it before picking another.");
  }
  const next = "pick_up";
  if (!canTransition(item.status, next)) throw new Error("Invalid transition to Pick up.");
  return { ...item, assignee: currentUser, status: next, startTime: item.startTime ?? Date.now(), endTime: null };
}
async function apiMove(item, next) {
  await delay(500 + Math.random() * 400);
  if (!canTransition(item.status, next)) throw new Error(`Invalid transition from ${LABEL[item.status]} to ${LABEL[next]}.`);
  const leavingPick = item.status === "pick_up" && next !== "pick_up";
  if (leavingPick && item.startTime) {
    const now = Date.now();
    const session = now - item.startTime;
    return {
      ...item,
      status: next,
      startTime: null,
      endTime: now,
      spentMs: (item.spentMs || 0) + Math.max(0, session),
    };
  }
  return { ...item, status: next };
}

/* ------------------ UI atoms ------------------ */
function Toasts({ toasts, remove }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`px-3 py-2 rounded-xl shadow text-sm ${t.type === "error" ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900"}`}>
          <div className="flex items-start gap-2">
            <div className="font-medium">{t.type === "error" ? "Error" : "Success"}</div>
            <div className="opacity-80">{t.msg}</div>
            <button className="ml-2 opacity-60 hover:opacity-100" onClick={() => remove(t.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Nice colorful stat card (clickable + active ring)
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
        ${onClick ? "cursor-pointer hover:translate-y-[-1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white/60" : ""}
        ${active ? "ring-2 ring-white/70" : ""}
      `}
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

// Small modal for comments history
function Modal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-lg font-medium">{title}</h3>
          <button className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={onClose}>✕</button>
        </div>
        <div className="max-h-[60vh] overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// Reusable comments cell: preview + actions
function CommentsCell({ item, onAdd, onViewAll }) {
  const c = item.comments || [];
  const latest = c[c.length - 1];
  return (
    <div className="min-w-[260px]">
      {c.length > 0 ? (
        <div className="text-xs">
          <div className="mb-0.5 text-slate-500">({c.length}) latest</div>
          <div className="text-slate-800">{latest ? (latest.text.length > 40 ? latest.text.slice(0, 40) + "…" : latest.text) : ""}</div>
          <div className="text-slate-500">{latest ? fmtDateTime(latest.ts) : ""}</div>
        </div>
      ) : (
        <span className="text-xs text-slate-400">No comments</span>
      )}
      <div className="mt-1 flex gap-2">
        <button type="button" className="rounded-lg bg-slate-900 px-2 py-0.5 text-xs text-white" onClick={onAdd}>
          Add
        </button>
        <button type="button" className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-800 hover:bg-slate-200" onClick={onViewAll} disabled={c.length === 0}>
          View all
        </button>
      </div>
    </div>
  );
}

function csvEscape(val) {
  if (val == null) return "";
  const s = String(val);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function buildManagerCsvRows(items, LABEL, fmtDate, fmt, fmtDuration, totalSpentMs) {
  const header = [
    "ID", "Title", "Complaint Received", "Complaint Logged",
    "Assignee", "Status", "Start", "End", "Total Time Spent (hh:mm:ss)", "Latest Comment"
  ];
  const rows = [header];
  for (const it of items) {
    const latestComment = (it.comments && it.comments.length)
      ? `${new Date(it.comments[it.comments.length - 1].ts).toLocaleString()} - ${it.comments[it.comments.length - 1].author}: ${it.comments[it.comments.length - 1].text}`
      : "";
    rows.push([
      it.id,
      it.title,
      fmtDate(it.receivedDate),
      fmtDate(it.loggedDate),
      it.assignee ?? "",
      LABEL[it.status] ?? it.status,
      fmt(it.startTime),
      fmt(it.endTime),
      fmtDuration(totalSpentMs(it)),
      latestComment
    ].map(csvEscape));
  }
  return rows.map(r => r.join(",")).join("\n");
}
function triggerDownload(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

/* ------------------ App ------------------ */
export default function App() {
  // searches
  const [managerQuery, setManagerQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [refQuery, setRefQuery] = useState("");
  const managerSearchRef = useRef(null);
  const userSearchRef = useRef(null);
  const refSearchRef = useRef(null);

  // quick tile filter: 'all' | 'pipeline' | 'completed'
  const [managerQuick, setManagerQuick] = useState("all");

  // column filters + sorting for manager grid
  const [managerFilters, setManagerFilters] = useState({
    id: "",
    title: "",
    receivedDate: "",
    loggedDate: "",
    assignee: "",
    status: "",
    start: "",
    end: "",
    spent: "",
    comments: "",
  });
  const [managerSort, setManagerSort] = useState({ key: null, dir: null }); // dir: 'asc' | 'desc' | null
  const setSortKey = (key) => {
    setManagerSort((cur) => {
      if (cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: null };
    });
  };
  const caret = (key) => {
    if (managerSort.key !== key) return null;
    return managerSort.dir === "asc" ? "▲" : "▼";
    };

  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem("wf_items_v1");
      return saved ? JSON.parse(saved) : initialItems;
    } catch {
      return initialItems;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("wf_items_v1", JSON.stringify(items));
    } catch {}
  }, [items]);

  const [tab, setTab] = useState("manager");
  const [allocSelect, setAllocSelect] = useState({});
  const [referSelect, setReferSelect] = useState({});
  const currentUser = "mahi";

  const [pending, setPending] = useState({});
  const [toasts, setToasts] = useState([]);
  const pushToast = (msg, type = "success") => setToasts((ts) => [...ts, { id: Math.random().toString(36).slice(2), msg, type }]);
  const removeToast = (id) => setToasts((ts) => ts.filter((t) => t.id !== id));

  // comments modal
  const [commentsItem, setCommentsItem] = useState(null);

  // Force a re-render once per second so elapsed/spent timers update live
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts: / focus search, g+m/u/r
  useEffect(() => {
    let goMode = false;
    let goTimer = null;
    function isTypingEl(el) {
      const tag = el?.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || el?.isContentEditable;
    }
    function focusSearchForTab() {
      if (tab === "manager" && managerSearchRef.current) managerSearchRef.current.focus();
      if (tab === "user" && userSearchRef.current) userSearchRef.current.focus();
      if (tab === "referrals" && refSearchRef.current) refSearchRef.current.focus();
    }
    function keyHandler(e) {
      if (isTypingEl(document.activeElement)) return;
      if (e.key === "/") {
        e.preventDefault();
        focusSearchForTab();
        return;
      }
      if (e.key.toLowerCase() === "g") {
        goMode = true;
        clearTimeout(goTimer);
        goTimer = setTimeout(() => (goMode = false), 1000);
        return;
      }
      if (goMode) {
        const k = e.key.toLowerCase();
        if (k === "m") setTab("manager");
        if (k === "u") setTab("user");
        if (k === "r") setTab("referrals");
        goMode = false;
        clearTimeout(goTimer);
      }
    }
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      clearTimeout(goTimer);
    };
  }, [tab]);

  /* ---- Derived ---- */
  const summary = useMemo(() => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const it of items) counts[it.status]++;
    return counts;
  }, [items]);

  const totals = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === "ch_complaint_closed").length;
    const pipeline = total - completed;
    return { total, pipeline, completed };
  }, [items]);

  // MANAGER items pipeline: quick tile filter -> column filters -> free-text -> sorting
  const managerItems = useMemo(() => {
    let rows = items;
    if (managerQuick === "pipeline") {
      rows = rows.filter((i) => i.status !== "ch_complaint_closed");
    } else if (managerQuick === "completed") {
      rows = rows.filter((i) => i.status === "ch_complaint_closed");
    }
    rows = applyColumnFilters(rows, managerFilters);
    rows = rows.filter((i) => matchesFilter(i, managerQuery));
    rows = sortRows(rows, managerSort);
    return rows;
  }, [items, managerQuick, managerFilters, managerQuery, managerSort]);

  const rawYourItems = useMemo(
    () => items.filter((i) => i.assignee === currentUser || (i.assignee === null && i.status === "complaint_unallocated")),
    [items]
  );
  const yourItems = useMemo(() => rawYourItems.filter(i => matchesFilter(i, userQuery)),[rawYourItems, userQuery]);

  const rawRefItems = useMemo(() => items.filter((i) => i.status.startsWith("ref_to_")), [items]);
  const referralItems = useMemo(() => rawRefItems.filter(i => matchesFilter(i, refQuery)), [rawRefItems, refQuery]);

  const mahiHaveActive = useMemo(
    () => items.some((i) => i.assignee === currentUser && i.status === "pick_up"),
    [items]
  );

  const isPending = (item, action = null) => {
    const val = pending[item.id];
    if (action == null) return Boolean(val);
    return val === action;
  };

  const canActOn = (it) => {
    if (it.assignee === currentUser && it.status === "pick_up") return true;
    return !mahiHaveActive;
  };

  /* ---- Actions ---- */
  async function handleAllocate(item) {
    const handler = allocSelect[item.id] || CH_NAMES[0];
    setPending((p) => ({ ...p, [item.id]: "allocate" }));
    try {
      const updated = await apiAllocateToCH(item, handler);
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      pushToast(`Allocated ${item.id} to ${handler}`);
    } catch (e) {
      pushToast(e.message || "Failed to allocate", "error");
    } finally {
      setPending((p) => ({ ...p, [item.id]: null }));
    }
  }
  async function handlePickUp(item) {
    setPending((p) => ({ ...p, [item.id]: "pickup" }));
    try {
      const updated = await apiPickUp(item, { currentUser, mahiHaveActive });
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
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
      const updated = await apiMove(item, next);
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
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
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, comments: [...(it.comments ?? []), note] } : it)));
    pushToast(`Added comment on ${item.id}`);
  }

  /* ---- UI helpers ---- */
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Complaints Workflow Tracker</h1>
          <p className="text-sm text-slate-600">Simplified Workflow Engine</p>
        </header>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-2xl bg-gradient-to-r from-sky-50 via-indigo-50 to-cyan-50 p-2 shadow-sm ring-1 ring-slate-200">
          <button
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition hover:translate-y-[-1px] hover:shadow-md ${
              tab === "manager"
                ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow"
                : "bg-white/70 text-slate-700 hover:bg-white"
            }`}
            onClick={() => setTab("manager")}
          >
            Manager Console
          </button>

          <button
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition hover:translate-y-[-1px] hover:shadow-md ${
              tab === "user"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow"
                : "bg-white/70 text-slate-700 hover:bg-white"
            }`}
            onClick={() => setTab("user")}
          >
            User Console
          </button>

          <button
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition hover:translate-y-[-1px] hover:shadow-md ${
              tab === "referrals"
                ? "bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow"
                : "bg-white/70 text-slate-700 hover:bg-white"
            }`}
            onClick={() => setTab("referrals")}
          >
            Referral Teams
          </button>
        </div>

        {/* ---------- Manager Console ---------- */}
        {tab === "manager" && (
          <section className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
            {/* Rollups: colorful stat cards (CLICKABLE) */}
            <div className="md:col-span-4 lg:col-span-6 grid gap-4 sm:grid-cols-3">
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
              <div key={s} className="rounded-2xl bg-white p-4 shadow ring-1 ring-slate-100 transition hover:shadow-md" title={DESC[s]}>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{LABEL[s]}</div>
                <div className="mt-1 text-3xl font-bold">{summary[s]}</div>
              </div>
            ))}

            {/* Grid */}
            <div className="mt-2 rounded-2xl bg-white p-4 shadow md:col-span-6">
              <h2 className="mb-3 text-lg font-medium">All Work Items</h2>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  ref={managerSearchRef}
                  type="text"
                  className="w-full rounded-xl border px-3 py-2 md:w-80"
                  placeholder="Search all…"
                  value={managerQuery}
                  onChange={(e) => setManagerQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-xl bg-slate-100 px-3 py-2 text-slate-800 hover:bg-slate-200"
                  onClick={() => {
                    setManagerFilters({
                      id: "", title: "", receivedDate: "", loggedDate: "",
                      assignee: "", status: "", start: "", end: "", spent: "", comments: "",
                    });
                    setManagerSort({ key: null, dir: null });
                    setManagerQuery("");
                    setManagerQuick("all");
                  }}
                  title="Clear all filters and sorting"
                >
                  Clear filters
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-3 py-2 text-white hover:opacity-90"
                  onClick={() => {
                    const csv = buildManagerCsvRows(managerItems, LABEL, fmtDate, fmt, fmtDuration, totalSpentMs);
                    triggerDownload(`complaints-manager-${new Date().toISOString().slice(0,10)}.csv`, csv);
                  }}
                  title="Export current (filtered) rows to CSV"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-auto rounded-2xl ring-1 ring-slate-100 transition hover:ring-slate-200">
                <table className="min-w-full text-sm">
                  <thead className={TABLE_HEAD_GRADIENT + " border-b border-slate-200"}>
                    {/* Labels row with sorting */}
                    <tr className="text-left">
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("id")}>
                          ID <span className="text-xs">{caret("id")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("title")}>
                          Title <span className="text-xs">{caret("title")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("receivedDate")}>
                          Complaint Received <span className="text-xs">{caret("receivedDate")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("loggedDate")}>
                          Complaint Logged <span className="text-xs">{caret("loggedDate")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("assignee")}>
                          Assignee <span className="text-xs">{caret("assignee")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("status")}>
                          Status <span className="text-xs">{caret("status")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("start")}>
                          Start <span className="text-xs">{caret("start")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("end")}>
                          End <span className="text-xs">{caret("end")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("spent")}>
                          Total Time Spent <span className="text-xs">{caret("spent")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">
                        <button className="flex items-center gap-1 font-medium" onClick={() => setSortKey("comments")}>
                          Comments <span className="text-xs">{caret("comments")}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                    {/* Inline filter inputs row */}
                    <tr className="border-t border-slate-200/70 text-left">
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="filter…"
                          value={managerFilters.id}
                          onChange={(e) => setManagerFilters(f => ({ ...f, id: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="filter…"
                          value={managerFilters.title}
                          onChange={(e) => setManagerFilters(f => ({ ...f, title: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="DD-MMM-YYYY"
                          value={managerFilters.receivedDate}
                          onChange={(e) => setManagerFilters(f => ({ ...f, receivedDate: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="DD-MMM-YYYY"
                          value={managerFilters.loggedDate}
                          onChange={(e) => setManagerFilters(f => ({ ...f, loggedDate: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="filter…"
                          value={managerFilters.assignee}
                          onChange={(e) => setManagerFilters(f => ({ ...f, assignee: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="filter…"
                          value={managerFilters.status}
                          onChange={(e) => setManagerFilters(f => ({ ...f, status: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="mm/dd hh:mm…"
                          value={managerFilters.start}
                          onChange={(e) => setManagerFilters(f => ({ ...f, start: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="mm/dd hh:mm…"
                          value={managerFilters.end}
                          onChange={(e) => setManagerFilters(f => ({ ...f, end: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="hh:mm:ss"
                          value={managerFilters.spent}
                          onChange={(e) => setManagerFilters(f => ({ ...f, spent: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-xs"
                          placeholder="latest comment…"
                          value={managerFilters.comments}
                          onChange={(e) => setManagerFilters(f => ({ ...f, comments: e.target.value }))}
                        />
                      </th>
                      <th className="py-1 pr-4"><span className="text-xs text-slate-400">—</span></th>
                    </tr>
                  </thead>

                  <tbody>
                    {managerItems.map((it) => (
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
                          <CommentsCell
                            item={it}
                            onAdd={() => handleAddComment(it)}
                            onViewAll={() => setCommentsItem(it)}
                          />
                        </td>
                        <td className="min-w-[320px] py-2 pr-4">
                          {it.status === "complaint_unallocated" ? (
                            <div className="flex items-center gap-2">
                              <select
                                className="rounded-xl border px-2 py-1"
                                value={allocSelect[it.id] ?? CH_NAMES[0]}
                                onChange={(e) => setAllocSelect((s) => ({ ...s, [it.id]: e.target.value }))}
                                title="Choose Complaint Handler"
                              >
                                {CH_NAMES.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className={`rounded-xl px-3 py-1 ${isPending(it, "allocate") ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"}`}
                                onClick={() => handleAllocate(it)}
                                disabled={isPending(it, "allocate")}
                                title="Allocate to selected CH (moves to CH Review)"
                              >
                                {isPending(it, "allocate") ? "Allocating…" : "Allocate"}
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
                <h2 className="text-lg font-medium">Mahi's Queue</h2>
                <p className="text-sm text-slate-500">
                  Signed in as <span className="font-medium">mahi</span>
                </p>
              </div>
              {mahiHaveActive ? (
                <div className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">mahi have an active item</div>
              ) : (
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">No active item</div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-4 shadow">
              <div className="mb-3">
                <input
                  ref={userSearchRef}
                  type="text"
                  className="w-full rounded-xl border px-3 py-2 md:w-80"
                  placeholder="Search your items…"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
              </div>

              <div className="overflow-auto rounded-2xl ring-1 ring-slate-100 transition hover:ring-slate-200">
                <table className="min-w-full text-sm">
                  <thead className={TABLE_HEAD_GRADIENT + " border-b border-slate-200"}>
                    <tr className="text-left">
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Complaint Received</th>
                      <th className="py-2 pr-4">Complaint Logged</th>
                      <th className="py-2 pr-4">Assignee</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Start</th>
                      <th className="py-2 pr-4">End</th>
                      <th className="py-2 pr-4">Elapsed</th>
                      <th className="py-2 pr-4">Comments</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yourItems.map((it) => (
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
                                disabled={!canActOn(it) || isPending(it, "pickup")}
                                className={`rounded-xl px-3 py-1 ${!canActOn(it) || isPending(it, "pickup") ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"}`}
                                onClick={() => handlePickUp(it)}
                                title="Pick up and start processing"
                              >
                                {isPending(it, "pickup") ? "Picking…" : "Pick up"}
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
                                    {[
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
                                    ].map((next) => (
                                      <option key={next} value={next}>
                                        {LABEL[next]}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={isPending(it, "referring")}
                                    className={`rounded-xl px-3 py-1 ${isPending(it, "referring") ? "bg-slate-200 text-slate-400" : "bg-purple-600 text-white"}`}
                                    onClick={() => {
                                      const next = referSelect[it.id] ?? "ref_to_bo_uk";
                                      setPending((p) => ({ ...p, [it.id]: "referring" }));
                                      handleMove(it, next).finally(() => setPending((p) => ({ ...p, [it.id]: null })));
                                    }}
                                    title={DESC[referSelect[it.id] ?? "ref_to_bo_uk"]}
                                  >
                                    Refer
                                  </button>
                                </div>

                                {/* Close */}
                                <button
                                  type="button"
                                  disabled={isPending(it, "ch_complaint_closed")}
                                  className={`rounded-xl px-3 py-1 ${isPending(it, "ch_complaint_closed") ? "bg-slate-200 text-slate-400" : "bg-emerald-600 text-white"}`}
                                  onClick={() => handleMove(it, "ch_complaint_closed")}
                                  title="Close complaint"
                                >
                                  {isPending(it, "ch_complaint_closed") ? "Closing…" : "Close"}
                                </button>
                              </>
                            )}

                            {it.status.startsWith("ref_to_") && <span className="text-xs text-slate-400">Waiting on referral team…</span>}

                            {it.status === "ch_referral_complete" && it.assignee === currentUser && (
                              <button
                                type="button"
                                disabled={isPending(it, "pick_up")}
                                className={`rounded-xl px-3 py-1 ${isPending(it, "pick_up") ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"}`}
                                onClick={() => handleMove(it, "pick_up")}
                                title="Re-pick and continue processing"
                              >
                                {isPending(it, "pick_up") ? "Picking…" : "Re-pick"}
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

              <div className="mb-3">
                <input
                  ref={refSearchRef}
                  type="text"
                  className="w-full rounded-xl border px-3 py-2 md:w-80"
                  placeholder="Search referral items…"
                  value={refQuery}
                  onChange={(e) => setRefQuery(e.target.value)}
                />
              </div>

              <div className="overflow-auto rounded-2xl ring-1 ring-slate-100 transition hover:ring-slate-200">
                <table className="min-w-full text-sm">
                  <thead className={TABLE_HEAD_GRADIENT + " border-b border-slate-200"}>
                    <tr className="text-left">
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Complaint Received</th>
                      <th className="py-2 pr-4">Complaint Logged</th>
                      <th className="py-2 pr-4">Assignee</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Start</th>
                      <th className="py-2 pr-4">End</th>
                      <th className="py-2 pr-4">Elapsed</th>
                      <th className="py-2 pr-4">Comments</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralItems.length === 0 && (
                      <tr>
                        <td colSpan={11} className="py-6 text-slate-500">
                          No items in referral queues.
                        </td>
                      </tr>
                    )}
                    {referralItems.map((it) => (
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
                            disabled={isPending(it, "ch_referral_complete")}
                            className={`rounded-xl px-3 py-1 ${isPending(it, "ch_referral_complete") ? "bg-slate-200 text-slate-400" : "bg-indigo-600 text-white"}`}
                            onClick={() => handleMove(it, "ch_referral_complete")}
                            title="Return to CH (Referral Complete)"
                          >
                            {isPending(it, "ch_referral_complete") ? "Completing…" : "Mark Referral Complete"}
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
              .sort((a, b) => a.ts - b.ts) // oldest -> newest
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
              const note = { ts: Date.now(), author: "mahi", text: txt.trim() };
              setItems((prev) =>
                prev.map((it) => (it.id === commentsItem.id ? { ...it, comments: [...(it.comments ?? []), note] } : it))
              );
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
