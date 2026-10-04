#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

usage() {
  cat <<'EOF'
用法：bash release.sh [--no-release]

默认：检查、测试、打包、验证后，通过 gh 发布版本说明及百度、夸克网盘地址。
ZIP/ZXP 安装包仅保存在本地，不上传到 GitHub Release。
--no-release  只验证并生成本地安装包和发布说明，不访问 GitHub。

发布前请提交并推送本次版本的代码，运行 gh auth login 登录 GitHub。
EOF
}

publish=true
while (($#)); do
  case "$1" in
    --no-release) publish=false ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 1 ;;
  esac
  shift
done

for tool in node pnpm; do
  command -v "$tool" >/dev/null || { printf '缺少命令：%s\n' "$tool" >&2; exit 1; }
done

version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'package.json 版本号无效：%s\n' "$version" >&2
  exit 1
fi
tag="v$version"
packages=("dist/zxp/illustrator_sci_toolbox_v$version.zxp" "dist/zxp/illustrator_sci_toolbox_v$version.zip")

if "$publish"; then
  for tool in git gh; do
    command -v "$tool" >/dev/null || { printf '缺少命令：%s\n' "$tool" >&2; exit 1; }
  done
  gh auth status
  origin=$(git remote get-url origin)
  repo=$(gh repo view "$origin" --json nameWithOwner --jq '.nameWithOwner')
  commit=$(git rev-parse HEAD)
  # GitHub must know the commit before it can create the release tag.
  gh api "repos/$repo/commits/$commit" --jq '.sha' >/dev/null
fi

pnpm release:notes "$tag"
pnpm test
pnpm zxp
pnpm verify:package
for package in "${packages[@]}"; do
  [[ -s "$package" ]] || { printf '安装包不存在或为空：%s\n' "$package" >&2; exit 1; }
done

if ! "$publish"; then
  printf '本地打包完成：%s（未发布）\n' "$tag"
  exit 0
fi

# Listing must succeed: authentication/network errors must not mean "not found".
release_tags=$(gh api --paginate "repos/$repo/releases?per_page=100" --jq '.[].tag_name')
if [[ $'\n'"$release_tags"$'\n' == *$'\n'"$tag"$'\n'* ]]; then
  gh release edit "$tag" --repo "$repo" --title "$tag" --notes-file release-notes.md
else
  gh release create "$tag" --repo "$repo" --target "$commit" \
    --title "$tag" --notes-file release-notes.md
fi
gh release view "$tag" --repo "$repo" --json url --jq '.url'
