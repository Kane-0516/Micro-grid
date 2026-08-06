# ============================================================
# Backend Dockerfile — FastAPI + PyPSA
# ============================================================
FROM python:3.11-slim

# 系统依赖（HiGHS 求解器 & numpy 编译依赖）
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ libffi-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /backend

# 先复制依赖文件，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码和产品配置
COPY app/       ./app/
COPY products.yaml .
COPY .private/  ./.private/

# 暴露端口
EXPOSE 6001

# 启动命令（从 backend/ 目录运行，确保 PRODUCTS_YAML 路径正确）
CMD ["python", "app/main.py"]
