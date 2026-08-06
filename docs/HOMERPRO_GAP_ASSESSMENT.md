项目地址在：C:\Panskai-work\PyPSA\MicroGrid

# 当前系统与 HOMER Pro 偏差评估

## 1. 总结

当前系统和 HOMER Pro 的偏差，不是单点造成的，而是多层叠加：

- 输入数据口径不同
- 柴油机调度模型不同
- 燃油模型不同
- 纯柴油基准场景不同
- 经济指标定义不同

最容易导致“大偏差”的，不是 CAPEX，而是：

- 柴油机运行逻辑
- 柴油燃油曲线
- 纯柴油基准场景
- 经济分析口径

## 2. 影响优先级表

| 优先级 | 偏差项 | 当前系统实现 | HOMER Pro 常见实现 | 影响程度 | 主要影响指标 |
|---|---|---|---|---|---|
| P1 | 柴油机启停逻辑 | 连续可调，`p_min_pu=0`，无 UC | 有启停状态、最小负载、调度策略 | 很高 | 运行小时、燃油、LCOE |
| P1 | 燃油模型 | `annual_diesel_kwh / diesel_eff` | 线性燃油曲线，含空载油耗 | 很高 | 燃油、年成本、回本 |
| P1 | 纯柴油基准场景 | 小时固定 `8760`，油耗经验换算 | 同样时序、同样口径独立仿真 | 很高 | 节油、节省、回本 |
| P1 | 输入时序 | 合成 PV、合成负荷 | 常用实测或导入序列 | 很高 | 发电、缺供、运行小时 |
| P2 | 电池调度 | 连续 `StorageUnit`，循环 SOC | 更接近实际 dispatch 策略 | 高 | 柴发替代比例、缺供 |
| P2 | 运行小时定义 | `P > 0.01 kW` 即算 1 小时 | 按机组开机状态统计 | 高 | 运行小时、维护成本 |
| P2 | 经济分析口径 | 年累计成本/LCOE 比较 | NPC、COE、贴现现金流 | 高 | 回本、LCOE、排序 |
| P3 | 柴发更换周期 | 模板固定年数 | 更接近累计运行小时寿命 | 中 | 长期 O&M、LCOE |
| P3 | 推荐链路 | 经验公式初筛 | 通常基于完整调度评估 | 中 | 推荐方案排序 |
| P3 | 缺供处理 | 高成本 `LoadShedding` | 更细的可靠性口径 | 中 | 缺供率、配置边界 |

## 3. 逐项评估

### 3.1 柴油机启停逻辑偏差

当前实现：

- `backend/app/services/microgrid_simulator.py:272`
- `backend/app/services/microgrid_simulator.py:276`

当前系统把柴油机建成：

- 连续可调发电机
- `p_min_pu = 0.0`
- 无最小负载率
- 无最小开机时间
- 无启停成本
- 无二进制开机状态

这会导致：

1. 柴油机可能在很多小时以很小功率“漂着运行”
2. 柴油机可能被优化切成很多碎片化出力时段

而 HOMER Pro 更接近真实机组：

- 有最小负载率
- 有启动决策
- 有明确的机组开机状态

影响：

- 柴油运行小时
- 柴油年发电量
- 电池替代比例
- 柴油维护成本

建议优先级：最高

### 3.2 燃油模型偏差

当前实现：

- `backend/app/services/simulator.py:88`
- `backend/app/services/simulator.py:90`

当前系统：

```text
mg_diesel_liters = annual_diesel_kwh / diesel_eff
diesel_only_liters = annual_load_kwh / (diesel_eff * 0.88)
```

这等于假设：

- 发电效率恒定
- 与负载率无关
- 不存在空载油耗

HOMER Pro 常见口径更接近：

```text
Fuel(L/h) = F0 * Prated + F1 * Poutput
```

也就是：

- 只要机组开机就有基础油耗
- 负载变化会影响边际油耗

影响：

- 低负载时油耗被低估
- 长期燃油费用会偏差明显

建议优先级：最高

### 3.3 纯柴油基准场景偏差

当前实现：

- `backend/app/services/simulator.py:90`
- `backend/app/services/simulator.py:99`

当前系统的纯柴油场景：

- 油耗：经验换算
- 小时：固定 `8760`

这意味着纯柴油基准不是与微电网同精度、同输入条件下的独立仿真场景。

这会直接影响：

- 节油量
- 年节省
- 回本年
- LCOE 交叉年

建议优先级：最高

### 3.4 输入时序偏差

当前实现：

- PV：`backend/app/services/microgrid_simulator.py:28`
- 负荷：`backend/app/services/microgrid_simulator.py:110`

当前系统：

- PV 曲线是合成时序
- 负荷曲线是模板化时序
- 云量扰动也是随机事件，不是真实站点气象

如果 HOMER 使用：

- NASA/ERA5 数据
- 导入的 `8760` 气象序列
- 实测负荷

那么两边结果天然会大幅偏离。

影响：

- 光伏发电量
- 柴油替代率
- 电池循环
- 缺供率
- 柴油运行小时

建议优先级：最高

### 3.5 电池调度偏差

当前实现：

- `backend/app/services/microgrid_simulator.py:257`
- `backend/app/services/microgrid_simulator.py:264`
- `backend/app/services/microgrid_simulator.py:265`

当前电池：

- 用 `StorageUnit`
- 循环 SOC
- 初始 SOC 固定 `50%`
- 电池功率默认取 `battery_kwh / 4`

这与 HOMER 中常见的：

- dispatch strategy
- reserve SOC
- generator charging
- cycle charging / load following

并不等价。

建议优先级：高

### 3.6 运行小时定义偏差

当前实现：`backend/app/services/microgrid_simulator.py:343`

```text
diesel_hours = (diesel_series > 0.01).sum()
```

只要某小时输出超过 `0.01 kW`，就算运行 `1` 小时。

如果柴油机是连续变量，这个定义会明显放大碎片化小出力的运行小时。

建议优先级：高

### 3.7 经济分析口径偏差

当前实现：

- `backend/app/services/economic_analysis.py:347`
- `backend/app/services/economic_analysis.py:425`

当前系统做的是：

- 年累计投入
- 年累计收益
- 累计 LCOE

而不是 HOMER 常见的：

- Net Present Cost
- Discounted cash flow
- 标准 COE 口径

这会导致：

- 即使能量结果接近，经济指标也可能差很多
- 特别是回本年、LCOE、长期总成本

建议优先级：高

### 3.8 柴发更换周期偏差

当前实现：

- `backend/app/services/template_cost_engine.py:435`
- `backend/app/services/template_cost_engine.py:436`
- `backend/app/services/economic_analysis.py:379`
- `backend/app/services/economic_analysis.py:388`

当前模板直接写死：

- 纯柴油 A 工况更换周期 `2` 年
- 微电网 B 工况更换周期 `17` 年

这不是按每个项目的实际年运行小时动态计算。

建议优先级：中高

### 3.9 推荐链路与正式链路不一致

当前实现：

- 推荐：`backend/app/services/optimizer.py`
- 正式：`backend/app/routers/calculate.py`

推荐链路使用：

- `_solar_fraction()` 经验公式
- 简化柴油运行小时公式
- 简化 LCOE 公式

正式链路使用：

- PyPSA 仿真
- 模板成本引擎
- 生命周期经济模型

这会导致推荐阶段和最终结果页数值不完全一致。

建议优先级：中

### 3.10 缺供与约束处理偏差

当前实现：`backend/app/services/microgrid_simulator.py:299`

缺供用高成本 `LoadShedding` 表示。工程上合理，但与 HOMER 的部分可靠性/约束口径不完全一致。

建议优先级：中

## 4. 最值得先改的 5 项

如果目标是尽快让当前系统更接近 HOMER Pro，建议顺序：

1. 统一输入数据
   - 用同一套 `8760` 负荷和气象序列
2. 改柴油机模型
   - 引入最小负载率、启停逻辑、开机状态
3. 改燃油模型
   - 从固定效率改为线性燃油曲线
4. 纯柴油基准场景独立仿真
   - 不再固定 `8760` 小时
5. 改经济分析口径
   - 若目标对齐 HOMER，则转为 NPC/COE 逻辑

## 5. 偏差来源与指标影响对应表

| 偏差来源 | 发电量 | 柴油小时 | 柴油升数 | 缺供率 | 回本年 | LCOE |
|---|---:|---:|---:|---:|---:|---:|
| 输入时序不同 | 高 | 高 | 高 | 高 | 高 | 高 |
| 柴油机启停逻辑不同 | 中 | 很高 | 很高 | 中 | 高 | 高 |
| 燃油曲线不同 | 低 | 中 | 很高 | 低 | 高 | 高 |
| 纯柴油基准不同 | 低 | 高 | 很高 | 低 | 很高 | 很高 |
| 电池调度不同 | 中 | 高 | 高 | 中 | 中 | 中 |
| 经济模型口径不同 | 低 | 低 | 低 | 低 | 很高 | 很高 |

## 6. 一句话结论

当前结果页虽然已经用了 `8760h` PyPSA 调度，但柴油机仍然不是按 HOMER 的真实机组逻辑建模，燃油和纯柴油对照场景也还是近似换算，再叠加输入时序和经济口径不同，所以和 HOMER Pro 出现明显偏差是预期内的。
