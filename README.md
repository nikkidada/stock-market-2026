# 2026 · A股 vs 美股 年度观察

一个基于真实行情 API 数据构建的**动态可视化网页**：展示 2026 年至今 A股 / 美股大盘指数走势，以及两市市值前十公司的市值逐月变迁（动态 Bar Race 排行榜）。

## 🌐 在线访问

👉 GitHub Pages 公开地址（部署完成后生效）：`https://<你的用户名>.github.io/<仓库名>/`

## ✨ 页面功能

| 模块 | 说明 |
| --- | --- |
| 市场概览 | 7 大指数实时卡片（数字滚动动画），点击卡片切换走势图 |
| 大盘走势 | A股四大指数 / 美股三大指数 / 两市全览，年初=100 归一化对比，Tooltip 含收盘点位与涨跌幅 |
| 动态排行榜 | **Bar Race 逐月市值演化动画**（1月 → 8月），支持播放/暂停/拖拽进度/调速 |
| 市值表格 | 前十公司当前市值、年初市值、年内变动额、变动幅度、排名升降、新上市公司标识 |

## 🗂 项目结构

```
├── index.html          # 页面骨架
├── style.css           # 样式（深色主题、动效）
├── app.js              # 前端逻辑（ECharts 图表、Bar Race、数字滚动）
├── data.js             # 行情数据（由脚本自动生成）
├── data.json           # 原始数据（由脚本自动生成）
├── fetch_data.py       # 数据采集脚本（纯 Python 标准库，无第三方依赖）
├── .github/workflows/refresh-data.yml  # 每日自动更新数据的工作流
└── README.md
```

## 🔌 数据来源（基于 API）

| 数据 | 接口 |
| --- | --- |
| A股/美股 市值前十、K线、总股本 | 东方财富行情 API（`push2.eastmoney.com` / `push2his.eastmoney.com`） |
| 美股指数 K线（标普500/纳指/道指） | 腾讯行情 API（`web.ifzq.gtimg.cn`） |

**口径**：年初市值 = 总股本 × 2025-12-31 收盘价；当前市值 = 最新总市值；2026 年新上市公司（如 SpaceX、SK海力士）无年初市值，按上市首月起始展示。

## ⚙️ 本地运行 / 重新拉取数据

```bash
# 1. 拉取最新行情数据（生成 data.json 与 data.js）
python fetch_data.py

# 2. 本地预览（任选一种静态服务器）
python -m http.server 8000
# 或
npx serve .
# 浏览器打开 http://localhost:8000
```

> 需要能访问 `push2.eastmoney.com`、`web.ifzq.gtimg.cn` 的网络环境。

## 🤖 每日自动更新

`.github/workflows/refresh-data.yml` 每天自动执行 `fetch_data.py`，若数据有变化则提交并推送，GitHub Pages 自动重新发布 —— 无需任何手动操作。

## ⚠️ 免责声明

本页面数据仅供学习研究，不构成任何投资建议。市场有风险，投资需谨慎。
