/* 2026 A股 vs 美股 年度观察 —— 前端逻辑 */
(function () {
  "use strict";

  var DATA = window.MARKET_DATA;
  if (!DATA) {
    document.getElementById("dataMeta").textContent = "数据加载失败";
    return;
  }

  /* ---------------- 工具 ---------------- */
  // A股: 红涨绿跌(涨=up=红)  美股: 绿涨红跌(涨=up=绿) —— 通过 CSS [data-market] 切换
  var US_NAMES = ["标普500", "纳斯达克", "道琼斯"];

  function fmtCap(v, cur) {
    if (v == null) return "—";
    var s = v >= 1e12 ? (v / 1e12).toFixed(2) + "万亿"
          : v >= 1e8 ? (v / 1e8).toFixed(1) + "亿"
          : (v / 1e4).toFixed(0) + "万";
    return (cur || "") + s;
  }
  function fmtPct(p) {
    if (p == null) return "—";
    return (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
  }
  function isUsName(n) { return US_NAMES.indexOf(n) >= 0; }

  function animateValue(el, to, dur, fmt) {
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min((ts - t0) / (dur || 900), 1);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt ? fmt(to * e) : Math.round(to * e).toLocaleString();
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------------- 概览卡片 ---------------- */
  var PALETTE = ["#4da3ff", "#7b61ff", "#2ee6a8", "#ffb454", "#ff5d5d",
                 "#ff7eb6", "#35d0ba", "#f5a623", "#5cd6ff", "#c39bff"];

  var cardBox = document.getElementById("overviewCards");
  var cardsHtml = "";
  DATA.indices.cn.forEach(function (ix) {
    var cls = ix.ytd >= 0 ? "up" : "down";
    cardsHtml += '<div class="card" data-group="cn" data-market="cn">' +
      '<div class="c-name"><span>' + ix.name + '</span><span class="dot" style="background:#e64545"></span></div>' +
      '<div class="c-value">' + ix.last.toFixed(2) + '</div>' +
      '<div class="c-ytd ' + cls + '">' + fmtPct(ix.ytd * 100) + ' <small style="color:var(--muted)">较年初</small></div></div>';
  });
  DATA.indices.us.forEach(function (ix) {
    var cls = ix.ytd >= 0 ? "up" : "down";
    cardsHtml += '<div class="card" data-group="us" data-market="us">' +
      '<div class="c-name"><span>' + ix.name + '</span><span class="dot" style="background:#7b61ff"></span></div>' +
      '<div class="c-value">' + ix.last.toFixed(2) + '</div>' +
      '<div class="c-ytd ' + cls + '">' + fmtPct(ix.ytd * 100) + ' <small style="color:var(--muted)">较年初</small></div></div>';
  });
  cardBox.innerHTML = cardsHtml;
  // 数字滚动
  var cards = cardBox.querySelectorAll(".card");
  Array.prototype.forEach.call(cards, function (c, i) {
    var cardVal = c.querySelector(".c-value");
    var target = parseFloat(cardVal.textContent);
    setTimeout(function () {
      animateValue(cardVal, target, 1000, function (v) { return v.toFixed(2); });
    }, 150 + i * 90);
  });

  // 卡片点击 → 切换对应指数分组
  Array.prototype.forEach.call(cards, function (c) {
    c.addEventListener("click", function () {
      document.querySelectorAll("#indexTabs .tab").forEach(function (t) {
        t.classList.toggle("active", t.dataset.group === c.dataset.group);
      });
      renderIndexChart(c.dataset.group);
    });
  });

  /* ---------------- 指数走势图 ---------------- */
  var indexChart = echarts.init(document.getElementById("indexChart"));
  var indexLegend = document.getElementById("indexLegend");

  var LINE_COLORS = {
    "上证指数": "#e64545", "深证成指": "#f5a623", "创业板指": "#7b61ff", "沪深300": "#2ee6a8",
    "标普500": "#4da3ff", "纳斯达克": "#c39bff", "道琼斯": "#ffb454"
  };

  function buildSeries(group) {
    var list = group === "cn" ? DATA.indices.cn
             : group === "us" ? DATA.indices.us
             : DATA.indices.cn.concat(DATA.indices.us);
    var dates = [];
    list.forEach(function (ix) {
      ix.series.forEach(function (p) { if (dates.indexOf(p.d) < 0) dates.push(p.d); });
    });
    dates.sort();
    var series = list.map(function (ix) {
      var map = {};
      ix.series.forEach(function (p) { map[p.d] = p.v; });
      var data = dates.map(function (d) {
        var raw = map[d];
        return raw == null ? null : { value: +(raw / ix.base * 100).toFixed(3), raw: raw, base: ix.base };
      });
      return { name: ix.name, type: "line", smooth: true, symbol: "none",
               data: data, lineStyle: { width: 2.2, color: LINE_COLORS[ix.name] },
               itemStyle: { color: LINE_COLORS[ix.name] }, connectNulls: false,
               emphasis: { focus: "series" }, animationDuration: 900 };
    });
    return { dates: dates, series: series };
  }

  function renderIndexChart(group) {
    var built = buildSeries(group);
    var dates = built.dates;
    indexChart.setOption({
      animationDuration: 900,
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15,21,38,.92)", borderColor: "rgba(255,255,255,.12)",
        textStyle: { color: "#e8ecf6", fontSize: 12 },
        formatter: function (params) {
          var head = "<b>" + params[0].axisValue + "</b><br/>";
          return head + params.map(function (p) {
            if (p.data == null) return p.marker + p.seriesName + "：休市";
            var chg = (p.data.raw / p.data.base - 1) * 100;
            var us = isUsName(p.seriesName);
            var col = us ? (chg >= 0 ? "#2ee6a8" : "#ff5d5d") : (chg >= 0 ? "#ff5d5d" : "#2ee6a8");
            return p.marker + p.seriesName + "：" + p.data.raw.toFixed(2) +
              "　<span style='color:" + col + "'>" + fmtPct(chg) + "</span>";
          }).join("<br/>");
        }
      },
      grid: { left: 54, right: 26, top: 30, bottom: 44 },
      xAxis: {
        type: "category", data: dates,
        boundaryGap: false, axisLine: { lineStyle: { color: "rgba(255,255,255,.15)" } },
        axisLabel: { color: "#8b93a7", fontSize: 11, hideOverlap: true },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value", name: "较年初 %", nameTextStyle: { color: "#8b93a7" },
        axisLabel: { color: "#8b93a7", fontSize: 11, formatter: "{value}%" },
        splitLine: { lineStyle: { color: "rgba(255,255,255,.06)" } }
      },
      legend: { show: false },
      series: built.series
    }, true);
    indexLegend.innerHTML = built.series.map(function (s) {
      return "<span><i style='background:" + LINE_COLORS[s.name] + "'></i>" + s.name + "</span>";
    }).join("");
  }
  renderIndexChart("cn");

  document.querySelectorAll("#indexTabs .tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll("#indexTabs .tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      renderIndexChart(t.dataset.group);
    });
  });

  /* ---------------- 市值前十: 动态 Bar Race ---------------- */
  var raceChart = echarts.init(document.getElementById("raceChart"));
  var raceMonthEl = document.getElementById("raceMonth");
  var raceNote = document.getElementById("raceNote");
  var slider = document.getElementById("raceSlider");
  var playBtn = document.getElementById("racePlay");
  var speedSel = document.getElementById("raceSpeed");

  var market = "cn";
  var companies = [];
  var months = [];
  var frame = 0;
  var playing = false;
  var timer = null;
  var colorOf = {};

  function loadMarket(m) {
    market = m;
    companies = DATA.top10[m].slice().sort(function (a, b) { return (b.mcap_now || 0) - (a.mcap_now || 0); });
    companies.forEach(function (c, i) { colorOf[c.name] = PALETTE[i % PALETTE.length]; });
    var s = new Set();
    companies.forEach(function (c) { c.series.forEach(function (p) { s.add(p.m); }); });
    months = Array.from(s).sort();
    frame = 0;
    slider.max = months.length - 1;
    slider.value = 0;
    raceMonthEl.textContent = months[0];
    raceNote.textContent = "逐月市值演化（月末收盘 · 总市值 = 总股本 × 收盘价）· " +
      (m === "cn" ? "A股红涨绿跌" : "美股绿涨红跌");
    stopPlay();
    renderRaceFrame();
  }

  function frameEntries() {
    var m = months[frame];
    return companies
      .map(function (c) {
        var v = null;
        c.series.forEach(function (x) { if (x.m === m) v = x.v; });
        return { name: c.name, code: c.code, v: v };
      })
      .filter(function (x) { return x.v != null; })
      .sort(function (a, b) { return b.v - a.v; })
      .slice(0, 10);
  }

  function renderRaceFrame() {
    var m = months[frame];
    var entries = frameEntries();
    var maxV = entries.length ? entries[0].v : 1;
    var names = entries.map(function (e) { return e.name; });
    raceMonthEl.textContent = m;
    slider.value = frame;
    raceChart.setOption({
      animationDurationUpdate: 550,
      animationEasingUpdate: "linear",
      grid: { left: 132, right: 118, top: 26, bottom: 26 },
      graphic: [{
        type: "text", left: "center", top: "middle", silent: true, z: 1,
        style: { text: m, font: "bold 92px 'PingFang SC','Microsoft YaHei',sans-serif",
                 fill: "rgba(255,255,255,.05)", textAlign: "center" }
      }],
      xAxis: {
        type: "value", max: maxV * 1.2,
        axisLabel: { show: false }, splitLine: { show: false },
        axisLine: { show: false }, axisTick: { show: false }
      },
      yAxis: {
        type: "category", data: names,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: "#e8ecf6", fontSize: 13, fontWeight: 600, width: 120, overflow: "truncate" }
      },
      series: [{
        type: "bar", data: entries.map(function (e) { return e.v; }),
        barWidth: "58%",
        label: {
          show: true, position: "right", color: "#e8ecf6", fontSize: 12.5,
          formatter: function (p) { return fmtCap(p.value, market === "cn" ? "¥" : "$"); }
        },
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: function (p) { return colorOf[names[p.dataIndex]] || "#4da3ff"; }
        }
      }]
    }, true);
  }

  function startPlay() {
    if (playing) return;
    playing = true;
    playBtn.textContent = "⏸";
    timer = setInterval(function () {
      frame = frame >= months.length - 1 ? 0 : frame + 1;
      renderRaceFrame();
    }, +speedSel.value);
  }
  function stopPlay() {
    playing = false;
    playBtn.textContent = "▶";
    if (timer) { clearInterval(timer); timer = null; }
  }
  playBtn.addEventListener("click", function () { playing ? stopPlay() : startPlay(); });
  slider.addEventListener("input", function () {
    frame = +slider.value;
    renderRaceFrame();
  });
  speedSel.addEventListener("change", function () {
    if (playing) { stopPlay(); startPlay(); }
  });

  document.querySelectorAll("#marketTabs .tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll("#marketTabs .tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      loadMarket(t.dataset.market);
      renderTable(t.dataset.market);
    });
  });

  /* ---------------- 市值前十表格 ---------------- */
  var tbody = document.querySelector("#rankTable tbody");
  var tableWrap = document.querySelector(".table-wrap");

  function renderTable(m) {
    tableWrap.setAttribute("data-market", m);
    var rows = DATA.top10[m].slice().sort(function (a, b) { return a.rank - b.rank; });
    var startRank = {};
    rows.filter(function (c) { return c.mcap_start != null; })
      .slice().sort(function (a, b) { return b.mcap_start - a.mcap_start; })
      .forEach(function (c, i) { startRank[c.code] = i + 1; });

    tbody.innerHTML = rows.map(function (c) {
      var move = "";
      if (startRank[c.code] != null) {
        var d = c.rank - startRank[c.code];
        move = d < 0 ? "<span class='rank-move rank-up'>▲" + (-d) + "</span>"
             : d > 0 ? "<span class='rank-move rank-down'>▼" + d + "</span>"
             : "<span class='rank-move rank-same'>—</span>";
      }
      var badge = c.listed_2026 ? " <span class='badge'>2026年新上市</span>" : "";
      var cur = m === "cn" ? "¥" : "$";
      var clsUp = c.change > 0 ? "up" : "down";
      return "<tr>" +
        "<td class='rank-num'>" + c.rank + move + "</td>" +
        "<td><span class='stock-name'>" + c.name + "</span>" + badge + "</td>" +
        "<td class='stock-code'>" + c.code + "</td>" +
        "<td><b>" + fmtCap(c.mcap_now, cur) + "</b></td>" +
        "<td>" + (c.mcap_start != null ? fmtCap(c.mcap_start, cur) : "—") + "</td>" +
        "<td class='" + clsUp + "'>" + (c.change != null ? (c.change > 0 ? "+" : "") + fmtCap(c.change, cur) : "—") + "</td>" +
        "<td class='" + clsUp + "'><b>" + fmtPct(c.change_pct) + "</b></td>" +
        "</tr>";
    }).join("");
  }

  /* ---------------- 初始化 ---------------- */
  loadMarket("cn");
  renderTable("cn");

  document.getElementById("dataMeta").textContent =
    "数据截至 " + DATA.meta.as_of + " · 来源: " + DATA.meta.source +
    " · 生成于 " + DATA.meta.generated;

  // 滚动到 Bar Race 可视后自动播放一次
  var raceEl = document.getElementById("raceChart");
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting && !playing && frame === 0) startPlay();
    });
  }, { threshold: 0.3 });
  if ("IntersectionObserver" in window) observer.observe(raceEl);

  window.addEventListener("resize", function () {
    indexChart.resize();
    raceChart.resize();
  });
})();
