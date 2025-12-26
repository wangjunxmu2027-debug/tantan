-- 修改访谈链接表，将 company_name 改为可选
-- 调研主题改为必填，公司名称、访谈者、目的均为可选

-- 1. 将 company_name 改为可选
ALTER TABLE public.interview_links 
ALTER COLUMN company_name DROP NOT NULL;

-- 2. 添加 purpose 字段（如果还没有）
ALTER TABLE public.interview_links 
ADD COLUMN IF NOT EXISTS purpose TEXT;

-- 3. 添加 voice 字段（如果还没有）
ALTER TABLE public.interview_links 
ADD COLUMN IF NOT EXISTS voice TEXT DEFAULT 'xinwen';

-- 4. 确保 theme 字段存在（已在前面的迁移中添加）
-- ALTER TABLE public.interview_links 
-- ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT '公司调研';

-- 5. 添加索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_interview_links_purpose ON public.interview_links(purpose);
CREATE INDEX IF NOT EXISTS idx_interview_links_voice ON public.interview_links(voice);

-- 6. 更新注释
COMMENT ON COLUMN public.interview_links.theme IS '调研主题（必填）：如公司调研、白皮书调研、市场调研等';
COMMENT ON COLUMN public.interview_links.company_name IS '公司名称（可选）：具体调研的公司名称';
COMMENT ON COLUMN public.interview_links.interviewer_name IS '访谈者姓名（可选）：预设的访谈者姓名';
COMMENT ON COLUMN public.interview_links.purpose IS '本次访谈目的（可选）：访谈的具体目的描述';
COMMENT ON COLUMN public.interview_links.voice IS '音色设置：访谈使用的AI音色ID';

