#!/usr/bin/env bash
# Kiểm một URL đã deploy có THẬT là app của mình đang chạy hay không.
#
# Lý do tồn tại: một deployment fail trên Vercel vẫn trả HTTP 200 — nó serve
# trang "Deployment has failed" của chính nó ở mọi path. Nên status code không
# chứng minh gì, và "curl thấy 200" là cách dễ nhất để tự ghi sai vào scorecard.
#
# Ba điều kiện, phải đủ cả ba:
#   1. status 200
#   2. body chứa <title> của mình (trang lỗi của Vercel có title khác)
#   3. có COOP + COEP — relayer-sdk cần cross-origin isolation để nạp WASM,
#      nên thiếu hai header này thì trang mở được mà reveal không chạy. Trang
#      lỗi của Vercel không có chúng, nên đây cũng là cái bẫy bắt được nó.
#
# Dùng: scripts/check-deploy.sh https://<host>
set -uo pipefail

BASE="${1:?dùng: scripts/check-deploy.sh https://<host>}"
EXPECT_TITLE="${EXPECT_TITLE:-PayDay Pot}"
FAIL=0

for path in / /app /app/draws/current /employer /docs/known-limitations; do
  url="${BASE%/}${path}"
  headers=$(curl -sS -D- -o /tmp/_cd_body --max-time 25 "$url" 2>/dev/null)
  status=$(printf '%s' "$headers" | awk 'NR==1{print $2}')
  coop=$(printf '%s' "$headers" | grep -ci '^cross-origin-opener-policy')
  coep=$(printf '%s' "$headers" | grep -ci '^cross-origin-embedder-policy')
  title=$(grep -oE '<title>[^<]*</title>' /tmp/_cd_body 2>/dev/null | head -1)

  # Gom TẤT CẢ lý do fail, không ghi đè: khi cả title lẫn header đều sai — đúng
  # trường hợp trang lỗi của Vercel — chỉ in một lý do sẽ dẫn đi chẩn đoán sai
  # cái CÒN LẠI, và cái còn lại ở đây là "deployment này chưa bao giờ chạy".
  reasons=""
  [ "$status" = "200" ] || reasons="$reasons status=$status"
  case "$title" in *"$EXPECT_TITLE"*) ;; *) reasons="$reasons title=${title:-<none>}";; esac
  [ "$coop" -ge 1 ] || reasons="$reasons no-COOP"
  [ "$coep" -ge 1 ] || reasons="$reasons no-COEP"

  if [ -z "$reasons" ]; then
    printf '%-28s OK\n' "$path"
  else
    printf '%-28s FAIL —%s\n' "$path" "$reasons"
    FAIL=1
  fi
done

rm -f /tmp/_cd_body
if [ "$FAIL" -eq 0 ]; then echo "✓ $BASE — app thật, cross-origin isolated"; else echo "✗ $BASE — xem dòng FAIL ở trên"; fi
exit "$FAIL"
