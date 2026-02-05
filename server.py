"""
Beacon Platform - Local Development Server with Publish Button
Run: python server.py
Then open: http://localhost:8080
"""

import http.server
import socketserver
import subprocess
import json
import os
from urllib.parse import urlparse

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class BeaconHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        if self.path == '/publish':
            self.handle_publish()
        else:
            self.send_error(404)

    def do_GET(self):
        # Inject publish button into HTML pages when served locally
        if self.path == '/' or self.path.endswith('.html'):
            self.serve_with_publish_button()
        else:
            super().do_GET()

    def serve_with_publish_button(self):
        # Determine file path
        if self.path == '/':
            filepath = os.path.join(DIRECTORY, 'index.html')
        else:
            filepath = os.path.join(DIRECTORY, self.path.lstrip('/'))

        if not os.path.exists(filepath):
            self.send_error(404)
            return

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Inject publish button before </body>
        publish_widget = '''
<!-- LOCAL DEV: Publish Button (not visible on GitHub Pages) -->
<div id="beacon-publish-widget" style="
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 99999;
    font-family: system-ui, sans-serif;
">
    <button onclick="beaconPublish()" id="beacon-publish-btn" style="
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        transition: all 0.2s;
    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        Publish
    </button>
    <div id="beacon-publish-status" style="
        margin-top: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        display: none;
    "></div>
</div>
<script>
async function beaconPublish() {
    const btn = document.getElementById('beacon-publish-btn');
    const status = document.getElementById('beacon-publish-status');

    btn.disabled = true;
    btn.textContent = 'Publishing...';
    btn.style.background = '#6b7280';

    status.style.display = 'block';
    status.style.background = '#fef3c7';
    status.style.color = '#92400e';
    status.textContent = 'Pushing to GitHub...';

    try {
        const response = await fetch('/publish', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            status.style.background = '#d1fae5';
            status.style.color = '#065f46';
            status.innerHTML = 'Published! Live in ~60s<br><a href="https://naharpt.github.io/beacon-platform/" target="_blank" style="color:#059669">View live site</a>';
        } else {
            status.style.background = '#fee2e2';
            status.style.color = '#991b1b';
            status.textContent = result.message || 'Publish failed';
        }
    } catch (err) {
        status.style.background = '#fee2e2';
        status.style.color = '#991b1b';
        status.textContent = 'Error: ' + err.message;
    }

    btn.disabled = false;
    btn.textContent = 'Publish';
    btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

    setTimeout(() => { status.style.display = 'none'; }, 5000);
}
</script>
'''

        # Inject before </body>
        if '</body>' in content:
            content = content.replace('</body>', publish_widget + '</body>')
        else:
            content += publish_widget

        # Send response
        self.send_response(200)
        self.send_header('Content-type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', len(content.encode('utf-8')))
        self.end_headers()
        self.wfile.write(content.encode('utf-8'))

    def handle_publish(self):
        os.chdir(DIRECTORY)

        # Check for changes
        result = subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True)

        if not result.stdout.strip():
            self.send_json({'success': False, 'message': 'No changes to publish'})
            return

        try:
            # Git add, commit, push
            subprocess.run(['git', 'add', '-A'], check=True, capture_output=True)

            from datetime import datetime
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
            subprocess.run(['git', 'commit', '-m', f'Update {timestamp}'], check=True, capture_output=True)

            subprocess.run(['git', 'push'], check=True, capture_output=True)

            self.send_json({'success': True, 'message': 'Published successfully'})
        except subprocess.CalledProcessError as e:
            self.send_json({'success': False, 'message': f'Git error: {e.stderr if hasattr(e, "stderr") else str(e)}'})

    def send_json(self, data):
        response = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Content-Length', len(response))
        self.end_headers()
        self.wfile.write(response)

print(f"Beacon Platform - Local Dev Server")
print(f"=" * 40)
print(f"Open: http://localhost:{PORT}")
print(f"Edit files, then click the green Publish button!")
print(f"Press Ctrl+C to stop")
print(f"=" * 40)

with socketserver.TCPServer(("", PORT), BeaconHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
