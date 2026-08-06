# -*- coding: utf-8 -*-
"""Generate 06_完整讲解. Run: python gen_full_06.py"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "06_完整讲解-通俗+代码+流程图.md"


def read(fn: str) -> str:
    return (ROOT / fn).read_text(encoding="utf-8")


def between(text: str, start: str, end: str) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    j = text.find(end, i + len(start)) if end else len(text)
    return text[i:j].strip()


def demote_all_headers(text: str) -> str:
    return "\n".join("#" + line if line.startswith("#") else line for line in text.splitlines())


def fix_links(text: str) -> str:
    return re.sub(r"\[([^\]]+)\]\(\./[^)]+\.md\)", r"\1", text)


FLOW_1 = """
### 2.5 流程图（问题一）

```mermaid
flowchart TD
  A[SiteAreaMap] --> B{多边形/面积}
  B -->|多边形| C[/api/layout]
  B -->|面积| D[max_systems_for_area]
  C --> E[optimize_polygon_layout]
  E --> F[MILP HiGHS]
  F --> G[max_systems=N]
```
"""

FLOW_2 = """
### 3.6 流程图（问题二）

```mermaid
flowchart TD
  A[known-load] --> B[/api/optimize]
  B --> C[for sets 1..N]
  C --> D[③ PyPSA or quick]
  D --> E[排序→calculate]
```
"""

FLOW_3 = """
### 4.6 流程图（问题三）

```mermaid
flowchart TD
  A[固定容量] --> B[8760h曲线]
  B --> C[PyPSA LP]
  C --> D[年油耗/失负荷]
```
"""

CHAIN = """
---

## 5. 三问题串联

见下文完整例子与 §01 双路径。求解器：①若干MILP + ②③≤10次PyPSA + 精算1次。
"""

SECTION_9_EXTRA = """
### 9.1 四问题速查（补充）

链条：①→②→③（售前）；投运后④。

### 9.2 双路径速查

known-load: optimize→calculate · DIY: calculate only
"""

SECTION_7 = """
---

## 7. BESS 平台知识汇总

> `05-优化求解/.../BESS-Optimization-Platform/Learn-node`

三种调度：规则≈cc；确定性≈③；预测+优化≈④。

```text
EMS(~1h) → MPC(~1min) → PID(~4s)
```

| 策略 | 路径 |
|------|------|
| deterministic_lp | ≈售前③ |
| economic.py | ≈④ |

阅读：13→12→05→04→11。
"""

# --- 01 分享稿切块 ---
s01 = read("01_分享稿-完整版.md")
s05 = read("05_三个优化问题-通俗讲解.md")
s04 = read("04_预测调度-讲义.md")
s03 = read("03_一页总览与对照表.md")

part1 = between(s01, "## 1.", "## 2.")  # 售前场景
part1 = part1.replace("## 1.", "## 1.", 1)

# 问题一：01 §3 + 05 §问题一 + 流程
p1_tech = between(s01, "## 3.", "## 4.")
p1_pop = between(s05, "## 问题一", "## 问题二")
sec2 = f"## 2. 问题一：场地\n\n{p1_pop}\n\n---\n\n{p1_tech}\n{FLOW_1}"

# 问题二
p2_tech = between(s01, "## 4.", "## 5.")
p2_pop = between(s05, "## 问题二", "## 问题三")
sec3 = f"## 3. 问题二：选型\n\n{p2_pop}\n\n---\n\n{p2_tech}\n{FLOW_2}"

# 问题三
p3_tech = between(s01, "## 5.", "## 6.")
p3_pop = between(s05, "## 问题三", "## 三个问题的关系")
sec4 = f"## 4. 问题三：运行\n\n{p3_pop}\n\n---\n\n{p3_tech}\n{FLOW_3}"

# 串联：05 例子 + 01 §6
chain_extra = between(s05, "## 再用一个完整的例子", "## 自然引出")
sec5 = CHAIN + "\n\n" + chain_extra + "\n\n" + between(s01, "## 6.", "## 7.")

# 问题四：04 全文 demote
s04_body = between(s04, "## 1.", None)
s04_body = demote_all_headers(s04_body)
s04_body = fix_links(s04_body)
sec6 = "## 6. 问题四：基于预测的调度优化\n\n" + s04_body

# HOMER
sec8 = between(s01, "## 2.", "## 3.").replace("## 2.", "## 8. 与 HOMER Pro 对比\n\n### 8.0 ", 1)
# fix - simpler
sec8 = "## 8. 与 HOMER Pro 对比\n\n" + between(s01, "### 2.1", "## 3.")

# FAQ + 03
sec9 = "## 9. 速查表、FAQ 与代码索引\n\n" + s03 + "\n\n---\n\n" + between(s01, "## 7.", "## 8.")
sec9 = fix_links(sec9)
appendix = between(s01, "## 附录", None)
if appendix:
    appendix = appendix.replace("## 附录：代码索引", "### 9.4 代码索引（MicroGrid-homerpro）", 1)
sec9 += "\n\n" + SECTION_9_EXTRA + "\n\n" + appendix

HEADER = """# 微电网售前与运行期：四个最优化问题 — 单文档完整版

> **本文档是唯一推荐阅读与讲解材料。** 已汇总 05/01/03/04/02 讲义及 BESS Learn-node 要点。  
> **版本：** 2026 · **仓库：** MicroGrid-homerpro

---

## 如何使用本文档

| 你想… | 跳到 |
|--------|------|
| 5 分钟全局观 | [§0](#0-一句话与四问题总表) |
| 售前三问题 | [§2～4](#2-问题一场地) |
| 双路径 | [§1](#1-售前在解决什么) |
| HOMER 对比 | [§8](#8-与-homer-pro-对比) |
| 预测调度④ | [§6](#6-问题四基于预测的调度优化) |
| BESS 参考 | [§7](#7-bess-平台知识汇总) |
| **给别人讲** | **[§10](#10-给他人讲解指南)** |
| 速查 FAQ | [§9](#9-速查表faq-与代码索引) |

**自学：** 0→1→2→3→4→5→6→7→9 · **开讲：** 只看 [§10](#10-给他人讲解指南)

---

## 目录

1. [售前场景](#1-售前在解决什么) · 2. [问题①](#2-问题一场地) · 3. [问题②](#3-问题二选型) · 4. [问题③](#4-问题三运行) · 5. [串联](#5-三问题串联) · 6. [问题④](#6-问题四基于预测的调度优化) · 7. [BESS](#7-bess-平台知识汇总) · 8. [HOMER](#8-与-homer-pro-对比) · 9. [FAQ](#9-速查表faq-与代码索引) · 10. [讲解指南](#10-给他人讲解指南)

"""

SECTION_0 = """---

## 0. 一句话与四问题总表

**售前：** ①地能装几套 → ②哪套最划算 → ③全年怎么开最省。**投运：** ④预测下滚动调度。

| # | 大白话 | 数学 | API | 状态 |
|---|--------|------|-----|------|
| ① | 地最多几套 | MILP | /api/layout | ✅ |
| ② | 1…N最划算 | 枚举+排序 | /api/optimize | ✅ |
| ③ | 全年怎么开 | LP | calculate | ✅ |
| ④ | 投运怎么开 | 预测+滚动 | EMS待建 | 🔜 |

**餐厅类比：** ①最多摆桌 · ②哪套回本快 · ③全年怎么开火 · ④每天看预报调班。

```mermaid
flowchart TB
  P1[①→N] --> P2[②] --> P3[③]
  P2 -.-> P3
  P3 -.-> R[④滚动]
```
"""

FLOW_1 = """
### 2.5 流程图（问题一）

```mermaid
flowchart TD
  A[SiteAreaMap] --> B{多边形/面积}
  B -->|多边形| C[/api/layout]
  B -->|面积| D[max_systems_for_area]
  C --> E[optimize_polygon_layout]
  E --> F[MILP HiGHS]
  F --> G[max_systems=N]
```
"""

FLOW_2 = """
### 3.6 流程图（问题二）

```mermaid
flowchart TD
  A[known-load] --> B[/api/optimize]
  B --> C[for sets 1..N]
  C --> D[③ PyPSA or quick]
  D --> E[排序→calculate]
```
"""

FLOW_3 = """
### 4.6 流程图（问题三）

```mermaid
flowchart TD
  A[固定容量] --> B[8760h曲线]
  B --> C[PyPSA LP]
  C --> D[年油耗/失负荷]
```
"""

CHAIN = """
---

## 5. 三问题串联

见 §5.1 非洲客户例子。求解器：①若干MILP + ②③≤10次PyPSA + 精算1次。
"""

SECTION_7 = """
---

## 7. BESS 平台知识汇总

三种调度：规则≈cc；确定性≈③；预测+优化≈④。分层：EMS→MPC→PID。代码：`core/mpc/economic.py`、`strategies/deterministic_lp/`。详见 Learn-node 13/05/04。
"""

SECTION_9_EXTRA = """
### 9.1 四问题速查

①MILP ②枚举 ③LP ④预测滚动（待建）

### 9.2 双路径

known-load: optimize→calculate · DIY: calculate only
"""

SECTION_10 = read("_section10_content.md") if (ROOT / "_section10_content.md").exists() else ""

FOOTER = """
---

### 9.6 收束

售前三问题 + 投运后第四问题。**③**证方案，**④**让电站更好开。**讲：** [§10](#10-给他人讲解指南)。

---

*文档结束。*
"""

# Section 10 content file
SECTION_10_CONTENT = r'''---

## 10. 给他人讲解指南（开箱即讲）

> 合并 `02_PPT讲义` 讲稿 + 口播稿 + 时间卡 + 易错点。主讲人看本节即可开讲。

### 10.1 时长

| 版本 | 时间 | 内容 |
|------|------|------|
| 标准 | 45～50min | ①②③+④概念 |
| 完整 | 55～65min | +④深入+BESS |

| 段 | min | 节 |
|----|-----|-----|
| 开场+场景 | 10 | §10.2-4 |
| ① | 8 | §10.5 |
| ② | 10 | §10.6 |
| ③ | 8 | §10.7 |
| 例子+HOMER | 5 | §5、§8 |
| ④ | 6 | §10.8 |
| FAQ | 5 | §10.10 |

### 10.2 开场白（背）

> 今天讲**四个最优化问题**：地能装几套、卖哪套划算、全年怎么开省、投运后按预测调度。不是HOMER翻版，是**MILP+套数枚举+PyPSA**。有**known-load**和**DIY**两条路径。最后讲第四问题（EMS建设中）。

### 10.3 三句话

1. known-load/DIY决定是否自动比方案  
2. 三售前问题：能装几套→哪套值得卖→全年怎么省  
3. 与HOMER问题类似，算法不同  

### 10.4 双场景（5min）

known-load：年kWh→optimize比1…N→选方案→calculate。  
DIY：手选设备→只calculate，经济估算±20～30%，**不optimize**。  
**勿说**「只有一个优化」→「三步链，DIY缺自动比选」。

### 10.5 问题①（8min）

**销售：** 固定大小拖车+通道，不规则地横竖停法不同→**最多N套**。不算发电回本电池。  
**技术：** 0-1 MILP，HiGHS。只填面积=启发式，不规则地可能高估。  
**例子：** A、B冲突，B、C冲突→选A+C=2套。  
**收束：** ①只给天花板N。

### 10.6 问题②（10min）

仅known-load。每套数：公式定储柴→**必须跑③**→比回本期。不能一个公式解最优。  
**②每次比较依赖③**；②买多大，③怎么用。

### 10.7 问题③（8min）

容量锁死，8760h LP。输出年油、失负荷。  
**例子：** 负荷100、光伏60→优化分电池+柴发，全年总成本最小。  
vs HOMER：规则 vs LP，机制不同。

### 10.8 问题④（6min）

**必投屏§6.2表。** ③已知全年；④预测滚动。两层：预测+优化；只执行第一步=MPC思想。  
**诚实：** prediction addon≠④已上线。

### 10.9 易错点

| 错 | 对 |
|----|-----|
| 一个大优化 | 四个不同问题 |
| N=7就卖7套 | N是上限 |
| optimize=调度 | optimize是②，调度是③ |
| prediction=④上线 | 多为售前lp预览 |
| DIY也比方案 | 不optimize |
| ③投运照抄 | 要④滚动 |

### 10.10 答疑速答

三问题一个吗？否。DIY不optimize？无年负荷。prediction=④？否。详见§9.3。

### 10.11 听众裁剪

销售：类比+例子+③④表。电气：调度+④架构。算法：②③链+§7。

### 10.12 PPT页对照

0封面 1三句话 2-3场景 4HOMER 5-6总览 7-10① 11-15② 16-19③ 20-21路径 22-23FAQ 24④

### 10.13 讲前checklist

- [ ] 按听众裁剪  
- [ ] 投屏§6.2或流程图  
- [ ] 强调DIY、prediction  
- [ ] 准备§5.2例子  
'''

if __name__ == "__main__":
    (ROOT / "_section10_content.md").write_text(SECTION_10_CONTENT.strip() + "\n", encoding="utf-8")
    s10 = read("_section10_content.md")

    parts = [
        HEADER,
        SECTION_0,
        part1,
        sec2,
        sec3,
        sec4,
        sec5,
        sec6,
        SECTION_7,
        sec8,
        sec9,
        s10,
        FOOTER,
    ]
    text = "\n\n".join(p for p in parts if p.strip())
    OUT.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT}: {len(text)} chars, {len(text.splitlines())} lines")
