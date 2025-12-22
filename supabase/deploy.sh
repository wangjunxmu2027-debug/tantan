#!/bin/bash

# Supabase Edge Functions 部署脚本
# 使用方法: ./deploy.sh <SUPABASE_ACCESS_TOKEN>

set -e

# 检查参数
if [ -z "$1" ]; then
    echo "❌ 请提供 Supabase 访问令牌"
    echo "用法: ./deploy.sh <SUPABASE_ACCESS_TOKEN>"
    echo ""
    echo "获取令牌: https://supabase.com/dashboard/account/tokens"
    exit 1
fi

export SUPABASE_ACCESS_TOKEN="$1"
PROJECT_REF="xvtgrzavwqesdfcifyrq"
SUPABASE_CLI="/tmp/supabase"

# 检查 CLI 是否存在
if [ ! -f "$SUPABASE_CLI" ]; then
    echo "📥 下载 Supabase CLI..."
    curl -L https://github.com/supabase/cli/releases/latest/download/supabase_darwin_arm64.tar.gz -o /tmp/supabase.tar.gz
    tar -xzf /tmp/supabase.tar.gz -C /tmp
    chmod +x /tmp/supabase
fi

echo "🚀 开始部署 Edge Functions 到项目: $PROJECT_REF"
echo ""

cd "$(dirname "$0")"

# 部署各个函数
FUNCTIONS=("interview-create" "interview-message" "interview-summary" "interview-status" "webhook")

for func in "${FUNCTIONS[@]}"; do
    echo "📦 部署 $func..."
    $SUPABASE_CLI functions deploy "$func" --project-ref "$PROJECT_REF" --no-verify-jwt
    echo "✅ $func 部署成功"
    echo ""
done

echo "🎉 所有函数部署完成!"
echo ""
echo "API 地址:"
echo "  - https://$PROJECT_REF.supabase.co/functions/v1/interview-create"
echo "  - https://$PROJECT_REF.supabase.co/functions/v1/interview-message"
echo "  - https://$PROJECT_REF.supabase.co/functions/v1/interview-summary"
echo "  - https://$PROJECT_REF.supabase.co/functions/v1/interview-status"
echo "  - https://$PROJECT_REF.supabase.co/functions/v1/webhook"

