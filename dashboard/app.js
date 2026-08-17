"use strict";

const DATA = window.SAILOR_REPORT_DATA || { months: [] };
const MONTHS = DATA.months;
const EMP_COLORS = ["#2f6bff", "#6941c6", "#d92d20", "#067647", "#b54708", "#175cd3"];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const normName = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, "");

const state = {
  tab: "overview",
  query: "",
  from: 0,
  to: MONTHS.length - 1,
  empKey: null,
  selected: [],
};

const visibleMonths = () =>
  MONTHS.slice(state.from, Math.min(state.to + 1, MONTHS.length));

function flaggedEntries(month) {
  const out = [];
  month.criteria.forEach((c) => {
    c.entries.forEach((e) => {
      if (e.type !== "text") out.push({ crit: c.name, entry: e });
    });
  });
  return out;
}

function indexEmployees(months) {
  const map = new Map();
  months.forEach((m) => {
    flaggedEntries(m).forEach((f) => {
      const key = normName(f.entry.name);
      if (!map.has(key)) map.set(key, { key, name: f.entry.name, criteria: new Set(), months: new Set(), records: 0 });
      const rec = map.get(key);
      rec.records++;
      rec.criteria.add(f.crit);
      rec.months.add(m.key);
      if (f.entry.name.length > rec.name.length) rec.name = f.entry.name;
    });
  });
  return [...map.values()].sort((a, b) => b.records - a.records || a.name.localeCompare(b.name));
}

/* ---------- Tabs ---------- */

function renderTabs() {
  const nav = document.getElementById("tabs");
  const months = visibleMonths();
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "criteria", label: "Per Criteria" },
    ...months.map((m) => ({ key: m.key, label: m.label, flagged: flaggedEntries(m).length })),
  ];
  nav.innerHTML = tabs
    .map((t) =>
      `<button class="tab ${t.key === state.tab ? "active" : ""}" data-tab="${esc(t.key)}">` +
      (t.key !== "overview" && t.flagged ? `<span class="tab-dot"></span>` : "") +
      `${esc(t.label)}</button>`
    )
    .join("");
  nav.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      renderTabs();
      render();
    })
  );
}

/* ---------- Month view ---------- */

function renderMonth(month) {
  const flags = flaggedEntries(month);
  const names = new Set(flags.map((f) => normName(f.entry.name)));
  const activeCrit = month.criteria.filter((c) =>
    c.entries.some((e) => e.type !== "text")
  ).length;

  const prevIdx = MONTHS.indexOf(month);
  const prev = prevIdx > state.from ? MONTHS[prevIdx - 1] : null;
  const prevTotal = prev ? flaggedEntries(prev).length : null;
  let changeHtml = "";
  if (prevTotal !== null) {
    const delta = flags.length - prevTotal;
    const pct = prevTotal ? Math.round((delta / prevTotal) * 100) : 0;
    changeHtml = `<div class="stat ${delta > 0 ? "up" : "neutral"}">` +
      `<div class="stat-label">vs ${esc(prev.label)}</div>` +
      `<div class="stat-value">${delta > 0 ? "+" : ""}${delta}</div>` +
      `<div class="stat-hint">${delta > 0 ? "more" : "fewer"} flagged records (${pct >= 0 ? "+" : ""}${pct}%)</div></div>`;
  }

  const cards = month.criteria
    .map((c) => {
      const entries = c.entries.filter((e) => e.type !== "text");
      const texts = c.entries.filter((e) => e.type === "text");
      const empty = entries.length === 0 && texts.length === 0;

      const link = c.sheet && c.sheet.startsWith("http")
        ? `<a class="sheet-link" href="${esc(c.sheet)}" target="_blank" rel="noopener">Open sheet \u2197</a>`
        : "";

      let body = "";
      if (!empty) {
        if (entries.length) body += `<div class="chips">${entries.map(chipHtml).join("")}</div>`;
        if (texts.length) {
          body += `<div class="notes">${texts
            .map((t) => `<div class="note">${esc(t.name)}</div>`)
            .join("")}${c.mail_subject ? `<div class="note-subject">Mail subject: ${esc(c.mail_subject)}</div>` : ""}</div>`;
        }
      } else {
        body = `<div class="empty-note">Nothing reported</div>`;
      }

      return `<div class="card ${empty ? "empty" : ""}">
        <div class="card-head">
          <span class="card-title">${esc(c.name)}</span>
          <span class="resp">${esc(c.responsibility)}</span>
        </div>
        ${link ? `<div>${link}</div>` : ""}
        ${body}
      </div>`;
    })
    .join("");

  return `
    <div class="stats">
      <div class="stat neutral">
        <div class="stat-label">Flagged records</div>
        <div class="stat-value">${flags.length}</div>
        <div class="stat-hint">across all criteria</div>
      </div>
      <div class="stat neutral">
        <div class="stat-label">Employees flagged</div>
        <div class="stat-value">${names.size}</div>
        <div class="stat-hint">distinct people</div>
      </div>
      <div class="stat neutral">
        <div class="stat-label">Active categories</div>
        <div class="stat-value">${activeCrit}<span style="font-size:15px;color:var(--muted)">/${month.criteria.length}</span></div>
        <div class="stat-hint">criteria with flags</div>
      </div>
      ${changeHtml}
    </div>
    <div class="cards">${cards}</div>`;
}

/* ---------- Overview ---------- */

function renderOverview() {
  const months = visibleMonths();
  const perMonth = months.map((m) => ({ month: m, flags: flaggedEntries(m) }));
  const totals = perMonth.map((p) => p.flags.length);
  const maxBars = Math.max(...totals, 1);

  const trend = perMonth
    .map((p, i) => {
      const h = Math.round((totals[i] / maxBars) * 100);
      return `<div class="trend-col">
        <div class="trend-val">${totals[i]}</div>
        <div class="trend-track"><div class="trend-fill" style="height:${h}%"></div></div>
        <div class="trend-label">${esc(shortMonth(p.month))}</div>
      </div>`;
    })
    .join("");

  const empCounts = new Map();
  perMonth.forEach((p) =>
    p.flags.forEach((f) => {
      if (f.entry.type !== "count") return;
      const key = normName(f.entry.name);
      if (!empCounts.has(key)) empCounts.set(key, { name: f.entry.name, total: 0 });
      const rec = empCounts.get(key);
      rec.total += f.entry.num || 0;
      rec.name = f.entry.name.length > rec.name.length ? f.entry.name : rec.name;
    })
  );
  const top = [...empCounts.values()].sort((a, b) => b.total - a.total).slice(0, 12);
  const maxEmp = Math.max(...top.map((t) => t.total), 1);

  const empBars = top
    .map(
      (t, i) => `<div class="bar-row">
        <div class="bar-label" title="${esc(t.name)}">${esc(t.name)}</div>
        <div class="bar-track"><div class="bar-fill ${i % 2 ? "alt" : ""}" style="width:${Math.round((t.total / maxEmp) * 100)}%"></div></div>
        <div class="bar-val">${t.total}</div>
      </div>`
    )
    .join("");

  const criteriaNames = [];
  months.forEach((m) =>
    m.criteria.forEach((c) => {
      if (!criteriaNames.includes(c.name)) criteriaNames.push(c.name);
    })
  );

  const criteriaTotals = criteriaNames
    .map((cn) => ({
      cn,
      total: perMonth.reduce((s, p) => {
        const c = p.month.criteria.find((x) => x.name === cn);
        return s + (c ? c.entries.filter((e) => e.type !== "text").length : 0);
      }, 0),
    }))
    .sort((a, b) => b.total - a.total || a.cn.localeCompare(b.cn));

  const heatRows = criteriaTotals
    .map(({ cn }) => {
      const cells = perMonth
        .map((p) => {
          const c = p.month.criteria.find((x) => x.name === cn);
          const n = c ? c.entries.filter((e) => e.type !== "text").length : 0;
          const cls = n === 0 ? "hm-0" : n <= 3 ? "hm-1" : n <= 6 ? "hm-2" : n <= 10 ? "hm-3" : n <= 15 ? "hm-4" : "hm-5";
          return `<td><span class="hm-cell ${cls}">${n || "\u00b7"}</span></td>`;
        })
        .join("");
      return `<tr><td class="crit">${esc(cn)}</td>${cells}</tr>`;
    })
    .join("");

  const heatHeaders = `<th style="text-align:left">Criteria</th>${perMonth
    .map((p) => `<th>${esc(shortMonth(p.month))}</th>`)
    .join("")}`;

  return `
    <div class="ov-section">
      <h2>Monthly trend</h2>
      <p>Total flagged records per month.</p>
      <div class="panel"><div class="trend-bars">${trend}</div>
        <div class="ov-note">Showing ${months.length} of ${MONTHS.length} months. Use the range selector above to adjust.</div>
      </div>
    </div>

    <div class="ov-grid">
      <div class="ov-section">
        <h2>Most flagged employees</h2>
        <p>Total late check-ins, partial attendance, early outs, etc. (count criteria).</p>
        <div class="panel"><div class="bars">${empBars || '<span style="color:var(--muted)">No count flags yet.</span>'}</div></div>
      </div>

      <div class="ov-section">
        <h2>Criteria activity</h2>
        <p>Records flagged per criterion per month.</p>
        <div class="panel heat-wrap">
          <table class="heat">
            <thead><tr>${heatHeaders}</tr></thead>
            <tbody>${heatRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

/* ---------- Search ---------- */

function renderSearch() {
  const employees = indexEmployees(visibleMonths());
  const q = normName(state.query);
  const results = employees.filter((e) => normName(e.name).includes(q));
  const selectedCount = state.selected.length;

  const cta = selectedCount >= 2
    ? `<div class="cmp-bar-cta">
        <span class="cmp-badge">${selectedCount} selected</span>
        <button class="btn primary" id="go-compare">Compare \u2192</button>
      </div>`
    : "";

  const list = results.length
    ? `<div class="emp-list">${results
        .map((e) => {
          const key = normName(e.name);
          const sel = state.selected.includes(key);
          const hot = e.records >= 10;
          return `<div class="emp-row ${sel ? "selected" : ""}">
            <input type="checkbox" data-emp="${esc(key)}" ${sel ? "checked" : ""}>
            <div style="min-width:0">
              <div class="emp-name">${esc(e.name)}</div>
              <div class="emp-meta">
                <span class="emp-tag">${e.records} records</span>
                <span class="emp-tag">${e.criteria.size} criteria</span>
                <span class="emp-tag">${e.months.size} months</span>
                ${hot ? `<span class="emp-tag hot">high volume</span>` : ""}
              </div>
            </div>
            <div class="emp-spacer"></div>
            <button class="btn small" data-view="${esc(key)}">View</button>
          </div>`;
        })
        .join("")}</div>`
    : `<div class="no-match">No employees match "${esc(state.query)}".</div>`;

  return `
    <div class="search-head">
      <div>
        <h2>Search results</h2>
        <div class="count">${results.length} of ${employees.length} flagged employees match "${esc(state.query)}"</div>
      </div>
      <div class="cmp-bar-cta">
        <button class="btn small" id="clear-search" title="Clear search">&times; Clear</button>
        ${cta}
      </div>
    </div>
    ${list}`;
}

/* ---------- Employee detail ---------- */

function buildEmployeeBreakdown(key) {
  const months = visibleMonths();
  const emp = indexEmployees(months).find((e) => e.key === key);
  const displayName = emp ? emp.name : key;

  const perMonth = months.map((m) => ({
    month: m,
    hits: flaggedEntries(m).filter((f) => normName(f.entry.name) === key),
  }));

  const statCards = perMonth
    .map((r) => {
      const n = r.hits.length;
      return `<div class="stat ${n ? "up" : "neutral"}">
        <div class="stat-label">${esc(shortMonth(r.month))}</div>
        <div class="stat-value">${n}</div>
        <div class="stat-hint">flagged records</div>
      </div>`;
    })
    .join("");

  const criteriaNames = [];
  perMonth.forEach((r) =>
    r.hits.forEach((f) => {
      if (!criteriaNames.includes(f.crit)) criteriaNames.push(f.crit);
    })
  );

  const rows = criteriaNames
    .map((cn) => {
      const cells = perMonth
        .map((r) => {
          const hit = r.hits.find((f) => f.crit === cn);
          if (!hit) return `<td class="z">\u00b7</td>`;
          const e = hit.entry;
          const cls = e.type === "time" ? "val-time" : e.type === "percent" ? "val-percent" : "val-flag";
          const suffix = e.type === "count" ? "\u00d7" : "";
          return `<td><span class="val-cell ${cls}">${esc(e.value)}${suffix}</span></td>`;
        })
        .join("");
      return `<tr><td class="name-cell">${esc(cn)}</td>${cells}</tr>`;
    })
    .join("");

  const monthCells = perMonth
    .map((r) => `<th>${esc(shortMonth(r.month))}</th>`)
    .join("");

  return { displayName, emp, statCards, rows, monthCells };
}

function renderEmployee() {
  const b = buildEmployeeBreakdown(state.empKey);

  return `
    <div class="detail-head">
      <button class="btn small" id="back-to-search">&larr; Back</button>
      <h2>${esc(b.displayName)}</h2>
      <span class="emp-tag">${b.emp ? `${b.emp.records} records across ${b.emp.criteria.size} criteria in range` : "no flags in range"}</span>
    </div>
    <div class="stats">${b.statCards}</div>
    <div class="panel heat-wrap" style="margin-top:20px">
      <h3 style="margin-bottom:12px">Monthly breakdown by criterion</h3>
      <table class="heat cmp-table">
        <thead><tr><th>Criterion</th>${b.monthCells}</tr></thead>
        <tbody>${b.rows}</tbody>
      </table>
    </div>`;
}

/* ---------- Compare ---------- */

function employeeMonthlyRecords(months, key) {
  return months.map((m) => flaggedEntries(m).filter((f) => normName(f.entry.name) === key).length);
}

function renderCompare() {
  const months = visibleMonths();
  const employees = indexEmployees(months).filter((e) => state.selected.includes(normName(e.name)));
  if (!employees.length) return renderSearch();

  const maxVal = Math.max(...employees.flatMap((e) => employeeMonthlyRecords(months, normName(e.name))), 1);

  const tableHead = `<th>Employee</th>${months.map((m) => `<th>${esc(shortMonth(m))}</th>`).join("")}<th>Total</th>`;
  const tableRows = employees
    .map((e, i) => {
      const key = normName(e.name);
      const vals = employeeMonthlyRecords(months, key);
      const total = vals.reduce((a, b) => a + b, 0);
      const cells = vals.map((v) => `<td>${v}</td>`).join("");
      return `<tr>
        <td class="name-cell"><span class="legend-swatch" style="background:${EMP_COLORS[i % EMP_COLORS.length]};display:inline-block;vertical-align:-1px;margin-right:6px"></span>${esc(e.name)}</td>
        ${cells}<td class="total-cell">${total}</td></tr>`;
    })
    .join("");

  const chartCols = months
    .map((m, mi) => {
      const bars = employees
        .map((e, i) => {
          const v = employeeMonthlyRecords(months, normName(e.name))[mi];
          const h = Math.max(Math.round((v / maxVal) * 100), v ? 4 : 2);
          return `<div class="cmp-bar" style="height:${h}%;background:${EMP_COLORS[i % EMP_COLORS.length]}" title="${esc(e.name)}: ${v}"></div>`;
        })
        .join("");
      return `<div class="cmp-col">
        <div class="cmp-bars">${bars}</div>
        <div class="cmp-month-label">${esc(shortMonth(m))}</div>
      </div>`;
    })
    .join("");

  const legend = employees
    .map((e, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${EMP_COLORS[i % EMP_COLORS.length]}"></span>${esc(e.name)}</div>`)
    .join("");

  const critRows = employees
    .map((e, i) => {
      const key = normName(e.name);
      const chips = [];
      months.forEach((m) => {
        flaggedEntries(m).forEach((f) => {
          if (normName(f.entry.name) !== key) return;
          const c = m.criteria.find((x) => x.name === f.crit);
          const res = c ? c.responsibility : "";
          chips.push(`${esc(f.crit)}${res ? ` <span class="z" style="font-size:11px">(${esc(res)})</span>` : ""}`);
        });
      });
      return `<div class="emp-row" style="cursor:default">
        <span class="legend-swatch" style="background:${EMP_COLORS[i % EMP_COLORS.length]};flex:none"></span>
        <div style="min-width:0">
          <div class="emp-name">${esc(e.name)}</div>
          <div class="chips" style="margin-top:8px">${chips.map((c) => `<span class="chip"><span>${c}</span></span>`).join("")}</div>
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="detail-head">
      <button class="btn small" id="back-to-search">&larr; Back</button>
      <h2>Compare ${employees.length} employees</h2>
      <button class="btn small" id="clear-compare">Clear selection</button>
    </div>
    <div class="ov-section">
      <div class="panel">
        <h3>Flagged records per month</h3>
        <div class="cmp-chart">${chartCols}</div>
        <div class="legend">${legend}</div>
      </div>
    </div>
    <div class="ov-section">
      <div class="panel heat-wrap">
        <h3>Side-by-side totals</h3>
        <table class="heat cmp-table">
          <thead><tr>${tableHead}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
    <div class="ov-section">
      <div class="panel">
        <h3>Flagged criteria per employee</h3>
        <div class="emp-list">${critRows}</div>
      </div>
    </div>`;
}

/* ---------- Per Criteria ---------- */

function hoursToHMS(h) {
  const total = Math.round(h * 3600);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const hh = Math.floor(total / 3600);
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTotal(type, total) {
  if (type === "count") return String(Math.round(total));
  if (type === "percent") return `${Math.round(total)}%`;
  return hoursToHMS(total);
}

function renderCriteriaTable() {
  const months = visibleMonths();
  const criteriaNames = [];
  months.forEach((m) =>
    m.criteria.forEach((c) => {
      if (!criteriaNames.includes(c.name)) criteriaNames.push(c.name);
    })
  );

  const monthHeaders = months.map((m) => `<th>${esc(shortMonth(m))}</th>`).join("");

  const panels = [];
  criteriaNames.forEach((cn) => {
    const c0 = months.map((m) => m.criteria.find((x) => x.name === cn)).find(Boolean);

    const agg = new Map();
    months.forEach((m) => {
      const c = m.criteria.find((x) => x.name === cn);
      if (!c) return;
      c.entries.forEach((e) => {
        if (e.type === "text") return;
        const key = normName(e.name);
        if (!agg.has(key)) agg.set(key, { key, name: e.name, type: e.type, total: 0, perMonth: new Map() });
        const rec = agg.get(key);
        rec.total += e.num || 0;
        rec.perMonth.set(m.key, e);
        if (e.name.length > rec.name.length) rec.name = e.name;
      });
    });

    if (!agg.size) return;

    const members = [...agg.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const catTotal = members.reduce((s, mm) => s + mm.total, 0);

    const body = members
      .map((mm, i) => {
        const cells = months
          .map((m) => {
            const e = mm.perMonth.get(m.key);
            if (!e) return `<td class="z">\u00b7</td>`;
            const cls = e.type === "time" ? "val-time" : e.type === "percent" ? "val-percent" : "val-flag";
            const suffix = e.type === "count" ? "\u00d7" : "";
            return `<td><span class="val-cell ${cls}">${esc(e.value)}${suffix}</span></td>`;
          })
          .join("");
        const badge = i === 0 ? `<span class="top-badge">top</span>` : "";
        return `<tr class="${i === 0 ? "top-row" : ""}">
          <td class="name-cell">${badge}<button class="name-link" data-view="${esc(mm.key)}">${esc(mm.name)}</button></td>
          ${cells}<td class="total-cell">${formatTotal(mm.type, mm.total)}</td>
        </tr>`;
      })
      .join("");

    const resp = c0 && c0.responsibility ? `<span class="resp">${esc(c0.responsibility)}</span>` : "";
    const link = c0 && c0.sheet && c0.sheet.startsWith("http")
      ? `<a class="sheet-link" href="${esc(c0.sheet)}" target="_blank" rel="noopener">Open sheet \u2197</a>`
      : "";
    const meta = [resp, link].filter(Boolean).join('<span class="sep">\u00b7</span>');

    panels.push({
      total: catTotal,
      html: `<div class="panel crit-panel">
        <div class="crit-head">
          <div class="crit-title">${esc(cn)}</div>
          <div class="crit-meta">${meta}</div>
        </div>
        <div class="heat-wrap">
          <table class="heat cmp-table">
            <thead><tr><th>Member</th>${monthHeaders}<th>Total</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`,
    });
  });

  const sections = panels
    .sort((a, b) => b.total - a.total)
    .map((p) => p.html)
    .join("");

  return `
    <div class="ov-section">
      <h2>All flagged members per criterion</h2>
      <p>Every team member flagged on each criterion, with their values across the selected months. Categories and members are ordered from highest to lowest.</p>
      ${sections || `<div class="no-match">No numeric flags in the selected range.</div>`}
    </div>`;
}

/* ---------- Render ---------- */

function shortMonth(m) {
  return m.label.split(" ")[0];
}

function chipHtml(e) {
  return `<span class="chip ${esc(e.type)}"><span class="chip-name">${esc(e.name)}</span>` +
    `<span class="chip-val">${esc(e.value)}${e.type === "count" ? "\u00d7" : ""}</span></span>`;
}

function render() {
  const main = document.getElementById("content");
  if (state.tab === "search") {
    main.innerHTML = renderSearch();
  } else if (state.tab === "employee") {
    main.innerHTML = renderEmployee();
  } else if (state.tab === "compare") {
    main.innerHTML = renderCompare();
  } else if (state.tab === "criteria") {
    main.innerHTML = renderCriteriaTable();
  } else if (state.tab === "overview") {
    main.innerHTML = renderOverview();
  } else {
    const month = MONTHS.find((m) => m.key === state.tab);
    main.innerHTML = month ? renderMonth(month) : renderOverview();
  }
  wireActions();
}

function wireActions() {
  const main = document.getElementById("content");

  main.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      state.empKey = b.dataset.view;
      state.tab = "employee";
      render();
    })
  );

  main.querySelectorAll("input[data-emp]").forEach((cb) =>
    cb.addEventListener("change", () => {
      const key = cb.dataset.emp;
      const i = state.selected.indexOf(key);
      if (cb.checked && i === -1) state.selected.push(key);
      if (!cb.checked && i !== -1) state.selected.splice(i, 1);
      render();
    })
  );

  const go = main.querySelector("#go-compare");
  if (go) go.addEventListener("click", () => { state.tab = "compare"; render(); });

  const back = main.querySelector("#back-to-search");
  if (back) back.addEventListener("click", () => { state.tab = "search"; render(); });

  const clear = main.querySelector("#clear-compare");
  if (clear) clear.addEventListener("click", () => { state.selected = []; state.tab = "search"; render(); });

  const clearSearch = main.querySelector("#clear-search");
  if (clearSearch) clearSearch.addEventListener("click", () => { state.query = ""; state.tab = "overview"; renderTabs(); render(); });
}

function initControls() {
  const fromSel = document.getElementById("from-month");
  const toSel = document.getElementById("to-month");

  const opts = MONTHS.map((m, i) => `<option value="${i}">${esc(m.label)}</option>`).join("");
  fromSel.innerHTML = opts;
  toSel.innerHTML = opts;
  fromSel.value = state.from;
  toSel.value = state.to;

  const syncFromInputs = () => {
    fromSel.value = state.from;
    toSel.value = state.to;
  };

  const applyRange = () => {
    let f = +fromSel.value;
    let t = +toSel.value;
    if (f > t) t = f;
    state.from = f;
    state.to = t;
    syncFromInputs();
    if (!visibleMonths().some((m) => m.key === state.tab)) state.tab = "overview";
    renderTabs();
    render();
  };

  fromSel.addEventListener("change", applyRange);
  toSel.addEventListener("change", applyRange);

  initModal();
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && state.query) {
      state.query = "";
      state.tab = "overview";
      renderTabs();
      render();
    }
  });
}

/* ---------- Search modal ---------- */

const modal = {
  query: "",
  results: [],
  hl: 0,
  mode: "list",
  empKey: null,
};

function modalEls() {
  return {
    backdrop: document.getElementById("search-modal"),
    input: document.getElementById("modal-search"),
    body: document.getElementById("modal-body"),
    close: document.getElementById("modal-close"),
    seeAll: document.getElementById("modal-see-all"),
  };
}

function openModal() {
  const els = modalEls();
  modal.query = "";
  modal.hl = 0;
  modal.mode = "list";
  modal.results = [];
  els.input.value = "";
  els.backdrop.hidden = false;
  els.seeAll.hidden = true;
  els.body.innerHTML = `<div class="modal-empty">Start typing a team member's name to see their month-wise data.</div>`;
  els.input.focus();
}

function closeModal() {
  modalEls().backdrop.hidden = true;
}

function renderModalList() {
  const els = modalEls();
  const q = normName(modal.query);
  if (!q) {
    modal.results = [];
    els.body.innerHTML = `<div class="modal-empty">Start typing a team member's name to see their month-wise data.</div>`;
    els.seeAll.hidden = true;
    return;
  }
  const employees = indexEmployees(visibleMonths());
  modal.results = employees
    .filter((e) => normName(e.name).includes(q))
    .slice(0, 12);
  els.seeAll.hidden = false;

  if (!modal.results.length) {
    els.body.innerHTML = `<div class="modal-empty">No team members match "${esc(modal.query)}".</div>`;
    return;
  }

  els.body.innerHTML = `<div class="emp-list">${modal.results
    .map((e, i) => {
      const key = normName(e.name);
      const hot = e.records >= 10;
      return `<div class="emp-row ${i === modal.hl ? "hl" : ""}" data-empkey="${esc(key)}">
        <div style="min-width:0">
          <div class="emp-name">${esc(e.name)}</div>
          <div class="emp-meta">
            <span class="emp-tag">${e.records} records</span>
            <span class="emp-tag">${e.criteria.size} criteria</span>
            <span class="emp-tag">${e.months.size} months</span>
            ${hot ? `<span class="emp-tag hot">high volume</span>` : ""}
          </div>
        </div>
        <div class="emp-spacer"></div>
        <span class="emp-tag">month-wise data &rarr;</span>
      </div>`;
    })
    .join("")}</div>`;

  els.body.querySelectorAll("[data-empkey]").forEach((row, i) =>
    row.addEventListener("click", () => showModalEmployee(row.dataset.empkey))
  );
}

function showModalEmployee(key) {
  const els = modalEls();
  modal.mode = "emp";
  modal.empKey = key;
  const b = buildEmployeeBreakdown(key);
  const noData = !b.rows;
  els.seeAll.hidden = true;
  els.body.innerHTML = `
    <div class="modal-detail">
      <div class="detail-head">
        <button class="btn small" id="modal-back">&larr; Back to results</button>
        <h2>${esc(b.displayName)}</h2>
        <span class="emp-tag">${b.emp ? `${b.emp.records} records across ${b.emp.criteria.size} criteria` : "no flags in range"}</span>
      </div>
      ${noData ? `<div class="no-match">No flagged data in the selected month range.</div>` : `
      <div class="stats">${b.statCards}</div>
      <div class="heat-wrap">
        <table class="heat cmp-table">
          <thead><tr><th>Criterion</th>${b.monthCells}</tr></thead>
          <tbody>${b.rows}</tbody>
        </table>
      </div>`}
      <div class="modal-detail-actions">
        <span></span>
        <button class="btn small primary" id="modal-open-full">Open full view \u2197</button>
      </div>
    </div>`;
  els.body.querySelector("#modal-back").addEventListener("click", () => {
    modal.mode = "list";
    renderModalList();
  });
  els.body.querySelector("#modal-open-full").addEventListener("click", () => {
    state.query = "";
    state.empKey = key;
    state.tab = "employee";
    closeModal();
    renderTabs();
    render();
  });
}

function modalSearchToPage() {
  const q = modal.query.trim();
  state.query = q;
  state.tab = q ? "search" : "overview";
  closeModal();
  renderTabs();
  render();
}

function initModal() {
  const els = modalEls();

  document.getElementById("search-open").addEventListener("click", openModal);
  els.close.addEventListener("click", closeModal);
  els.seeAll.addEventListener("click", modalSearchToPage);
  els.backdrop.addEventListener("click", (ev) => {
    if (ev.target === els.backdrop) closeModal();
  });

  els.input.addEventListener("input", () => {
    modal.query = els.input.value.trim();
    modal.hl = 0;
    modal.mode = "list";
    renderModalList();
  });

  els.input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (modal.mode === "list" && modal.results.length) {
        modal.hl = (modal.hl + 1) % modal.results.length;
        renderModalList();
      }
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (modal.mode === "list" && modal.results.length) {
        modal.hl = (modal.hl - 1 + modal.results.length) % modal.results.length;
        renderModalList();
      }
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (modal.mode === "list" && modal.results.length) {
        const key = normName(modal.results[modal.hl].name);
        showModalEmployee(key);
      } else if (modal.mode === "emp") {
        els.body.querySelector("#modal-open-full")?.click();
      }
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !modalEls().backdrop.hidden) closeModal();
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      openModal();
    }
    if (ev.key === "/" && !ev.metaKey && !ev.ctrlKey && !ev.altKey &&
        !/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName || "")) {
      ev.preventDefault();
      openModal();
    }
  });
}

function dataSignature(d) {
  return `${d.generated || ""}|${(d.months || []).map((m) => m.key).join(",")}`;
}

function startUpdateWatcher() {
  if (typeof setInterval === "undefined" || typeof fetch === "undefined") return;
  const lastSig = dataSignature(DATA);
  let announced = false;

  setInterval(() => {
    if (announced) return;
    fetch(`data/sailor-report.js?t=${Date.now()}`)
      .then((r) => r.text())
      .then((text) => {
        const fakeWin = {};
        new Function("window", text)(fakeWin);
        const sig = fakeWin.SAILOR_REPORT_DATA ? dataSignature(fakeWin.SAILOR_REPORT_DATA) : "";
        if (sig && sig !== lastSig) {
          announced = true;
          document.getElementById("update-banner").hidden = false;
        }
      })
      .catch(() => {});
  }, 15000);
}

function init() {
  const badge = document.getElementById("generated-badge");
  if (DATA.generated) badge.textContent = `Generated ${DATA.generated}`;
  const refresh = document.getElementById("update-refresh");
  if (refresh) refresh.addEventListener("click", () => location.reload());
  initControls();
  renderTabs();
  render();
  startUpdateWatcher();
}

document.addEventListener("DOMContentLoaded", init);