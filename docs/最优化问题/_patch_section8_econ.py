# -*- coding: utf-8 -*-
from pathlib import Path

DOC = Path(__file__).resolve().parent / "06_完整讲解-通俗+代码+流程图.md"

INSERT = r'''
### 8.7 经济分析怎么算？和 HOMER Pro 一样吗？

> **结论先说：** 售前 **optimize / calculate（精算）** 已走 **HOMER 风格经济主链**（组件现金流 → 实贴现 → NPC → 年化 → COE），**框架对齐**；数值是否接近 HOMER 取决于 **③ 仿真输出**（油耗、运行小时、电池循环）和 **成本输入** 是否与 HOMER 一致——**不能承诺同输入逐项相同**。

#### 8.7.1 售前主链路（API 实际走的）

```mermaid
flowchart TD
  A[③ PyPSA / quick_estimate] --> B[年油耗 L、柴发小时、电池放电量、失负荷]
  B --> C[build_template_cost_breakdown\n产品库 + 报价模板 CAPEX/O&M]
  B --> D[ProjectParameters\n年油费 = 升数 × 油价]
  C --> E[generate_homer_economic_report]
  D --> E
  E --> F[NPC / COE / breakeven / 年对比表]
  F --> G[optimize 排序 或 calculate 报告]
```

| 步骤 | 做什么 | 代码 |
|------|--------|------|
| 1. 运行量 | B 工况 + A 工况（纯柴油）仿真 | `run_pypsa` → `sim_r` |
| 2. CAPEX | 按套数/pack/柴发/EMS 从 **产品库 + 内部 Excel 模板** 拆组件价 | `template_cost_engine.build_template_cost_breakdown` |
| 3. 年油费 | `microgrid_diesel_liters × 油价`；纯柴油同理 | `ProjectParameters` |
| 4. 经济内核 | 25 年（可配）组件现金流、贴现、NPC、COE | `homer_economic_model.generate_homer_economic_report` |

**optimize 排序用的指标**（来自 `econ_report["summary"]`）：

| 指标 | 字段 | 含义 |
|------|------|------|
| 回本期 | `breakeven_year` | 折现后「纯柴油累计成本 − 微电网累计成本」首次 ≥ 0 的年份 |
| NPV 式节省 | `npc_savings_usd` | `diesel_only_npc − microgrid_npc`（全寿命折现差） |
| 微电网 COE | `final_mg_lcoe` | 微电网 NPC 年化 ÷ 年供电量（$/kWh） |
| 简单回本期 | `simple_payback_years` | `售价 ÷ 年运营节省`（**未折现**，报告辅助项） |

#### 8.7.2 一年成本怎么拼（HOMER 思路）

对 **微电网** 与 **纯柴油** 各建一套 `EconomicComponent` 列表（PV 组件、逆变器、电池、BOS、柴发…），每年：

```text
年成本(y) =
  组件资本（y=1 记初始 CAPEX）
+ 到寿命时的更换成本
+ 项目末年残值回收（负成本）
+ 年燃油费（仿真升数 × 油价，每年常数）
+ 固定 O&M（光储保险等，来自模板）
+ 柴发维护（按 B/A 工况运行小时：换油、滤芯、人工…）
```

**寿命（与 HOMER 类似，绑定仿真）：**

| 组件 | 规则 |
|------|------|
| 柴发 | `service_life_hours ÷ 年运行小时`（B 工况用 `mg_diesel_hours`，A 用 ~8760） |
| 电池 | `min(浮充寿命, 循环寿命)`；循环侧用 `年放电量 / (pack×kWh×循环次数×DOD)` |
| PV / 逆变器 | 模板默认 25y / 15y 等 |

**贴现：**

```text
real_rate = (1 + nominal_rate) / (1 + inflation) − 1
NPC = Σ_y  年成本(y) / (1 + real_rate)^y
年化总成本 = NPC × CRF(real_rate, 项目年数)
COE = 年化总成本 / 年供电 kWh（扣除失负荷）
```

#### 8.7.3 与 HOMER Pro 对齐的部分

| 类别 | 说明 |
|------|------|
| **经济主链** | NPC → 年化成本 → **COE**（不再用旧版「累计投入÷累计电量」当主指标） |
| **贴现** | 名义利率 + 通胀 → **实贴现率** |
| **组件级** | 分项 CAPEX、更换、残值 |
| **柴发寿命** | 按 **运行小时** 折算，不是写死 2 年/17 年 |
| **电池寿命** | 吞吐量 + 日历寿命双约束 |
| **柴发 O&M** | 维护次数 ∝ 年运行小时（换油间隔、滤芯等） |
| **对比框架** | 微电网 vs **独立纯柴油基准**（不是手填常数） |
| **排序逻辑** | optimize 按折现 NPC/回本期/COE，不是纯经验公式 |

#### 8.7.4 尚未与 HOMER 对齐 / 易混口径

| 类别 | 我们 | HOMER | 影响 |
|------|------|-------|------|
| **成本输入** | 产品库 + 内部报价模板 | HOMER 组件成本表 | CAPEX/NPC 基数可不同 |
| **运行量来源** | PyPSA + proxy（见 §8.4） | 规则 dispatch | 油费、柴发更换频率偏差 → **NPC/COE 偏差** |
| **年油费进经济** | `升数 × 油价`（仿真已用 F0/F1 算升数） | 同类思路 | 仿真准则经济准 |
| **售价/利润** | 模板 `profit_margin`、pass-through 规则 | HOMER 项目设置 | 回本期对「售价」敏感 |
| **quick_estimate** | 不跑 PyPSA，粗算油耗/小时 | — | **仅快估，精度差** |
| **DIY** | 仍走同一经济内核，但负荷/场景弱 | — | 文案 **±20～30%** |
| **旧链路** | `economic_analysis.generate_solution_report` 仍在 designer/脚本里 | — | **API 售前不走这条** |

**一句话：** 经济公式已 HOMER 化，但 **HOMER 的 NPC 是仿真结果的投影**——③ 与 HOMER 有 dispatch 差距（§8.6），经济数字就会跟着偏；成本表不一致也会偏。

#### 8.7.5 和「柴发小时」的关系

经济里柴发小时 **两处消费**：

1. **年燃油** ← 小时数本身不直接乘价，但影响仿真升数（F0 含空载项 × 运行小时）  
2. **柴发寿命 & 维护** ← 直接用 `annual_diesel_hours`：`service_life_hours/hours` 决定几年换机；维护费 ∝ `ceil(hours/S_oil)` 等  

因此 §8.4 里「运行小时偏高」会 **同时抬高 O&M 和缩短更换周期**，NPC 可能比 HOMER 更 pessimistic。

**代码索引：** `homer_economic_model.py` · `template_cost_engine.py` · `optimizer.py`（570 行起）· `calculate.py`（217 行起） · 规范 `docs/HOMERPRO_COST_ECON_ALIGNMENT_SPEC.md`
'''

FAQ = '''
**Q8：经济分析和 HOMER 一样吗？**  
框架一样：组件现金流 → 实贴现 NPC → 年化 → COE；optimize/calculate 走 `generate_homer_economic_report`。数值取决于仿真油/小时和模板 CAPEX 是否与 HOMER 同输入——见 [§8.7](#87-经济分析怎么算和-homer-pro-一样吗)。
'''

TABLE = '| 经济分析 / HOMER | [§8.7](#87-经济分析怎么算和-homer-pro-一样吗) |'


def main():
    text = DOC.read_text(encoding="utf-8")
    if "### 8.7 经济分析怎么算？" in text:
        print("already there")
        return

    anchor = "更细说明见仓库 `docs/HOMERPRO_DISPATCH_AND_GAP_GUIDE.md`、`docs/HOMERPRO_RUNTIME_GAP_EXPLANATION.md`。\n\n---\n\n## 9."
    if anchor not in text:
        raise SystemExit("anchor not found")

    text = text.replace(
        anchor,
        "更细说明见仓库 `docs/HOMERPRO_DISPATCH_AND_GAP_GUIDE.md`、`docs/HOMERPRO_RUNTIME_GAP_EXPLANATION.md`。\n\n"
        + INSERT.strip()
        + "\n\n---\n\n## 9.",
    )

    if "Q8：经济分析" not in text and "Q7：柴发运行小时" in text:
        text = text.replace(
            "B 工况：8760h PyPSA（或 cc 规则仿真）后，统计 `diesel_status>0.5` 的小时数；默认 **proxy** 用出力阈值 + 最小开停机代理。A 工况纯柴油约 8760h。燃油用 F0/F1 另算。与 HOMER **口径接近、算法不同**，同输入仍可能有偏差——见 [§8.4～8.6](#84-柴发运行小时怎么算)。\n\n---",
            "B 工况：8760h PyPSA（或 cc 规则仿真）后，统计 `diesel_status>0.5` 的小时数；默认 **proxy** 用出力阈值 + 最小开停机代理。A 工况纯柴油约 8760h。燃油用 F0/F1 另算。与 HOMER **口径接近、算法不同**，同输入仍可能有偏差——见 [§8.4～8.6](#84-柴发运行小时怎么算)。\n\n"
            + FAQ.strip()
            + "\n\n---",
        )

    if "经济分析 / HOMER" not in text:
        text = text.replace(
            "| 柴发小时 / HOMER 对齐 | [§8.4～8.6](#84-柴发运行小时怎么算) |",
            "| 柴发小时 / HOMER 对齐 | [§8.4～8.6](#84-柴发运行小时怎么算) |\n" + TABLE,
        )

    DOC.write_text(text, encoding="utf-8", newline="\n")
    text.encode("utf-8")
    print("ok", len(text.splitlines()), "lines")


if __name__ == "__main__":
    main()
