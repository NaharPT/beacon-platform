"""Export Beacon edits from Supabase to Markdown file."""

import json
import re
from datetime import datetime
import urllib.request

SUPABASE_URL = "https://kpjslkdqprdgsbsdrouo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwanNsa2RxcHJkZ3Nic2Ryb3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNjc5MTMsImV4cCI6MjA4NTg0MzkxM30.7nqg32fwMKtEnkmUQUIvjs1MDQLcnlebloZ5a7TpVlE"

def strip_html(html):
    """Remove HTML tags and decode entities."""
    text = re.sub(r'<[^>]+>', ' ', html)
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&nbsp;', ' ').replace('&quot;', '"')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def fetch_versions():
    """Fetch all versions from Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/page_versions?select=*&order=updated_at.desc"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def export_to_markdown(versions, output_file="beacon_edits_backup.md"):
    """Export versions to markdown file."""
    lines = []
    lines.append("# Beacon Platform - Edit History Backup")
    lines.append(f"\nExported: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"\nTotal versions: {len(versions)}\n")
    lines.append("---\n")

    for v in versions:
        lines.append(f"## Version {v['version_major']}.{v['version_minor']}")
        lines.append(f"- **Updated by:** {v['updated_by']}")
        lines.append(f"- **Updated at:** {v['updated_at']}")
        lines.append(f"- **Page:** {v['page']}")
        lines.append("")

        content = v.get('content', {})
        if isinstance(content, str):
            content = json.loads(content)

        lines.append("### Edited Sections\n")

        # Group by section (extract section ID from selector)
        sections = {}
        for selector, html in content.items():
            # Extract section ID if present
            match = re.search(r'#([\w-]+)', selector)
            section = match.group(1) if match else 'other'
            if section not in sections:
                sections[section] = []
            sections[section].append((selector, html))

        for section, items in sorted(sections.items()):
            lines.append(f"#### {section}")
            for selector, html in items[:5]:  # Limit to 5 per section
                text = strip_html(html)[:200]
                if text:
                    lines.append(f"- `{selector}`: {text}...")
            if len(items) > 5:
                lines.append(f"- ... and {len(items) - 5} more edits in this section")
            lines.append("")

        lines.append("---\n")

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"Exported to {output_file}")
    return output_file

def export_latest_full(versions, output_file="beacon_current_state.json"):
    """Export the latest version's full content as JSON."""
    if versions:
        latest = versions[0]
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(latest, f, indent=2, ensure_ascii=False)
        print(f"Full state exported to {output_file}")
    return output_file

if __name__ == "__main__":
    print("Fetching versions from Supabase...")
    versions = fetch_versions()
    print(f"Found {len(versions)} versions")

    export_to_markdown(versions)
    export_latest_full(versions)

    print("\nDone! Your edits are now backed up locally.")
