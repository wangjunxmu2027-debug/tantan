# 部署指南 - 调研主题功能更新

## 📋 本次更新内容

### 功能变更
- ✅ **调研主题改为必填**（第一个字段）
- ✅ **公司名称改为可选**
- ✅ 支持多种调研场景：公司调研、白皮书调研、市场调研、需求分析等
- ✅ 优化问题库加载逻辑，支持按主题查询

### 修改的文件
1. **数据库迁移**
   - `supabase/migrations/20251226_update_links_schema.sql`

2. **后端 Edge Functions**
   - `supabase/functions/admin-links/index.ts`
   - `supabase/functions/batch-links/index.ts`
   - `supabase/functions/verify-link/index.ts`
   - `supabase/functions/interview-create/index.ts`
   - `supabase/functions/_shared/feishu.ts`

3. **前端**
   - `frontend/src/components/CreateLinkModal.tsx`
   - `frontend/src/app/i/[code]/page.tsx`

---

## 🚀 部署步骤

### 1. 数据库迁移

#### 方式 1：使用 Supabase Dashboard（推荐）

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 进入项目 → SQL Editor
3. 复制 `supabase/migrations/20251226_update_links_schema.sql` 的内容
4. 粘贴并执行 SQL

#### 方式 2：使用 Supabase CLI

```bash
# 连接到项目
supabase link --project-ref your-project-ref

# 应用迁移
supabase db push
```

#### 方式 3：手动执行 SQL

在 Supabase SQL Editor 中依次执行：

```sql
-- 1. 将 company_name 改为可选
ALTER TABLE public.interview_links 
ALTER COLUMN company_name DROP NOT NULL;

-- 2. 添加 purpose 字段（如果还没有）
ALTER TABLE public.interview_links 
ADD COLUMN IF NOT EXISTS purpose TEXT;

-- 3. 添加 voice 字段（如果还没有）
ALTER TABLE public.interview_links 
ADD COLUMN IF NOT EXISTS voice TEXT DEFAULT 'xinwen';

-- 4. 添加索引
CREATE INDEX IF NOT EXISTS idx_interview_links_purpose ON public.interview_links(purpose);
CREATE INDEX IF NOT EXISTS idx_interview_links_voice ON public.interview_links(voice);

-- 5. 更新注释
COMMENT ON COLUMN public.interview_links.theme IS '调研主题（必填）：如公司调研、白皮书调研、市场调研等';
COMMENT ON COLUMN public.interview_links.company_name IS '公司名称（可选）：具体调研的公司名称';
COMMENT ON COLUMN public.interview_links.interviewer_name IS '访谈者姓名（可选）：预设的访谈者姓名';
COMMENT ON COLUMN public.interview_links.purpose IS '本次访谈目的（可选）：访谈的具体目的描述';
COMMENT ON COLUMN public.interview_links.voice IS '音色设置：访谈使用的AI音色ID';
```

### 2. 部署 Edge Functions

```bash
# 部署单个函数（如果需要）
supabase functions deploy admin-links
supabase functions deploy batch-links
supabase functions deploy verify-link
supabase functions deploy interview-create

# 或部署所有函数
supabase functions deploy
```

### 3. 部署前端

```bash
cd frontend

# 安装依赖（如需要）
npm install

# 构建
npm run build

# 部署到 Vercel
vercel --prod
```

---

## ✅ 测试清单

### 1. 数据库测试

```sql
-- 验证 schema 修改
SELECT column_name, is_nullable, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'interview_links'
ORDER BY ordinal_position;

-- 应该看到：
-- company_name: is_nullable = YES
-- theme: 已存在
-- purpose: 已存在
-- voice: 已存在，默认值 'xinwen'
```

### 2. 功能测试

#### 测试场景 1：白皮书调研（无公司）
1. 打开前端创建链接页面
2. 选择主题："白皮书调研"
3. 公司名称：留空
4. 创建链接
5. 访问链接，验证欢迎消息

#### 测试场景 2：公司调研
1. 选择主题："公司调研" 或自定义："小米公司需求调研"
2. 选择公司："小米"
3. 创建链接
4. 访问链接，验证欢迎消息包含公司名

#### 测试场景 3：自定义主题
1. 点击"自定义主题"
2. 输入主题名称
3. 选择或不选公司
4. 创建链接并验证

### 3. API 测试

#### 测试创建链接 API

```bash
curl -X POST https://your-project.supabase.co/functions/v1/admin-links \
  -H "Content-Type: application/json" \
  -H "x-admin-password: tantan2024" \
  -d '{
    "theme": "白皮书调研",
    "company_name": null,
    "interviewer_name": "张总",
    "purpose": "了解行业需求",
    "expires_hours": 168,
    "voice": "xinwen",
    "sync_to_feishu": true
  }'
```

#### 测试链接验证 API

```bash
curl -X POST https://your-project.supabase.co/functions/v1/verify-link \
  -H "Content-Type: application/json" \
  -d '{
    "link_code": "your-link-code"
  }'

# 响应应包含：
# {
#   "valid": true,
#   "theme": "白皮书调研",
#   "company_name": null,
#   ...
# }
```

---

## 🔧 飞书多维表格配置

确保飞书多维表格包含以下字段：

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 调研主题 | 文本 | 是 | 调研的主题名称 |
| 公司名称 | 文本 | 否 | 具体公司名称（可为空）|
| 访谈者 | 文本 | 否 | 访谈者姓名 |
| 本次访谈目的 | 文本 | 否 | 访谈目的描述 |
| 访谈链接 | 文本/链接 | 是 | 访谈链接 URL |

---

## 📊 数据兼容性

### 现有数据
- ✅ 现有的 `interview_links` 记录不受影响
- ✅ `theme` 字段默认为 "公司调研"（已在之前的迁移中添加）
- ✅ `company_name` 可以为 NULL

### 向后兼容
- ✅ 支持老的访谈链接
- ✅ API 向后兼容
- ✅ 前端优雅处理空值

---

## 🐛 故障排查

### 问题 1：创建链接失败，提示"缺少调研主题"

**原因**：前端未传递 `theme` 字段

**解决**：
1. 清除浏览器缓存
2. 重新部署前端
3. 确保前端版本最新

### 问题 2：链接访问时显示异常

**检查**：
1. 验证 `verify-link` 函数是否返回 `theme` 字段
2. 检查 sessionStorage 是否正确存储
3. 查看浏览器控制台错误

### 问题 3：问题库加载失败

**检查**：
1. Supabase `questions_cache` 表是否存在
2. 飞书 API 配置是否正确
3. 查看 Edge Function 日志

---

## 📝 回滚方案

如果需要回滚到旧版本：

```sql
-- 恢复 company_name 为必填
ALTER TABLE public.interview_links 
ALTER COLUMN company_name SET NOT NULL;

-- 注意：回滚前需要确保所有记录的 company_name 不为 NULL
UPDATE public.interview_links 
SET company_name = '未指定' 
WHERE company_name IS NULL;
```

然后重新部署旧版本的代码。

---

## 📞 支持

如有问题，请检查：
1. Supabase Edge Function 日志
2. 浏览器控制台日志
3. 数据库表结构

---

**部署时间**: 2024-12-26
**版本**: v2.0 - 主题驱动的访谈系统

