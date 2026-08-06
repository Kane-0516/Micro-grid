# MicroGrid 项目启动文档

本文档说明 `C:\Panskai-work\PyPSA\MicroGrid` 这个项目在本地开发和联调时应该如何启动，以及每种启动方式的适用场景、依赖关系、验证方法和常见问题。

## 1. 项目结构

仓库主要分为三部分：

- `frontend/`
  React + Vite + TypeScript 前端，默认开发端口 `5173`。
- `backend/`
  FastAPI 后端，默认端口 `6001`。
- `pelias/`
  本地地理编码服务 Pelias 的辅助脚本与说明。Pelias 默认端口 `4000`。

还有两个根目录级入口文件：

- `start-all.bat`
  推荐的开发启动脚本。会联动检查 Pelias、启动后端、再启动前端。
- `docker-compose.yml`
  用于容器化启动前后端。

## 2. 端口与服务关系

本项目默认使用以下端口：

- 前端 Vite: `http://localhost:5173`
- 后端 FastAPI: `http://127.0.0.1:6001`
- 后端 Swagger 文档: `http://127.0.0.1:6001/docs`
- Pelias 地理编码: `http://localhost:4000`

开发模式下，前端并不是直接写死请求 `6001`，而是通过 Vite 代理转发：

- 前端代码请求路径统一为 `/api/...`
- `frontend/vite.config.ts` 会把 `/api` 代理到 `http://127.0.0.1:6001`

所以：

- 浏览器访问前端时使用 `5173`
- 前端调用后端时仍然使用相对路径 `/api`
- 实际后端必须在 `6001` 端口可用

## 3. 推荐启动方式

### 3.1 方式一：完整开发联调，推荐

这是最接近项目日常开发的方式。

启动顺序：

1. 先启动 Pelias
2. 再运行根目录 `start-all.bat`

命令：

```powershell
cd C:\Panskai-work\PyPSA\MicroGrid
.\start-all.bat
```

`start-all.bat` 实际会做这些事：

1. 在 `frontend/.env.local` 写入：

```env
VITE_GEOCODER_URL=http://localhost:6001/api/geocode?limit=1
```

2. 检查 Pelias 是否已经在以下地址可用：

- `http://localhost:4000/v1/search`
- `http://localhost:4000/v1/reverse`

3. 如果 Pelias 可用，则启动后端，并注入这些环境变量：

```text
GEOCODER_DEFAULT_REGION=us
GEOCODER_API_URL=http://localhost:4000/v1/search
GEOCODER_REVERSE_API_URL=http://localhost:4000/v1/reverse
GEOCODER_API_URL_CN=http://localhost:4000/v1/search
GEOCODER_REVERSE_API_URL_CN=http://localhost:4000/v1/reverse
GEOCODER_API_URL_US=http://localhost:4000/v1/search
GEOCODER_REVERSE_API_URL_US=http://localhost:4000/v1/reverse
```

4. 轮询检查后端健康接口：

```text
http://127.0.0.1:6001/api/health
```

5. 启动前端开发服务：

```text
http://localhost:5173
```

### 3.2 这种方式适合什么

适合以下场景：

- 需要地点搜索
- 需要反向地理编码
- 需要地图点选位置后自动回填地址
- 需要完整验证地图测量、地址搜索和后端计算链路

这是你平时开发和验收时最应该使用的方式。

补充说明：当前地图排布规则已经调整为“每台光伏支架之间保留 10 英尺（3048 mm）间距”，不再按“整个场地边界整体退让 10 英尺”计算。也就是说，地图框选会保留完整场地边界，支架套数由多边形内排布结果决定。

## 4. 手动分开启动

当你需要分别调试前后端时，可以手动启动。

### 4.1 启动后端

进入后端目录：

```powershell
cd C:\Panskai-work\PyPSA\MicroGrid\backend
```

安装依赖：

```powershell
pip install -r requirements.txt
```

启动后端：

```powershell
python app/main.py
```

也可以直接双击：

```text
backend\start.bat
```

启动成功后可以访问：

- `http://localhost:6001/docs`
- `http://localhost:6001/api/health`

### 4.2 启动前端

进入前端目录：

```powershell
cd C:\Panskai-work\PyPSA\MicroGrid\frontend
```

安装依赖：

```powershell
npm install
```

启动开发服务：

```powershell
npm run dev
```

默认访问地址：

```text
http://localhost:5173
```

### 4.3 分开启动时要注意什么

如果只是分别启动前后端，而没有启动 Pelias，那么：

- 后端计算类接口仍然可以正常工作
- 前端主界面仍然可以打开
- 地图地址搜索和反向地址解析会受影响
- 中国地区部分简单城市名查询，后端有一小份本地 fallback，可以返回有限结果
- 但真正的反向地理编码仍然依赖 Pelias

所以：

- 算法调试、表单调试、非地图链路调试，可以不启 Pelias
- 地图定位、搜索、地址回填联调，必须启 Pelias

## 5. Pelias 启动说明

Pelias 不是前后端的一部分，它是单独的本地地理编码服务。

项目里已经提供了说明文件：

- `pelias/README.md`
- `docs/GEOCODER_PROXY.md`
- `docs/PELIAS_DOCKER_EXPLAINED.md`

### 5.1 Pelias 的作用

Pelias 提供两类能力：

- 正向地理编码：输入地点文本，返回经纬度
- 反向地理编码：输入经纬度，返回地址

本项目地图相关功能会通过后端代理访问 Pelias，而不是让前端直接访问 Pelias。

### 5.2 Pelias 的默认地址

- `http://localhost:4000/v1/search`
- `http://localhost:4000/v1/reverse`

### 5.3 Pelias 的 Windows 准备方式

项目当前推荐：

- Docker Desktop
- WSL2

初始化示例：

```powershell
cd C:\Panskai-work\PyPSA\MicroGrid
powershell -ExecutionPolicy Bypass -File .\pelias\setup-windows.ps1 -Region us
```

或者：

```powershell
cd C:\Panskai-work\PyPSA\MicroGrid
powershell -ExecutionPolicy Bypass -File .\pelias\setup-windows.ps1 -Region cn
```

然后在 WSL 中执行导入脚本，例如：

```bash
bash /mnt/c/Panskai-work/PyPSA/MicroGrid/pelias/run-import-us.sh
```

如果你只是使用项目，而不是维护地理数据，理解到这里就够了。真正的数据导入、重建索引、清理索引，直接看 `pelias/README.md`。

## 6. Docker 启动方式

这个仓库也支持容器化启动，但要注意：

- `docker-compose.yml` 只包含前端和后端
- 不包含 Pelias
- 所以 Docker 方案更适合没有地图搜索依赖的部署验证，或者你自己额外挂接一个独立 Pelias

启动：

```powershell
cd C:\Panskai-work\PyPSA\MicroGrid
docker compose up --build -d
```

查看日志：

```powershell
docker compose logs -f
```

停止：

```powershell
docker compose down
```

Docker 默认入口：

- 前端: `http://localhost:8081`
- 后端: `http://localhost:6001/docs`

## 7. 后端配置项

后端配置来自：

- `backend/app/core/config.py`

当前默认值如下：

```text
API_HOST=0.0.0.0
API_PORT=6001
DEBUG=false
CORS_ORIGINS=http://localhost:8081,http://localhost:5173,http://localhost:4173,http://localhost:3000
GEOCODER_API_URL=http://localhost:4000/v1/search
GEOCODER_REVERSE_API_URL=http://localhost:4000/v1/reverse
GEOCODER_DEFAULT_REGION=us
```

如果你需要手动覆盖，可以在启动前先设置环境变量。

例如：

```powershell
$env:DEBUG='true'
$env:API_PORT='6001'
$env:GEOCODER_DEFAULT_REGION='cn'
python app/main.py
```

## 8. 前端配置项

前端当前主要依赖：

- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/.env.local`

开发环境里最关键的是：

- Vite 监听 `5173`
- `/api` 代理到 `http://127.0.0.1:6001`
- `start-all.bat` 会自动生成 `frontend/.env.local`

如果你需要手写 `.env.local`，至少可以放：

```env
VITE_GEOCODER_URL=http://localhost:6001/api/geocode?limit=1
```

## 9. 快速验证方法

启动完成后，建议按下面顺序验证。

### 9.1 验证后端

打开：

```text
http://localhost:6001/api/health
```

正常返回类似：

```json
{"status":"ok","version":"2.0.0"}
```

### 9.2 验证前端

打开：

```text
http://localhost:5173
```

如果首页正常打开，说明前端服务正常。

### 9.3 验证前后端联通

打开前端后，检查以下功能是否可用：

- 产品列表能正常加载
- 优化或计算不会立刻报 API unavailable
- 结果页可以获取返回结果

### 9.4 验证地理编码

浏览器或接口工具访问：

```text
http://localhost:6001/api/geocode?q=1600+Pennsylvania+Ave+NW&country_code=us
```

反向地理编码：

```text
http://localhost:6001/api/reverse-geocode?lat=38.897473&lon=-77.036551&country_code=us
```

如果这两条正常，说明 Pelias 代理链路正常。

## 10. 停止服务

### 10.1 手动启动的前端或后端

如果你是在当前终端里直接运行：

- `npm run dev`
- `python app/main.py`

那么直接在对应窗口按 `Ctrl + C` 即可。

### 10.2 通过 `start-all.bat` 启动

`start-all.bat` 会前台占住前端窗口，后端在后台启动。

常规做法：

1. 在 `start-all.bat` 的窗口里按 `Ctrl + C` 结束前端
2. 如果后端还在后台，可关闭对应命令行窗口，或结束监听 `6001` 的 Python 进程

### 10.3 Docker

```powershell
docker compose down
```

## 11. 常见问题

### 11.1 前端能打开，但很多接口报 API unavailable

原因通常是后端没启动，或者前端代理目标 `6001` 没通。

检查：

```text
http://localhost:6001/api/health
```

### 11.2 地图能打开，但地址搜索失败

通常是 Pelias 没启动，或者数据没导入完成。

检查：

- `http://localhost:4000/v1/search?text=test&size=1`
- `http://localhost:4000/v1/reverse?point.lat=39.9&point.lon=116.4&size=1`

### 11.3 `start-all.bat` 一启动就提示 Pelias 不可用

这是脚本的预期行为。它会先检查 `4000` 端口的 Pelias，再决定是否继续。

要么：

- 先把 Pelias 起好

要么：

- 不用 `start-all.bat`
- 改成手动分别启动前后端

### 11.4 前端修改后仍然看到旧报错

这通常是 Vite 缓存或旧 dev server 没退出。

可按以下顺序处理：

1. 停掉当前 `npm run dev`
2. 删除 `frontend/node_modules/.vite`
3. 重新执行 `npm run dev`
4. 浏览器强制刷新

### 11.5 只想做后端接口调试，不想启前端

可以，只启动后端：

```powershell
cd C:\Panskai-work\PyPSA\MicroGrid\backend
python app/main.py
```

然后直接使用：

- Swagger: `http://localhost:6001/docs`
- 健康检查: `http://localhost:6001/api/health`

## 12. 推荐的日常使用方式

如果你只是正常开发这个项目，建议记住下面这套流程：

1. 需要地图搜索和地址解析时，先确保 Pelias 已启动
2. 在仓库根目录运行 `start-all.bat`
3. 浏览器打开 `http://localhost:5173`
4. 接口联调看 `http://localhost:6001/docs`
5. 前端缓存异常时，清理 `frontend/node_modules/.vite` 后重启 Vite

这就是当前仓库最贴近真实使用情况的一套启动方式。