/**
 * Beacon Collaborative Editing System
 * - Anyone with link can edit
 * - Version tracking (v1.0, v1.1, etc.)
 * - Full version history with revert
 * - Real-time sync across all viewers
 */

let supabase = null;
let currentVersion = { major: 1, minor: 0 };
let versionHistory = [];
let isEditMode = false;
let pageId = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

// Initialize on page load
document.addEventListener('DOMContentLoaded', initBeacon);

async function initBeacon() {
  // Check if Supabase is configured (read from window.* for ES module compatibility)
  if (typeof window.SUPABASE_URL === 'undefined' || window.SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    console.log('Beacon: Supabase not configured. See SETUP.md');
    addVersionBadge('Local Mode', 'Setup Supabase to enable collaboration');
    addEditUI();
    return;
  }

  // Initialize Supabase client (also expose globally for materials panel)
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  window.supabase = supabase;

  // Load current version and history
  await loadVersionHistory();

  // Subscribe to real-time updates
  subscribeToChanges();

  // Add edit UI
  addEditUI();
}

async function loadVersionHistory() {
  const { data, error } = await supabase
    .from('page_versions')
    .select('*')
    .eq('page', pageId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Beacon: Load error', error);
    return;
  }

  versionHistory = data || [];

  if (versionHistory.length > 0) {
    const latest = versionHistory[0];
    currentVersion = { major: latest.version_major || 1, minor: latest.version_minor || 0 };
    applyContent(latest.content);
    addVersionBadge(
      `v${currentVersion.major}.${currentVersion.minor}`,
      `by ${latest.updated_by || 'Unknown'} - ${formatTime(latest.updated_at)}`
    );
  } else {
    addVersionBadge('v1.0', 'Initial version');
  }
}

function applyContent(content) {
  if (!content) return;
  const data = typeof content === 'string' ? JSON.parse(content) : content;
  Object.entries(data).forEach(([selector, html]) => {
    try {
      const el = document.querySelector(selector);
      if (el) el.innerHTML = html;
    } catch (e) {
      // Invalid selector, skip
    }
  });
}

function subscribeToChanges() {
  supabase
    .channel('version_changes')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'page_versions', filter: `page=eq.${pageId}` },
      (payload) => {
        if (!isEditMode) {
          loadVersionHistory();
          showNotification('Page updated by ' + (payload.new.updated_by || 'someone'));
        }
      }
    )
    .subscribe();
}

function addVersionBadge(version, subtitle) {
  document.getElementById('beacon-version-badge')?.remove();

  const badge = document.createElement('div');
  badge.id = 'beacon-version-badge';
  badge.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-weight:600;font-size:14px">${version}</span>
      ${versionHistory.length > 1 ? `<button onclick="showVersionHistory()" style="
        background:rgba(255,255,255,0.2); border:none; color:white;
        padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer;
      ">History</button>` : ''}
    </div>
    <div style="font-size:11px;opacity:0.8;margin-top:2px">${subtitle}</div>
  `;
  badge.style.cssText = `
    position:fixed; top:20px; right:20px; z-index:99999;
    background:linear-gradient(135deg,#0d9488,#7c3aed); color:white;
    padding:12px 16px; border-radius:8px;
    font-family:system-ui,sans-serif;
    box-shadow:0 4px 12px rgba(15,118,110,0.3);
  `;
  document.body.appendChild(badge);
}

function showVersionHistory() {
  document.getElementById('beacon-history-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'beacon-history-panel';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="margin:0;font-size:16px;">Version History</h3>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background:none; border:none; font-size:20px; cursor:pointer; color:#64748b;
      ">&times;</button>
    </div>
    <div style="max-height:400px;overflow-y:auto;">
      ${versionHistory.map((v, i) => `
        <div style="
          padding:12px; border-radius:6px; margin-bottom:8px;
          background:${i === 0 ? '#ccfbf1' : '#f1f5f9'};
          border:1px solid ${i === 0 ? '#14b8a6' : '#e2e8f0'};
        ">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong>v${v.version_major}.${v.version_minor}</strong>
              ${i === 0 ? '<span style="background:#14b8a6;color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:8px;">CURRENT</span>' : ''}
              <div style="font-size:12px;color:#64748b;margin-top:4px;">
                by ${v.updated_by || 'Unknown'} - ${formatTime(v.updated_at)}
              </div>
            </div>
            ${i > 0 ? `<button onclick="revertToVersion(${v.id})" style="
              background:#f59e0b; color:white; border:none;
              padding:6px 12px; border-radius:4px; font-size:12px; cursor:pointer;
            ">Revert</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  panel.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    z-index:100000; background:white; padding:24px;
    border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.3);
    font-family:system-ui,sans-serif; min-width:400px; max-width:500px;
  `;
  document.body.appendChild(panel);

  // Add backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'beacon-history-backdrop';
  backdrop.onclick = () => { panel.remove(); backdrop.remove(); };
  backdrop.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99999;
  `;
  document.body.insertBefore(backdrop, panel);
}

async function revertToVersion(versionId) {
  const version = versionHistory.find(v => v.id === versionId);
  if (!version) return;

  const editorName = prompt('Your name (for revert history):', localStorage.getItem('beacon-editor') || '');
  if (!editorName) return;
  localStorage.setItem('beacon-editor', editorName);

  // Create a new version with the old content
  const newMinor = currentVersion.minor + 1;

  const { error } = await supabase
    .from('page_versions')
    .insert({
      page: pageId,
      content: version.content,
      version_major: currentVersion.major,
      version_minor: newMinor,
      updated_by: `${editorName} (reverted to v${version.version_major}.${version.version_minor})`
    });

  if (error) {
    showNotification('Revert failed!', 'error');
    return;
  }

  // Close panel and reload
  document.getElementById('beacon-history-panel')?.remove();
  document.getElementById('beacon-history-backdrop')?.remove();
  await loadVersionHistory();
  showNotification(`Reverted to v${version.version_major}.${version.version_minor}`);
}

function addEditUI() {
  const container = document.createElement('div');
  container.id = 'beacon-edit-ui';
  container.innerHTML = `
    <button id="beacon-export-btn" onclick="exportToFile()" style="
      background:linear-gradient(135deg,#f59e0b,#d97706);
      color:white; border:none; padding:12px 24px; border-radius:8px;
      font-size:14px; font-weight:600; cursor:pointer;
      box-shadow:0 4px 12px rgba(245,158,11,0.4);
      transition:transform 0.2s; margin-right:8px;
    " onmouseover="this.style.transform='scale(1.05)'"
       onmouseout="this.style.transform='scale(1)'" title="Download backup of all edits">Export</button>
    <button id="beacon-cancel-btn" onclick="cancelEdits()" style="
      background:linear-gradient(135deg,#64748b,#475569);
      color:white; border:none; padding:12px 24px; border-radius:8px;
      font-size:14px; font-weight:600; cursor:pointer;
      box-shadow:0 4px 12px rgba(100,116,139,0.4);
      transition:transform 0.2s; display:none; margin-right:8px;
    " onmouseover="this.style.transform='scale(1.05)'"
       onmouseout="this.style.transform='scale(1)'">Cancel</button>
    <button id="beacon-edit-btn" onclick="toggleEditMode()" style="
      background:linear-gradient(135deg,#14b8a6,#7c3aed);
      color:white; border:none; padding:12px 24px; border-radius:8px;
      font-size:14px; font-weight:600; cursor:pointer;
      box-shadow:0 4px 12px rgba(20,184,166,0.4);
      transition:transform 0.2s;
    " onmouseover="this.style.transform='scale(1.05)'"
       onmouseout="this.style.transform='scale(1)'">Edit</button>
  `;
  container.style.cssText = `
    position:fixed; bottom:20px; right:20px; z-index:99999;
    font-family:system-ui,sans-serif; display:flex; align-items:center;
  `;
  document.body.appendChild(container);
}

function toggleEditMode() {
  isEditMode = !isEditMode;
  const btn = document.getElementById('beacon-edit-btn');
  const cancelBtn = document.getElementById('beacon-cancel-btn');

  if (isEditMode) {
    enableEditing();
    btn.textContent = 'Save';
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
    cancelBtn.style.display = 'inline-block';
    showNotification('Edit mode ON - Click any text to edit');
  } else {
    saveChanges();
  }
}

function cancelEdits() {
  isEditMode = false;
  disableEditing();

  const btn = document.getElementById('beacon-edit-btn');
  const cancelBtn = document.getElementById('beacon-cancel-btn');

  btn.textContent = 'Edit';
  btn.style.background = 'linear-gradient(135deg,#14b8a6,#7c3aed)';
  cancelBtn.style.display = 'none';

  // Reload page to discard unsaved changes
  location.reload();
}

function addFormatToolbar() {
  document.getElementById('beacon-format-toolbar')?.remove();

  const toolbar = document.createElement('div');
  toolbar.id = 'beacon-format-toolbar';
  toolbar.innerHTML = `
    <button onclick="formatText('bold')" title="Bold (Ctrl+B)" style="
      background:none; border:1px solid #e2e8f0; padding:6px 10px;
      border-radius:4px; cursor:pointer; font-weight:bold; font-size:14px;
    ">B</button>
    <button onclick="formatText('italic')" title="Italic (Ctrl+I)" style="
      background:none; border:1px solid #e2e8f0; padding:6px 10px;
      border-radius:4px; cursor:pointer; font-style:italic; font-size:14px;
    ">I</button>
    <span style="width:1px;background:#e2e8f0;margin:0 8px;"></span>
    <button onclick="changeFontSize(-1)" title="Decrease size" style="
      background:none; border:1px solid #e2e8f0; padding:6px 10px;
      border-radius:4px; cursor:pointer; font-size:12px;
    ">A-</button>
    <button onclick="changeFontSize(1)" title="Increase size" style="
      background:none; border:1px solid #e2e8f0; padding:6px 10px;
      border-radius:4px; cursor:pointer; font-size:16px;
    ">A+</button>
  `;
  toolbar.style.cssText = `
    position:fixed; top:80px; right:320px; z-index:99999;
    background:white; padding:8px 12px; border-radius:8px;
    box-shadow:0 4px 12px rgba(0,0,0,0.15);
    font-family:system-ui,sans-serif;
    display:flex; align-items:center; gap:6px;
  `;
  document.body.appendChild(toolbar);
}

function formatText(command) {
  document.execCommand(command, false, null);
}

function changeFontSize(direction) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  // Get the current font size of the selection
  const range = selection.getRangeAt(0);
  if (range.collapsed) return;

  // Use fontSize command (1-7 scale, we'll use 3 as default)
  const currentSize = document.queryCommandValue('fontSize') || '3';
  let newSize = parseInt(currentSize) + direction;
  newSize = Math.max(1, Math.min(7, newSize)); // Clamp between 1 and 7

  document.execCommand('fontSize', false, newSize.toString());
}

function removeFormatToolbar() {
  document.getElementById('beacon-format-toolbar')?.remove();
}

function enableEditing() {
  const editableSelectors = [
    'h1', 'h2', 'h3',
    '.tagline', '.subtitle',
    '.card h2', '.card h3', '.card p',
    'p', 'li', 'td', 'th',
    '.hero .stat .num', '.hero .stat .label'
  ];

  editableSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      if (el.closest('#beacon-edit-ui') || el.closest('#beacon-version-badge') ||
          el.closest('#beacon-history-panel') || el.closest('#beacon-format-toolbar')) return;

      el.setAttribute('contenteditable', 'true');
      el.style.outline = '2px dashed rgba(20,184,166,0.3)';
      el.style.outlineOffset = '2px';
      el.style.cursor = 'text';
      el.addEventListener('focus', handleEditFocus);
      el.addEventListener('blur', handleEditBlur);
    });
  });

  // Show format toolbar
  addFormatToolbar();
}

function handleEditFocus(e) {
  e.target.style.outline = '2px solid #14b8a6';
  e.target.style.background = 'rgba(20,184,166,0.05)';
}

function handleEditBlur(e) {
  e.target.style.outline = '2px dashed rgba(20,184,166,0.3)';
  e.target.style.background = '';
}

function disableEditing() {
  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    el.removeAttribute('contenteditable');
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.background = '';
    el.style.cursor = '';
    el.removeEventListener('focus', handleEditFocus);
    el.removeEventListener('blur', handleEditBlur);
  });

  // Hide format toolbar
  removeFormatToolbar();
}

async function saveChanges() {
  const editorName = prompt('Your name (for version history):', localStorage.getItem('beacon-editor') || '');
  if (!editorName) {
    isEditMode = true;
    return;
  }
  localStorage.setItem('beacon-editor', editorName);

  // Collect content
  const content = {};
  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    const selector = getUniqueSelector(el);
    if (selector) content[selector] = el.innerHTML;
  });

  disableEditing();
  const btn = document.getElementById('beacon-edit-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const newMinor = currentVersion.minor + 1;

  if (supabase) {
    const { error } = await supabase
      .from('page_versions')
      .insert({
        page: pageId,
        content: content,
        version_major: currentVersion.major,
        version_minor: newMinor,
        updated_by: editorName
      });

    if (error) {
      console.error('Beacon: Save error', error);
      showNotification('Save failed! Check console.', 'error');
      btn.textContent = 'Edit';
      btn.disabled = false;
      btn.style.background = 'linear-gradient(135deg,#14b8a6,#7c3aed)';
      document.getElementById('beacon-cancel-btn').style.display = 'none';
      return;
    }
  }

  currentVersion.minor = newMinor;
  await loadVersionHistory();

  btn.textContent = 'Edit';
  btn.disabled = false;
  btn.style.background = 'linear-gradient(135deg,#14b8a6,#7c3aed)';
  document.getElementById('beacon-cancel-btn').style.display = 'none';
  showNotification(`Saved as v${currentVersion.major}.${currentVersion.minor}!`);
}

function getUniqueSelector(el) {
  if (el.id) return `#${el.id}`;

  const path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.tagName.toLowerCase();
    if (el.id) {
      path.unshift(`#${el.id}`);
      break;
    }
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/)
        .filter(c => c && !c.startsWith('beacon-'));
      if (classes.length) selector += '.' + classes.join('.');
    }
    const siblings = el.parentNode
      ? Array.from(el.parentNode.children).filter(e => e.tagName === el.tagName)
      : [];
    if (siblings.length > 1) {
      selector += `:nth-of-type(${siblings.indexOf(el) + 1})`;
    }
    path.unshift(selector);
    el = el.parentNode;
    if (el === document.body) break;
  }
  return path.join(' > ');
}

function formatTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;

  return d.toLocaleDateString();
}

function showNotification(message, type = 'success') {
  document.getElementById('beacon-notification')?.remove();

  const notif = document.createElement('div');
  notif.id = 'beacon-notification';
  notif.textContent = message;
  notif.style.cssText = `
    position:fixed; bottom:80px; right:20px; z-index:99999;
    background:${type === 'error' ? '#fee2e2' : '#d1fae5'};
    color:${type === 'error' ? '#991b1b' : '#065f46'};
    padding:12px 20px; border-radius:8px;
    font-family:system-ui,sans-serif; font-size:14px;
    box-shadow:0 4px 12px rgba(0,0,0,0.1);
  `;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 4000);
}

async function exportToFile() {
  showNotification('Exporting edits...');

  try {
    // Fetch all versions from Supabase
    const { data, error } = await supabase
      .from('page_versions')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Create markdown content
    let md = `# Beacon Platform - Edit Backup\n\n`;
    md += `Exported: ${new Date().toLocaleString()}\n`;
    md += `Total versions: ${data.length}\n\n---\n\n`;

    for (const v of data) {
      md += `## Version ${v.version_major}.${v.version_minor}\n`;
      md += `- **Updated by:** ${v.updated_by}\n`;
      md += `- **Updated at:** ${v.updated_at}\n`;
      md += `- **Page:** ${v.page}\n\n`;

      const content = typeof v.content === 'string' ? JSON.parse(v.content) : v.content;
      const selectorCount = Object.keys(content).length;
      md += `Edited ${selectorCount} elements.\n\n`;

      // Show first 10 edits as preview
      const entries = Object.entries(content).slice(0, 10);
      for (const [selector, html] of entries) {
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 100);
        md += `- \`${selector}\`: ${text}...\n`;
      }
      if (selectorCount > 10) {
        md += `- ... and ${selectorCount - 10} more edits\n`;
      }
      md += `\n---\n\n`;
    }

    // Also create JSON backup
    const jsonBackup = JSON.stringify(data, null, 2);

    // Download both files
    downloadFile('beacon_edits_backup.md', md, 'text/markdown');
    setTimeout(() => {
      downloadFile('beacon_full_backup.json', jsonBackup, 'application/json');
    }, 500);

    showNotification('Backup downloaded! (MD + JSON)');
  } catch (err) {
    console.error('Export error:', err);
    showNotification('Export failed: ' + err.message, 'error');
  }
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Global functions
window.toggleEditMode = toggleEditMode;
window.showVersionHistory = showVersionHistory;
window.revertToVersion = revertToVersion;
window.formatText = formatText;
window.changeFontSize = changeFontSize;
window.cancelEdits = cancelEdits;
window.exportToFile = exportToFile;
