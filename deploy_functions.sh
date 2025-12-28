#!/bin/bash

# Edge Functions 部署脚本
# 使用 Supabase CLI 部署更新的 Edge Functions

echo "========================================="
echo "🚀 部署 Edge Functions"
echo "========================================="
echo ""

# 检查 Supabase CLI 是否安装
if ! command -v supabase &> /dev/null; then
    echo "❌ 错误: 未安装 Supabase CLI"
    echo ""
    echo "安装方法:"
    echo "brew install supabase/tap/supabase"
    echo ""
    echo "或访问: https://supabase.com/docs/guides/cli"
    exit 1
fi

echo "✅ Supabase CLI 已安装"
echo ""

# 检查是否已链接项目
if [ ! -f ".supabase/config.toml" ] && [ ! -f "supabase/.temp/project-ref" ]; then
    echo "⚠️  项目未链接，正在链接..."
    echo ""
    supabase link --project-ref xvtgrzavwqesdfcifyrq
    
    if [ $? -ne 0 ]; then
        echo "❌ 链接项目失败"
        exit 1
    fi
fi

echo "✅ 项目已链接: xvtgrzavwqesdfcifyrq"
echo ""

# 部署更新的 Edge Functions
echo "📦 部署 Edge Function: admin-links"
supabase functions deploy admin-links

echo ""
echo "📦 部署 Edge Function: batch-links"
supabase functions deploy batch-links

echo ""
echo "📦 部署 Edge Function: verify-link"
supabase functions deploy verify-link

echo ""
echo "📦 部署 Edge Function: interview-create"
supabase functions deploy interview-create

echo ""
echo "========================================="
echo "✅ 部署完成！"
echo "========================================="
echo ""
echo "现在可以运行测试脚本:"
echo "./test_api_update.sh"

