# Glossary / 术语表

| Term / 术语 | English | 中文 |
|-------------|---------|------|
| Bracket Set | A standard folding PV bracket set, default 32 panels (2×16), 28 m × 5.6 m, footprint 156.8 m² | 一套标准折叠光伏支架，默认 32 块面板（2×16），28 m × 5.6 m，占地 156.8 m² |
| Bracket Spacing | Minimum spacing between adjacent bracket sets, fixed at 10 ft (3.048 m) | 相邻支架最小间距，固定为 10 ft（3.048 m） |
| Estimated Minimum Footprint | Minimum site area required to install a given number of bracket sets, including spacing | 安装指定套数支架所需的最小场地面积，含间距 |
| Measured Area | Full polygon boundary area drawn on the map (gross area) | 地图多边形框选的完整边界面积（毛面积） |
| Usable Area | Net area available for installation, defaults to Measured Area unless manually adjusted | 实际可安装的净面积，默认等于毛面积，用户可手动调整 |
| Maximum Installable Sets | Maximum bracket sets that can fit within the given area, determined by the layout optimization algorithm | 经排布算法计算的最大可安装支架套数 |
| Layout Optimizer | Mixed-orientation MILP layout optimization engine | 混合朝向 MILP 排布优化引擎 |
| Known-Load Solution | Configuration path for users who know their annual electricity consumption; system auto-optimizes PV/storage/diesel sizing | 已知年用电量的配置路径，系统自动优化 PV/储能/柴发容量 |
| DIY Solution | Configuration path where users directly specify equipment parameters | 用户直接指定设备参数的配置路径 |
| Standard Product | Predefined integrated PV-storage-diesel product specifications (small/medium/large) | 预定义的光储柴一体化产品规格（小型/中型/大型） |
| Solar Parameters | Site solar assessment parameters based on NASA POWER data (peak sun hours, annual effective hours, annual irradiance) | 基于 NASA POWER 数据的站点日照评估参数（峰值日照时数、年等效小时数、年辐照量） |
| Pelias | Locally deployed open-source geocoding service for forward/reverse address resolution | 本地部署的开源地理编码服务，提供正向/反向地址解析 |
| MQ Power DCA20SPXU4F | The company's purchased 20 kW diesel generator unit | 公司已采购的 20kW 柴油发电机组型号 |
| ConfigData | Frontend core business data container used throughout the configuration flow | 前端核心业务数据容器，贯穿整个配置流程 |
| PV Capacity | Photovoltaic installed capacity (kWp) = bracket sets × panels per set × panel wattage | 光伏装机容量（kWp）= 套数 × 每套面板数 × 单块功率 |
| MILP | Mixed-Integer Linear Programming — mathematical optimization with integer and continuous variables | 混合整数线性规划——含整数和连续变量的数学优化方法 |
| HiGHS | High-performance open-source MILP solver | 高性能开源 MILP 求解器 |
