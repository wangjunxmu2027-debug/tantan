#!/bin/bash

# 测试脚本 - 验证调研主题功能更新
# 使用方法: ./test_api_update.sh

API_URL="https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1"
ADMIN_PASSWORD="tantan2024"

echo "========================================="
echo "🧪 测试调研主题功能更新"
echo "========================================="
echo ""

# 测试 1: 创建白皮书调研链接（无公司）
echo "📝 测试 1: 创建白皮书调研链接（无公司）"
echo "-----------------------------------------"
RESPONSE=$(curl -s -X POST "${API_URL}/admin-links" \
  -H "Content-Type: application/json" \
  -H "x-admin-password: ${ADMIN_PASSWORD}" \
  -d '{
    "theme": "白皮书调研",
    "company_name": null,
    "interviewer_name": "张总",
    "purpose": "了解行业需求",
    "expires_hours": 168,
    "voice": "xinwen",
    "sync_to_feishu": false,
    "base_url": "https://tantan.airdemo.cn"
  }')

echo "响应: ${RESPONSE}"
echo ""

# 提取 link_code
LINK_CODE_1=$(echo $RESPONSE | grep -o '"link_code":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$LINK_CODE_1" ]; then
  echo "✅ 测试 1 通过: 链接代码 = ${LINK_CODE_1}"
  echo ""
  
  # 测试链接验证
  echo "📝 测试 1.1: 验证链接并检查 theme 字段"
  echo "-----------------------------------------"
  VERIFY_RESPONSE=$(curl -s -X POST "${API_URL}/verify-link" \
    -H "Content-Type: application/json" \
    -d "{\"link_code\": \"${LINK_CODE_1}\"}")
  
  echo "验证响应: ${VERIFY_RESPONSE}"
  
  # 检查是否包含 theme 字段
  if echo "$VERIFY_RESPONSE" | grep -q '"theme"'; then
    echo "✅ 测试 1.1 通过: theme 字段已返回"
  else
    echo "❌ 测试 1.1 失败: 未找到 theme 字段"
  fi
else
  echo "❌ 测试 1 失败: 无法创建链接"
fi

echo ""
echo ""

# 测试 2: 创建公司调研链接
echo "📝 测试 2: 创建公司调研链接（有公司）"
echo "-----------------------------------------"
RESPONSE2=$(curl -s -X POST "${API_URL}/admin-links" \
  -H "Content-Type: application/json" \
  -H "x-admin-password: ${ADMIN_PASSWORD}" \
  -d '{
    "theme": "小米公司需求调研",
    "company_name": "小米",
    "interviewer_name": "李总",
    "purpose": "CRM系统需求分析",
    "expires_hours": 168,
    "voice": "xinwen",
    "sync_to_feishu": false,
    "base_url": "https://tantan.airdemo.cn"
  }')

echo "响应: ${RESPONSE2}"
echo ""

LINK_CODE_2=$(echo $RESPONSE2 | grep -o '"link_code":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$LINK_CODE_2" ]; then
  echo "✅ 测试 2 通过: 链接代码 = ${LINK_CODE_2}"
  
  # 测试链接验证
  echo ""
  echo "📝 测试 2.1: 验证链接"
  echo "-----------------------------------------"
  VERIFY_RESPONSE2=$(curl -s -X POST "${API_URL}/verify-link" \
    -H "Content-Type: application/json" \
    -d "{\"link_code\": \"${LINK_CODE_2}\"}")
  
  echo "验证响应: ${VERIFY_RESPONSE2}"
  
  # 检查 theme 和 company_name
  if echo "$VERIFY_RESPONSE2" | grep -q '"theme":"小米公司需求调研"'; then
    echo "✅ 测试 2.1 通过: theme 正确"
  else
    echo "❌ 测试 2.1 失败: theme 不正确"
  fi
  
  if echo "$VERIFY_RESPONSE2" | grep -q '"company_name":"小米"'; then
    echo "✅ 测试 2.2 通过: company_name 正确"
  else
    echo "❌ 测试 2.2 失败: company_name 不正确"
  fi
else
  echo "❌ 测试 2 失败: 无法创建链接"
fi

echo ""
echo ""

# 测试 3: 测试只有主题的链接（自定义主题）
echo "📝 测试 3: 创建自定义主题链接"
echo "-----------------------------------------"
RESPONSE3=$(curl -s -X POST "${API_URL}/admin-links" \
  -H "Content-Type: application/json" \
  -H "x-admin-password: ${ADMIN_PASSWORD}" \
  -d '{
    "theme": "市场调研",
    "company_name": null,
    "interviewer_name": null,
    "purpose": null,
    "expires_hours": 24,
    "voice": "xinwen",
    "sync_to_feishu": false,
    "base_url": "https://tantan.airdemo.cn"
  }')

echo "响应: ${RESPONSE3}"
echo ""

LINK_CODE_3=$(echo $RESPONSE3 | grep -o '"link_code":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$LINK_CODE_3" ]; then
  echo "✅ 测试 3 通过: 链接代码 = ${LINK_CODE_3}"
else
  echo "❌ 测试 3 失败: 无法创建链接"
fi

echo ""
echo ""

# 测试 4: 测试缺少 theme 的情况（应该返回错误）
echo "📝 测试 4: 测试缺少 theme（应该失败）"
echo "-----------------------------------------"
RESPONSE4=$(curl -s -X POST "${API_URL}/admin-links" \
  -H "Content-Type: application/json" \
  -H "x-admin-password: ${ADMIN_PASSWORD}" \
  -d '{
    "company_name": "测试公司",
    "interviewer_name": "王总",
    "expires_hours": 168
  }')

echo "响应: ${RESPONSE4}"

if echo "$RESPONSE4" | grep -q "缺少调研主题"; then
  echo "✅ 测试 4 通过: 正确返回错误信息"
else
  echo "❌ 测试 4 失败: 应该返回错误"
fi

echo ""
echo ""
echo "========================================="
echo "🎉 测试完成！"
echo "========================================="
echo ""
echo "生成的测试链接："
[ ! -z "$LINK_CODE_1" ] && echo "1. 白皮书调研: https://tantan.airdemo.cn/i/${LINK_CODE_1}"
[ ! -z "$LINK_CODE_2" ] && echo "2. 公司调研: https://tantan.airdemo.cn/i/${LINK_CODE_2}"
[ ! -z "$LINK_CODE_3" ] && echo "3. 市场调研: https://tantan.airdemo.cn/i/${LINK_CODE_3}"
echo ""
echo "请在浏览器中访问这些链接进行端到端测试！"

