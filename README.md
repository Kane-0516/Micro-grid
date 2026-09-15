# MicroGrid-homerpro 微电网方案测算系统

这是一个面向售前场景的微电网容量配置与经济性测算系统。项目主要用于根据用户输入的负荷、地区、光伏、储能、柴油机、逆变器等参数，快速生成离网/微电网方案，并输出系统配置、拓扑示意、成本收益和报告结果。

项目由两部分组成：

- `frontend/`：前端页面，React + Vite + TypeScript。
- `backend/`：后端接口，FastAPI，负责产品配置、测算、优化、报告导出、地理编码等功能。

## 一、运行前准备

建议在 Windows 环境运行，当前项目里的启动脚本也是按 Windows 编写的。

需要提前安装：

1. **Python 3.11+**，本机测试脚本中使用过 Python 3.13。
2. **Node.js 20+**，用于安装和构建前端。
3. **Docker Desktop**，如果要使用本地 Pelias 地理编码服务，需要启动 Docker。
4. **Git**，用于拉取/提交代码。

如果只是先看页面和主要测算功能，可以先不管 Pelias；如果要使用地图搜索、地址解析、经纬度反查，就需要启动 Pelias。

## 二、推荐启动方式：一键启动

在项目根目录双击或运行：

```bat
start-all.bat
```

这个脚本会做几件事：

1. 写入前端地理编码代理配置。
2. 检查本地 Pelias 服务是否可用。
3. 如果 Pelias 没启动，会尝试通过 Docker Compose 启动 Pelias。
4. 启动后端 FastAPI 服务。
5. 后端会在 `6001` 端口提供 API，并在已构建前端存在时直接托管前端页面。

启动后访问：

- 前端页面：`http://localhost:6001/`
- 后端接口文档：`http://localhost:6001/docs`
- 健康检查：`http://localhost:6001/api/health`

> 说明：`start-all.bat` 是当前更推荐的入口。根目录下有些单独的 `start-backend*.cmd`、`start-frontend*.cmd` 可能保留了旧路径，换电脑后不一定能直接用。

## 三、手动启动方式

如果一键脚本没有跑起来，可以按下面步骤手动启动。

### 1. 安装后端依赖

```bat
cd backend
python -m pip install -r requirements.txt
```

### 2. 安装并构建前端

```bat
cd frontend
npm install
npm run build
```

构建完成后会生成：

```text
frontend/dist/
```

后端启动时会自动读取这个目录，并把前端页面挂在 `http://localhost:6001/`。

### 3. 启动后端

回到项目根目录，执行：

```bat
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 6001 --app-dir .
```

然后访问：

- `http://localhost:6001/`
- `http://localhost:6001/docs`

### 4. 前后端分开调试

如果要开发前端，可以单独启动 Vite：

```bat
cd frontend
npm install
npm run dev
```

默认访问：

```text
http://localhost:5173/
```

后端仍然单独启动在：

```text
http://localhost:6001/
```

## 四、Docker 方式运行

项目根目录提供了 `docker-compose.yml`，包含：

- `postgres`：产品配置数据库。
- `backend`：FastAPI 后端。
- `frontend`：Nginx 托管前端静态页面。

启动命令：

```bat
docker compose up -d --build
```

启动后访问：

- 前端：`http://localhost:8081/`
- 后端：`http://localhost:6001/docs`

停止服务：

```bat
docker compose down
```

如果要同时使用 Pelias，请参考：

- `pelias/README.md`
- `docs/GEOCODER_PROXY.md`
- `docs/PELIAS_DOCKER_EXPLAINED.md`
- `deploy/README.md`

## 五、主要目录说明

```text
MicroGrid-homerpro/
├─ frontend/              # 前端页面，React + Vite
├─ backend/               # 后端接口，FastAPI
├─ backend/app/routers/   # API 路由
├─ backend/app/services/  # 测算、优化、报告等业务逻辑
├─ backend/app/schemas/   # 请求和响应数据结构
├─ backend/products.yaml  # 产品配置兜底数据
├─ docs/                  # 项目说明与部署文档
├─ pelias/                # 地理编码相关配置
├─ deploy/                # 部署脚本和 Docker Compose 配置
└─ start-all.bat          # 推荐的一键启动入口
```

## 六、常用功能入口

系统目前主要包含这些功能：

1. **已知负荷方案测算**：输入站点、负荷、储能、柴油机等约束，生成推荐配置。
2. **DIY 配置流程**：按步骤选择光伏、逆变器、电池、柴油机等设备。
3. **方案结果页**：展示系统容量、投资估算、收益指标和 ROI 图表。
4. **拓扑展示**：展示微电网系统结构和标准产品连接关系。
5. **报告导出**：根据测算结果生成可交付的方案报告。
6. **产品配置管理**：维护标准产品、设备参数和价格配置。

## 七、常见问题

### 1. 页面打不开怎么办？

先确认后端是否启动成功：

```text
http://localhost:6001/docs
```

如果接口文档打不开，说明后端没有启动成功。可以查看：

- `backend/server-start.out.log`
- `backend/server-start.err.log`

### 2. 地图搜索或地址解析不可用怎么办？

地理编码依赖 Pelias，本地默认地址一般是：

```text
http://localhost:4000/v1/search
```

如果 Pelias 没启动，地图搜索可能失败，但主要测算流程通常仍可继续使用。

### 3. 前端改了代码但页面没变化怎么办？

如果是后端托管 `frontend/dist/` 的方式，需要重新构建前端：

```bat
cd frontend
npm run build
```

如果是开发模式，使用：

```bat
npm run dev
```

### 4. 后端依赖安装失败怎么办？

建议先升级 pip：

```bat
python -m pip install --upgrade pip
```

然后重新安装：

```bat
python -m pip install -r backend/requirements.txt
```

部分科学计算依赖如 `pypsa`、`highspy`、`pandas` 可能安装较慢，耐心等一下。

## 八、快速验证

启动成功后，按顺序检查：

1. 打开 `http://localhost:6001/docs`，确认接口文档能显示。
2. 打开 `http://localhost:6001/api/health`，确认后端健康检查正常。
3. 打开 `http://localhost:6001/`，确认前端页面能进入。
4. 在页面中走一遍方案配置流程，确认能生成结果。

## 九、补充说明

这个项目是售前演示和方案测算项目，重点是让业务人员能够快速生成微电网方案，不是单纯的代码样例。交付或演示前，建议提前完成：

- 前端重新构建。
- 后端接口启动检查。
- Pelias 地理编码服务检查。
- 产品价格和设备参数检查。
- 报告导出流程检查。
