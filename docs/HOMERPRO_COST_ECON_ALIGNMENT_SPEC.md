# HOMER Pro 成本模型与经济分析模型对齐规范

## 1. 目标

本文档的目标不是泛泛描述 HOMER Pro，而是给当前项目提供一套可落地的 `HOMER-compatible` 成本与经济分析规范，使 `C:\Panskai-work\PyPSA\MicroGrid` 后续能够逐步复现 HOMER Pro 的核心输出口径。

这里的“对齐”指的是：

- 同一套 `8760` 负荷与资源输入
- 同一套设备成本输入
- 同一套柴油机运行与燃油口径
- 同一套寿命、更换、残值、贴现规则
- 最终按 `NPC` 排序，而不是按经验公式、静态回本或累计 LCOE 排序

一句话结论：

> 你当前系统与 HOMER Pro 的主要差异，不在 CAPEX 明细，而在“调度输出如何映射成寿命成本”和“经济指标如何做贴现汇总”。要复现 HOMER，必须把经济核心从“年累计成本/LCOE”切换到“组件现金流 -> 折现 -> NPC -> 年化成本 -> COE”。


## 2. 当前项目的真实现状

结合现有代码，当前项目实际上同时存在三套不同口径：

### 2.1 旧简化链路

- [simulator.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/simulator.py)
- [economic_analysis.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/economic_analysis.py)
- [optimizer.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/optimizer.py)

特点：

- 柴油油耗仍有固定效率换算
- 纯柴油基准场景不是严格独立仿真
- 经济分析是年累计投入/收益/LCOE
- 排序逻辑仍有经验公式

这条链路不可能严格对齐 HOMER Pro。

### 2.2 中间模板链路

- [template_cost_engine.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/template_cost_engine.py)

特点：

- 已经能把报价模板拆成组件级 CAPEX/OPEX
- 但柴油机更换年限仍然写死为 `2` 年和 `17` 年
- 这不是 HOMER 的寿命逻辑

### 2.3 最接近 HOMER 的链路

- [solution_pipeline.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/solution_pipeline.py)
- [simulation_bridge.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/simulation_bridge.py)

这里已经出现了两个非常重要的 HOMER 思路：

- 柴油机线性燃油曲线 `Fuel = F0 * Ygen + F1 * Pgen`
- 独立的纯柴油基准仿真

所以后续应当以这条链路为基础继续收敛，而不是继续在旧链路上打补丁。


## 3. HOMER Pro 对齐时必须先统一的边界

在讨论成本模型之前，必须明确一个事实：

> HOMER 的经济结果不是独立计算出来的，它是仿真结果的经济投影。

因此下列运行量必须先统一，否则后面的 NPC、COE 一定偏：

- `annual_load_served_kwh`
- `annual_pv_generation_kwh`
- `annual_diesel_generation_kwh`
- `annual_diesel_fuel_liters`
- `diesel_hours_of_operation`
- `diesel_starts`
- `annual_battery_throughput_kwh`
- `annual_unmet_load_kwh`
- `annual_excess_electricity_kwh`

如果这些量与 HOMER 不同，后面的经济值再怎么调也只是“拟合”，不是“复现”。


## 4. HOMER-compatible 成本模型

## 4.1 组件级成本输入结构

HOMER 的成本输入本质上是按组件定义，而不是按项目总表一次性塞进去。

每一类组件至少应包含：

- `capital_cost`
- `replacement_cost`
- `fixed_om_cost`
- `variable_om_cost` 或基于运行量的维护成本
- `lifetime_rule`
- `salvage_rule`

建议在项目中统一成如下抽象：

```text
ComponentCostInput
  - name
  - capital_cost
  - replacement_cost
  - fixed_om_per_year
  - variable_om_basis
  - lifetime_mode
  - lifetime_years
  - lifetime_hours
  - lifetime_throughput_kwh
  - salvage_enabled
```

### 4.1.1 PV

建议输入：

- 初始资本成本
- 更换成本
- 固定年 O&M
- 寿命按年

### 4.1.2 逆变器/PCS

建议输入：

- 初始资本成本
- 更换成本
- 固定年 O&M
- 寿命按年

### 4.1.3 电池

建议输入：

- 初始资本成本
- 更换成本
- 固定年 O&M
- 浮充寿命 `float life`
- 吞吐寿命 `lifetime throughput`

### 4.1.4 柴油机

建议输入：

- 初始资本成本
- 更换成本
- 固定年 O&M
- 运行维护成本
- 燃油价格
- 寿命按运行小时，而不是按年


## 4.2 柴油机燃油模型

HOMER 官方文档给出的柴油机燃油模型是线性燃油曲线：

```text
Fuel_t = F0 * Ygen + F1 * Pgen_t    , 当机组运行时
Fuel_t = 0                          , 当机组停机时
```

其中：

- `F0`：截距系数，代表空载油耗
- `F1`：斜率，代表边际油耗
- `Ygen`：柴油机额定容量
- `Pgen_t`：t 时刻实际输出功率

这正是 [solution_pipeline.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/solution_pipeline.py) 已经开始采用的方向。

这意味着你项目中以下旧公式必须退出正式链路：

```text
annual_diesel_liters = annual_diesel_kwh / diesel_eff
```

因为它忽略了：

- 空载油耗
- 部分负载油耗恶化
- 开机但低出力时的真实燃油成本


## 4.3 柴油机寿命模型

HOMER 官方口径里，发电机寿命是“运行小时寿命”，不是“自然年份寿命”。

应采用：

```text
generator_operational_life_years = generator_lifetime_hours / annual_hours_of_operation
```

因此：

- 不能再用固定 `2` 年或 `17` 年替代寿命
- 也不能只按装机规模经验写死更换周期
- 柴油机的更换频率必须由仿真输出的 `annual_hours_of_operation` 决定

对当前项目的直接要求是：

- [template_cost_engine.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/template_cost_engine.py) 中 `replacement_cycle_a_years=2` 和 `replacement_cycle_b_years=17` 应退出正式 HOMER-compatible 链路
- 柴油机更换年限应改为“由小时寿命动态计算”


## 4.4 电池寿命模型

HOMER 官方文档中，储能寿命可能由两个因素共同约束：

- 浮充寿命 `float life`
- 吞吐寿命 `lifetime throughput`

对于要对齐 HOMER 的项目，建议采用：

```text
battery_life_years = min(
    float_life_years,
    n_batt * throughput_lifetime_per_unit_kwh / annual_throughput_kwh
)
```

说明：

- 如果电池循环很频繁，吞吐寿命先到
- 如果系统循环较浅但年限较长，浮充寿命先到

这与当前简单的“每 10 年更换一次电池”不同。


## 4.5 残值模型

HOMER 官方残值逻辑的关键点是：

- 残值基于 `replacement cost`
- 假设线性折旧
- 残值取决于项目结束时组件还剩多少寿命

因此目标实现应为：

```text
salvage_value = replacement_cost * remaining_life_fraction
```

这里的 `remaining_life_fraction` 是“项目结束时，距离该组件下一次报废还剩余的寿命占比”。

重要的是：

- 残值不是基于 `capital_cost`
- 残值不能简单设成 0
- 如果项目结束前刚更换过组件，则残值会明显不为 0

而当前项目尚未形成这套标准残值口径。


## 4.6 O&M 成本模型

对齐 HOMER 时，O&M 不应只保留“固定年费”。

建议拆成：

- `fixed_om_per_year`
- `runtime_om_per_hour`
- `throughput_om_per_kwh`
- `fuel_cost`

对柴油机尤其要区分：

- 固定维护
- 按运行小时触发的小保养/大保养
- 燃油成本
- 更换成本

你当前 [economic_analysis.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/economic_analysis.py) 里已经有接近“运行维护”的结构，但仍然被固定更换周期拖偏了。


## 5. HOMER-compatible 经济分析模型

## 5.1 实际排名指标是 NPC，不是 LCOE

这是最关键的一条。

HOMER 官方说明非常明确：

- 系统的主排序依据是 `Total Net Present Cost`
- `COE` 是展示指标，不是优化排序主指标

因此你的最终优化链路必须是：

```text
候选系统
-> 8760 仿真
-> 组件现金流
-> 折现
-> Total NPC
-> 排序
-> 再输出 COE / Payback / Fuel / Hours
```

而不是：

```text
候选系统
-> 经验公式
-> 年成本或累计 LCOE
-> 排序
```


## 5.2 真实贴现口径使用 real discount rate

HOMER 官方文档说明：

- 先由名义贴现率和通胀率计算 `real discount rate`
- 所有成本都转成不含通胀的“real costs”
- 后续的年化和现值计算都基于 real discount rate

按该页面公式，可采用标准 Fisher 关系：

```text
i_real = (i_nominal - inflation) / (1 + inflation)
```

这里是依据 HOMER 官方 “Real Discount Rate” 页面中的公式关系整理得到。

这意味着当前模型里如果直接把所有年成本做名义累加，或者一边涨价一边再用 nominal rate 贴现，就会和 HOMER 偏掉。


## 5.3 折现现金流与 NPC

HOMER-compatible 的总经济计算核心应是：

```text
NPC_total = sum_t DiscountedNetCashFlow_t
```

或者按成本/收入拆开理解：

```text
NPC_total
  = PV(capital)
  + PV(replacement)
  + PV(fixed_O&M)
  + PV(variable_O&M)
  + PV(fuel)
  + PV(other_costs)
  - PV(salvage)
  - PV(other_revenues)
```

其中：

```text
discount_factor_t = 1 / (1 + i_real)^t
```

这与当前 [economic_analysis.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/economic_analysis.py) 中的“逐年累计投入”和“累计收益”本质不同。


## 5.4 总年化成本

HOMER 将总 NPC 转为总年化成本：

```text
C_ann_tot = NPC_total * CRF(i_real, N)
```

其中：

```text
CRF(i, N) = i * (1 + i)^N / ((1 + i)^N - 1)
```

若 `i = 0`，可退化为：

```text
CRF(0, N) = 1 / N
```

这一步是 HOMER 的 COE 计算前置步骤，不能直接跳过。


## 5.5 COE 口径

HOMER 官方将 `COE` 定义为：

- 系统提供有用电能的平均成本
- 对纯电系统，可近似理解为：

```text
COE = C_ann_tot / E_served
```

其中：

- `C_ann_tot`：总年化成本
- `E_served`：年度供电量/被满足的有效电负荷

对你当前项目而言，如果没有热负荷：

- 不要再用“累计总投入 / 累计总负荷”直接叫 HOMER 的 LCOE
- 应先算 `NPC`
- 再算 `annualized cost`
- 最后算 `COE`


## 5.6 Payback 只能作为辅助指标

你当前模型里对回本年、NPV、IRR 已经有一些实现，但在 HOMER 语境下要注意：

- `Payback` 不是主排序指标
- `COE` 也不是主排序指标
- `NPC` 才是主排序指标

所以推荐输出顺序应改成：

1. `Total NPC`
2. `Total annualized cost`
3. `COE`
4. `Operating cost`
5. `Fuel consumption`
6. `Generator hours / starts / operational life`
7. `Payback / NPV / IRR` 作为扩展商业指标


## 6. 当前项目的目标实现口径

下面这套口径是建议你在代码里正式落地的“唯一标准链路”。

## 6.1 仿真层

输入：

- 同一套 `8760` 负荷
- 同一套 `8760` 资源序列
- 统一设备额定参数

输出：

- `annual_diesel_generation_kwh`
- `annual_diesel_fuel_liters`
- `diesel_hours_of_operation`
- `diesel_starts`
- `annual_battery_throughput_kwh`
- `annual_load_served_kwh`
- `annual_unmet_load_kwh`
- `annual_excess_kwh`

建议：

- 保留 [solution_pipeline.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/solution_pipeline.py) 的柴油燃油模型
- 纯柴油基准必须是独立仿真，不允许再用经验换算


## 6.2 成本层

由 [template_cost_engine.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/template_cost_engine.py) 负责输出组件成本，但只做：

- CAPEX 明细
- replacement cost 输入
- fixed O&M 输入

不再负责：

- 把柴油机寿命硬编码成固定年份
- 直接代替经济计算主引擎


## 6.3 经济层

建议新增一个正式模块，例如：

- [homer_economic_model.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/homer_economic_model.py)

职责：

- 接收仿真输出
- 接收组件成本输入
- 计算各组件 replacement timeline
- 计算 salvage value
- 计算 discounted cash flow
- 输出 `NPC / annualized cost / COE / operating cost`

建议核心数据结构：

```text
EconomicInputs
SimulationOutputs
ComponentCashflow
EconomicSummary
```


## 7. 代码层面的直接改造建议

## 7.1 保留并继续强化的部分

- [solution_pipeline.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/solution_pipeline.py)
  - 保留 `DieselSpec`
  - 保留 `DieselFuelModel`
  - 保留 `DieselOnlySimulator`

- [template_cost_engine.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/template_cost_engine.py)
  - 保留组件级报价拆分
  - 仅作为成本输入层


## 7.2 应退出正式口径的部分

- [simulator.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/simulator.py)
  - 固定效率燃油换算
  - 固定 `8760` 的纯柴油近似

- [economic_analysis.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/economic_analysis.py)
  - 年累计成本表可保留作“商业展示表”
  - 但不应继续作为 HOMER-compatible 主经济引擎

- [optimizer.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/optimizer.py)
  - 可继续做候选集预筛
  - 但最终排序必须切到 full simulation + NPC


## 7.3 必须新增的逻辑

### A. 柴油机按小时寿命更换

```text
life_years = generator_lifetime_hours / annual_runtime_hours
replacement_years = [life_years, 2*life_years, ... < project_life]
```

### B. 电池按吞吐或浮充寿命取最短

```text
battery_life_years = min(float_life_years, throughput_based_years)
```

### C. 残值

```text
salvage = replacement_cost * remaining_life_fraction
```

### D. 正式 NPC/COE 引擎

```text
for year in 0..N:
    cashflow[year] =
        capital_if_year0
      + replacement_if_triggered
      + fixed_om
      + runtime_om
      + throughput_om
      + fuel_cost
      - salvage_if_terminal

NPC = sum(cashflow[year] / (1 + i_real)^year)
C_ann = NPC * CRF(i_real, N)
COE = C_ann / annual_load_served
```


## 8. 推荐实施顺序

### 第一阶段：统一经济输入与仿真输出

目标：

- 全部正式结果页都只接受同一套仿真结果
- 删除固定效率油耗口径
- 删除固定 2/17 年更换口径

### 第二阶段：建立 HOMER-compatible 经济内核

目标：

- 新增 `NPC / annualized cost / COE / salvage`
- 让正式页面展示这组指标

### 第三阶段：让优化器按 NPC 排序

目标：

- `optimizer.py` 只负责生成候选
- 最终评分全部改为 `Total NPC`

### 第四阶段：再处理 dispatch 细节

目标：

- 引入更接近 HOMER 的柴油启停、最小负载、启动次数
- 再逐步逼近运行小时、燃油、缺供率


## 9. 验收标准

如果目标是“结果上接近 HOMER”，建议采用以下验收标准：

- 同一 `8760` 输入下，柴油年发电量偏差 `< 3%`
- 柴油年耗油量偏差 `< 3%`
- 柴油运行小时偏差 `< 5%`
- 柴油机寿命年数偏差 `< 5%`
- 电池寿命年数偏差 `< 5%`
- `Total NPC` 偏差 `< 3%`
- `COE` 偏差 `< 3%`

如果 dispatch 策略尚未完全对齐，可先接受：

- 运行结果偏差 `< 5%`
- 经济结果偏差 `< 5%`


## 10. 结论

对当前项目而言，真正应该复现的 HOMER Pro 经济主链路是：

```text
8760仿真
-> 柴油/电池/负荷运行量
-> 组件寿命与更换
-> 残值
-> 贴现现金流
-> Total NPC
-> Total annualized cost
-> COE
```

不是：

```text
年油耗经验换算
-> 固定更换年限
-> 年累计成本
-> 累计LCOE
```

如果你后面要“和 HOMER 结果一致”，建议直接以 [solution_pipeline.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/solution_pipeline.py) 作为运行量基础，以新增的 `homer_economic_model.py` 作为唯一正式经济内核，逐步淘汰 [simulator.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/simulator.py) 与 [economic_analysis.py](/C:/Panskai-work/PyPSA/MicroGrid/backend/app/services/economic_analysis.py) 中的旧口径。


## 11. 参考来源

以下为本次整理使用的 HOMER 官方资料：

- HOMER Pro Generator Fuel Curve Slope: https://www.homerenergy.com/products/pro/docs/3.15/generator_fuel_curve_slope.html
- HOMER Pro Generator Fuel Curve Intercept Coefficient: https://www.homerenergy.com/products/pro/docs/3.15/generator_fuel_curve_intercept_coefficient.html
- HOMER Pro Fuel Curve: https://www.homerenergy.com/products/pro/docs/3.15/fuel_curve.html
- HOMER Pro Generator Lifetime: https://homerenergy.com/products/pro/docs/latest/generator_lifetime.html
- HOMER Pro Generator Operational Life: https://homerenergy.com/products/pro/docs/3.15/generator_operational_life.html
- HOMER Pro Real Discount Rate: https://homerenergy.com/products/pro/docs/latest/real_discount_rate.html
- HOMER Pro Total Net Present Cost: https://homerenergy.com/products/pro/docs/3.15/total_net_present_cost.html
- HOMER Pro Total Annualized Cost: https://www.homerenergy.com/products/pro/docs/3.15/total_annualized_cost.html
- HOMER Pro Annualized Cost: https://www.homerenergy.com/products/pro/docs/3.15/annualized_cost.html
- HOMER Pro Levelized Cost of Energy: https://homerenergy.com/products/pro/docs/3.15/levelized_cost_of_energy.html
- HOMER Pro Salvage Value: https://www.homerenergy.com/products/pro/docs/3.15/salvage_value.html
- HOMER Pro Lifetime Throughput: https://homerenergy.com/products/pro/docs/latest/lifetime_throughput.html
- HOMER Pro Battery Bank Life: https://homerenergy.com/products/pro/docs/3.15/battery_bank_life.html
- HOMER Pro Battery Throughput: https://www.homerenergy.com/products/pro/docs/3.15/battery_throughput.html
- HOMER Pro Battery Wear Cost: https://www.homerenergy.com/products/pro/docs/3.15/battery_wear_cost.html
