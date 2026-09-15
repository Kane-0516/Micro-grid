# ============================================================
# E2B sandbox template — MicroGrid as an on-demand agent tool.
#
# 方式 2（代码存 Git 仓库）：镜像里只装依赖，不打包业务代码。
# 每次调用时由 agent 在沙箱里 `git clone` 拉取最新代码再执行，
# 这样改代码只需要 `git push`，不用重新构建模板。
#
# 每次调用的完整流程：
#   1. 用这个模板创建一个沙箱
#   2. 在沙箱里 `git clone <repo> /repo`（浅克隆，秒级）
#   3. 运行 `python /repo/backend/e2b_tool.py <action> '<json>'`
#   4. 读 stdout 的那一行 JSON
#   5. 销毁沙箱（sandbox.kill()）——不留任何状态
# ============================================================
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ libffi-dev git && \
    rm -rf /var/lib/apt/lists/*

# 依赖固定在镜像里（启动快）；代码在调用时 git clone 拉取（改代码不用重建模板）。
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

WORKDIR /
