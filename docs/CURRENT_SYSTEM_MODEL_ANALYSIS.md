# 当前系统计算模型总分析

## 1. 当前在线主链路

当前结果页主链路入口是：

- `backend/app/routers/calculate.py:33`
- `frontend/src/api/client.ts:114`
- `frontend/src/features/wizard/hooks/useWizardCalculation.ts:121`

主链路流程：

1. 前端收集配置参数
2. 后端 `calculator.compute_sizes()` 推导系统规格
3. 后端运行快速估算或 `8760h` 仿真
4. 后端 `build_template_cost_breakdown()` 构造 CAPEX/OPEX
5. 后端 `generate_solution_report()` 生成经济分析
6. 前端结果页展示系统配置、仿真结果、成本结果、经济比较表

## 2. 成本计算模型

当前成本计算由两层组成：

- 规格推算模型
- 模板化成本拆分模型

### 2.1 规格推算模型

规格推算在 `backend/app/services/calculator.py`。

关键公式：

```text
pv_kw = bracketSets * panels_per_set * panel.kw
```

DIY 年负荷近似：

```text
peak_kw = voltage * requiredCurrent * 0.85 / 1000
annual_load_kwh = peak_kw * 8 * 365
```

电池容量采用经验公式：

```text
battery_kwh_target = max(
    pv_kw * 3 * storageDays,
    daily_load_kwh * autonomy_factor * storageDays / 0.9
)
```

其中：

- 有柴油机时 `autonomy_factor = 0.5`
- 无柴油机时 `autonomy_factor = 1.0`

关键代码位置：

- `backend/app/services/calculator.py:34`
- `backend/app/services/calculator.py:47`
- `backend/app/services/calculator.py:57`
- `backend/app/services/calculator.py:65`
- `backend/app/services/calculator.py:74`

### 2.2 模板化成本拆分模型

正式结果页链路中，实际 CAPEX/OPEX 由 `backend/app/services/template_cost_engine.py` 负责生成，不是 `calculator.build_capex()`。

主入口：`backend/app/services/template_cost_engine.py:267`

当前 CAPEX 拆分为：

- 光伏组件
- 光伏支架
- 储能系统
- 柴油发电机
- 国际运输
- 安装费
- 电气附件
- 其他初始成本

物流和附件采用“基础值 + 每套支架增量”：

```text
intl_transport = base + pv_sets * per_bracket_set
installation   = base + pv_sets * per_bracket_set
accessory_cost = base + pv_sets * per_bracket_set
```

新柴油机才计入采购 CAPEX。

对应：

- `backend/app/services/template_cost_engine.py:309`
- `backend/app/services/template_cost_engine.py:310`
- `backend/app/services/template_cost_engine.py:311`
- `backend/app/services/template_cost_engine.py:318`
- `backend/app/services/template_cost_engine.py:401`

### 2.3 售价与利润模型

售价与利润定义在 `SystemCapex`：

```text
equipment_subtotal = 所有 CAPEX 项合计
profit_base = equipment_subtotal - diesel_generator_cost - installation_cost
selling_price = equipment_subtotal + profit_base * profit_margin
profit_amount = selling_price - equipment_subtotal
```

对应：

- `backend/app/services/economic_analysis.py:65`
- `backend/app/services/economic_analysis.py:75`
- `backend/app/services/economic_analysis.py:83`

### 2.4 OPEX

当前 OPEX 分两块：

- 固定光储 O&M
- 柴油机维护 O&M

柴油机维护 O&M 依赖运行小时：

```text
annual_minor_services = ceil(runtime_hours / S_oil)
annual_minor_service_cost = annual_minor_services * (labor + oil + oil_filter + fuel_filter)
annual_air_filter_cost = ceil(runtime_hours / S_air) * C_af
annual_coolant_cost = 按年周期平摊
annual_battery_cost = 按年周期平摊
```

对应：

- `backend/app/services/template_cost_engine.py:434`
- `backend/app/services/template_cost_engine.py:462`

## 3. 经济分析模型

当前正式经济分析在 `backend/app/services/economic_analysis.py`，主入口：`backend/app/services/economic_analysis.py:700`。

它本质上是：

- 微电网方案 vs 纯柴油方案
- 逐年累计成本对比
- 以累计收益与累计 LCOE 为核心输出

### 3.1 燃料成本

在 `ProjectParameters` 中定义：

```text
microgrid_annual_fuel_cost  = microgrid_diesel_liters  * diesel_price_per_liter
dieselonly_annual_fuel_cost = dieselonly_diesel_liters * diesel_price_per_liter
```

对应：

- `backend/app/services/economic_analysis.py:160`
- `backend/app/services/economic_analysis.py:172`
- `backend/app/services/economic_analysis.py:176`

### 3.2 柴油机 O&M 模型

柴油机 O&M 由 `DieselOMCalculator` 负责：

- `backend/app/services/economic_analysis.py:184`
- `backend/app/services/economic_analysis.py:246`

逐年逻辑：

```text
materials = 保养次数 * (机油 + 机滤 + 柴滤) + 空滤更换
labor     = 保养次数 * t_pm * labor_rate
coolant   = 指定年份发生
battery   = 指定年份发生
generator_capex = 更换周期年份发生
```

### 3.3 微电网与纯柴油年成本

微电网年度成本：`backend/app/services/economic_analysis.py:398`

```text
Year 1: selling_price + diesel_om_B + microgrid_fuel
Year N: fixed_microgrid_om + diesel_om_B + microgrid_fuel
```

纯柴油年度成本：`backend/app/services/economic_analysis.py:413`

```text
dieselonly_cost = diesel_om_A + generator_replacement + dieselonly_fuel
```

### 3.4 比较指标

比较表：`backend/app/services/economic_analysis.py:425`

```text
annual_revenue     = diesel_cost - microgrid_cost
cumulative_revenue = 累计 annual_revenue
mg_lcoe            = cumulative_microgrid_cost / cumulative_load
diesel_lcoe        = cumulative_diesel_cost / cumulative_load
```

回本年与 LCOE 交叉年：

- `backend/app/services/economic_analysis.py:469`
- `backend/app/services/economic_analysis.py:482`

结论：当前经济模型更接近工程方案对比模型，而不是 HOMER Pro 的标准 NPC/COE 模型。

## 4. 仿真模型

正式仿真位于：

- `backend/app/services/simulator.py:59`
- `backend/app/services/microgrid_simulator.py:167`

### 4.1 两种仿真口径

`/api/calculate` 支持两种模式：

- `simulate=false`：快速估算
- `simulate=true`：`8760h` PyPSA 仿真

对应：

- `backend/app/routers/calculate.py:33`
- `backend/app/routers/calculate.py:68`
- `backend/app/routers/calculate.py:72`
- `frontend/src/api/client.ts:103`
- `frontend/src/api/client.ts:114`

### 4.2 快速估算模型

快速估算位于：`backend/app/services/simulator.py:19`

```text
solar_frac = min(0.97, REF_SOLAR_FRAC * (pv_to_load / ref_ratio) ** 0.6)
mg_diesel_kwh    = annual_load_kwh * (1 - solar_frac)
mg_diesel_liters = mg_diesel_kwh / diesel_eff
mg_diesel_hours  = mg_diesel_kwh / (diesel_kw * 0.6)
diesel_only_liters = annual_load_kwh / (diesel_eff * 0.88)
```

### 4.3 正式 PyPSA 仿真模型

PyPSA 流程：

1. 生成合成 PV 时序
2. 生成合成负荷时序
3. 构建离网网络
4. 用 `highs` 做经济调度
5. 输出发电、弃光、缺供、柴油小时

关键代码：

- PV 时序：`backend/app/services/microgrid_simulator.py:28`
- 负荷时序：`backend/app/services/microgrid_simulator.py:110`
- 建模入口：`backend/app/services/microgrid_simulator.py:227`

当前关键假设：

- 电池为 `StorageUnit`
- `cyclic_state_of_charge=True`
- 初始 SOC 为 `50%`
- 柴油机连续可调，`p_min_pu=0.0`
- 没有二进制启停、最小开机时间、启动成本
- 缺供通过高成本 `LoadShedding` 表示

对应：

- `backend/app/services/microgrid_simulator.py:257`
- `backend/app/services/microgrid_simulator.py:264`
- `backend/app/services/microgrid_simulator.py:265`
- `backend/app/services/microgrid_simulator.py:272`
- `backend/app/services/microgrid_simulator.py:276`
- `backend/app/services/microgrid_simulator.py:299`

关键输出定义：

```text
solar_fraction   = pv_gen_kwh / load_kwh
loss_of_load     = load_shed_kwh / load_kwh
curtailment_rate = curtail_kwh / pv_gen_kwh
diesel_hours     = count(diesel_power > 0.01 kW)
```

对应：

- `backend/app/services/microgrid_simulator.py:343`
- `backend/app/services/microgrid_simulator.py:350`
- `backend/app/services/microgrid_simulator.py:351`
- `backend/app/services/microgrid_simulator.py:352`

仿真结果回到业务层后的再换算：

```text
mg_diesel_liters   = annual_diesel_kwh / diesel_eff
diesel_only_liters = annual_load_kwh / (diesel_eff * 0.88)
diesel_run_hours_a = 8760
```

对应：

- `backend/app/services/simulator.py:88`
- `backend/app/services/simulator.py:90`
- `backend/app/services/simulator.py:99`

## 5. 三类模型之间的关系

### 5.1 规格推算先于一切

`calculator.compute_sizes()` 先输出：

- PV 容量
- 电池容量
- 柴油机容量
- 逆变器数量
- 托盘数量
- 场地需求

这些结果同时喂给：

- 仿真模型
- 成本拆分模型

### 5.2 仿真模型向成本模型提供运行量

仿真模型输出：

- 柴油运行小时
- 柴油发电量
- 缺供率
- 弃光率
- 光伏占比

其中对成本模型直接有影响的是：

- `mgDieselHours`
- 柴油升数

因为：

- 柴发维护成本依赖运行小时
- 柴油燃料成本依赖柴油升数

### 5.3 成本模型向经济模型提供 CAPEX/OPEX

成本拆分模型输出：

- `SystemCapex`
- `MicrogridOMParams`
- `DieselOMParams`

经济模型再据此计算：

- 微电网年度投入
- 纯柴油年度投入
- 累计收益
- LCOE
- 回本年

### 5.4 推荐链路与正式链路不同精度

已知负载场景先走 `/api/optimize`，再在选中方案后走 `/api/calculate?simulate=true`。

对应前端：

- `frontend/src/features/wizard/hooks/useWizardCalculation.ts:73`
- `frontend/src/features/wizard/hooks/useWizardCalculation.ts:82`
- `frontend/src/features/wizard/hooks/useWizardCalculation.ts:103`
- `frontend/src/features/wizard/hooks/useWizardCalculation.ts:160`

优化模型位于 `backend/app/services/optimizer.py:187`，用的是简化经验公式，不是完整 PyPSA。

因此当前系统实际上有两套精度不同的模型：

- 推荐阶段：简化优化模型
- 最终结果页：正式仿真 + 正式成本 + 正式经济分析

## 6. 当前主链路之外的模块

仓库中还有：

- `backend/app/services/financial_model.py`
- `backend/app/services/solution_pipeline.py`

它们不是当前结果页主链路的一部分。

- `financial_model.py` 更偏人民币口径财务模型，包含回本、NPV、IRR
- `solution_pipeline.py` 是另一条组合分析管线，但当前在线接口未直接走它

## 7. 结论

当前系统不是一个单独模型，而是一个分层组合模型：

- 第 1 层：规格推算模型
- 第 2 层：仿真模型
- 第 3 层：模板成本模型
- 第 4 层：生命周期经济比较模型

其中最关键的现实点是：

- 结果页主链路与推荐链路不是同一精度
- 仿真结果与经济结果通过“柴油小时”和“柴油升数”强耦合
- 当前经济分析是工程比较模型，不是完整 HOMER NPC/COE 模型
