# Supabase Edge Functions 部署指南

## 目录结构

```
supabase/
├── functions/
│   ├── _shared/           # 共享模块
│   │   ├── cors.ts        # CORS 处理
│   │   ├── prompts.ts     # Prompt 模板
│   │   └── llm.ts         # LLM 服务
│   ├── interview-create/  # 创建会话
│   ├── interview-message/ # 发送消息（核心）
│   ├── interview-summary/ # 获取总结
│   ├── interview-status/  # 获取状态
│   └── webhook/           # 飞书 Webhook 回调
└── config.toml            # Supabase 配置
```

## 环境变量配置

在 Supabase Dashboard 中设置以下 Secrets：

```bash
# LLM API 配置
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your-openai-api-key
LLM_MODEL=gpt-4o
```

## 部署步骤

### 1. 登录 Supabase CLI

```bash
supabase login
```

### 2. 链接项目

```bash
cd /Users/bytedance/Downloads/tantan2
supabase link --project-ref xvtgrzavwqesdfcifyrq
```

### 3. 设置环境变量（Secrets）

```bash
# 设置 LLM API 密钥
supabase secrets set LLM_API_KEY=your-openai-api-key
supabase secrets set LLM_API_BASE_URL=https://api.openai.com/v1
supabase secrets set LLM_MODEL=gpt-4o
```

### 4. 部署所有函数

```bash
# 部署所有函数
supabase functions deploy interview-create --no-verify-jwt
supabase functions deploy interview-message --no-verify-jwt
supabase functions deploy interview-summary --no-verify-jwt
supabase functions deploy interview-status --no-verify-jwt
supabase functions deploy webhook --no-verify-jwt
```

### 5. 验证部署

部署后，你的边缘函数将可通过以下 URL 访问：

- `https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/interview-create`
- `https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/interview-message`
- `https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/interview-summary`
- `https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/interview-status`
- `https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/webhook`

## API 使用说明

### 创建会话

```bash
curl -X POST https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/interview-create
```

响应：
```json
{
  "session_id": "uuid",
  "welcome_message": "...",
  "stage": "collect"
}
```

### 发送消息

```bash
curl -X POST https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/interview-message \
  -H "Content-Type: application/json" \
  -d '{"session_id": "your-session-id", "content": "我是小米的王俊"}'
```

响应：
```json
{
  "reply": "...",
  "stage": "interview",
  "progress": {"current_part": 1, "current_question_index": 0, "total_parts": 3},
  "is_completed": false
}
```

### 获取状态

```bash
curl "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/interview-status?session_id=your-session-id"
```

### 获取总结

```bash
curl "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1/interview-summary?session_id=your-session-id"
```

## 前端更新

更新前端的 API 配置以使用新的边缘函数地址。

