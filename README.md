# AI调研助手 - 探探 🔍

一个基于LLM的智能访谈Agent系统，用于进行结构化的企业调研访谈，并将结果自动保存到飞书多维表格。

![AI调研助手-探探](https://img.shields.io/badge/AI-调研助手-purple)
![Python](https://img.shields.io/badge/Python-3.9+-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)

## ✨ 功能特点

- 🎤 **智能开场**：自动开场白，收集被访者基本信息
- 🔍 **信息提取**：LLM智能提取公司名称和用户姓名
- 📋 **问题检索**：根据公司名从飞书多维表格获取定制问题
- 💬 **多轮对话**：专业的访谈式对话，支持追问和跳过
- 🎙️ **语音输入**：支持浏览器原生语音转文字
- 📊 **自动总结**：访谈结束后自动生成分析报告
- 💾 **数据保存**：自动将访谈记录保存到飞书多维表格

## 🏗️ 系统架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   前端 (Next.js) │────▶│  后端 (FastAPI)  │────▶│   飞书多维表格   │
│                 │     │                 │     │                 │
│  - 对话界面      │     │  - 状态机管理    │     │  - 调研问题表    │
│  - 语音输入      │     │  - LLM调用      │     │  - 会话记录表    │
│  - 消息展示      │     │  - 信息提取      │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │    LLM API      │
                        │  (中转/OpenAI)   │
                        └─────────────────┘
```

## 📦 项目结构

```
tantan2/
├── backend/                    # 后端服务
│   ├── app/
│   │   ├── main.py            # FastAPI入口
│   │   ├── models/            # 数据模型
│   │   ├── prompts/           # Prompt模板
│   │   ├── routers/           # API路由
│   │   └── services/          # 业务服务
│   │       ├── llm_service.py      # LLM调用
│   │       ├── bitable_service.py  # 飞书API
│   │       ├── state_service.py    # 状态管理
│   │       └── interview_controller.py  # 访谈控制器
│   ├── config.py              # 配置文件
│   ├── requirements.txt       # Python依赖
│   └── env.template           # 环境变量模板
│
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── app/               # Next.js App Router
│   │   ├── components/        # React组件
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── VoiceInput.tsx
│   │   │   └── ...
│   │   └── lib/               # 工具库
│   │       └── api.ts
│   ├── package.json
│   └── tailwind.config.ts
│
└── README.md
```

## 🚀 快速开始

### 环境要求

- Python 3.9+
- Node.js 18+
- npm 或 yarn

### 1. 配置后端

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 复制环境变量模板并填写配置
cp env.template .env
```

编辑 `.env` 文件，填写必要的配置：

```env
# LLM API 配置
LLM_API_BASE_URL=https://your-api-base-url/v1
LLM_API_KEY=your-api-key
LLM_MODEL=gpt-4o

# 飞书配置
FEISHU_APP_ID=your-feishu-app-id
FEISHU_APP_SECRET=your-feishu-app-secret

# 多维表格配置
BITABLE_APP_TOKEN=your-bitable-app-token
BITABLE_QUESTIONS_TABLE_ID=your-questions-table-id
BITABLE_RECORDS_TABLE_ID=your-records-table-id
```

### 2. 配置前端

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 配置API地址（可选，默认localhost:8000）
# 创建 .env.local 文件
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

### 3. 启动服务

**启动后端：**

```bash
cd backend
source venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000
```

**启动前端：**

```bash
cd frontend
npm run dev
```

访问 http://localhost:3000 开始使用！

## 📋 飞书多维表格配置

### 调研问题表结构

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 被调研公司名称 | 文本 | 公司核心品牌词（如：小米、字节） |
| part1 | 多行文本 | 第一部分问题（每行一个问题） |
| part2 | 多行文本 | 第二部分问题 |
| part3 | 多行文本 | 第三部分问题 |
| 提交人 | 人员 | 问题提交者 |
| 预计调研结束日期 | 日期 | 调研截止日期 |

### 会话记录表结构

| 字段名 | 类型 | 说明 |
|--------|------|------|
| ID | 文本 | 会话唯一ID |
| 用户 | 文本 | 被访者姓名 |
| 用户输入 | 文本 | 用户信息摘要 |
| 对话记录 | 多行文本 | 完整对话JSON |
| 命中技能 | 单选 | 访谈类型标签 |
| 执行状态 | 单选 | 对话成功/对话失败 |
| Token消耗 | 数字 | LLM token使用量 |
| 访谈分析 | 多行文本 | AI生成的分析报告 |

## 🔧 API文档

启动后端后，访问 http://localhost:8000/docs 查看完整的API文档。

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/interview/create | 创建新的访谈会话 |
| POST | /api/interview/message | 发送消息 |
| GET | /api/interview/{session_id}/status | 获取会话状态 |
| GET | /api/interview/{session_id}/summary | 获取访谈总结 |

## 🎨 自定义配置

### 修改开场白

编辑 `backend/app/services/interview_controller.py` 中的 `WELCOME_MESSAGE` 变量。

### 修改访谈Agent Prompt

编辑 `backend/app/prompts/interview_agent.py` 中的 Prompt 模板。

### 添加默认问题

编辑 `backend/app/services/bitable_service.py` 中的 `_get_default_questions` 方法。

## 📝 开发说明

### 后端技术栈

- **FastAPI**: Web框架
- **OpenAI Python SDK**: LLM调用
- **lark-oapi**: 飞书API SDK
- **Pydantic**: 数据验证

### 前端技术栈

- **Next.js 14**: React框架
- **TailwindCSS**: 样式
- **Framer Motion**: 动画
- **Web Speech API**: 语音识别

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

Made with ❤️ by AI调研助手团队




