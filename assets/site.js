/*
 * rsnode homepage data layer.
 *
 * Every number on the page comes from data/benchmark.json. Nothing is hardcoded
 * here, nothing is interpolated from another document, and a null measurement is
 * rendered as null — never as a zero-length bar.
 */
(function () {
  "use strict";

  var DATA_URL = "data/benchmark.json";

  var ORDER = ["startup", "memory", "native-call", "http", "compatibility"];

  var LABEL = {
    node: "Node.js",
    rustnode: "rsnode",
    bun: "Bun"
  };

  var SLUG = {
    node: "node",
    rustnode: "rsnode",
    bun: "bun"
  };

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function isNum(v) {
    return typeof v === "number" && isFinite(v);
  }

  /* A cell may be a number, null, or { value, status } — normalise all three. */
  function cell(raw) {
    if (raw == null) return { value: null, status: "missing" };
    if (isNum(raw)) return { value: raw, status: "ok" };
    if (typeof raw === "object") {
      if (isNum(raw.value)) return { value: raw.value, status: "ok" };
      return { value: null, status: raw.status || raw.state || "missing" };
    }
    return { value: null, status: "missing" };
  }

  function fmt(v) {
    if (!isNum(v)) return "—";
    var s;
    var a = Math.abs(v);
    if (a >= 10000) s = v.toFixed(0);
    else if (a >= 100) s = trim(v.toFixed(1));
    else if (a >= 10) s = trim(v.toFixed(1));
    else if (a >= 1) s = trim(v.toFixed(2));
    else s = trim(v.toFixed(3));

    // group thousands for anything that reaches five digits
    if (Math.abs(v) >= 10000) {
      var neg = s.charAt(0) === "-";
      if (neg) s = s.slice(1);
      s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      if (neg) s = "-" + s;
    }
    return s;
  }

  function trim(s) {
    return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function runtimeKeys(data) {
    var keys = ["node", "rustnode", "bun"];
    var have = data && data.runtimes ? Object.keys(data.runtimes) : [];
    have.forEach(function (k) {
      if (keys.indexOf(k) === -1) keys.push(k);
    });
    return keys;
  }

  function nameFor(data, key) {
    if (data && data.runtimes && data.runtimes[key] && data.runtimes[key].name) {
      return data.runtimes[key].name;
    }
    return LABEL[key] || key;
  }

  function versionFor(data, key) {
    var r = data && data.runtimes ? data.runtimes[key] : null;
    if (!r) return null;
    if (r.version && r.engine) return r.version + " (" + r.engine + ")";
    return r.version || r.engine || null;
  }

  /* ---------- verdicts ---------- */

  /*
   * A verdict is derived from the section's own numbers. It always names who
   * won, and it never softens a loss. `kind` only drives the colour of the
   * badge; the sentence is what carries the meaning.
   *
   * Rows inside one section are different workloads, so they are never compared
   * against each other — only each runtime against itself, row by row.
   */
  function verdictFor(section, data) {
    var rows = section.rows || [];
    var lower = section.lowerIsBetter !== false;
    var keys = runtimeKeys(data);

    if (section.id === "compatibility") {
      return compatVerdict(section, rows, cell(rows[0] ? rows[0].rustnode : null),
                           cell(rows[0] ? rows[0].node : null), data);
    }

    if (!rows.length) {
      return { kind: "neutral", text: "No rows are present in this section yet." };
    }

    var wins = 0, losses = 0, ties = 0, unmeasured = 0;
    var worst = null;   // rsnode's most costly comparison in this section
    var bestGain = null;
    var unit = section.unit ? " " + section.unit : "";

    function classify(ratio) {
      if (ratio >= 1.03) return "win";
      if (ratio <= 0.97) return "loss";
      return "level";
    }

    rows.forEach(function (r) {
      var rs = cell(r.rustnode);
      var nd = cell(r.node);

      if (rs.value == null || nd.value == null) {
        unmeasured++;
        return;
      }

      // ratio expressed so that > 1 always means rsnode is ahead
      var ratio = lower ? nd.value / rs.value : rs.value / nd.value;
      var verdict = classify(ratio);

      if (verdict === "win") {
        wins++;
        if (!bestGain || ratio > bestGain.ratio) {
          bestGain = { ratio: ratio, row: r, rs: rs.value, nd: nd.value };
        }
      } else if (verdict === "loss") {
        losses++;
        if (!worst || ratio < worst.ratio) {
          worst = { ratio: ratio, row: r, rs: rs.value, nd: nd.value };
        }
      } else {
        ties++;
      }
    });

    var parts = [];
    var kind = "neutral";

    var lead = rows.filter(function (r) { return r.headline; })[0] || rows[0];
    var leadRs = cell(lead.rustnode);
    var leadNd = cell(lead.node);
    var leadName = lead.case != null ? "`" + lead.case + "`" : "the headline case";

    if (leadRs.value != null && leadNd.value != null) {
      var r0 = lower ? leadNd.value / leadRs.value : leadRs.value / leadNd.value;
      kind = classify(r0);
      var margin = r0 >= 1.10 || r0 <= 0.91 ? "" : " by a narrow margin";

      if (kind === "win") {
        parts.push("On " + leadName + " rsnode is ahead" + margin + ", at " +
          fmt(leadRs.value) + unit + " against Node's " + fmt(leadNd.value) + unit +
          " (" + fmt(r0) + "x).");
      } else if (kind === "loss") {
        parts.push("On " + leadName + " Node wins at " + fmt(leadNd.value) + unit +
          " against rsnode's " + fmt(leadRs.value) + unit + " — rsnode is at " +
          fmt(r0) + "x of Node.");
      } else {
        parts.push("On " + leadName + " the two are effectively level: rsnode " +
          fmt(leadRs.value) + unit + ", Node " + fmt(leadNd.value) + unit + ".");
      }
    } else if (leadRs.value == null) {
      kind = "loss";
      parts.push("rsnode has no measurement for " + leadName + " in this run" +
        (leadNd.value != null ? "; Node recorded " + fmt(leadNd.value) + unit : "") + ".");
    } else {
      parts.push("rsnode recorded " + fmt(leadRs.value) + unit + " on " + leadName +
        "; Node was not measured.");
    }

    if (rows.length > 1) {
      var tally = [];
      if (wins) tally.push("ahead on " + wins);
      if (losses) tally.push("behind on " + losses);
      if (ties) tally.push("level on " + ties);
      if (unmeasured) tally.push("not measured on " + unmeasured);
      if (tally.length) {
        parts.push("Across the " + rows.length + " cases shown rsnode is " +
          tally.join(", ") + ".");
      }
    }

    if (worst) {
      parts.push("Its widest gap in this section is " + fmt(worst.ratio) +
        "x of Node on `" + worst.row.case + "`.");
    } else if (bestGain && rows.length > 1) {
      parts.push("Its widest lead in this section is " + fmt(bestGain.ratio) +
        "x of Node on `" + bestGain.row.case + "`.");
    }

    var bunCount = 0;
    var bunBetter = 0;
    rows.forEach(function (r) {
      var bn = cell(r.bun);
      var rs = cell(r.rustnode);
      if (bn.value == null) return;
      bunCount++;
      if (rs.value == null) { bunBetter++; return; }
      var cmp = lower ? rs.value <= bn.value : rs.value >= bn.value;
      if (!cmp) bunBetter++;
    });
    if (bunCount) {
      parts.push("Bun was faster than rsnode on " + bunBetter + " of the " + bunCount +
        " cases where it was measured, which is expected: Bun's runtime is a different " +
        "engine, and this page does not claim otherwise.");
    }

    return { kind: kind, text: parts.join(" ") };
  }

  function compatVerdict(section, rows, rs, nd, data) {
    var unit = section.unit || "";
    var parts = [];

    if (rs.value != null) {
      parts.push("rsnode covers " + fmt(rs.value) + unit +
        " of the surface measured here" +
        (nd.value != null ? ", against " + fmt(nd.value) + unit + " for Node" : "") + ".");
    } else {
      parts.push("Coverage for rsnode has not been measured yet.");
      return { kind: "neutral", text: parts.join(" ") };
    }

    parts.push("This card is deliberately not a speed number: it is a breadth " +
      "measurement of how much of Node's own behaviour reproduces. The part that " +
      "is missing is unfinished native work, and it is stated rather than rounded away.");
    parts.push("It is also not a compatibility guarantee — passing files is not proof " +
      "that a subsystem matches, which is why the full report lists the gate results " +
      "and the known divergences separately.");

    if (nd.value == null) {
      parts.push("No Node baseline is recorded in this dataset.");
    }

    return { kind: "neutral", text: parts.join(" ") };
  }

  /* ---------- chart ---------- */

  function buildChart(section, data) {
    var keys = runtimeKeys(data);
    var lower = section.lowerIsBetter !== false;
    var rows = section.rows || [];
    var chart = el("div", "chart");
    chart.setAttribute("role", "list");

    // global max for bar scaling, so bars are comparable across cases
    var max = 0;
    rows.forEach(function (r) {
      keys.forEach(function (k) {
        var c = cell(r[k]);
        if (c.value != null && c.value > max) max = c.value;
      });
    });

    rows.forEach(function (r) {
      var group = el("div", "case-group");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", r.case != null ? String(r.case) : "case");

      var labelRow = el("div", "case-label");
      labelRow.appendChild(el("span", "mono", r.case != null ? String(r.case) : "—"));
      var nVal = r.n;
      if (isNum(nVal)) labelRow.appendChild(el("span", "n", "n=" + nVal));
      group.appendChild(labelRow);

      // best runtime for this row
      var rowBest = null;
      keys.forEach(function (k) {
        var c = cell(r[k]);
        if (c.value == null) return;
        if (!rowBest || (lower ? c.value < rowBest.value : c.value > rowBest.value)) {
          rowBest = { key: k, value: c.value };
        }
      });

      keys.forEach(function (k) {
        var c = cell(r[k]);
        var row = el("div", "row is-" + (SLUG[k] || "other"));
        if (rowBest && rowBest.key === k) row.classList.add("is-best");
        row.appendChild(el("span", "row-name", nameFor(data, k)));

        var track = el("div", "row-track");
        var outer = el("div", "bar-outer");

        if (c.value == null) {
          outer.appendChild(el("div", "bar-na"));
        } else {
          var bar = el("div", "bar");
          var pct = max > 0 ? (c.value / max) * 100 : 0;
          // keep a sliver visible for very small non-zero values
          if (c.value > 0 && pct < 1.5) pct = 1.5;
          bar.style.width = pct.toFixed(2) + "%";
          bar.setAttribute("aria-hidden", "true");
          outer.appendChild(bar);
        }

        track.appendChild(outer);

        var value = el("span", "row-value");
        if (c.value == null) {
          value.classList.add("is-na");
          value.textContent = naText(c.status);
        } else {
          value.textContent = fmt(c.value) + (section.unit ? " " + section.unit : "");
          if (rowBest && rowBest.key === k) {
            value.appendChild(document.createTextNode(" "));
            value.appendChild(el("span", "best-tag", "best"));
          }
        }
        track.appendChild(value);
        row.setAttribute("role", "listitem");
        row.setAttribute("aria-label",
          nameFor(data, k) + ": " +
          (c.value == null ? naText(c.status) : fmt(c.value) + (section.unit ? " " + section.unit : "")) +
          (rowBest && rowBest.key === k ? ", best in this case" : ""));
        row.appendChild(track);
        group.appendChild(row);
      });

      chart.appendChild(group);
    });

    return chart;
  }

  function naText(status) {
    if (status === "failed" || status === "error") return "failed";
    if (status === "skipped") return "not run";
    return "not measured";
  }

  /* ---------- method footnote ---------- */

  /*
   * bun prints the method inside the card, not in a tooltip. Same here:
   * what the workload is · how it was measured · hardware · medians of N
   */
  function buildMethod(section, data) {
    var segs = [];
    var rows = section.rows || [];

    if (section.method) segs.push(section.method);

    var hw = [];
    if (data && data.host) {
      if (data.host.cpu) hw.push(data.host.cpu);
      if (isNum(data.host.cores)) hw.push(data.host.cores + " cores");
      if (data.host.note) hw.push(data.host.note);
    }
    segs.push(hw.length ? hw.join(", ") : "hardware not recorded");

    var ns = rows
      .map(function (r) { return r.n; })
      .filter(function (v) { return isNum(v); });
    if (ns.length) {
      var lo = Math.min.apply(null, ns);
      var hi = Math.max.apply(null, ns);
      segs.push(lo === hi ? "medians of " + lo : "medians of " + lo + "–" + hi + " per case");
    } else if (section.id !== "compatibility") {
      segs.push("sample size not recorded");
    }

    var vers = runtimeKeys(data)
      .map(function (k) {
        var v = versionFor(data, k);
        return v ? nameFor(data, k) + " " + v : null;
      })
      .filter(Boolean);
    if (vers.length) segs.push(vers.join(" · "));

    var p = el("p", "method");
    segs.forEach(function (s, i) {
      if (i) {
        var dot = el("span", "dot", "·");
        p.appendChild(dot);
      }
      p.appendChild(el("span", "", s));
    });
    return p;
  }

  /* ---------- cards ---------- */

  function buildCard(section, data, index) {
    var compat = section.id === "compatibility";
    var card = el("article", compat ? "card card-compat" : "card");
    card.id = "card-" + (section.id || index);

    var head = el("div", "card-head");
    head.appendChild(el("h3", "card-title", section.title || section.id || "Section"));

    var unitTxt = compat && section.unit ? section.unit + " covered" : section.unit;
    if (unitTxt) head.appendChild(el("span", "card-unit", unitTxt));
    card.appendChild(head);

    var verdict = verdictFor(section, data);
    var v = el("div", "verdict is-" + verdict.kind);
    var icon = verdict.kind === "win" ? "+" : verdict.kind === "loss" ? "!" : "·";
    v.appendChild(el("span", "verdict-icon", icon));
    var body = el("span", "verdict-body");
    body.textContent = verdict.text;
    v.appendChild(body);
    card.appendChild(v);

    if (compat) {
      card.appendChild(buildCompatBody(section, data));
    } else {
      card.appendChild(buildChart(section, data));
    }

    card.appendChild(buildMethod(section, data));

    var foot = el("div", "card-foot");
    var a = el("a", "", "full report");
    a.href = "https://github.com/SnowingFox/rsnode/blob/main/docs/compat-status.md";
    a.rel = "noopener";
    foot.appendChild(a);
    card.appendChild(foot);

    return card;
  }

  /* Compatibility is a breadth card: no speed bars, its own layout. */
  function buildCompatBody(section, data) {
    var keys = runtimeKeys(data);
    var rows = section.rows || [];
    var body = el("div", "compat-body");

    var left = el("div");
    var headlineRow = rows[0] || {};
    var rs = cell(headlineRow.rustnode);

    var h = el("p", "compat-headline");
    h.textContent = rs.value == null ? "—" : fmt(rs.value) + (section.unit || "");
    var sub = el("small");
    sub.textContent = section.headlineNote ||
      ("share of the measured surface covered — higher is better. " +
       "What exactly was measured is stated in the method line below, not implied here.");
    h.appendChild(sub);
    left.appendChild(h);

    var stats = el("ul", "compat-stats");
    (section.stats || []).forEach(function (s) {
      var li = el("li");
      li.appendChild(el("span", "num", s.value != null ? String(s.value) : "—"));
      li.appendChild(el("span", "lbl", s.label || ""));
      stats.appendChild(li);
    });
    if (stats.children.length) left.appendChild(stats);

    body.appendChild(left);

    var right = el("div");
    var bars = el("div", "compat-bars");
    rows.forEach(function (r) {
      keys.forEach(function (k) {
        var c = cell(r[k]);

        var wrap = el("div");
        var lab = el("div", "cbar-label");
        lab.appendChild(el("span", "", nameFor(data, k) + " · " + (r.case || "")));
        lab.appendChild(el("span", "val",
          c.value == null ? naText(c.status) : fmt(c.value) + (section.unit || "")));
        wrap.appendChild(lab);

        var outer = el("div", "cbar-outer");
        if (c.value == null) {
          // a missing baseline is drawn as missing, never as an empty bar
          outer.appendChild(el("div", "bar-na"));
        } else {
          var bar = el("div", "cbar" + (k === "rustnode" ? "" : " is-secondary"));
          bar.style.width = Math.max(0, Math.min(100, c.value)) + "%";
          bar.setAttribute("aria-hidden", "true");
          outer.appendChild(bar);
        }
        wrap.appendChild(outer);
        bars.appendChild(wrap);
      });
    });
    right.appendChild(bars);
    body.appendChild(right);

    return body;
  }

  /* ---------- the calibration control ---------- */

  function buildCalibration(data) {
    var cal = data && data.calibration ? data.calibration.null_control_js_loop : null;
    if (!cal) return null;

    var card = el("article", "card");
    card.id = "card-calibration";
    var head = el("div", "card-head");
    head.appendChild(el("h3", "card-title", "The control: a pure-JavaScript loop"));
    head.appendChild(el("span", "card-unit", "not a benchmark"));
    card.appendChild(head);

    var note = el("div", "verdict is-neutral");
    note.appendChild(el("span", "verdict-icon", "·"));
    var b = el("span", "verdict-body");
    b.textContent = "This workload should measure identical on any runtime that runs the same " +
      "JavaScript on the same engine. If it does not, the difference is the engine, and it " +
      "tells you how much to discount every other JavaScript-bound row on this page.";
    note.appendChild(b);
    card.appendChild(note);

    var chart = el("div", "chart");
    ["node", "rustnode", "bun"].forEach(function (k) {
      var c = cell(cal[k]);
      var row = el("div", "row is-" + SLUG[k]);
      row.appendChild(el("span", "row-name", nameFor(data, k)));
      var track = el("div", "row-track");
      var outer = el("div", "bar-outer");
      if (c.value == null) {
        outer.appendChild(el("div", "bar-na"));
      } else {
        var bar = el("div", "bar");
        var max = Math.max(cell(cal.node).value || 0, cell(cal.rustnode).value || 0, cell(cal.bun).value || 0);
        var pct = max > 0 ? (c.value / max) * 100 : 0;
        if (c.value > 0 && pct < 1.5) pct = 1.5;
        bar.style.width = pct.toFixed(2) + "%";
        bar.setAttribute("aria-hidden", "true");
        outer.appendChild(bar);
      }
      track.appendChild(outer);
      var val = el("span", "row-value");
      if (c.value == null) {
        val.classList.add("is-na");
        val.textContent = naText(c.status);
      } else {
        val.textContent = fmt(c.value) + " ms";
      }
      track.appendChild(val);
      row.appendChild(track);
      chart.appendChild(row);
    });
    card.appendChild(chart);

    var m = el("p", "method");
    var segs = [
      "20M integer adds in a loop · timed inside the process",
      data.host && data.host.cpu ? data.host.cpu : "hardware not recorded",
      isNum(cal.n) ? "medians of " + cal.n : "sample size not recorded"
    ];
    if (cal.note) segs.push(cal.note);
    segs.forEach(function (s, i) {
      if (i) m.appendChild(el("span", "dot", "·"));
      m.appendChild(el("span", "", s));
    });
    card.appendChild(m);

    return card;
  }

  /* ---------- empty state ---------- */

  function isEmpty(data) {
    if (!data) return true;
    if (data.status === "not-generated") return true;
    return !Array.isArray(data.sections) || data.sections.length === 0;
  }

  function renderEmpty(mount, data) {
    mount.innerHTML = "";

    var banner = document.getElementById("data-banner");
    if (banner) {
      banner.hidden = false;
      banner.innerHTML = "";
      var strong = el("strong", "", "The three-way dataset has not been generated yet.");
      banner.appendChild(strong);
      banner.appendChild(document.createTextNode(
        " This page is fully built and reads " 
      ));
      var c1 = el("code", "", "data/benchmark.json");
      banner.appendChild(c1);
      banner.appendChild(document.createTextNode(
        " at load time, but that file is still a placeholder with no measurements in it. " +
        "Drop the real dataset in at that exact path and every card below fills in — no markup " +
        "changes are needed. No numbers are shown here rather than showing any that were not measured."
      ));
    }

    var note = el("div", "notice");
    note.appendChild(el("p", "", "Waiting on data/benchmark.json."));
    var p2 = el("p", "", "When the file arrives, these five cards render from it in this order: " +
      ORDER.map(function (id) {
        return id;
      }).join(", ") + ".");
    note.appendChild(p2);
    mount.appendChild(note);

    // Show the five card shells, each honestly empty.
    ORDER.forEach(function (id) {
      var card = el("article", id === "compatibility" ? "card card-compat" : "card");
      card.id = "card-" + id;
      card.setAttribute("data-state", "empty");
      var head = el("div", "card-head");
      head.appendChild(el("h3", "card-title", titleFor(id)));
      card.appendChild(head);

      var v = el("div", "verdict is-neutral");
      v.appendChild(el("span", "verdict-icon", "·"));
      v.appendChild(el("span", "verdict-body", "No measurement for this section yet."));
      card.appendChild(v);

      var chart = el("div", "chart");
      ["node", "rustnode", "bun"].forEach(function (k) {
        var row = el("div", "row is-" + SLUG[k]);
        row.appendChild(el("span", "row-name", LABEL[k]));
        var track = el("div", "row-track");
        var outer = el("div", "bar-outer");
        outer.appendChild(el("div", "bar-na"));
        track.appendChild(outer);
        var val = el("span", "row-value is-na", "not measured");
        track.appendChild(val);
        row.appendChild(track);
        chart.appendChild(row);
      });
      card.appendChild(chart);

      var m = el("p", "method", "method line renders here: workload · how it was measured · hardware · medians of N");
      card.appendChild(m);
      mount.appendChild(card);
    });

    var foot = document.getElementById("foot-generated");
    if (foot) foot.textContent = "dataset: not generated";
  }

  function titleFor(id) {
    if (id === "startup") return "Process startup";
    if (id === "memory") return "Peak memory";
    if (id === "native-call") return "Native call overhead";
    if (id === "http") return "HTTP throughput";
    if (id === "compatibility") return "Compatibility coverage";
    return id;
  }

  /* ---------- order ---------- */

  /*
   * The five cards are fixed by the page, not by the dataset. A section the
   * dataset does not contain is still rendered, with an explicit empty state,
   * so a missing measurement can never look like an omitted one.
   */
  function ordered(sections) {
    var byId = {};
    (sections || []).forEach(function (s) {
      if (s && s.id) byId[s.id] = s;
    });

    var out = ORDER.map(function (id) {
      return { id: id, section: byId[id] || null };
    });

    (sections || []).forEach(function (s) {
      if (s && ORDER.indexOf(s.id) === -1) out.push({ id: s.id, section: s });
    });

    return out;
  }

  function buildStubCard(id, data) {
    var compat = id === "compatibility";
    var card = el("article", compat ? "card card-compat" : "card");
    card.id = "card-" + id;
    card.setAttribute("data-state", "absent");

    var head = el("div", "card-head");
    head.appendChild(el("h3", "card-title", titleFor(id)));
    card.appendChild(head);

    var v = el("div", "verdict is-neutral");
    v.appendChild(el("span", "verdict-icon", "·"));
    v.appendChild(el("span", "verdict-body",
      "This dataset contains no section for this measurement. It is shown empty " +
      "rather than omitted, so the absence is visible."));
    card.appendChild(v);

    var chart = el("div", "chart");
    ["node", "rustnode", "bun"].forEach(function (k) {
      var row = el("div", "row is-" + SLUG[k]);
      row.appendChild(el("span", "row-name", nameFor(data, k)));
      var track = el("div", "row-track");
      var outer = el("div", "bar-outer");
      outer.appendChild(el("div", "bar-na"));
      track.appendChild(outer);
      track.appendChild(el("span", "row-value is-na", "not measured"));
      row.appendChild(track);
      chart.appendChild(row);
    });
    card.appendChild(chart);

    var m = el("p", "method");
    m.textContent = "no method line: this measurement is not present in data/benchmark.json";
    card.appendChild(m);

    return card;
  }

  /* ---------- render ---------- */

  function render(data) {
    var mount = document.getElementById("bench-cards");
    if (!mount) return;

    if (isEmpty(data)) {
      renderEmpty(mount, data);
      return;
    }

    mount.innerHTML = "";

    ordered(data.sections).forEach(function (entry, i) {
      if (entry.section) {
        mount.appendChild(buildCard(entry.section, data, i));
      } else {
        mount.appendChild(buildStubCard(entry.id, data));
      }
    });

    var cal = buildCalibration(data);
    if (cal) mount.appendChild(cal);

    var foot = document.getElementById("foot-generated");
    if (foot) {
      var bits = [];
      if (data.generated) bits.push("dataset " + data.generated);
      if (data.host && data.host.cpu) bits.push(data.host.cpu);
      foot.textContent = bits.length ? bits.join(" · ") : "dataset loaded";
    }

    var banner = document.getElementById("data-banner");
    if (banner) banner.hidden = true;
  }

  function fail(err) {
    var mount = document.getElementById("bench-cards");
    if (!mount) return;
    mount.innerHTML = "";
    var banner = document.getElementById("data-banner");
    if (banner) {
      banner.hidden = false;
      banner.innerHTML = "";
      banner.appendChild(el("strong", "", "data/benchmark.json could not be loaded."));
      banner.appendChild(document.createTextNode(
        " The page expects that file next to index.html. Error: " + (err && err.message ? err.message : String(err))
      ));
    }
    var note = el("div", "notice");
    note.appendChild(el("p", "", "No benchmark cards can be rendered without the dataset."));
    mount.appendChild(note);
    var foot = document.getElementById("foot-generated");
    if (foot) foot.textContent = "dataset: unavailable";
  }

  function load() {
    if (typeof fetch !== "function") {
      fail(new Error("this browser has no fetch()"));
      return;
    }
    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + DATA_URL);
        return res.json();
      })
      .then(render)
      .catch(fail);
  }

  /* ---------- copy buttons ---------- */

  function initCopy() {
    var buttons = document.querySelectorAll(".copy");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-copy-target"));
        if (!target) return;
        var text = target.innerText.replace(/^\$\s?/gm, "");
        var done = function (ok) {
          btn.textContent = ok ? "copied" : "select & copy";
          btn.setAttribute("data-state", ok ? "ok" : "");
          setTimeout(function () {
            btn.textContent = "copy";
            btn.removeAttribute("data-state");
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        } else {
          done(false);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initCopy();
      load();
    });
  } else {
    initCopy();
    load();
  }
})();
