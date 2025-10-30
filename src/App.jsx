import React, { useMemo, useState } from "react";

/**
 * Workflow UI — Step 3 (UI-only)
 * - Expanded complaint statuses + tooltips
 * - Manager allocation: Complaint Unallocated -> CH Review (choose CH from dropdown)
 * - User console: CH picks up, can Refer (dropdown) or Close
 * - Referral Teams console: can mark referral complete (CH cannot)
 * - Start time on Pick up; End time when leaving Pick up; cumulative spentMs
 * - Toasts + pending/disabled logic
 * - Per-console search; Manager rollups
 */

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
  complaint_unallocated: ["ch_review"], // manager allocates to CH review
  ch_review: ["pick_up"], // CH picks up to start work
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
  // referral queues can return to CH
  ref_to_bo_uk: ["ch_referral_complete"],
  ref_to_bo_ind: ["ch_referral_complete"],
  ref_to_finance: ["ch_referral_complete"],
  ref_to_aps: ["ch_referral_complete"],
  ref_to_cuw: ["ch_referral_complete"],
  ref_to_fct: ["ch_referral_complete"],
  ref_to_client: ["ch_referral_complete"],
  ref_to_rs: ["ch_referral_complete"],
  ref_to_ph: ["ch_referral_complete"],
  ch_referral_complete: ["ch_review", "pick_up"], // back with CH
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

// Random timestamp between N and M days ago
function randomDateDaysAgo(minDays = 1, maxDays = 30) {
  const days = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

// Human readable duration like 1h 03m 12s
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

// Elapsed for the *current* session (user & referral tables)
function currentElapsedMs(it) {
  if (it.startTime && !it.endTime) return Date.now() - it.startTime;
  if (it.startTime && it.endTime) return it.endTime - it.startTime;
  return 0;
}

// Total spent for manager (cumulative + any active)
function totalSpentMs(it) {
  const active = it.status === "pick_up" && it.startTime && !it.endTime ? (Date.now() - it.startTime) : 0;
  return (it.spentMs || 0) + active;
}

function matchesFilter(it, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase().replace(/\*/g, ""); // simple wildcard: ignore '*'
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

/* ------------------ Sample data + CH list ------------------ */
const seedItems = [
  { id: "W-201", title: "Address change complaint", assignee: null,  status: "complaint_unallocated", startTime: null, endTime: null, spentMs: 0, comments: [] },
  { id: "W-202", title: "Chargeback follow-up",     assignee: "you", status: "ch_review",             startTime: null, endTime: null, spentMs: 0, comments: [] },
  {
    id: "W-203",
    title: "Refund case - #7781",
    assignee: "you",
    status: "pick_up",
    startTime: Date.now() - 5 * 60 * 1000,
    endTime: null,
    spentMs: 0,
    comments: [{ ts: Date.now() - 10 * 60 * 1000, author: "you", text: "Initial review started." }],
  },
  { id: "W-204", title: "Vendor onboarding",        assignee: "bob",   status: "ref_to_finance", startTime: Date.now() - 60 * 60 * 1000, endTime: null, spentMs: 0, comments: [] },
  { id: "W-205", title: "Policy docs missing",      assignee: "alice", status: "ch_review",      startTime: null, endTime: null, spentMs: 0, comments: [] },
];

// Attach complaint dates (received + logged) once at init
const initialItems = seedItems.map((it) => {
  const received = randomDateDaysAgo(5, 30); // last 5–30 days
  const logged = received + Math.floor(Math.random() * 4) * 24 * 60 * 60 * 1000; // 0–3 days after
  return { ...it, receivedDate: received, loggedDate: logged };
});

const CH_NAMES = ["Alice", "Bob", "Charlie", "Deepa", "Ehsan", "you"]; // sample list

/* ------------------ Simulated API (UI-only) ------------------ */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiAllocateToCH(item, handlerName) {
  await delay(500 + Math.random() * 400);
  if (!canTransition(item.status, "ch_review")) throw new Error("Cannot allocate from current status.");
  return { ...item, assignee: handlerName, status: "ch_review" };
}

async function apiPickUp(item, { currentUser, youHaveActive }) {
  await delay(600 + Math.random() * 400);
  if (youHaveActive && !(item.assignee === currentUser && item.status === "pick_up")) {
    throw new Error("You already have an active item. Complete or refer it before picking another.");
  }
  const next = "pick_up";
  if (!canTransition(item.status, next)) throw new Error("Invalid transition to Pick up.");
  return {
    ...item,
    assignee: currentUser,
    status: next,
    startTime: item.startTime ?? Date.now(), // keep if already running
    endTime: null, // open session
  };
}

async function apiMove(item, next) {
  await delay(500 + Math.random() * 400);
  if (!canTransition(item.status, next)) {
    throw new Error(`Invalid transition from ${LABEL[item.status]} to ${LABEL[next]}.`);
  }
  const leavingPick = item.status === "pick_up" && next !== "pick_up";
  if (leavingPick && item.startTime) {
    const now = Date.now();
    const session = now - item.startTime;
    return {
      ...item,
      status: next,
      startTime: null,                 // close session
      endTime: now,                    // stamp last session end
      spentMs: (item.spentMs || 0) + Math.max(0, session),
    };
  }
  // default path (not leaving pick_up)
  return { ...item, status: next };
}

/* ------------------ Toasts ------------------ */
function Toasts({ toasts, remove }) {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-3 py-2 rounded-xl shadow text-sm ${t.type === "error" ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900"}`}
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

/* ------------------ App ------------------ */
export default function App() {
  // search boxes (one per console)
  const [managerQuery, setManagerQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [refQuery, setRefQuery] = useState("");

  const [items, setItems] = useState(initialItems);
  const [tab, setTab] = useState("manager"); // "manager" | "user" | "referrals"
  const [allocSelect, setAllocSelect] = useState({}); // { [itemId]: handlerName }
  const [referSelect, setReferSelect] = useState({}); // { [itemId]: referralStatus }
  const currentUser = "you"; // TODO: auth later

  const [pending, setPending] = useState({});
  const [toasts, setToasts] = useState([]);
  const pushToast = (msg, type = "success") =>
    setToasts((ts) => [...ts, { id: Math.random().toString(36).slice(2), msg, type }]);
  const removeToast = (id) => setToasts((ts) => ts.filter((t) => t.id !== id));

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

  // Manager list (filtered)
  const managerItems = useMemo(() => items.filter((i) => matchesFilter(i, managerQuery)), [items, managerQuery]);

  // User lists (filtered)
  const rawYourItems = useMemo(
    () => items.filter((i) => i.assignee === currentUser || (i.assignee === null && i.status === "complaint_unallocated")),
    [items]
  );
  const yourItems = useMemo(() => rawYourItems.filter((i) => matchesFilter(i, userQuery)), [rawYourItems, userQuery]);

  // Referral lists (filtered)
  const rawRefItems = useMemo(() => items.filter((i) => i.status.startsWith("ref_to_")), [items]);
  const referralItems = useMemo(() => rawRefItems.filter((i) => matchesFilter(i, refQuery)), [rawRefItems, refQuery]);

  const youHaveActive = useMemo(
    () => items.some((i) => i.assignee === currentUser && i.status === "pick_up"),
    [items]
  );

  const isPending = (item, action = null) => {
    const val = pending[item.id];
    if (action == null) return Boolean(val);
    return val === action;
  };

  const canActOn = (it) => {
    if (it.assignee === currentUser && it.status === "pick_up") return true; // can always act on your active
    return !youHaveActive; // otherwise block if you already have an active one
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
      const updated = await apiPickUp(item, { currentUser, youHaveActive });
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

  const fmtShort = (s, n = 30) => (s.length > n ? s.slice(0, n) + "…" : s);

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
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Complaints Workflow Tracker</h1>
          <p className="text-sm text-slate-600">Simplified Workflow Engine</p>
        </header>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          <button className={`px-4 py-2 rounded-2xl shadow-sm ${tab === "manager" ? "bg-white" : "bg-slate-100"}`} onClick={() => setTab("manager")}>
            Manager Console
          </button>
          <button className={`px-4 py-2 rounded-2xl shadow-sm ${tab === "user" ? "bg-white" : "bg-slate-100"}`} onClick={() => setTab("user")}>
            User Console
          </button>
          <button className={`px-4 py-2 rounded-2xl shadow-sm ${tab === "referrals" ? "bg-white" : "bg-slate-100"}`} onClick={() => setTab("referrals")}>
            Referral Teams
          </button>
        </div>

        {/* ---------- Manager Console ---------- */}
        {tab === "manager" && (
          <section className="grid md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* Rollups */}
            <div className="bg-white rounded-2xl shadow p-4 md:col-span-4 lg:col-span-6">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="rounded-xl border p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Total complaints received</div>
                  <div className="text-3xl font-bold mt-1">{totals.total}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Total complaints in pipeline</div>
                  <div className="text-3xl font-bold mt-1">{totals.pipeline}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Total complaints completed</div>
                  <div className="text-3xl font-bold mt-1">{totals.completed}</div>
                </div>
              </div>
            </div>

            {/* Status tiles */}
            {STATUSES.map((s) => (
              <div key={s} className="bg-white rounded-2xl shadow p-4" title={DESC[s]}>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{LABEL[s]}</div>
                <div className="text-3xl font-bold mt-1">{summary[s]}</div>
              </div>
            ))}

            <div className="md:col-span-6 bg-white rounded-2xl shadow p-4 mt-2">
              <h2 className="text-lg font-medium mb-3">All Work Items</h2>
              <div className="mb-3">
                <input
                  type="text"
                  className="border rounded-xl px-3 py-2 w-full md:w-80"
                  placeholder="Search (id, title, assignee, status, comments)…  Use * as wildcard"
                  value={managerQuery}
                  onChange={(e) => setManagerQuery(e.target.value)}
                />
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Complaint Received</th>
                      <th className="py-2 pr-4">Complaint Logged</th>
                      <th className="py-2 pr-4">Assignee</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Start</th>
                      <th className="py-2 pr-4">End</th>
                      <th className="py-2 pr-4">Total Time Spent</th>
                      <th className="py-2 pr-4">Comments</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerItems.map((it) => (
                      <tr key={it.id} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-4 font-mono">{it.id}</td>
                        <td className="py-2 pr-4">{it.title}</td>
                        <td className="py-2 pr-4">{fmtDate(it.receivedDate)}</td>
                        <td className="py-2 pr-4">{fmtDate(it.loggedDate)}</td>
                        <td className="py-2 pr-4">{it.assignee ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${pill(it.status)}`} title={DESC[it.status]}>
                            {LABEL[it.status]}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{fmt(it.startTime)}</td>
                        <td className="py-2 pr-4">{fmt(it.endTime)}</td>
                        <td className="py-2 pr-4">{fmtDuration(totalSpentMs(it))}</td>
                        <td className="py-2 pr-4 min-w-[260px]">
                          {it.comments && it.comments.length > 0 ? (
                            <div className="text-xs">
                              <div className="text-slate-500">({it.comments.length}) latest</div>
                              <div className="text-slate-800">{fmtShort(it.comments[it.comments.length - 1].text, 40)}</div>
                              <div className="text-slate-500">{new Date(it.comments[it.comments.length - 1].ts).toLocaleString()}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">No comments</span>
                          )}
                          <div>
                            <button type="button" className="mt-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-xs" onClick={() => handleAddComment(it)}>
                              Add
                            </button>
                          </div>
                        </td>
                        <td className="py-2 pr-4 min-w-[320px]">
                          {it.status === "complaint_unallocated" ? (
                            <div className="flex items-center gap-2">
                              <select
                                className="border rounded-xl px-2 py-1"
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
                                className={`px-3 py-1 rounded-xl ${isPending(it, "allocate") ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"}`}
                                onClick={() => handleAllocate(it)}
                                disabled={isPending(it, "allocate")}
                                title="Allocate to selected CH (moves to CH Review)"
                              >
                                {isPending(it, "allocate") ? "Allocating…" : "Allocate"}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
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

        {/* ---------- User Console (CH) ---------- */}
        {tab === "user" && (
          <section className="grid gap-4">
            <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Your Queue</h2>
                <p className="text-sm text-slate-500">
                  Signed in as <span className="font-medium">{currentUser}</span>
                </p>
              </div>
              {youHaveActive ? (
                <div className="text-sm px-3 py-1 rounded-full bg-amber-100 text-amber-800">You have an active item</div>
              ) : (
                <div className="text-sm px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">No active item</div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow p-4">
              {/* Search */}
              <div className="mb-3">
                <input
                  type="text"
                  className="border rounded-xl px-3 py-2 w-full md:w-80"
                  placeholder="Search your queue…  Use * as wildcard"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
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
                      <tr key={it.id} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-4 font-mono">{it.id}</td>
                        <td className="py-2 pr-4">{it.title}</td>
                        <td className="py-2 pr-4">{fmtDate(it.receivedDate)}</td>
                        <td className="py-2 pr-4">{fmtDate(it.loggedDate)}</td>
                        <td className="py-2 pr-4">{it.assignee ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${pill(it.status)}`} title={DESC[it.status]}>
                            {LABEL[it.status]}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{fmt(it.startTime)}</td>
                        <td className="py-2 pr-4">{fmt(it.endTime)}</td>
                        <td className="py-2 pr-4">{fmtDuration(currentElapsedMs(it))}</td>
                        <td className="py-2 pr-4 min-w-[260px]">
                          {it.comments && it.comments.length > 0 ? (
                            <div className="text-xs">
                              <div className="text-slate-500">({it.comments.length}) latest</div>
                              <div className="text-slate-800">{fmtShort(it.comments[it.comments.length - 1].text, 40)}</div>
                              <div className="text-slate-500">{new Date(it.comments[it.comments.length - 1].ts).toLocaleString()}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">No comments</span>
                          )}
                          <div>
                            <button type="button" className="mt-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-xs" onClick={() => handleAddComment(it)}>
                              Add
                            </button>
                          </div>
                        </td>
                        <td className="py-2 pr-4 min-w-[360px]">
                          <div className="flex flex-wrap gap-2 items-center">
                            {it.status === "ch_review" && it.assignee === currentUser && (
                              <button
                                type="button"
                                disabled={!canActOn(it) || isPending(it, "pickup")}
                                className={`px-3 py-1 rounded-xl ${
                                  !canActOn(it) || isPending(it, "pickup") ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"
                                }`}
                                onClick={() => handlePickUp(it)}
                                title="Pick up and start processing"
                              >
                                {isPending(it, "pickup") ? "Picking…" : "Pick up"}
                              </button>
                            )}

                            {it.status === "pick_up" && it.assignee === currentUser && (
                              <>
                                {/* Refer first */}
                                <div className="flex items-center gap-2">
                                  <select
                                    className="border rounded-xl px-2 py-1"
                                    value={referSelect[it.id] ?? referralTargets[0]}
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
                                    disabled={isPending(it, "referring")}
                                    className={`px-3 py-1 rounded-xl ${isPending(it, "referring") ? "bg-slate-200 text-slate-400" : "bg-purple-600 text-white"}`}
                                    onClick={() => {
                                      const next = referSelect[it.id] ?? referralTargets[0];
                                      setPending((p) => ({ ...p, [it.id]: "referring" }));
                                      handleMove(it, next).finally(() => setPending((p) => ({ ...p, [it.id]: null })));
                                    }}
                                    title={DESC[referSelect[it.id] ?? referralTargets[0]]}
                                  >
                                    Refer
                                  </button>
                                </div>

                                {/* Close */}
                                <button
                                  type="button"
                                  disabled={isPending(it, "ch_complaint_closed")}
                                  className={`px-3 py-1 rounded-xl ${isPending(it, "ch_complaint_closed") ? "bg-slate-200 text-slate-400" : "bg-emerald-600 text-white"}`}
                                  onClick={() => handleMove(it, "ch_complaint_closed")}
                                  title="Close complaint"
                                >
                                  {isPending(it, "ch_complaint_closed") ? "Closing…" : "Close"}
                                </button>
                              </>
                            )}

                            {/* CH cannot complete referrals here */}
                            {it.status.startsWith("ref_to_") && <span className="text-xs text-slate-400">Waiting on referral team…</span>}

                            {it.status === "ch_referral_complete" && it.assignee === currentUser && (
                              <button
                                type="button"
                                disabled={isPending(it, "pick_up")}
                                className={`px-3 py-1 rounded-xl ${isPending(it, "pick_up") ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white"}`}
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
            <div className="bg-white rounded-2xl shadow p-4">
              <h2 className="text-lg font-medium mb-3">Referral Queue</h2>

              {/* Search */}
              <div className="mb-3">
                <input
                  type="text"
                  className="border rounded-xl px-3 py-2 w-full md:w-80"
                  placeholder="Search referrals…  Use * as wildcard"
                  value={refQuery}
                  onChange={(e) => setRefQuery(e.target.value)}
                />
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
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
                      <tr key={it.id} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-4 font-mono">{it.id}</td>
                        <td className="py-2 pr-4">{it.title}</td>
                        <td className="py-2 pr-4">{fmtDate(it.receivedDate)}</td>
                        <td className="py-2 pr-4">{fmtDate(it.loggedDate)}</td>
                        <td className="py-2 pr-4">{it.assignee ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${pill(it.status)}`} title={DESC[it.status]}>
                            {LABEL[it.status]}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{fmt(it.startTime)}</td>
                        <td className="py-2 pr-4">{fmt(it.endTime)}</td>
                        <td className="py-2 pr-4">{fmtDuration(currentElapsedMs(it))}</td>
                        <td className="py-2 pr-4 min-w-[260px]">
                          {it.comments && it.comments.length > 0 ? (
                            <div className="text-xs">
                              <div className="text-slate-500">({it.comments.length}) latest</div>
                              <div className="text-slate-800">{fmtShort(it.comments[it.comments.length - 1].text, 40)}</div>
                              <div className="text-slate-500">{new Date(it.comments[it.comments.length - 1].ts).toLocaleString()}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">No comments</span>
                          )}
                          <div>
                            <button type="button" className="mt-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-xs" onClick={() => handleAddComment(it)}>
                              Add
                            </button>
                          </div>
                        </td>
                        <td className="py-2 pr-4 min-w-[240px]">
                          <button
                            type="button"
                            disabled={isPending(it, "ch_referral_complete")}
                            className={`px-3 py-1 rounded-xl ${isPending(it, "ch_referral_complete") ? "bg-slate-200 text-slate-400" : "bg-indigo-600 text-white"}`}
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

      <Toasts toasts={toasts} remove={removeToast} />
    </div>
  );
}
