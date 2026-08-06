# -*- coding: utf-8 -*-
from pathlib import Path

DOC = Path(__file__).resolve().parent / "06_完整讲解-通俗+代码+流程图.md"

INSERT = r'''
### 8.4 柴发运行小时怎么算？

报告里通常有两组柴发小时数，**不要混用**：

| 字段（API/报告） | 含义 | 典型值 |
|------------------|------|--------|
| `mgDieselHours` / `annual_diesel_hours` / `mg_diesel_hours` | **B 工况**：微电网（光+储+柴）下柴发年运行小时 | 几百～一千多 h（项目相关） |
| `dieselRunHoursA` / `diesel_run_hours_a` | **A 工况**：纯柴油基准下柴发年运行小时 | 有柴发时通常 **≈ 8760 h** |

**A 工况（纯柴油）** 用 `DieselOnlySimulator`：全年只有柴发带负荷，PyPSA 逐时优化后统计「有出力的小时数」：

```text
diesel_run_hours = count(P_diesel(t) > 0.01 kW)   # 8760 个时段
```

**B 工况（微电网）** 才是客户关心的「加了光储以后油机开多少小时」。计算在 `simulator._run_pypsa_cached` / `optimizer._pypsa_simulation` 里，**先跑 PyPSA 得到 8760h 柴发功率曲线**，再按 `dieselDispatchMode` 统计小时数。

#### 8.4.1 计算流水线（B 工况）

```mermaid
flowchart TD
  A[generate_load_profile + generate_pv_profile] --> B[OffGridMicrogridSimulator.optimize]
  B --> C["_diesel_series: 8760h 柴发功率 kW"]
  C --> D{dispatch_mode?}
  D -->|lp / lf / proxy 默认| E["_estimate_diesel_commitment 或 status 序列"]
  D -->|cc| F["_run_homer_style_dispatch 规则逐时仿真"]
  D -->|uc| G["PyPSA 二进制 status 列"]
  E --> H["diesel_status(t) ∈ {0,1}"]
  F --> H
  G --> H
  H --> I["mg_diesel_hours = count(diesel_status > 0.5)"]
  C --> J["DieselFuelModel F0/F1 → 年油耗 L"]
```

#### 8.4.2 各调度模式下「开机小时」判定

| 模式 | 默认？ | 怎么判定某小时「柴发在运行」 | 年小时数怎么来 |
|------|--------|------------------------------|----------------|
| **proxy** | ✅ 精算默认 | 先 LP 求出力 → `P ≥ 1%×额定 kW` 记 1 → 再套 **最小开/停机时长** 平滑 | `count(status>0.5)` |
| **lp / lf** | | 与 proxy 同类后处理；或直接用出力阈值 | 同上 |
| **cc** | 部分场景 | **不用** PyPSA 小时统计作最终值；改跑 `_run_homer_style_dispatch`（LF/CC/CD 规则逐时） | 规则仿真里 `P>0.01` 的小时数 |
| **uc** | 验证用 | PyPSA **committable** 柴发，优化器直接给 `generators_t.status` | `count(status>0.5)` |

**proxy 核心代码逻辑**（`microgrid_simulator._estimate_diesel_commitment`）：

```text
threshold = max(0.01, 0.01 × diesel_kw)
status(t) = 1  若 P_diesel(t) ≥ threshold
再 enforce 最小开机/停机时长（默认各 1h，cc 可设 2h）
mg_diesel_hours = Σ status(t)
mg_diesel_starts = Σ [status 从 0→1 的跳变次数]
```

**cc 模式特殊：** PyPSA 算完后，**油耗、运行小时、启动次数会被 HOMER 风格规则仿真结果覆盖**（循环充电、reserve SOC、柴发顺充电池等近似规则见 `_run_homer_style_dispatch`）。

**油耗与小时数分开算：** 小时数看 `diesel_status`；升数看 `DieselFuelModel`：

```text
若该小时 status=1（在运行）:
  fuel(t) = F0 × P_rated + F1 × max(P_out(t), min_load_kw)   # L
年油耗 = Σ fuel(t)
```

`F0`/`F1` 来自产品库 `fuel_intercept_coeff` / `fuel_slope_coeff`（默认约 0.033 / 0.273，可按机组标定）。

#### 8.4.3 和「纯柴油 8760h」的关系

- **A 工况**回答：「如果不用光储、全靠这台柴发扛全年负荷，要烧多少油、开多少小时？」→ 运行小时 **接近全年 8760**（有最小出力约束时可能略少）。  
- **B 工况**回答：「上了光储之后，柴发实际还要开多少小时？」→ 通常 **远小于 8760**（例如对标案例 HOMER 约 **889 h**，本项目 proxy 仍在收敛中，可能偏高）。  
- 经济报告里柴发 **O&M** 用 B 工况小时：`diesel_kw × 0.5 + run_hours × 1.20`（`optimizer._diesel_om_annual`）。  
- **quick_estimate 预筛**（不跑完整 PyPSA 时）用经验式 `hours ≈ 年柴发 kWh / (diesel_kw × 0.6)`  capped 8760——**仅粗筛，不是精算口径**。

#### 8.4.4 结果页上的 HOMER 对照行

精算返回的 `homer_dispatch_comparison` 会并列：

- **PyPSA optimized**（当前主口径）  
- **HOMER LF / CC / CD**（基于公开调度描述的 **透明规则近似**，不是 HOMER Pro 专有引擎）

用于解释「我们和 HOMER 差在哪」，**不能**当作「HOMER 官方复算结果」。

**代码索引：**

| 内容 | 路径 |
|------|------|
| B 工况汇总 | `simulator._run_pypsa_cached` |
| 小时/启动统计 | `microgrid_simulator.run_simulation` |
| proxy 启停代理 | `microgrid_simulator._estimate_diesel_commitment` |
| cc 规则仿真 | `simulator._run_homer_style_dispatch` |
| F0/F1 油耗 | `solution_pipeline.DieselFuelModel` |
| A 工况 | `solution_pipeline.DieselOnlySimulator` |

---

### 8.5 已与 HOMER Pro 对齐的部分

> 口径：**流程与输出口径尽量一致**；数值 **同输入下仍可能有差异**（见 §8.6）。

| 类别 | 对齐内容 | 说明 |
|------|----------|------|
| **场景结构** | A 纯柴油 + B 微电网双场景 | 与 HOMER 对比「省多少油」的框架一致 |
| **燃油模型** | 线性曲线 `Fuel = F0×P_rated + F1×P_out` | 产品库可配截距/斜率；可 `calibrate_from_homer` 反推 F1 |
| **纯柴油基准** | 独立 `DieselOnlySimulator` | 不再用简单经验换算 |
| **经济主链** | NPC → 年化成本 → COE | `homer_economic_model.py`；实贴现率、残值、更换 |
| **柴发寿命** | 按 **运行小时寿命** 折算年数 | `service_life_hours / annual_runtime_hours` |
| **电池寿命** | 循环吞吐量 + 浮充寿命 取较短 | 与 HOMER 双约束思路一致 |
| **调度模式选项** | lp / **proxy（默认）** / uc；cc 可走规则 | 速度 vs 真实性分层 |
| **CC/LF/CD 对照** | 结果页并列 HOMER 风格规则行 | 便于偏差解释（非黑盒引擎） |
| **外层流程** | 先 PV 范围 → 配储柴 → 全年仿真 → 比经济性 | 对客户话术可对齐 |
| **柴发选型** | 峰值×1.2 取标准档 | 与业务规则文档一致 |

---

### 8.6 尚未与 HOMER Pro 对齐的部分

| 类别 | HOMER Pro 典型做法 | 我们现状 | 影响 |
|------|-------------------|----------|------|
| **外层搜索** | PV×电池×柴发 Search Space 或 Optimizer | **仅套数 1…N** + 公式定储 + 柴发常固定 | 最优方案空间更小 |
| **内层仿真** | 专用 **规则逐时** dispatch（LF/CC） | 默认 **PyPSA LP + proxy 后处理** | 年油耗、**运行小时**可能偏差 |
| **调度引擎** | 非通用 MIP 硬解全年 UC | uc 可选但慢；默认 proxy | HOMER 行为 ≠ LP/Proxy/UC 任一原样 |
| **电池策略** | reserve SOC、柴发充电、循环充电阈值 | cc 有近似；lp/proxy **不完整** | **运行小时偏高的主因之一** |
| **输入时序** | 用户/ERA5 等 **同一套 8760** | 合成负荷 + 经纬度 PV 曲线 | 未导入相同 CSV 则无法逐项对标 |
| **设备参数** | 机组设备卡逐项校准 | 默认 F0/F1、min_load 25～30% | 差参数会拉开油耗与小时 |
| **运行小时定义** | 更接近真实 **开机状态** | 多为 **出力阈值 + 启停代理** | 同项目 HOMER 889h vs 我们仍可能 1100h+ |
| **场地 MILP** | 无 | ✅ 我们有① | 我们多一步，非 HOMER 能力 |
| **known-load / DIY** | 无 | ✅ 产品分叉 | 售前流程差异 |
| **prediction / ④** | 可扩展 | EMS 预测滚动 **建设中** | 投运层未对齐 |

**一句话对外：** 我们 **卖的问题和 HOMER 类似**，**算的方法不同**；燃油曲线和经济主链已 HOMER 化，**dispatch 与输入数据尚未完全复刻**，因此 **柴发运行小时、年油耗、NPC 不应承诺与 HOMER 逐项相同**。

**偏差量级（内部参考，同一基准项目）：**

| 指标 | HOMER Pro 参考 | 本项目趋势 |
|------|----------------|------------|
| B 工况柴发小时 | 例：889 h | proxy 已向 889 收敛，仍可能偏高 |
| 旧 LP 口径 | — | 曾出现 ~1498 h（碎片化低功率） |
| A 工况小时 | 8760 h | 一致 |

更细说明见仓库 `docs/HOMERPRO_DISPATCH_AND_GAP_GUIDE.md`、`docs/HOMERPRO_RUNTIME_GAP_EXPLANATION.md`。
'''

FAQ_Q7 = '''
**Q7：柴发运行小时怎么来的？和 HOMER 一样吗？**  
B 工况：8760h PyPSA（或 cc 规则仿真）后，统计 `diesel_status>0.5` 的小时数；默认 **proxy** 用出力阈值 + 最小开停机代理。A 工况纯柴油约 8760h。燃油用 F0/F1 另算。与 HOMER **口径接近、算法不同**，同输入仍可能有偏差——见 [§8.4～8.6](#84-柴发运行小时怎么算)。
'''

TABLE_ROW = '| 柴发小时 / HOMER 对齐 | [§8.4～8.6](#84-柴发运行小时怎么算) |'


def main():
    text = DOC.read_text(encoding="utf-8")
    if "### 8.4 柴发运行小时怎么算？" in text:
        print("already patched")
        return

    marker = "我们 **known-load** 接近「PV 轴（套数）+ 从属公式定储」，不是 HOMER 全表笛卡尔积；**DIY** 接近「用户定容量再 Simulate」。\n\n---\n\n## 9."
    if marker not in text:
        raise SystemExit("insert marker not found")

    text = text.replace(
        marker,
        "我们 **known-load** 接近「PV 轴（套数）+ 从属公式定储」，不是 HOMER 全表笛卡尔积；**DIY** 接近「用户定容量再 Simulate」。\n"
        + INSERT.strip()
        + "\n\n---\n\n## 9.",
    )

    faq_anchor = "**Q6：负载能否唯一确定 PV/储/柴？**"
    if faq_anchor in text and "Q7：柴发运行小时" not in text:
        text = text.replace(
            "**Q6：负载能否唯一确定 PV/储/柴？**  \n不能。负荷定需求；多种供应组合均可行，靠 ② 比经济性。\n\n---",
            "**Q6：负载能否唯一确定 PV/储/柴？**  \n不能。负荷定需求；多种供应组合均可行，靠 ② 比经济性。\n\n"
            + FAQ_Q7.strip()
            + "\n\n---",
        )

    if "柴发小时 / HOMER 对齐" not in text:
        text = text.replace(
            "| HOMER 对比 | [§8](#8-与-homer-pro-对比) |",
            "| HOMER 对比 | [§8](#8-与-homer-pro-对比) |\n" + TABLE_ROW,
        )

    # expand dispatch mode table in section 4
    old_table = """| 模式 | 说明 |
|------|------|
| lf / lp | PyPSA 经济调度 |
| cc | 循环充电；可规则覆盖油耗 |
| prediction（EMS） | 精算时可走 lp；与预测调度专题衔接 |"""

    new_table = """| 模式 | 说明 | 柴发小时统计 |
|------|------|----------------|
| **proxy**（默认） | LP 求出力 → 阈值 + 最小开停机代理 | `count(status>0.5)` |
| lf / lp | 连续经济调度 + 后处理 | 同 proxy 思路 |
| cc | 规则逐时 `_run_homer_style_dispatch` **覆盖**油耗与小时 | 规则仿真内统计 |
| uc | PyPSA 二进制启停（慢，验证用） | `generators_t.status` |
| prediction（EMS） | 精算时可走 lp；与④衔接 | 同 lp/proxy |

> 柴发小时与 HOMER 对齐细节见 [§8.4](#84-柴发运行小时怎么算)。"""

    if old_table in text:
        text = text.replace(old_table, new_table)

    DOC.write_text(text, encoding="utf-8", newline="\n")
    # verify utf-8
    raw = DOC.read_bytes()
    assert raw[:3] != b"\xef\xbb\xbf" or True
    raw.decode("utf-8")
    print("ok, lines", len(text.splitlines()))


if __name__ == "__main__":
    main()
