# 部门 Python 项目编码规范（通用）

本文档为**部门级通用标准**，适用于所有 Python 项目（Web API、CLI 工具、数据处理、全栈应用等）。各项目应在 README 中说明如何落地本规范，业务相关的目录细节见项目自身的 `docs/project-layout.md`（如有）。

**检查方式**：由 `run-review.cmd` 运行 pylint / pydocstyle / ruff，结果作为外部问题导入 SonarQube。

**版本**：1.0 | **适用范围**：部门全体 Python 项目

---

## 目录

- [Python 编码规范](#python-编码规范)
- [目录结构规范](#目录结构规范)
- [Git 分支与仓库规范](#git-分支与仓库规范)
- [仓库卫生与安全规范](#仓库卫生与安全规范)
- [项目落地指南](#项目落地指南)
- [附录：项目类型目录模板](#附录项目类型目录模板)

---

## Python 编码规范

全部门 Python 代码遵循 [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)。

### 规则一览

| 规则 ID | 等级 | 说明 |
|---------|------|------|
| `PY-GOOGLE` | MAJOR | 遵循 Google Python 风格，由 pylint（Google pylintrc）检查 |
| `PY-INDENT` | MAJOR | 缩进使用 4 个空格，禁止使用 Tab |
| `PY-LINE80` | MAJOR | 每行不得超过 80 个字符 |
| `PY-DOC` | MAJOR | 注释与 docstring 遵循 Google pyguide 3.8 |
| `PY-DOC-MODULE` | MAJOR | 非测试模块文件开头必须有模块 docstring（pydocstyle D100） |
| `PY-DOC-CLASS` | MAJOR | 类必须有 docstring，公开属性用 Attributes（D101 + Google） |
| `PY-DOC-FUNC` | MAJOR | 公开函数/方法需有 docstring，使用 Args/Returns/Yields/Raises |
| `PY-DOC-FMT` | MAJOR | docstring 格式规范（D200/D205/D400） |

---

### PY-GOOGLE：遵循 Google Python 风格

- **等级**：MAJOR
- **检查工具**：pylint（Google pylintrc）、ruff

要点：

- 导入顺序：标准库 → 第三方库 → 本项目模块
- 命名：`snake_case`（函数/变量）、`PascalCase`（类）、`UPPER_SNAKE_CASE`（常量）
- 类型注解：公开 API 应标注参数与返回值类型
- 异常：捕获具体异常，避免裸 `except:`

---

### PY-INDENT：缩进使用 4 个空格

- **等级**：MAJOR

```python
# 正确
def create_record(session, record_in):
    db_obj = Model.model_validate(record_in)
    session.add(db_obj)
    return db_obj

# 错误：使用 Tab 缩进
```

---

### PY-LINE80：行宽不超过 80 字符

- **等级**：MAJOR

超出时优先使用括号换行或提取变量：

```python
# 正确
statement = (
    select(Model)
    .where(Model.owner_id == owner_id)
    .offset(skip)
    .limit(limit)
)
```

---

### PY-DOC：注释与 docstring 遵循 Google 约定

- **等级**：MAJOR
- **检查工具**：pydocstyle `--convention=google`

- 模块、类、公开函数使用 **docstring**，不用 `#` 注释替代
- 内部实现细节可用 `#` 行注释
- docstring 语言与项目一致（中文或英文均可，**同一项目内保持一致**）

---

### PY-DOC-MODULE：模块需要 docstring

- **等级**：MAJOR | **对应**：pydocstyle D100

```python
"""用户账户 CRUD 操作.

提供用户的创建、查询、更新与删除函数。
"""
```

**例外**：仅作包声明的 `__init__.py` 可只写一行摘要。

---

### PY-DOC-CLASS：类需要 docstring

- **等级**：MAJOR | **对应**：pydocstyle D101 + Google Attributes

```python
class User(BaseModel):
    """用户实体.

    Attributes:
        id: 唯一标识.
        email: 登录邮箱.
        is_active: 是否启用.
    """
```

---

### PY-DOC-FUNC：公开函数/方法需要 docstring

- **等级**：MAJOR

以下情况**必须**提供 docstring：有副作用、行为非显然、参数/返回值需说明。

```python
def create_user(*, session: Session, user_in: UserCreate) -> User:
    """创建用户.

    Args:
        session: 数据库会话.
        user_in: 创建请求体.

    Returns:
        持久化后的 User 实例.

    Raises:
        IntegrityError: 邮箱已存在时.
    """
```

---

### PY-DOC-FMT：docstring 格式规范

- **等级**：MAJOR | **对应**：D200 / D205 / D400

| 要求 | 说明 |
|------|------|
| 三引号 | 使用 `"""` |
| 首行摘要 | 不超过 80 字符，以句号结尾 |
| 多段结构 | 摘要后空一行，再写 Args/Returns 等 |

---

## 目录结构规范

### LAYOUT-REQUIRED：项目目录必须符合交付模板

- **规则 ID**：`LAYOUT-REQUIRED`
- **等级**：MAJOR

所有交付项目必须：

1. 按**职责分层**，不把源码、测试、脚本、文档混在同一层
2. 在 README 中声明项目类型及采用的目录模板（见 [附录](#附录项目类型目录模板)）
3. 新增文件放入对应层级，不得随意扁平化

### 通用分层原则（所有 Python 项目适用）

```
<project-root>/
├── <src>/              # 应用源码（名称可为 src/、app/、backend/app/）
├── tests/              # 测试，镜像源码结构
├── scripts/            # 运维/开发脚本（prestart、lint、deploy）
├── docs/               # 交付文档（禁止临时脚本，见 HYGIENE-DOC-SCRIPT）
├── pyproject.toml      # 依赖与工具配置（或 requirements.txt + 等效配置）
├── README.md           # 项目说明、快速启动
├── .gitignore
└── .env.example        # 环境变量模板（推荐）
```

### 源码内部分层（Web / 服务项目）

| 层级 | 目录名（示例） | 职责 |
|------|----------------|------|
| 入口 | `main.py` | 应用启动、中间件注册 |
| 配置 | `core/` | Settings、数据库、安全、日志 |
| 模型 | `models.py` 或 `models/` | 数据模型 / Schema |
| 数据访问 | `crud.py` 或 `repository/` | 数据库读写 |
| 业务逻辑 | `services/` | 复杂业务、算法、外部集成 |
| 接口层 | `api/routes/` | HTTP 路由（一资源一文件） |
| 迁移 | `alembic/` | 数据库版本管理（有 ORM 时） |

**数据流**：`routes → services（可选）→ crud/repository → models → DB`

### 文件命名规范（Python）

| 类型 | 规则 | 示例 |
|------|------|------|
| 模块 | `snake_case.py` | `user_service.py` |
| 路由/API | 与资源名一致，复数 | `users.py`, `orders.py` |
| 测试 | `test_<模块名>.py` | `test_users.py` |
| 类 | `PascalCase` | `User`, `OrderCreate` |
| 函数/变量 | `snake_case` | `create_user`, `get_by_id` |
| 常量 | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |

### 新增功能时的通用放置规则

```
1. models          → 定义数据结构
2. crud/repository → 数据访问
3. services        → 复杂业务（可选）
4. api/routes      → HTTP/CLI 入口
5. tests           → 与源码路径对应
6. alembic         → 模型变更后生成迁移（如有数据库）
```

### 禁止事项（通用）

| 禁止 | 正确做法 |
|------|----------|
| 测试放在源码包内 | 放项目根 `tests/`，镜像源码结构 |
| 业务脚本与 API 混放 | 脚本放 `scripts/`，业务放 `services/` |
| 所有接口写一个文件 | 按资源/模块拆分 |
| 在 `docs/` 提交 `_patch*.py`、`gen_*.py` | 放 `scripts/` 或不纳入 Git |
| 手动改自动生成代码 | 改源配置后重新生成 |

### 目录合规检查清单

- [ ] README 声明了项目类型与目录模板
- [ ] 源码、测试、脚本、文档分目录存放
- [ ] 新测试路径与源码路径对应
- [ ] 未在 `docs/` 提交临时脚本

---

## Git 分支与仓库规范

### 规则一览

| 规则 ID | 等级 | 说明 |
|---------|------|------|
| `GIT-REQUIRED-BRANCHES` | MAJOR | 必须有 main、dev、release 分支 |
| `GIT-DEV-DEFAULT` | MAJOR | 默认在 dev 上开发 |
| `GIT-NO-DEV-ON-MAIN` | MAJOR | 禁止直接在 main 上开发 |
| `GIT-BRANCH-FORMAT` | MAJOR | 分支命名格式 |
| `GIT-MAIN-LOWER` | MAJOR | 主分支名必须小写 |
| `GIT-REPO-LOWER` | MAJOR | 仓库名必须全部小写 |
| `GIT-REPO-HYPHEN` | MAJOR | 仓库名单词用横线 `-` 连接 |
| `GIT-REPO-LENGTH` | MAJOR | 仓库名不超过 5 个单词（按 `-` 分段） |

### GIT-REQUIRED-BRANCHES

| 分支 | 用途 |
|------|------|
| `main` | 生产稳定版本 |
| `dev` | 日常集成分支 |
| `release` | 发布候选 / 预发布 |

### GIT-DEV-DEFAULT / GIT-NO-DEV-ON-MAIN

- 除**第一条初始化 commit** 外，不在 `main` 上开发
- 流程：`dev` → `feature/xxx` → `dev` → `release` → `main`

### GIT-BRANCH-FORMAT

长期分支：`main` | `dev` | `release`

短期分支（kebab-case）：

```
feature/<描述>    bugfix/<描述>    refactor/<描述>
chore/<描述>      hotfix/<描述>
```

### 仓库命名

| 要求 | 正确 | 错误 |
|------|------|------|
| 小写 | `data-pipeline` | `Data-Pipeline` |
| 横线连接 | `user-service` | `user_service` |
| ≤ 5 段 | `data-pipeline-api` | `a-b-c-d-e-f-g` |

---

## 仓库卫生与安全规范

### 规则一览

| 规则 ID | 等级 | 说明 |
|---------|------|------|
| `HYGIENE-SENSITIVE-FILE` | MAJOR | 禁止提交敏感配置 |
| `HYGIENE-TRACKED-ARTIFACT` | MAJOR | 禁止提交中间产物 |
| `HYGIENE-PRESIGNED-URL` | MAJOR | 禁止提交预签名 URL |
| `HYGIENE-DOC-SCRIPT` | MAJOR | docs 下禁止开发过程脚本 |

### HYGIENE-SENSITIVE-FILE

禁止 Git 跟踪（`.env.example` 等模板除外）：

```
.env  .env.local  .env.production  .private/  credentials/  secrets/
*.pem  *.key  id_rsa
```

### HYGIENE-TRACKED-ARTIFACT

禁止：`*.bak` `*.tmp` `*.db` `*.sqlite` `*.log` `*.xlsx` `*.zip`
`__pycache__/` `dist/` `htmlcov/` `node_modules/` `.venv/`

### HYGIENE-PRESIGNED-URL

禁止提交含 `X-Amz-Credential` 或 `X-Amz-Signature` 的 URL。

### HYGIENE-DOC-SCRIPT

`docs/` 禁止：`_patch*.py` `gen_*.py` `*_temp.py`

---

## 项目落地指南

### 新项目如何采用本规范

1. 复制或引用 `docs/standards/coding-standards.md`（可放在部门模板仓库）
2. 在 README 中声明**项目类型**（见附录 A/B/C）
3. 创建 `.gitignore`、`.env.example`、`pyproject.toml`
4. 配置 `run-review.cmd` 或 CI 中的 pylint / pydocstyle / ruff
5. 如有特殊目录，新增 `docs/project-layout.md` 补充业务结构

### 本地检查命令（示例）

```bash
# 按项目实际路径调整
ruff check .
ruff format . --check
pytest -v
pydocstyle --convention=google <src_dir>
```

### 提交前检查清单（通用）

- [ ] docstring 符合 Google 格式
- [ ] 行宽 ≤ 80，缩进 4 空格
- [ ] 文件在正确目录层级
- [ ] 未提交 `.env`、日志、dump 等
- [ ] 在 `dev` 或 `feature/*` 分支开发
- [ ] 测试通过

---

## 附录：项目类型目录模板

以下为部门推荐的**三类交付模板**。项目选一种并在 README 中声明；业务模块名按实际替换。

### 附录 A：Python API 服务（FastAPI / Flask）

适用：REST API、微服务、后端单体。

```
<project-name>/
├── app/                          # 或 src/
│   ├── main.py                   # 入口
│   ├── models.py                 # 数据模型
│   ├── crud.py                   # 数据访问
│   ├── api/
│   │   ├── deps.py
│   │   ├── main.py               # 路由注册
│   │   └── routes/               # 一资源一文件
│   │       ├── login.py
│   │       └── users.py
│   ├── core/                     # config, db, security
│   ├── services/                 # [可选] 复杂业务
│   └── alembic/                  # [可选] 数据库迁移
├── tests/                        # 镜像 app/ 结构
├── scripts/                      # prestart, test, lint, format
├── pyproject.toml
├── Dockerfile                    # [可选]
├── README.md
└── docs/
```

### 附录 B：Python 包 / CLI / 库

适用：可发布 pip 包、命令行工具、算法库。

```
<project-name>/
├── src/
│   └── <package_name>/           # 包名 snake_case
│       ├── __init__.py
│       ├── cli.py                # [可选] 入口
│       ├── core/
│       └── utils/
├── tests/
│   └── test_<module>.py
├── pyproject.toml
├── README.md
└── docs/
```

### 附录 C：全栈 Web（Python 后端 + 前端）

适用：前后端分离或同仓全栈项目。

```
<project-name>/
├── backend/                      # Python API（结构同附录 A）
│   ├── app/
│   ├── tests/
│   └── scripts/
├── frontend/                     # 前端（React/Vue 等）
│   └── src/
│       ├── components/           # 按业务域拆分
│       ├── hooks/
│       ├── lib/
│       └── client/               # OpenAPI 自动生成，勿手改
├── packages/                     # [可选] 共享包
├── docs/
├── compose.yml                   # [可选] Docker
├── README.md
├── development.md
└── deployment.md
```

> **本项目** 采用附录 C。

---

## 参考

- [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)
- [pydocstyle - Google convention](http://www.pydocstyle.org/en/stable/error_codes.html)
- [FastAPI 全栈模板](https://github.com/fastapi/full-stack-fastapi-template)（附录 C 参考实现）

---

## 文档维护

| 文档 | 范围 | 维护方 |
|------|------|--------|
| `docs/standards/coding-standards.md` | 部门通用，所有 Python 项目 | 部门 / 模板仓库 |
| `docs/project-layout.md` | 单个项目的业务目录 | 项目负责人 |
| `README.md` | 单个项目说明与快速启动 | 项目负责人 |
