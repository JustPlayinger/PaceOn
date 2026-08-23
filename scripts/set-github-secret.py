# 把本地 debug.keystore 存入 GitHub Actions Secret（libsodium sealed box 加密）
import base64
import json
import os
import sys
import urllib.request

from nacl.bindings import crypto_box_seal

REPO = "JustPlayinger/PaceOn"
NAME = "ANDROID_DEBUG_KEYSTORE_BASE64"
KEYSTORE = os.path.expanduser("~/.android/debug.keystore")
TOKEN = os.environ.get("GITHUB_TOKEN", "")


def req(method, url, data=None, headers=None):
    r = urllib.request.Request(
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
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())


def main():
    if not TOKEN:
        print("请设置 GITHUB_TOKEN")
        sys.exit(1)
    if not os.path.exists(KEYSTORE):
        print(f"未找到 keystore: {KEYSTORE}")
        sys.exit(1)

    pk = req("GET", f"https://api.github.com/repos/{REPO}/actions/secrets/public-key")
    pub = base64.b64decode(pk["key"])
    value = base64.b64encode(open(KEYSTORE, "rb").read()).decode()
    sealed = base64.b64encode(crypto_box_seal(value.encode(), pub)).decode()
    req(
        "PUT",
        f"https://api.github.com/repos/{REPO}/actions/secrets/{NAME}",
        data=json.dumps({"encrypted_value": sealed, "key_id": pk["key_id"]}).encode(),
        headers={"Content-Type": "application/json"},
    )
    print(f"✅ Secret {NAME} 已设置（{len(value)} 字节 base64）")


if __name__ == "__main__":
    main()
