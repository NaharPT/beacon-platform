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
let originalContent = {}; // Store content before editing to detect actual changes

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
    <button id="beacon-export-btn" onclick="exportToWord()" style="
      background:linear-gradient(135deg,#f59e0b,#d97706);
      color:white; border:none; padding:12px 24px; border-radius:8px;
      font-size:14px; font-weight:600; cursor:pointer;
      box-shadow:0 4px 12px rgba(245,158,11,0.4);
      transition:transform 0.2s; margin-right:8px;
    " onmouseover="this.style.transform='scale(1.05)'"
       onmouseout="this.style.transform='scale(1)'" title="Export page as Word document">Export</button>
    <button id="beacon-history-btn" onclick="showEditHistory()" style="
      background:linear-gradient(135deg,#6366f1,#4f46e5);
      color:white; border:none; padding:12px 24px; border-radius:8px;
      font-size:14px; font-weight:600; cursor:pointer;
      box-shadow:0 4px 12px rgba(99,102,241,0.4);
      transition:transform 0.2s; margin-right:8px;
    " onmouseover="this.style.transform='scale(1.05)'"
       onmouseout="this.style.transform='scale(1)'" title="View edit history and details">History</button>
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
  // Reset original content tracker
  originalContent = {};

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

      // Store original content BEFORE enabling editing
      const elSelector = getUniqueSelector(el);
      if (elSelector) {
        originalContent[elSelector] = el.innerHTML;
      }

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
  // Collect ONLY changed content (compare to original)
  const changedContent = {};
  let changeCount = 0;

  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    const selector = getUniqueSelector(el);
    if (selector) {
      const currentHtml = el.innerHTML;
      const originalHtml = originalContent[selector];

      // Only include if actually changed
      if (currentHtml !== originalHtml) {
        changedContent[selector] = currentHtml;
        changeCount++;
      }
    }
  });

  // If nothing changed, don't create a new version
  if (changeCount === 0) {
    disableEditing();
    const btn = document.getElementById('beacon-edit-btn');
    btn.textContent = 'Edit';
    btn.style.background = 'linear-gradient(135deg,#14b8a6,#7c3aed)';
    document.getElementById('beacon-cancel-btn').style.display = 'none';
    showNotification('No changes detected');
    return;
  }

  // Show custom save dialog
  showSaveDialog(changeCount, changedContent);
}

function showSaveDialog(changeCount, changedContent) {
  document.getElementById('beacon-save-dialog')?.remove();
  document.getElementById('beacon-save-backdrop')?.remove();

  const nextMinor = `v${currentVersion.major}.${currentVersion.minor + 1}`;
  const nextMajor = `v${currentVersion.major + 1}.0`;
  const savedName = localStorage.getItem('beacon-editor') || '';

  const dialog = document.createElement('div');
  dialog.id = 'beacon-save-dialog';
  dialog.innerHTML = `
    <div style="margin-bottom:20px;">
      <h3 style="margin:0 0 8px 0;font-size:18px;color:#1e293b;">Save Changes</h3>
      <p style="margin:0;color:#64748b;font-size:14px;">
        ${changeCount} change${changeCount > 1 ? 's' : ''} detected
      </p>
    </div>

    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:13px;color:#475569;margin-bottom:6px;">Your name</label>
      <input type="text" id="beacon-save-name" value="${savedName}" placeholder="Enter your name" style="
        width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:6px;
        font-size:14px; box-sizing:border-box;
      ">
    </div>

    <div style="margin-bottom:20px; padding:12px; background:#f8fafc; border-radius:8px;">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
        <input type="checkbox" id="beacon-major-release" style="width:18px;height:18px;cursor:pointer;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#1e293b;">Major release</div>
          <div style="font-size:12px;color:#64748b;">
            Save as <strong>${nextMajor}</strong> instead of ${nextMinor}
          </div>
        </div>
      </label>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button onclick="closeSaveDialog()" style="
        padding:10px 20px; border:1px solid #e2e8f0; background:white;
        border-radius:6px; font-size:14px; cursor:pointer; color:#64748b;
      ">Cancel</button>
      <button onclick="confirmSave()" style="
        padding:10px 20px; border:none; background:linear-gradient(135deg,#14b8a6,#7c3aed);
        border-radius:6px; font-size:14px; cursor:pointer; color:white; font-weight:600;
      ">Save</button>
    </div>
  `;
  dialog.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    z-index:100002; background:white; padding:24px;
    border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.3);
    font-family:system-ui,sans-serif; width:380px; max-width:90vw;
  `;

  // Store changedContent for use in confirmSave
  dialog.dataset.changedContent = JSON.stringify(changedContent);
  dialog.dataset.changeCount = changeCount;

  const backdrop = document.createElement('div');
  backdrop.id = 'beacon-save-backdrop';
  backdrop.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:100001;
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(dialog);

  // Focus name input
  document.getElementById('beacon-save-name').focus();

  // Handle Enter key
  document.getElementById('beacon-save-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') confirmSave();
  });
}

function closeSaveDialog() {
  document.getElementById('beacon-save-dialog')?.remove();
  document.getElementById('beacon-save-backdrop')?.remove();
  isEditMode = true; // Keep edit mode active
}

async function confirmSave() {
  const dialog = document.getElementById('beacon-save-dialog');
  const nameInput = document.getElementById('beacon-save-name');
  const majorCheckbox = document.getElementById('beacon-major-release');

  const editorName = nameInput.value.trim();
  if (!editorName) {
    nameInput.style.borderColor = '#ef4444';
    nameInput.focus();
    return;
  }

  localStorage.setItem('beacon-editor', editorName);

  const changedContent = JSON.parse(dialog.dataset.changedContent);
  const changeCount = parseInt(dialog.dataset.changeCount);
  const isMajorRelease = majorCheckbox.checked;

  // Close dialog
  closeSaveDialog();
  disableEditing();

  const btn = document.getElementById('beacon-edit-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  // Calculate new version
  let newMajor, newMinor;
  if (isMajorRelease) {
    newMajor = currentVersion.major + 1;
    newMinor = 0;
  } else {
    newMajor = currentVersion.major;
    newMinor = currentVersion.minor + 1;
  }

  if (supabase) {
    const { error } = await supabase
      .from('page_versions')
      .insert({
        page: pageId,
        content: changedContent,
        version_major: newMajor,
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

  currentVersion.major = newMajor;
  currentVersion.minor = newMinor;
  await loadVersionHistory();

  btn.textContent = 'Edit';
  btn.disabled = false;
  btn.style.background = 'linear-gradient(135deg,#14b8a6,#7c3aed)';
  document.getElementById('beacon-cancel-btn').style.display = 'none';

  const versionStr = `v${newMajor}.${newMinor}`;
  const releaseType = isMajorRelease ? 'Major release' : `${changeCount} change${changeCount > 1 ? 's' : ''}`;
  showNotification(`${releaseType} saved as ${versionStr}!`);
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

async function exportToWord() {
  showNotification('Preparing document...');

  try {
    // Load docx library dynamically
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
            WidthType, BorderStyle, AlignmentType } = await import('https://esm.sh/docx@8.5.0');

    const title = document.querySelector('h1')?.textContent?.trim() || 'Beacon Document';
    const version = `v${currentVersion.major}.${currentVersion.minor}`;
    const exportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    // Collect document sections
    const children = [];

    // Title
    children.push(new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 48, color: '0d9488' })],
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 }
    }));

    // Metadata line
    children.push(new Paragraph({
      children: [new TextRun({ text: `Beacon Platform | ${version} | ${exportDate}`, size: 20, color: '64748b' })],
      spacing: { after: 400 }
    }));

    // Process main content sections
    const sections = document.querySelectorAll('section[id], .card, article');
    sections.forEach(section => {
      // Skip UI elements
      if (section.closest('#beacon-edit-ui') || section.closest('.materials-panel')) return;

      // Section heading
      const heading = section.querySelector('h2, h3');
      if (heading) {
        const level = heading.tagName === 'H2' ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
        children.push(new Paragraph({
          children: [new TextRun({ text: heading.textContent.trim(), bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : 26, color: '7c3aed' })],
          heading: level,
          spacing: { before: 300, after: 100 }
        }));
      }

      // Process paragraphs
      section.querySelectorAll('p').forEach(p => {
        if (p.closest('h1, h2, h3')) return;
        const text = p.textContent.trim();
        if (text) {
          children.push(new Paragraph({
            children: [new TextRun({ text, size: 22 })],
            spacing: { after: 120 }
          }));
        }
      });

      // Process lists
      section.querySelectorAll('ul, ol').forEach(list => {
        list.querySelectorAll('li').forEach(li => {
          const text = li.textContent.trim();
          if (text) {
            children.push(new Paragraph({
              children: [new TextRun({ text: '  - ' + text, size: 22 })],
              spacing: { after: 60 }
            }));
          }
        });
      });

      // Process tables
      section.querySelectorAll('table').forEach(table => {
        const rows = [];
        table.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th, td').forEach(cell => {
            const isHeader = cell.tagName === 'TH';
            cells.push(new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: cell.textContent.trim(), bold: isHeader, size: 20 })]
              })],
              shading: isHeader ? { fill: 'f1f5f9' } : undefined
            }));
          });
          if (cells.length) rows.push(new TableRow({ children: cells }));
        });
        if (rows.length) {
          children.push(new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE }
          }));
          children.push(new Paragraph({ children: [], spacing: { after: 200 } }));
        }
      });
    });

    // Footer
    children.push(new Paragraph({
      children: [new TextRun({ text: '---', size: 20, color: 'e2e8f0' })],
      spacing: { before: 400 }
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: `Generated from Beacon Platform - ${window.location.href}`, size: 18, color: '94a3b8', italics: true })]
    }));

    // Create document
    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
        },
        children
      }]
    });

    // Generate and download
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Beacon_${pageId}_${version.replace('.', '-')}_${new Date().toISOString().split('T')[0]}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Word document downloaded!');
  } catch (err) {
    console.error('Export error:', err);
    // Fallback to simple HTML export if docx library fails
    exportToWordFallback();
  }
}

function exportToWordFallback() {
  try {
    const mainContent = document.body;
    const clone = mainContent.cloneNode(true);
    clone.querySelectorAll('[id^="beacon-"], .materials-panel, script, style, nav, .sidebar').forEach(el => el.remove());

    const title = document.querySelector('h1')?.textContent || 'Beacon Document';
    const version = `v${currentVersion.major}.${currentVersion.minor}`;
    const exportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const wordDoc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 2.5cm; }
  body { font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.6; color: #333; max-width: 800px; }
  h1 { font-size: 24pt; color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 8pt; }
  h2 { font-size: 16pt; color: #7c3aed; margin-top: 24pt; page-break-after: avoid; }
  h3 { font-size: 13pt; color: #475569; }
  p { margin: 8pt 0; }
  ul, ol { margin: 8pt 0 8pt 24pt; }
  li { margin: 4pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
  th, td { border: 1px solid #cbd5e1; padding: 8pt; text-align: left; }
  th { background: #f1f5f9; font-weight: bold; }
  .header-info { color: #64748b; font-size: 10pt; margin-bottom: 16pt; }
</style></head>
<body>
  <div class="header-info"><strong>Beacon Platform</strong> | ${version} | ${exportDate}</div>
  ${clone.innerHTML}
  <p style="margin-top: 40pt; border-top: 1px solid #e2e8f0; padding-top: 12pt; font-size: 9pt; color: #94a3b8;">
    Generated from Beacon Platform
  </p>
</body></html>`;

    const blob = new Blob([wordDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Beacon_${pageId}_v${currentVersion.major}-${currentVersion.minor}_${new Date().toISOString().split('T')[0]}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Document downloaded (basic format)');
  } catch (err) {
    showNotification('Export failed: ' + err.message, 'error');
  }
}

async function showEditHistory() {
  document.getElementById('beacon-edit-history-panel')?.remove();
  document.getElementById('beacon-edit-history-backdrop')?.remove();

  // Fetch version history if not loaded
  if (!versionHistory.length && supabase) {
    const { data } = await supabase
      .from('page_versions')
      .select('*')
      .eq('page', pageId)
      .order('updated_at', { ascending: false });
    versionHistory = data || [];
  }

  const panel = document.createElement('div');
  panel.id = 'beacon-edit-history-panel';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="margin:0;font-size:18px;color:#1e293b;">Edit History</h3>
      <button onclick="this.closest('#beacon-edit-history-panel').remove();document.getElementById('beacon-edit-history-backdrop')?.remove();" style="
        background:none; border:none; font-size:24px; cursor:pointer; color:#64748b; line-height:1;
      ">&times;</button>
    </div>
    <p style="color:#64748b;font-size:13px;margin-bottom:16px;">
      ${versionHistory.length} versions saved. Click any version to see changes or revert.
    </p>
    <div style="max-height:500px;overflow-y:auto;">
      ${versionHistory.length === 0 ? '<p style="color:#94a3b8;text-align:center;padding:20px;">No edit history yet</p>' : ''}
      ${versionHistory.map((v, i) => {
        const content = typeof v.content === 'string' ? JSON.parse(v.content) : v.content;
        const editCount = Object.keys(content).length;
        const isLatest = i === 0;
        return `
        <div style="
          padding:16px; border-radius:8px; margin-bottom:12px;
          background:${isLatest ? '#f0fdfa' : '#f8fafc'};
          border:1px solid ${isLatest ? '#14b8a6' : '#e2e8f0'};
        ">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <strong style="font-size:15px;">v${v.version_major}.${v.version_minor}</strong>
                ${isLatest ? '<span style="background:#14b8a6;color:white;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">CURRENT</span>' : ''}
              </div>
              <div style="font-size:12px;color:#64748b;">
                by <strong>${v.updated_by || 'Unknown'}</strong> &bull; ${formatTime(v.updated_at)}
              </div>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                ${editCount} elements edited
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button onclick="showVersionDetails(${v.id})" style="
                background:#e2e8f0; color:#475569; border:none;
                padding:6px 12px; border-radius:4px; font-size:12px; cursor:pointer;
              ">Details</button>
              ${!isLatest ? `<button onclick="revertToVersion(${v.id})" style="
                background:#f59e0b; color:white; border:none;
                padding:6px 12px; border-radius:4px; font-size:12px; cursor:pointer;
              ">Revert</button>` : ''}
            </div>
          </div>
        </div>
      `}).join('')}
    </div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <button onclick="exportVersionsJSON()" style="
        background:#6366f1; color:white; border:none;
        padding:10px 16px; border-radius:6px; font-size:13px; cursor:pointer; width:100%;
      ">Download Full History (JSON)</button>
    </div>
  `;
  panel.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    z-index:100000; background:white; padding:24px;
    border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.3);
    font-family:system-ui,sans-serif; width:500px; max-width:90vw;
  `;
  document.body.appendChild(panel);

  // Add backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'beacon-edit-history-backdrop';
  backdrop.onclick = () => { panel.remove(); backdrop.remove(); };
  backdrop.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99999;
  `;
  document.body.insertBefore(backdrop, panel);
}

async function showVersionDetails(versionId) {
  const version = versionHistory.find(v => v.id === versionId);
  if (!version) return;

  const content = typeof version.content === 'string' ? JSON.parse(version.content) : version.content;
  const entries = Object.entries(content);

  // Create details panel
  const detailsPanel = document.createElement('div');
  detailsPanel.id = 'beacon-version-details';
  detailsPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="margin:0;font-size:16px;">v${version.version_major}.${version.version_minor} - Edit Details</h3>
      <button onclick="this.closest('#beacon-version-details').remove()" style="
        background:none; border:none; font-size:20px; cursor:pointer; color:#64748b;
      ">&times;</button>
    </div>
    <div style="font-size:12px;color:#64748b;margin-bottom:12px;">
      ${entries.length} elements changed by ${version.updated_by}
    </div>
    <div style="max-height:400px;overflow-y:auto;">
      ${entries.slice(0, 50).map(([selector, html]) => {
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const preview = text.slice(0, 150);
        return `
        <div style="padding:10px;border-bottom:1px solid #f1f5f9;">
          <div style="font-family:monospace;font-size:11px;color:#7c3aed;margin-bottom:4px;word-break:break-all;">
            ${selector}
          </div>
          <div style="font-size:12px;color:#475569;">
            ${preview}${text.length > 150 ? '...' : ''}
          </div>
        </div>
      `}).join('')}
      ${entries.length > 50 ? `<div style="padding:12px;text-align:center;color:#94a3b8;font-size:12px;">
        ... and ${entries.length - 50} more edits
      </div>` : ''}
    </div>
  `;
  detailsPanel.style.cssText = `
    position:fixed; top:50%; left:calc(50% + 280px); transform:translate(-50%,-50%);
    z-index:100001; background:white; padding:20px;
    border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,0.2);
    font-family:system-ui,sans-serif; width:400px; max-width:40vw;
  `;

  document.getElementById('beacon-version-details')?.remove();
  document.body.appendChild(detailsPanel);
}

async function exportVersionsJSON() {
  if (!versionHistory.length) {
    showNotification('No versions to export', 'error');
    return;
  }

  const jsonBackup = JSON.stringify(versionHistory, null, 2);
  const blob = new Blob([jsonBackup], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `beacon_history_${pageId}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification('History exported!');
}

// Global functions
window.toggleEditMode = toggleEditMode;
window.showVersionHistory = showVersionHistory;
window.revertToVersion = revertToVersion;
window.formatText = formatText;
window.changeFontSize = changeFontSize;
window.cancelEdits = cancelEdits;
window.exportToWord = exportToWord;
window.exportToWordFallback = exportToWordFallback;
window.showEditHistory = showEditHistory;
window.showVersionDetails = showVersionDetails;
window.exportVersionsJSON = exportVersionsJSON;
window.showSaveDialog = showSaveDialog;
window.closeSaveDialog = closeSaveDialog;
window.confirmSave = confirmSave;
