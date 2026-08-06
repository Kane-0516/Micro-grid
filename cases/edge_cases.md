# Edge Cases / 边界场景

## EC1: Geocoding failure — Pelias not running / 地理编码失败——Pelias 未启动

- **Input / 输入:** Search "Durham, NC" with Pelias service offline / Pelias 服务离线时搜索 "Durham, NC"
- **Expected (EN):** Error message distinguishing "Pelias not running" from "network unreachable", with fallback suggestions (try nearby city, ZIP code, or map selection)
- **预期（中文）：** 错误消息区分"Pelias 未启动"和"网络不可达"，并建议使用附近城市名、邮编或地图选点

---

## EC2: Solar parameter loading failure / 日照参数加载失败

- **Input / 输入:** Select coordinates with backend API offline / 后端 API 离线时选择坐标
- **Expected (EN):** Warning with specific message (backend unavailable vs data retrieval failure); auto-retry when backend comes online; suggest refresh or reselect on persistent failure
- **预期（中文）：** 显示具体警告（后端不可用 vs 数据获取失败）；后端恢复后自动重试；持续失败时建议刷新或重新选点

---

## EC3: Zero area input / 零面积输入

- **Input / 输入:** Available area = 0 or negative / 可用面积 = 0 或负数
- **Expected (EN):** Maximum installable sets = 0, no optimization run
- **预期（中文）：** 最大可安装套数 = 0，不触发优化

---

## EC4: Very small polygon / 极小多边形

- **Input / 输入:** Polygon smaller than one bracket footprint (< 156.8 m²) / 多边形小于单套支架占地（< 156.8 m²）
- **Expected (EN):** 0 installable sets returned
- **预期（中文）：** 返回 0 套可安装

---

## EC5: Concave L-shaped polygon / 凹形 L 形多边形

- **Input / 输入:** L-shaped polygon 100 m × 30 m + 50 m × 30 m / L 形多边形 100 m × 30 m + 50 m × 30 m
- **Expected (EN):** MILP finds optimal mixed-orientation layout, potentially placing horizontal brackets in the wide arm and vertical brackets in the narrow arm
- **预期（中文）：** MILP 找到最优混合朝向排布，可能在宽臂横放、窄臂竖放
