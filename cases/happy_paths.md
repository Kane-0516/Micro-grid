# Happy Path Scenarios / 正常路径场景

## HP1: Known-Load Solution / 已知负荷方案

**English:**
1. Select "Known-Load Solution"
2. Search address "6400 Durham Rd, Timberlake, NC"
3. System returns coordinates, automatically loads solar parameters
4. Enter annual electricity consumption: 131,400 kWh
5. Select existing 20 kW diesel generator
6. System auto-optimizes, recommends a 4-set bracket plan
7. Select recommended plan, proceed to economic analysis

**中文：**
1. 选择"已知负荷方案"
2. 搜索地址 "6400 Durham Rd, Timberlake, NC"
3. 系统返回坐标，自动加载日照参数
4. 输入年用电量 131,400 kWh
5. 选择已有 20 kW 柴发
6. 系统自动优化，推荐 4 套支架方案
7. 选择推荐方案，进入经济分析

---

## HP2: DIY Solution / 自定义方案

**English:**
1. Select "DIY Solution"
2. Set project location
3. Enter usable area: 1000 m²
4. System shows maximum installable sets = 4 (spacing-corrected)
5. Manually select PV/storage/diesel parameters
6. View economic analysis results

**中文：**
1. 选择"自定义方案"
2. 设置项目位置
3. 输入可用面积 1000 m²
4. 系统显示最大可安装 4 套（间距修正）
5. 手动选择 PV/储能/柴发参数
6. 查看经济分析结果

---

## HP3: Polygon Layout / 多边形排布

**English:**
1. Draw a polygon on the map to outline the site boundary
2. System calls backend MILP solver (mixed-orientation optimization)
3. Displays maximum installable sets and layout overlay on the map
4. Results are written back to the form automatically

**中文：**
1. 在地图上画多边形框选场地边界
2. 系统调用后端 MILP 求解器（混合朝向优化）
3. 显示最大可安装套数和排布图
4. 结果自动回填到表单
