const ROOT_FOLDER_ID = '1ywyLMxaXOl_pWlto7wnLlYq0zG-0zeMv';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const TASKS_PROPERTY = 'FIELD_SURVEY_TASKS_V2';
const SHEET_HEADERS = ['日期', '時間', '概要', '照片說明', '緯度', '經度', '誤差範圍', '照片檔名', '照片連結'];

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('現場勘查工具')
    .setFaviconUrl('https://xindianli33-ux.github.io/site-survey-records-mvp/icon.png');
}

function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }
function getBootstrapData() { return { tasks: listTasks(), maxImageMb: Math.floor(MAX_IMAGE_BYTES / 1024 / 1024) }; }
function listTasks() { return readTasks_().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }

function createTask(payload) {
  const taskName = sanitizeText_(payload && (payload.taskName || payload.name), 80);
  if (!taskName) throw new Error('請輸入任務名稱');
  const rawDate = String(payload && (payload.taskDate || payload.date) || '').replace(/-/g, '');
  const taskDate = /^\d{8}$/.test(rawDate) ? rawDate : formatDate_(new Date());
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    root.setName('現場勘查工具');
    const baseName = `${taskDate}-${taskName}`;
    let folderName = baseName;
    let sequence = 2;
    while (root.getFoldersByName(folderName).hasNext()) folderName = `${baseName}-${String(sequence++).padStart(2, '0')}`;
    const folder = root.createFolder(folderName);
    const spreadsheet = SpreadsheetApp.create(`${folderName}-現勘資料`);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
    const sheet = spreadsheet.getSheets()[0];
    sheet.setName('現勘資料');
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange('A:B').setNumberFormat('@');
    sheet.autoResizeColumns(1, SHEET_HEADERS.length);
    const task = { id: Utilities.getUuid(), taskName, taskDate, folderName, folderId: folder.getId(), sheetId: spreadsheet.getId(), createdAt: new Date().toISOString() };
    const tasks = readTasks_();
    tasks.push(task);
    writeTasks_(tasks);
    return task;
  } finally { lock.releaseLock(); }
}

function saveSurveyPhoto(payload) {
  validatePhotoPayload_(payload);
  const task = findTask_(payload.taskId);
  const bytes = Utilities.base64Decode(payload.base64);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('照片不可超過 15 MB');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const folder = DriveApp.getFolderById(task.folderId);
    const fileName = makeFileName_(payload);
    const file = folder.createFile(Utilities.newBlob(bytes, payload.mimeType, fileName));
    file.setDescription(sanitizeText_(payload.description, 500));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) {}
    const row = [payload.date, payload.time, sanitizeText_(payload.summary, 80), sanitizeText_(payload.description, 500), normalizeNumber_(payload.latitude), normalizeNumber_(payload.longitude), normalizeNumber_(payload.accuracy) || 0, fileName, file.getUrl()];
    SpreadsheetApp.openById(task.sheetId).getSheets()[0].appendRow(row);
    SpreadsheetApp.flush();
    return rowToRecord_(row);
  } finally { lock.releaseLock(); }
}

function getTaskRecords(taskId) {
  const task = findTask_(taskId);
  const sheet = SpreadsheetApp.openById(task.sheetId).getSheets()[0];
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, SHEET_HEADERS.length).getDisplayValues().map(rowToRecord_).reverse();
}

function rowToRecord_(row) { return { date: row[0], time: row[1], summary: row[2], description: row[3], latitude: row[4], longitude: row[5], accuracy: row[6], fileName: row[7], photoUrl: row[8] }; }
function makeFileName_(payload) { const extension = sanitizeExtension_(payload.originalName, payload.mimeType); const summary = sanitizeFilePart_(payload.summary); return sanitizeFileName_(`${payload.date}-${payload.time}${summary ? `-${summary}` : ''}.${extension}`); }
function validatePhotoPayload_(payload) {
  if (!payload || !payload.taskId) throw new Error('尚未選擇任務');
  if (!/^\d{8}$/.test(String(payload.date || '')) || !/^\d{6}$/.test(String(payload.time || ''))) throw new Error('照片日期或時間格式錯誤');
  if (!payload.mimeType || !/^image\//i.test(payload.mimeType) || !payload.base64) throw new Error('照片資料不完整');
  if (payload.base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 32) throw new Error('照片不可超過 15 MB');
}
function findTask_(taskId) { const task = readTasks_().find(item => item.id === String(taskId)); if (!task) throw new Error('找不到指定任務，請重新選擇'); return task; }
function readTasks_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(TASKS_PROPERTY) || '[]'); } catch (error) { return []; } }
function writeTasks_(tasks) { PropertiesService.getScriptProperties().setProperty(TASKS_PROPERTY, JSON.stringify(tasks)); }
function formatDate_(date) { return Utilities.formatDate(date, 'Asia/Taipei', 'yyyyMMdd'); }
function sanitizeText_(value, max) { return String(value || '').trim().slice(0, max); }
function sanitizeFilePart_(value) { return sanitizeText_(value, 60).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim(); }
function sanitizeFileName_(value) { return String(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180); }
function sanitizeExtension_(name, mimeType) { const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/); if (match && ['jpg', 'jpeg', 'png', 'heic', 'heif'].includes(match[1])) return match[1] === 'jpeg' ? 'jpg' : match[1]; if (/png/i.test(mimeType)) return 'png'; if (/hei[cf]/i.test(mimeType)) return /heif/i.test(mimeType) ? 'heif' : 'heic'; return 'jpg'; }
function normalizeNumber_(value) { const number = Number(value); return Number.isFinite(number) ? number : ''; }

