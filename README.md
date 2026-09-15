# MicroGrid-homerpro 微电网方案测算系统

面向售前场景的微电网容量配置与经济性测算系统：输入负荷、地区、光伏、储能、柴油机、逆变器等参数，快速生成离网/微电网方案，输出系统配置、拓扑、成本收益和报告。

- `frontend/`：React + Vite + TypeScript
- `backend/`：FastAPI，负责测算、优化、报告导出、地理编码

## 快速启动

需要：Python 3.11+、Node.js 20+、Git；用本地 Pelias 地理编码（地图搜索/地址解析）时还需要 Docker Desktop，不需要可跳过。

**一键启动**（推荐，Windows）：

```bat
start-all.bat
```

会自动写入前端地理编码配置、按需拉起 Pelias、启动后端（`6001` 端口，同时托管已构建的前端）。

**手动启动**：

```bat
cd backend && python -m pip install -r requirements.txt
cd ../frontend && npm install && npm run build
cd ../backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 6001 --app-dir .
```

前端单独调试用 `npm run dev`（`http://localhost:5173`），后端接口不受影响。

**Docker 方式**：

```bat
docker compose up -d --build   # 前端 :8081，后端 :6001
docker compose down
```

访问地址：前端 `http://localhost:6001/`　接口文档 `http://localhost:6001/docs`　健康检查 `http://localhost:6001/api/health`

## 用 E2B 把测算引擎当 AI Agent 工具调用

除了作为 Web 服务运行，`backend/` 还能被 AI Agent 当作一次性工具调用，不需要常驻服务器、不需要数据库：

1. 依赖预装在 E2B 沙箱模板 `microgrid-tool`（`backend/e2b.Dockerfile`）里；
2. 每次调用时，agent 在沙箱内 `git clone` 拉取本仓库最新代码到 `$HOME`；
3. 运行 `python backend/e2b_tool.py <calculate|optimize|layout_optimize> '<json>'`，从 stdout 读一行 JSON 结果；
4. 销毁沙箱，不留任何状态。

改代码只需要 `git push`，不用重新构建模板。完整的调用示例（Python SDK 代码、私有仓库怎么处理、注意事项）见 [`docs/E2B_AGENT_TOOL.md`](docs/E2B_AGENT_TOOL.md)——这份文档跟着代码一起被跟踪和推送（`docs/` 下其余内容不推送到 GitHub，只有这一份是例外）。

## 目录结构

```text
MicroGrid-homerpro/
├─ frontend/              # 前端页面
├─ backend/
│  ├─ app/routers/        # API 路由
│  ├─ app/services/       # 测算、优化、报告等业务逻辑
│  ├─ app/schemas/        # 请求/响应数据结构
│  ├─ products.yaml       # 产品配置兜底数据
│  ├─ e2b_tool.py         # E2B agent 工具入口
│  └─ e2b.Dockerfile      # E2B 沙箱模板
├─ pelias/                # 地理编码相关配置
├─ deploy/                # 部署脚本、Docker Compose
└─ start-all.bat          # 一键启动入口
```

## 常见问题

- **页面打不开**：先看 `http://localhost:6001/docs` 能不能打开；打不开说明后端没起来，查 `backend/server-start.{out,err}.log`。
- **地图搜索/地址解析不可用**：依赖 Pelias（默认 `http://localhost:4000/v1/search`），没启动时主要测算流程仍可用。
- **改了前端代码没反应**：托管模式需要 `npm run build` 重新构建；开发模式用 `npm run dev`。
- **后端依赖装不上**：先 `python -m pip install --upgrade pip` 再重装；`pypsa`/`highspy`/`pandas` 等科学计算库安装较慢，耐心等。

## 交付/演示前检查

1. `http://localhost:6001/docs` 接口文档能打开
2. `http://localhost:6001/api/health` 健康检查正常
3. 前端页面能走完一遍方案配置流程并生成结果
4. Pelias 地理编码、产品价格/设备参数、报告导出流程都确认过
