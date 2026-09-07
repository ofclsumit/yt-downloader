"""
Utility to strip and optimize browser cookies for YouTube yt-dlp deployment.
Reduces 100KB+ raw browser cookie dumps down to ~1-2KB of YouTube-only cookies,
preventing Linux ARG_MAX ('argument list too long') errors on Render and Docker.
"""
import sys
import os
import base64
import json
from pathlib import Path

def strip_youtube_cookies(input_path: str, output_path: str = "youtube_cookies.txt"):
    in_file = Path(input_path)
    if not in_file.exists():
        print(f"Error: File '{input_path}' not found.")
        sys.exit(1)

    raw_text = in_file.read_text(encoding="utf-8", errors="ignore").strip()
    original_size = len(raw_text.encode("utf-8"))

    youtube_lines = ["# Netscape HTTP Cookie File", "# Filtered for YouTube only"]

    # Support JSON cookies (e.g. Cookie-Editor extension)
    if raw_text.startswith("[") and raw_text.endswith("]"):
        try:
            cookie_list = json.loads(raw_text)
            for c in cookie_list:
                dom = c.get("domain", "")
                if "youtube.com" in dom or "google.com" in dom:
                    sub = "TRUE" if dom.startswith(".") else "FALSE"
                    p = c.get("path", "/")
                    sec = "TRUE" if c.get("secure", True) else "FALSE"
                    exp = str(int(c.get("expirationDate") or c.get("expires") or 2147483647))
                    name = c.get("name", "")
                    v = c.get("value", "")
                    youtube_lines.append(f"{dom}\t{sub}\t{p}\t{sec}\t{exp}\t{name}\t{v}")
        except Exception as e:
            print(f"Failed to parse JSON cookies: {e}")
    else:
        # Netscape / Mozilla format
        for line in raw_text.splitlines():
            line_str = line.strip()
            if not line_str or line_str.startswith("#"):
                continue
            parts = line_str.split("\t")
            if len(parts) >= 6:
                domain = parts[0]
                if "youtube.com" in domain:
                    youtube_lines.append(line_str)

    clean_content = "\n".join(youtube_lines) + "\n"
    clean_size = len(clean_content.encode("utf-8"))

    # Save clean file
    out_file = Path(output_path)
    out_file.write_text(clean_content, encoding="utf-8")

    # Generate Base64
    b64_val = base64.b64encode(clean_content.encode("utf-8")).decode("ascii")

    print("=" * 60)
    print("YOUTUBE COOKIE STRIPPER RESULT:")
    print(f"  Original size:     {original_size / 1024:.1f} KB ({original_size} bytes)")
    print(f"  Stripped size:     {clean_size / 1024:.1f} KB ({clean_size} bytes)")
    print(f"  Reduction:         {((original_size - clean_size) / original_size) * 100:.1f}% smaller!")
    print(f"  Saved clean file:  {out_file.resolve()}")
    print("=" * 60)
    print("\nDEPLOYMENT INSTRUCTIONS FOR RENDER:")
    print("Option 1 (RECOMMENDED - Render Secret File):")
    print("  1. In Render Dashboard -> Your Worker -> Environment -> 'Secret Files'")
    print("  2. Add Secret File: 'cookies.txt'")
    print(f"  3. Paste the contents of: {out_file.name}")
    print("\nOption 2 (Render Environment Variable - B64):")
    print("  Set environment variable YTDLP_COOKIES_B64 to:")
    print(f"  {b64_val}")
    print("=" * 60)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/strip_cookies.py <path_to_cookies.txt>")
        sys.exit(1)
    strip_youtube_cookies(sys.argv[1])
