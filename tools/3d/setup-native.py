"""Install a portable Blender LTS and uv from their official release archives."""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import urllib.request
import zipfile


ROOT = Path(os.environ["LOCALAPPDATA"]) / "OskiRideTools"
DOWNLOADS = ROOT / "downloads"
HEADERS = {"User-Agent": "OskiRide-3D-Setup/1.0"}


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=90)


def text(url):
    with request(url) as response:
        return response.read().decode("utf-8")


def download(url, target):
    if target.exists():
        print(f"Using archive {target.name}", flush=True)
        return
    partial = target.with_suffix(target.suffix + ".part")
    with request(url) as response, partial.open("wb") as output:
        length = int(response.headers.get("Content-Length", 0))
        received, last_step = 0, -1
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            received += len(chunk)
            step = received // (25 * 1024 * 1024)
            if step != last_step:
                suffix = f" / {length // 1048576} MiB" if length else ""
                print(f"{target.name}: {received // 1048576} MiB{suffix}", flush=True)
                last_step = step
    partial.replace(target)


def verify(target, checksum_text):
    expected = None
    for line in checksum_text.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[-1].lstrip("*") == target.name:
            expected = parts[0].lower()
            break
        if len(parts) == 1 and re.fullmatch(r"[0-9a-fA-F]{64}", parts[0]):
            expected = parts[0].lower()
    if expected is None:
        raise RuntimeError(f"No official SHA256 for {target.name}")
    with target.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != expected:
        raise RuntimeError(f"Checksum mismatch for {target.name}")
    print(f"SHA256 verified: {target.name}", flush=True)


def extract(archive, destination, executables_only=False):
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            name = PurePosixPath(member.filename)
            if name.is_absolute() or ".." in name.parts:
                raise RuntimeError("Unsafe archive member")
            output = (destination / Path(*name.parts)).resolve()
            if not output.is_relative_to(root):
                raise RuntimeError("Archive path escaped install directory")
            if executables_only:
                if name.name not in {"uv.exe", "uvx.exe", "uvw.exe"}:
                    continue
                (destination / name.name).write_bytes(bundle.read(member))
            else:
                bundle.extract(member, destination)


def main():
    global ROOT, DOWNLOADS
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    # Packaged Windows apps redirect AppData writes. Native DLL/manifest loading
    # needs the physical path rather than the virtual AppData alias.
    ROOT = ROOT.resolve()
    DOWNLOADS = ROOT / "downloads"
    release = json.loads(text("https://api.github.com/repos/astral-sh/uv/releases/latest"))
    uv_name = "uv-x86_64-pc-windows-msvc.zip"
    assets = {item["name"]: item["browser_download_url"] for item in release["assets"]}
    uv_zip = DOWNLOADS / uv_name
    download(assets[uv_name], uv_zip)
    verify(uv_zip, text(assets[uv_name + ".sha256"]))
    uv_dir = ROOT / "uv"
    extract(uv_zip, uv_dir, executables_only=True)
    listing_url = "https://download.blender.org/release/Blender4.5/"
    listing = text(listing_url)
    candidates = set(re.findall(r"blender-4\.5\.\d+-windows-x64\.zip", listing))
    if not candidates:
        raise RuntimeError("No Windows Blender 4.5 LTS archive in the official release index")
    blender_name = max(candidates, key=lambda name: int(name.split("-")[1].split(".")[2]))
    blender_version = blender_name.split("-")[1]
    blender_zip = DOWNLOADS / blender_name
    download(listing_url + blender_name, blender_zip)
    verify(blender_zip, text(listing_url + f"blender-{blender_version}.sha256"))
    blender_dir = ROOT / "blender"
    executable = blender_dir / blender_name.removesuffix(".zip") / "blender.exe"
    if not executable.exists():
        print("Extracting Blender", flush=True)
        extract(blender_zip, blender_dir)
    result = {
        "blender": str(executable), "blenderVersion": blender_version,
        "uv": str(uv_dir / "uv.exe"), "uvVersion": release["tag_name"],
        "toolsRoot": str(ROOT), "mcpPackage": "mcp-for-blender==2.2.4",
        "mcpCommand": str(ROOT / "bin" / "mcp-for-blender.exe"),
    }
    output = Path(__file__).with_name("toolchain.local.json")
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
