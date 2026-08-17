const DEFAULT_DRIVE_FOLDER_ID = '1ywyLMxaXOl_pWlto7wnLlYq0zG-0zeMv';
const DEFAULT_SPREADSHEET_ID = '1g24Es02qizbBYJR5fZJ1RGBC0EujaD4fcwsp8bgIi4s';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const SHEET_HEADERS = [
  'record_id', 'created_at', 'drive_file_id', 'file_name', 'description',
  'latitude', 'longitude', 'coordinate_source', 'user_email', 'drive_url', 'synced_at',
];

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('現勘資料｜手機現場紀錄')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('theme-color', '#205f4f');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getAppInfo() {
  return {
    userEmail: Session.getActiveUser().getEmail() || '目前 Google 帳號',
    online: true,
    maxImageMb: Math.floor(MAX_IMAGE_BYTES / 1024 / 1024),
  };
}

function saveSurveyPhoto(payload) {
  validatePayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ensureSheet_();
    const existing = findRecord_(sheet, payload.clientId);
    if (existing) return existing;

    const bytes = Utilities.base64Decode(payload.base64);
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('照片不可超過 15 MB');

    const config = getConfig_();
    const folder = DriveApp.getFolderById(config.driveFolderId);
    const safeName = sanitizeFileName_(payload.fileName);
    const blob = Utilities.newBlob(bytes, payload.mimeType, safeName);
    const file = folder.createFile(blob);
    file.setDescription(payload.description || '現勘照片');

    const now = new Date();
    const row = [
      payload.clientId,
      payload.capturedAt || now.toISOString(),
      file.getId(),
      safeName,
      String(payload.description || ''),
      normalizeNumber_(payload.latitude),
      normalizeNumber_(payload.longitude),
      payload.latitude != null && payload.longitude != null ? String(payload.coordinateSource || 'DEVICE') : 'NONE',
      Session.getActiveUser().getEmail(),
      file.getUrl(),
      now.toISOString(),
    ];
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return rowToRecord_(row);
  } finally {
    lock.releaseLock();
  }
}

function getRecentRecords(limit) {
  const sheet = ensureSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const count = Math.min(Math.max(Number(limit) || 30, 1), 100, lastRow - 1);
  const startRow = lastRow - count + 1;
  return sheet.getRange(startRow, 1, count, SHEET_HEADERS.length)
    .getDisplayValues()
    .map(rowToRecord_)
    .reverse();
}

function getConfig_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    driveFolderId: properties.getProperty('DRIVE_FOLDER_ID') || DEFAULT_DRIVE_FOLDER_ID,
    spreadsheetId: properties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID,
  };
}

function ensureSheet_() {
  const spreadsheet = SpreadsheetApp.openById(getConfig_().spreadsheetId);
  const sheet = spreadsheet.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRecord_(sheet, clientId) {
  if (sheet.getLastRow() < 2) return null;
  const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(clientId))
    .matchEntireCell(true)
    .findNext();
  if (!match) return null;
  return rowToRecord_(sheet.getRange(match.getRow(), 1, 1, SHEET_HEADERS.length).getDisplayValues()[0]);
}

function rowToRecord_(row) {
  return {
    clientId: row[0],
    capturedAt: row[1],
    fileId: row[2],
    fileName: row[3],
    description: row[4],
    latitude: row[5] === '' ? null : Number(row[5]),
    longitude: row[6] === '' ? null : Number(row[6]),
    coordinateSource: row[7],
    userEmail: row[8],
    driveUrl: row[9],
    syncedAt: row[10],
  };
}

function validatePayload_(payload) {
  if (!payload || !payload.clientId) throw new Error('缺少紀錄編號');
  if (!payload.fileName || !payload.mimeType || !payload.base64) throw new Error('照片資料不完整');
  if (!/^image\//i.test(payload.mimeType)) throw new Error('只能上傳照片');
  if (payload.base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16) throw new Error('照片不可超過 15 MB');
}

function sanitizeFileName_(value) {
  const cleaned = String(value || 'survey-photo.jpg').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return cleaned.slice(0, 180) || 'survey-photo.jpg';
}

function normalizeNumber_(value) {
  if (value === '' || value == null) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}
