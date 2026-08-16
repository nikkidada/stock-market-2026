# -*- coding: utf-8 -*-
"""
2026年 A股 & 美股 市场数据采集脚本
数据源 (纯 Python 标准库, 无第三方依赖):
  - 腾讯行情API (qt.gtimg.cn): 实时行情 (价格/总市值), 支持批量
  - 腾讯K线API   (web.ifzq.gtimg.cn): A股/美股个股与A股指数日K线
  - Yahoo Finance (query1.finance.yahoo.com): 美股指数日K线
  - 东方财富行情API (可选增强): 个股总股本/总市值精确值; 不可用时自动回退

用法: python fetch_data.py
输出: data.json (原始数据) 与 data.js (嵌入网页的 window.MARKET_DATA)
"""
import urllib.request
import urllib.parse
import json
import datetime
import time
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
EM_HEADERS = dict(UA)
EM_HEADERS['Referer'] = 'https://quote.eastmoney.com/'

YEAR = 2026
BASE_DATE = f"{YEAR-1}-12-31"          # 年初基准: 前一年最后一个交易日
TODAY = datetime.date.today().isoformat()

_last_req = 0.0


def http_get(url, timeout=30, retries=4, headers=None):
    """带重试与退避的请求, 减少被服务端限流断连的概率"""
    global _last_req
    headers = headers or UA
    last_err = None
    for attempt in range(retries):
        try:
            wait = _last_req + 0.4 - time.time()
            if wait > 0:
                time.sleep(wait)
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                _last_req = time.time()
                return r.read()
        except Exception as e:
            last_err = e
            time.sleep(0.8 * (attempt + 1))
    raise last_err


# ---------------- 腾讯行情 ----------------

def tx_quotes(codes):
    """腾讯实时行情(批量). codes: ['sh601398','usNVDA',...]
    返回 {code: {name, price, mcap_yi(仅A股有), ok}}"""
    u = "https://qt.gtimg.cn/q=" + ",".join(codes)
    raw = http_get(u)
    text = None
    for enc in ("gbk", "utf-8"):
        try:
            text = raw.decode(enc)
            break
        except Exception:
            continue
    out = {}
    for line in (text or "").strip().split(";"):
        line = line.strip()
        if "=" not in line:
            continue
        key, val = line.split("=", 1)
        code = key.replace("v_", "")
        f = val.strip('"').split("~")
        if len(f) < 4:
            out[code] = {"ok": False}
            continue
        item = {"ok": True, "name": f[1], "price": _to_float(f[3])}
        if len(f) > 45:
            item["mcap_yi"] = _to_float(f[45])   # A股: 总市值(亿元)
        out[code] = item
    return out


def _to_float(s):
    try:
        return float(s)
    except Exception:
        return None


def tx_kline(code, beg="2025-12-30", end=None):
    """腾讯日K线, 返回 [{date, open, close, high, low}] (不复权)"""
    end = end or TODAY
    u = (f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
         f"param={code},day,{beg},{end},400,qfq")
    j = json.loads(http_get(u).decode("utf-8"))
    node = (j.get("data") or {}).get(code) or {}
    days = node.get("day") or node.get("qfqday") or []
    rows = []
    for d in days:
        if len(d) >= 3:
            rows.append({"date": d[0], "open": float(d[1]), "close": float(d[2]),
                         "high": float(d[3]) if len(d) > 3 else None,
                         "low": float(d[4]) if len(d) > 4 else None})
    return rows


# ---------------- Yahoo Finance (美股指数) ----------------

def yahoo_kline(symbol):
    """Yahoo Finance 日K线, 返回 [{date, close}]"""
    u = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}"
         f"?range=1y&interval=1d")
    j = json.loads(http_get(u).decode("utf-8"))
    res = j["chart"]["result"][0]
    rows = []
    for t, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]):
        if c is None:
            continue
        d = datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%d")
        rows.append({"date": d, "close": float(c)})
    return rows


# ---------------- 东方财富 (可选增强) ----------------

PUSH2_HOSTS = ["push2.eastmoney.com", "82.push2.eastmoney.com",
               "83.push2.eastmoney.com", "92.push2.eastmoney.com"]

_EM_FAILS = 0
EM_MAX_FAILS = 2   # 连续失败熔断: 之后本运行不再请求东财


def em_stock_get(secid):
    """东方财富个股详情: 总股本(f84) 总市值(f116). 失败抛异常"""
    global _EM_FAILS
    if _EM_FAILS >= EM_MAX_FAILS:
        raise RuntimeError("EM circuit-breaker open")
    last_err = None
    for host in PUSH2_HOSTS:
        u = (f"https://{host}/api/qt/stock/get?secid={secid}"
             f"&fields=f43,f57,f58,f84,f116,f117")
        for _ in range(2):
            try:
                j = json.loads(http_get(u, headers=EM_HEADERS, retries=2).decode("utf-8"))["data"]
                if j and j.get("f116"):
                    _EM_FAILS = 0
                    return {"shares": j.get("f84"), "mcap": j.get("f116")}
                last_err = RuntimeError("empty stock/get")
            except Exception as e:
                last_err = e
                time.sleep(0.8)
    _EM_FAILS += 1
    raise last_err


# ---------------- 市值前十候选股 ----------------

# A股候选 (沪深主板/科创板/创业板大市值)
CN_CANDIDATES = ["sh688825", "sh601398", "sh601939", "sh601288", "sh600941",
                 "sh601857", "sh601988", "sz300750", "sh600519", "sh600938",
                 "sh601628", "sh600036", "sh601318", "sz002594", "sh688981",
                 "sh601088", "sh601728", "sh601899", "sz000858", "sz000333",
                 "sh601328", "sh601658", "sh600028", "sz000651"]

# 美股候选 + 总股本(股) 回退表 (2026-08-14 由东财数据核对; 股本短期稳定)
US_SHARES = {
    "NVDA": 24.2e9, "AAPL": 14.5943e9, "GOOGL": 12.2303e9, "GOOG": 12.2298e9,
    "MSFT": 7.4255e9, "AMZN": 10.7866e9, "AVGO": 4.7576e9, "SPCX": 13.1818e9,
    "META": 2.5475e9, "TSLA": 3.9495e9, "SKHY": 7.2887e9, "MU": 1.1294e9,
}
US_CANDIDATES = ["NVDA", "AAPL", "GOOGL", "GOOG", "MSFT", "AMZN", "AVGO",
                 "SPCX", "META", "TSLA", "SKHY", "MU"]
US_NAMES = {"NVDA": "英伟达", "AAPL": "苹果", "GOOGL": "Alphabet(谷歌)", "GOOG": "Alphabet(谷歌)",
            "MSFT": "微软", "AMZN": "亚马逊", "AVGO": "博通", "SPCX": "SpaceX",
            "META": "Meta", "TSLA": "特斯拉", "SKHY": "SK海力士", "MU": "美光科技"}
US_KL_SUFFIXES = {"SPCX": [".OQ", ".N"], "SKHY": [".OQ", ".N"]}   # 上市时间短, 双后缀探测


# ---------------- 组装 ----------------

def monthly_snapshot(rows):
    """日K线 → 月末收盘快照 {month: close}"""
    out = {}
    for r in rows:
        out[r["date"][:7]] = r["close"]
    return out


def build_index(name, source, symbol):
    rows = yahoo_kline(symbol) if source == "yahoo" else tx_kline(symbol)
    base = None
    series = []
    for r in rows:
        if r["date"] <= BASE_DATE:
            base = r["close"]
        elif r["date"] >= f"{YEAR}-01-01":
            series.append({"d": r["date"], "v": r["close"]})
    if not base or not series:
        return None
    last = series[-1]["v"]
    return {"name": name, "base": base, "last": last,
            "ytd": round(last / base - 1, 6), "series": series}


def get_stock_kline(code, market):
    """取个股日K线(腾讯优先, 美股多后缀探测)"""
    if market == "us":
        suffixes = US_KL_SUFFIXES.get(code, [".OQ", ".N"])
        for sfx in suffixes:
            try:
                rows = tx_kline("us" + code + sfx)
                if rows:
                    return rows
            except Exception:
                continue
        return []
    return tx_kline(("sh" if code[0] in "695" else "sz") + code)


def build_company(code, name, price, mcap_now, shares, market):
    kline = get_stock_kline(code, market)
    ms = monthly_snapshot(kline)
    series = []
    for m in sorted(ms.keys()):
        if m >= f"{YEAR}-01" and ms[m] is not None:
            series.append({"m": m, "v": round(shares * ms[m], 0)})

    start_close = None
    for r in kline:
        if r["date"] <= BASE_DATE:
            start_close = r["close"]
    mcap_start = round(shares * start_close, 0) if start_close else None

    return {
        "code": code, "name": name, "price": price,
        "mcap_now": mcap_now, "mcap_start": mcap_start,
        "change": (mcap_now - mcap_start) if mcap_start else None,
        "change_pct": round((mcap_now / mcap_start - 1) * 100, 2) if mcap_start else None,
        "series": series,
        "listed_2026": mcap_start is None,
    }


def main():
    result = {"meta": {}, "indices": {"cn": [], "us": []}, "top10": {"cn": [], "us": []}}

    # ---- 指数 ----
    for name, src, sym in [("上证指数", "tx", "sh000001"),
                           ("深证成指", "tx", "sz399001"),
                           ("创业板指", "tx", "sz399006"),
                           ("沪深300", "tx", "sh000300")]:
        r = build_index(name, src, sym)
        if r:
            result["indices"]["cn"].append(r)
            print(f"[CN-IDX] {name}: base={r['base']:.2f} last={r['last']:.2f} ytd={r['ytd']*100:.2f}%")
    for name, src, sym in [("标普500", "yahoo", "^GSPC"),
                           ("纳斯达克", "yahoo", "^IXIC"),
                           ("道琼斯", "yahoo", "^DJI")]:
        r = build_index(name, src, sym)
        if r:
            result["indices"]["us"].append(r)
            print(f"[US-IDX] {name}: base={r['base']:.2f} last={r['last']:.2f} ytd={r['ytd']*100:.2f}%")

    # ---- A股市值前十 (腾讯行情排序) ----
    q = tx_quotes(CN_CANDIDATES)
    cn_items = []
    for c in CN_CANDIDATES:
        it = q.get(c) or {}
        if it.get("ok") and it.get("mcap_yi") and it.get("price"):
            cn_items.append({"code": c[2:], "name": it["name"], "price": it["price"],
                             "mcap_yi": it["mcap_yi"]})
    cn_items.sort(key=lambda x: x["mcap_yi"], reverse=True)
    for i, it in enumerate(cn_items[:10], 1):
        mcap = it["mcap_yi"] * 1e8
        shares = mcap / it["price"]
        c = build_company(it["code"], it["name"], it["price"], mcap, shares, "cn")
        c["rank"] = i
        result["top10"]["cn"].append(c)
        print(f"[CN-TOP{i}] {c['name']} {c['code']} mcap={mcap/1e12:.3f}万亿 "
              f"start={'%.3f万亿' % (c['mcap_start']/1e12) if c['mcap_start'] else 'None'}")

    # ---- 美股市值前十 (腾讯价格 × 股本表; 东财精确值优先) ----
    us_items = []
    for t in US_CANDIDATES:
        shares = US_SHARES.get(t)
        if not shares:
            continue
        price = None
        try:
            info = em_stock_get("105." + t)
            if info.get("shares"):
                shares = info["shares"]
        except Exception:
            pass
        try:
            price = (tx_quotes(["us" + t]).get("us" + t) or {}).get("price")
        except Exception:
            price = None
        if not price:
            continue
        mcap = price * shares
        name = US_NAMES.get(t, t)
        us_items.append({"code": t, "name": name, "price": price, "mcap": mcap,
                         "shares": shares, "goog": t == "GOOG"})
    # 去重 Alphabet (GOOGL/GOOG 为同一公司, 保留市值更大者)
    goog_items = [x for x in us_items if x["code"] in ("GOOGL", "GOOG")]
    if len(goog_items) >= 2:
        keep = max(goog_items, key=lambda x: x["mcap"])
        us_items = [x for x in us_items if x["code"] not in ("GOOGL", "GOOG")] + [keep]
    us_items.sort(key=lambda x: x["mcap"], reverse=True)
    for i, it in enumerate(us_items[:10], 1):
        c = build_company(it["code"], it["name"], it["price"], it["mcap"], it["shares"], "us")
        c["rank"] = i
        result["top10"]["us"].append(c)
        print(f"[US-TOP{i}] {c['name']} {c['code']} mcap={it['mcap']/1e12:.3f}万亿美元 "
              f"start={'%.3f万亿美元' % (c['mcap_start']/1e12) if c['mcap_start'] else 'None'}")

    result["meta"] = {
        "year": YEAR,
        "generated": TODAY,
        "as_of": "2026-08-14 收盘",
        "source": "腾讯行情API / Yahoo Finance / 东方财富行情API",
    }

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    with open("data.js", "w", encoding="utf-8") as f:
        f.write("window.MARKET_DATA = " + json.dumps(result, ensure_ascii=False) + ";\n")
    print("OK -> data.json / data.js")


if __name__ == "__main__":
    main()
