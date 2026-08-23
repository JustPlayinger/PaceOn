#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键上传 APK + Windows 桌面版到 GitHub Release。

用法：
  1. 设置 GitHub token：set GITHUB_TOKEN=你的token
  2. python scripts/upload-release-asset.py

说明：
  - 默认上传到 tag v1.2.0 的 Release（可用环境变量 PACEON_RELEASE_TAG 覆盖）
  - 上传 APK + NSIS 安装器 + 便携版 EXE 三个资产
  - 幂等：同名资产已存在会先删除再上传
"""
import json
import os
import sys
import time
import urllib.request
import urllib.parse

TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
REPO = "JustPlayinger/PaceOn"
TAG = os.environ.get("PACEON_RELEASE_TAG", "v1.2.1")
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

ASSETS = [
    (os.path.join(ROOT, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"), "PaceOn-v1.2.1.apk"),
    (os.path.join(ROOT, "desktop", "release", "PaceOn Setup 1.2.1.exe"), "PaceOn-Setup-1.2.1.exe"),
    (os.path.join(ROOT, "desktop", "release", "PaceOn 1.2.1.exe"), "PaceOn-Portable-1.2.1.exe"),
]


def api(method, url, data=None, headers=None, timeout=60):
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "User-Agent": "paceon",
            "Accept": "application/vnd.github+json",
            **(headers or {}),
        },
    )
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8"))


def main():
    if not TOKEN:
        print("请先设置环境变量 GITHUB_TOKEN（你的 GitHub Personal Access Token，需 repo 权限）")
        print("  Windows: set GITHUB_TOKEN=ghp_xxx")
        print("  macOS/Linux: export GITHUB_TOKEN=ghp_xxx")
        sys.exit(1)

    rel = api("GET", f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
    print(f"Release: {rel['tag_name']}  id={rel['id']}")
    existing = {a["name"]: a["id"] for a in rel.get("assets", [])}

    for path, name in ASSETS:
        if not os.path.exists(path):
            print(f"跳过（文件不存在）：{name}")
            continue
        if name in existing:
            api("DELETE", f"https://api.github.com/repos/{REPO}/releases/assets/{existing[name]}")
            print(f"已删除旧资产 {name}")

        size = os.path.getsize(path)
        print(f"上传 {name}（{size / 1024 / 1024:.1f} MB）...")
        with open(path, "rb") as f:
            data = f.read()
        url = f"https://uploads.github.com/repos/{REPO}/releases/{rel['id']}/assets?name={urllib.parse.quote(name)}"

        for attempt in range(5):
            try:
                r = api(
                    "POST",
                    url,
                    data=data,
                    headers={"Content-Type": "application/octet-stream"},
                    timeout=3600,
                )
                print(f"✅ 上传成功：{r['name']}  state={r['state']}")
                print(f"   下载地址：{r['browser_download_url']}")
                break
            except Exception as e:
                print(f"  第 {attempt + 1} 次尝试失败：{e}")
                time.sleep(15)
        else:
            print(f"上传失败：{name}")
            sys.exit(1)

    print("全部资产上传完成。")


if __name__ == "__main__":
    main()

