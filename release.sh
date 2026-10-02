# Change directory to the script's directory
cd "$(dirname $0)" 

# Get version from theme.json
version=v$(grep -oP '(?<="version": ")[^"]+' theme.json) 

# Commit changes
git add .
git commit -m "🔖 $version" 
git push

# 判断 tag 是否存在
if git rev-parse --quiet --verify $version >/dev/null; then
    # 删除本地仓库中的 tag
    git tag -d $version
    # 删除远程仓库中的 tag
    git push origin ":refs/tags/$version"

fi

# 创建新的 tag
git tag $version # Create a tag

# 推送新的 tag 到远程仓库
git push origin --tags 
# git archive --format zip --output ../package-$version.zip HEAD # Create a zip archive




