-- 创建访谈链接表
CREATE TABLE IF NOT EXISTS public.interview_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    interviewer_name TEXT, -- 预填的访谈者姓名
    link_code TEXT UNIQUE NOT NULL, -- 短链接代码
    expires_at TIMESTAMPTZ, -- 过期时间（可选）
    max_uses INTEGER DEFAULT 0, -- 最大使用次数，0表示无限
    use_count INTEGER DEFAULT 0, -- 已使用次数
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT DEFAULT 'admin'
);

-- 创建链接访问统计表
CREATE TABLE IF NOT EXISTS public.link_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID REFERENCES public.interview_links(id) ON DELETE CASCADE,
    session_id TEXT, -- 关联的访谈会话ID
    visited_at TIMESTAMPTZ DEFAULT now(),
    completed BOOLEAN DEFAULT false, -- 是否完成访谈
    completed_at TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_interview_links_company ON public.interview_links(company_name);
CREATE INDEX IF NOT EXISTS idx_interview_links_code ON public.interview_links(link_code);
CREATE INDEX IF NOT EXISTS idx_link_visits_link_id ON public.link_visits(link_id);

-- 启用 RLS
ALTER TABLE public.interview_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_visits ENABLE ROW LEVEL SECURITY;

-- 创建策略允许服务角色访问
CREATE POLICY "Service role can manage interview_links" ON public.interview_links
    FOR ALL USING (true);

CREATE POLICY "Service role can manage link_visits" ON public.link_visits
    FOR ALL USING (true);

