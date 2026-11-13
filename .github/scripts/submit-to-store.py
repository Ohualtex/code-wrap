"""Upload the approved Code Wrap ZIP and request Chrome Web Store review."""

import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zipfile import ZipFile


ITEM_ID = "bfgcpcdlkncohhfgpegabmdcbgbjjilf"
API = "https://chromewebstore.googleapis.com"


def request(token, url, data=None, content_type="application/json"):
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = content_type
    try:
        with urlopen(Request(url, data=data, headers=headers), timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        raise SystemExit(f"Chrome Web Store {url.rsplit(':', 1)[-1]} returned HTTP {error.code}.") from None
    except URLError:
        raise SystemExit("Chrome Web Store connection failed. Check item status before retrying.") from None


def submit(package_path):
    token = os.environ.get("CWS_ACCESS_TOKEN")
    publisher = os.environ.get("CWS_PUBLISHER_ID")
    if not token or not publisher:
        raise SystemExit("Chrome Web Store credentials or publisher ID are missing.")

    with ZipFile(package_path) as package:
        version = json.loads(package.read("manifest.json"))["version"]
    if os.environ["GITHUB_REF_NAME"] != f"v{version}":
        raise SystemExit("The approved ZIP version does not match the release tag.")

    item = f"publishers/{quote(publisher, safe='')}/items/{ITEM_ID}"
    status_url = f"{API}/v2/{item}:fetchStatus"
    status = request(token, status_url)
    if status.get("itemId") != ITEM_ID or status.get("takenDown"):
        raise SystemExit("Could not verify the Code Wrap store item.")

    submitted = status.get("submittedItemRevisionStatus") or {}
    if submitted.get("state") in {"PENDING_REVIEW", "STAGED"}:
        raise SystemExit("A revision is already awaiting review or publication.")
    if status.get("lastAsyncUploadState") == "IN_PROGRESS":
        raise SystemExit("A previous upload is still in progress.")

    published = status.get("publishedItemRevisionStatus") or {}
    channels = published.get("distributionChannels") or []
    current_version = tuple(map(int, version.split(".")))
    if not channels or any(
        current_version <= tuple(map(int, channel["crxVersion"].split(".")))
        for channel in channels
    ):
        raise SystemExit("The ZIP version must exceed the published store version.")

    uploaded = request(
        token, f"{API}/upload/v2/{item}:upload", package_path.read_bytes(), "application/zip"
    )
    state = uploaded.get("uploadState")
    if uploaded.get("itemId") != ITEM_ID or uploaded.get("crxVersion") not in {None, version}:
        raise SystemExit("Chrome Web Store returned unexpected upload details.")

    for _ in range(30):
        if state != "IN_PROGRESS":
            break
        time.sleep(5)
        state = request(token, status_url).get("lastAsyncUploadState")

    if state != "SUCCEEDED":
        raise SystemExit("Upload was not confirmed. Check the store dashboard before retrying.")

    result = request(token, f"{API}/v2/{item}:publish", b'{"publishType":"DEFAULT_PUBLISH"}')
    if result.get("itemId") != ITEM_ID or result.get("state") not in {"PENDING_REVIEW", "PUBLISHED"}:
        raise SystemExit("Submission state was unexpected. Check the store dashboard before retrying.")
    print(f"Code Wrap {version}: {result['state']}. Approved revisions publish automatically.")


if __name__ == "__main__":
    submit(Path(sys.argv[1]))
