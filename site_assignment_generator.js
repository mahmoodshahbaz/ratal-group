// ============================================================================
//  SITE ASSIGNMENT GENERATOR
//  Ratal Advanced Technologies — ACCSYS Field Operations Platform
//
//  What this does:
//    1. Queries active employees for a department from Supabase
//    2. Merges coordinator's daily assignments (project, site, status)
//    3. Generates a PDF (sponsored employees first, outsourced second)
//    4. Uploads PDF to Google Drive (same as all other system files)
//    5. Sends email to DH + coordinator with PDF attached
//    6. Supports corrections — each correction creates a new version (v2, v3…)
//       with audit trail; previous version is marked "superseded" but kept
//
//  Correction rules:
//    - Same day  : coordinator can correct freely (reason required)
//    - Next day+ : DH must also approve (requiresDhApproval flag set)
//    - Downstream forms (FA, OT, Expenses) are alerted when their date's
//      assignment is corrected so coordinators can review
//
//  Environment variables (never put in client-side code):
//    SUPABASE_URL, SUPABASE_SERVICE_KEY
//    GOOGLE_SERVICE_ACCOUNT_JSON   ← service account key JSON (string), in secrets only
//    DRIVE_SITE_ASSIGNMENT_FOLDER_ID  ← base Google Drive folder ID for site assignments
//    GMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
// ============================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');
const { google }      = require('googleapis');
const PdfPrinter      = require('pdfmake');
const nodemailer      = require('nodemailer');
const { Readable }    = require('stream');

// ── SUPABASE CLIENT (DB only — no Storage) ───────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service role key — ONLY on backend, never in .env for client
);

// ── GOOGLE DRIVE AUTH ────────────────────────────────────────────────────────
// GOOGLE_SERVICE_ACCOUNT_JSON must only live in Supabase Edge Function secrets
// or your backend .env — NEVER in any client-side code or committed file
function _getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// Drive folder ID where all Site Assignment PDFs are stored
// Structure auto-created: {BASE_FOLDER}/{DEPT}/{YYYY-MM}/SA_xxx.pdf
const DRIVE_BASE_FOLDER = process.env.DRIVE_SITE_ASSIGNMENT_FOLDER_ID;

const MAX_ROWS = 200;   // safety cap on employee count

// ── FONTS (pdfmake needs a fonts map; using built-in Helvetica avoids file deps) ──
const printer = new PdfPrinter({
  Helvetica: {
    normal:      'Helvetica',
    bold:        'Helvetica-Bold',
    italics:     'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
});

// ════════════════════════════════════════════════════════════════════════════
//  MAIN ENTRY — Generate a new Site Assignment (or a correction)
// ════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} params
 * @param {string}   params.department        e.g. 'CISU'
 * @param {string}   params.assignmentDate    'YYYY-MM-DD'
 * @param {string}   [params.periodType]      'Daily' | 'Weekly'
 * @param {string}   params.coordinatorId     UUID from employees table
 * @param {string}   params.coordinatorName   Display name
 * @param {string}   [params.generalProjectNo] e.g. 'P-CISU-2026' for idle employees
 * @param {Array}    params.assignments        [{employeeId, projectNo, siteNo, status, remarks}]
 *                                             status: 'ASSIGNED' | 'IDLE' | 'LEAVE' | 'ABSENT'
 * @param {string}   [params.correctionReason] Required when parentId is set
 * @param {string}   [params.parentId]         UUID of the record being corrected
 * @returns {{ assignmentId, refNo, publicUrl, version }}
 */
async function generateSiteAssignment({
  department,
  assignmentDate,
  periodType      = 'Daily',
  coordinatorId,
  coordinatorName,
  generalProjectNo,
  assignments     = [],
  correctionReason = null,
  parentId        = null,
}) {

  // ── 1. DETERMINE VERSION ─────────────────────────────────────────────────
  const version = parentId ? await _nextVersion(parentId) : 1;
  const refNo   = _buildRef(department, assignmentDate, version);

  // ── 2. INSERT RECORD (status = draft while we generate) ─────────────────
  const { data: record, error: recErr } = await supabase
    .from('site_assignments')
    .insert({
      assignment_ref:   refNo,
      department,
      assignment_date:  assignmentDate,
      period_type:      periodType,
      coordinator_id:   coordinatorId,
      coordinator_name: coordinatorName,
      general_project_no: generalProjectNo || null,
      status:           'draft',
      version,
      parent_id:        parentId || null,
      correction_reason: correctionReason || null,
      requires_dh_approval: _isLateCorrection(parentId, assignmentDate),
    })
    .select()
    .single();

  if (recErr) throw new Error(`DB insert failed: ${recErr.message}`);
  const assignmentId = record.id;

  // ── 3. FETCH ACTIVE EMPLOYEES ────────────────────────────────────────────
  // Sponsored first (sorted by name), then Outsourced (sorted by name)
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, employee_name_en, employment_type, department')
    .eq('department', department)
    .eq('status', 'active')
    .limit(MAX_ROWS);

  if (empErr) throw new Error(`Employee fetch failed: ${empErr.message}`);
  if (!employees.length) throw new Error(`No active employees found for department: ${department}`);

  const sorted = [
    ...employees.filter(e => e.employment_type === 'sponsored').sort(_byName),
    ...employees.filter(e => e.employment_type === 'outsourced').sort(_byName),
  ];

  // ── 4. MERGE COORDINATOR INPUT ───────────────────────────────────────────
  const aMap = {};
  for (const a of assignments) aMap[a.employeeId] = a;

  const lines = sorted.map((emp, idx) => {
    const a = aMap[emp.id] || {};
    return {
      sNo:            idx + 1,
      employeeId:     emp.id,
      employeeNameEn: emp.employee_name_en,
      employmentType: emp.employment_type,   // 'sponsored' | 'outsourced'
      projectNo:      a.projectNo  || '',
      siteNo:         a.siteNo     || '',
      status:         a.status     || 'IDLE', // default IDLE if coordinator didn't fill row
      remarks:        a.remarks    || '',
    };
  });

  // ── 5. SAVE LINES ────────────────────────────────────────────────────────
  const { error: lineErr } = await supabase.from('site_assignment_lines').insert(
    lines.map(l => ({
      assignment_id:   assignmentId,
      employee_id:     l.employeeId,
      employee_name_en: l.employeeNameEn,
      employment_type: l.employmentType,
      project_no:      l.projectNo  || null,
      site_no:         l.siteNo     || null,
      status:          l.status,
      remarks:         l.remarks    || null,
      sort_order:      l.sNo,
    }))
  );
  if (lineErr) throw new Error(`Lines insert failed: ${lineErr.message}`);

  // ── 6. TALLY COUNTS ──────────────────────────────────────────────────────
  const counts = _tally(lines);

  // ── 7. GENERATE PDF ──────────────────────────────────────────────────────
  const pdfBuffer = await _buildPdf({
    refNo, department, assignmentDate, periodType, coordinatorName,
    generalProjectNo, lines, counts, version, correctionReason,
  });

  // ── 8. UPLOAD TO GOOGLE DRIVE ────────────────────────────────────────────
  const fileName   = `SA_${refNo}.pdf`;
  const yearMonth  = assignmentDate.substring(0, 7);   // 'YYYY-MM'
  const { driveFileId, webViewLink } = await _uploadToDrive(
    pdfBuffer, fileName, department, yearMonth
  );

  // ── 9. MARK PUBLISHED ────────────────────────────────────────────────────
  await supabase.from('site_assignments').update({
    pdf_url:       webViewLink,
    drive_file_id: driveFileId,
    status:        'published',
    generated_at:  new Date().toISOString(),
  }).eq('id', assignmentId);

  // ── 10. SUPERSEDE PARENT (if correction) ─────────────────────────────────
  if (parentId) {
    await supabase.from('site_assignments')
      .update({ status: 'superseded' })
      .eq('id', parentId);

    // Alert any downstream forms (FA, OT, Expenses) for this date
    await _alertDownstreamForms(department, assignmentDate, refNo, version);
  }

  // ── 11. SEND EMAIL ───────────────────────────────────────────────────────
  await _sendEmail({
    refNo, department, assignmentDate, coordinatorName,
    counts, pdfBuffer, webViewLink, version, correctionReason,
  });

  console.log(`✅  Generated: ${refNo}  |  ${lines.length} employees  |  v${version}`);
  console.log(`📁  Drive: ${webViewLink}`);
  return { assignmentId, refNo, driveFileId, webViewLink, version };
}

// ════════════════════════════════════════════════════════════════════════════
//  CORRECTION ENTRY POINT
// ════════════════════════════════════════════════════════════════════════════
/**
 * Submit a correction to an existing site assignment.
 * The latest active version is automatically found — you don't need to track versions.
 *
 * @param {object} params
 * @param {string}   params.departmentOrRef   Department name OR assignment_ref of any version
 * @param {string}   params.assignmentDate    'YYYY-MM-DD'
 * @param {string}   params.coordinatorId
 * @param {string}   params.correctionReason  Required — shown in email and on PDF
 * @param {Array}    params.assignments        Full corrected assignment list (all employees)
 */
async function correctSiteAssignment({
  departmentOrRef,
  assignmentDate,
  coordinatorId,
  correctionReason,
  assignments,
}) {
  if (!correctionReason?.trim()) throw new Error('Correction reason is required');

  // Find the current active (non-superseded) record for this dept+date
  const { data: original, error } = await supabase
    .from('site_assignments')
    .select('*')
    .eq('assignment_date', assignmentDate)
    .or(`department.eq.${departmentOrRef},assignment_ref.like.%${departmentOrRef}%`)
    .not('status', 'eq', 'superseded')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error || !original) throw new Error(`No active assignment found for ${departmentOrRef} on ${assignmentDate}`);

  return generateSiteAssignment({
    department:       original.department,
    assignmentDate:   original.assignment_date,
    periodType:       original.period_type,
    coordinatorId,
    coordinatorName:  original.coordinator_name,
    generalProjectNo: original.general_project_no,
    assignments,
    correctionReason,
    parentId:         original.id,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  PDF BUILDER
// ════════════════════════════════════════════════════════════════════════════
function _buildPdf({ refNo, department, assignmentDate, periodType, coordinatorName,
  generalProjectNo, lines, counts, version, correctionReason }) {

  return new Promise((resolve, reject) => {
    const isCorrection = version > 1;
    const title = isCorrection
      ? `DAILY SITE ASSIGNMENT & ATTENDANCE RECORD  [CORRECTION v${version}]`
      : 'DAILY SITE ASSIGNMENT & ATTENDANCE RECORD';

    // ── TABLE BODY ─────────────────────────────────────────────────────────
    const tableBody = [[
      { text: 'S.No',          style: 'th', alignment: 'center' },
      { text: 'Employee Name', style: 'th' },
      { text: 'Type',          style: 'th', alignment: 'center' },
      { text: 'Project No',    style: 'th', alignment: 'center' },
      { text: 'Site No',       style: 'th', alignment: 'center' },
      { text: 'Status',        style: 'th', alignment: 'center' },
      { text: 'Remarks',       style: 'th' },
    ]];

    const STATUS_COLOR = { ASSIGNED: '#0A7A0A', IDLE: '#CC6000', LEAVE: '#0055CC', ABSENT: '#CC0000' };

    let lastType = null;
    for (const line of lines) {
      // Section divider when employment type changes
      if (line.employmentType !== lastType) {
        lastType = line.employmentType;
        const label = lastType === 'sponsored'
          ? '▶  Ratal Sponsored Employees'
          : '▶  Outsourced / Agency Employees';
        tableBody.push([{ text: label, colSpan: 7, style: 'sectionDiv', alignment: 'left' }, {},{},{},{},{},{}]);
      }

      const shade = line.sNo % 2 === 0 ? '#F5F5F5' : null;
      const sc    = STATUS_COLOR[line.status] || '#000000';

      tableBody.push([
        { text: String(line.sNo),         alignment: 'center', fontSize: 8, fillColor: shade },
        { text: line.employeeNameEn,       fontSize: 8,         fillColor: shade },
        { text: lastType === 'sponsored' ? 'Sponsored' : 'Outsourced', fontSize: 7, alignment: 'center', color: '#666666', fillColor: shade },
        { text: line.projectNo || '—',     fontSize: 8, alignment: 'center', fillColor: shade },
        { text: line.siteNo    || '—',     fontSize: 8, alignment: 'center', fillColor: shade },
        { text: line.status,               fontSize: 8, alignment: 'center', color: sc, bold: true, fillColor: shade },
        { text: line.remarks   || '',      fontSize: 7, fillColor: shade },
      ]);
    }

    // ── DOC DEFINITION ─────────────────────────────────────────────────────
    const docDef = {
      pageSize:        'A4',
      pageOrientation: 'portrait',
      pageMargins:     [36, 36, 36, 36],
      defaultStyle:    { font: 'Helvetica', fontSize: 9 },

      header: (currentPage, pageCount) => ({
        text: `${refNo}  |  Page ${currentPage} of ${pageCount}`,
        alignment: 'right', fontSize: 7, color: '#888888', margin: [0, 8, 36, 0],
      }),

      footer: (currentPage, pageCount) => ({
        text: `Generated: ${new Date().toISOString()}  |  ${refNo}${isCorrection ? `  |  CORRECTION v${version}` : ''}`,
        alignment: 'center', fontSize: 7, color: '#AAAAAA', margin: [36, 0, 36, 8],
      }),

      content: [
        // ── Company + Ref ─────────────────────────────────────────────────
        {
          columns: [
            { text: 'Ratal Advanced Technologies', style: 'company' },
            {
              stack: [
                { text: `Ref#   ${refNo}`,           alignment: 'right', fontSize: 8 },
                { text: `Date   ${assignmentDate}`,  alignment: 'right', fontSize: 8 },
              ],
            },
          ],
          margin: [0, 0, 0, 4],
        },
        // ── Title ─────────────────────────────────────────────────────────
        { text: title, style: 'title', margin: [0, 2, 0, 2] },
        { text: 'Applicable to Field Operations only · Not for Admin / Accounts / Procurement / Office Staff',
          style: 'subtitle', margin: [0, 0, 0, 4] },

        // ── Correction Banner ─────────────────────────────────────────────
        ...(isCorrection ? [{
          table: { widths: ['*'], body: [[{
            text: `⚠  CORRECTION v${version}${correctionReason ? `  —  Reason: ${correctionReason}` : ''}`,
            color: '#FFFFFF', fillColor: '#CC0000', bold: true, fontSize: 9,
            alignment: 'center', margin: [4, 4, 4, 4],
          }]] },
          layout: 'noBorders',
          margin: [0, 0, 0, 6],
        }] : []),

        // ── Info Block ────────────────────────────────────────────────────
        {
          table: {
            widths: ['auto', '*', 16, 'auto', '*'],
            body: [
              [{ text: 'Department',     style: 'lbl' }, { text: department,        style: 'val' }, '',
               { text: 'Assignment Date', style: 'lbl' }, { text: assignmentDate,   style: 'val' }],
              [{ text: 'Coordinator',    style: 'lbl' }, { text: coordinatorName,   style: 'val' }, '',
               { text: 'Period Type',   style: 'lbl' }, { text: periodType,         style: 'val' }],
              [{ text: 'General Project',style: 'lbl' }, { text: generalProjectNo || '—', style: 'val' }, '',
               { text: 'Total Employees',style:'lbl' }, { text: String(lines.length), style: 'val' }],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 8],
        },

        // ── Note ──────────────────────────────────────────────────────────
        { text: 'Note: Employees with no Project No or Site No are marked IDLE. Their cost is charged to the General Project above.',
          fontSize: 7, color: '#CC0000', margin: [0, 0, 0, 6] },

        // ── Main Table ────────────────────────────────────────────────────
        {
          table: {
            headerRows: 1,
            dontBreakRows: false,
            widths: [22, '*', 52, 62, 44, 52, 80],
            body: tableBody,
          },
          layout: {
            hLineWidth: () => 0.4,
            vLineWidth: () => 0.4,
            hLineColor: () => '#CCCCCC',
            vLineColor: () => '#CCCCCC',
            fillColor: (row) => row === 0 ? '#1F3864' : null,
          },
        },

        // ── Summary Counts ────────────────────────────────────────────────
        { text: ' ', fontSize: 4 },
        {
          table: {
            widths: ['*', '*', '*', '*'],
            body: [[
              { text: `Assigned: ${counts.assigned}`, color: '#0A7A0A', bold: true, fontSize: 9, alignment: 'center', margin: [0, 4] },
              { text: `Idle: ${counts.idle}`,         color: '#CC6000', bold: true, fontSize: 9, alignment: 'center', margin: [0, 4] },
              { text: `Leave: ${counts.leave}`,       color: '#0055CC', bold: true, fontSize: 9, alignment: 'center', margin: [0, 4] },
              { text: `Absent: ${counts.absent}`,     color: '#CC0000', bold: true, fontSize: 9, alignment: 'center', margin: [0, 4] },
            ]],
          },
          layout: { hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => '#CCCCCC', vLineColor: () => '#CCCCCC' },
          margin: [0, 0, 0, 24],
        },

        // ── Signatures ────────────────────────────────────────────────────
        {
          columns: [
            { stack: [
              { text: 'Prepared By', bold: true, fontSize: 9, decoration: 'underline' },
              { text: coordinatorName, fontSize: 9, margin: [0, 14, 0, 0] },
            ]},
            { stack: [
              { text: 'Verified By', bold: true, fontSize: 9, decoration: 'underline', alignment: 'center' },
              { text: '______________________________', alignment: 'center', color: '#888888', margin: [0, 14, 0, 0] },
            ]},
            { stack: [
              { text: 'Approved By (DH)', bold: true, fontSize: 9, decoration: 'underline', alignment: 'right' },
              { text: '______________________________', alignment: 'right', color: '#888888', margin: [0, 14, 0, 0] },
            ]},
          ],
        },
      ],

      styles: {
        company:    { fontSize: 15, bold: true, color: '#1F3864' },
        title:      { fontSize: 12, bold: true, color: '#1F3864', alignment: 'center' },
        subtitle:   { fontSize: 7,  italics: true, color: '#888888', alignment: 'center' },
        th:         { fontSize: 8,  bold: true, color: '#FFFFFF', margin: [2, 3, 2, 3] },
        lbl:        { fontSize: 8,  bold: true, color: '#333333' },
        val:        { fontSize: 8,  color: '#1155CC' },
        sectionDiv: { fontSize: 8,  bold: true, color: '#1F3864', fillColor: '#D9E1F2', margin: [4, 4, 4, 4] },
      },
    };

    const pdfDoc = printer.createPdfKitDocument(docDef);
    const chunks = [];
    pdfDoc.on('data',  c => chunks.push(c));
    pdfDoc.on('end',   () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  EMAIL
// ════════════════════════════════════════════════════════════════════════════
async function _sendEmail({ refNo, department, assignmentDate, coordinatorName,
  counts, pdfBuffer, webViewLink, version, correctionReason }) {

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type:         'OAuth2',
      user:          process.env.GMAIL_USER,
      clientId:      process.env.GMAIL_CLIENT_ID,
      clientSecret:  process.env.GMAIL_CLIENT_SECRET,
      refreshToken:  process.env.GMAIL_REFRESH_TOKEN,
    },
  });

  const isCorrection = version > 1;
  const subject = isCorrection
    ? `[CORRECTION v${version}] Site Assignment — ${department} — ${assignmentDate} — ${refNo}`
    : `Site Assignment — ${department} — ${assignmentDate} — ${refNo}`;

  // Fetch DH email for this department
  const { data: dh } = await supabase
    .from('employees')
    .select('email')
    .eq('department', department)
    .eq('role', 'dept_head')
    .maybeSingle();

  const to = [dh?.email, process.env.GMAIL_USER].filter(Boolean).join(', ');

  const textBody = [
    `Department    : ${department}`,
    `Date          : ${assignmentDate}`,
    `Reference     : ${refNo}`,
    `Coordinator   : ${coordinatorName}`,
    '',
    isCorrection ? `⚠  CORRECTION v${version}` : '',
    correctionReason ? `Reason        : ${correctionReason}` : '',
    '',
    'SUMMARY:',
    `  ✅ Assigned  : ${counts.assigned}`,
    `  🟠 Idle      : ${counts.idle}`,
    `  🔵 Leave     : ${counts.leave}`,
    `  🔴 Absent    : ${counts.absent}`,
    '',
    `View PDF  : ${webViewLink}`,
    '',
    isCorrection
      ? '⚠  This document supersedes the previous version. Please discard the earlier copy and use this one.'
      : 'Please review and sign the printed copy for records.',
  ].filter(l => l !== null).join('\n');

  await transporter.sendMail({
    from:    `"Ratal ACCSYS" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text:    textBody,
    attachments: [{
      filename:    `SA_${refNo}.pdf`,
      content:     pdfBuffer,
      contentType: 'application/pdf',
    }],
  });

  console.log(`📧  Email sent → ${to}  |  Subject: ${subject}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  DOWNSTREAM ALERT — warn FA / OT / Expense forms when an assignment is corrected
// ════════════════════════════════════════════════════════════════════════════
async function _alertDownstreamForms(department, assignmentDate, newRef, version) {
  // Insert a notification record that the UI/app can surface to coordinators
  await supabase.from('system_notifications').insert({
    type:        'site_assignment_corrected',
    department,
    related_date: assignmentDate,
    message:     `Site Assignment for ${department} on ${assignmentDate} was corrected (${newRef} v${version}). Review your Food Allowance, OT, and Expense submissions for this date.`,
    created_at:  new Date().toISOString(),
    resolved:    false,
  }).catch(e => console.warn('Notification insert skipped (table may not exist yet):', e.message));
}

// ════════════════════════════════════════════════════════════════════════════
//  GOOGLE DRIVE UPLOAD
// ════════════════════════════════════════════════════════════════════════════
/**
 * Uploads a PDF buffer to Google Drive.
 * Folder structure inside DRIVE_BASE_FOLDER:
 *   {DEPT} / {YYYY-MM} / SA_xxx.pdf
 * Creates sub-folders automatically if they don't exist.
 */
async function _uploadToDrive(pdfBuffer, fileName, department, yearMonth) {
  const drive = _getDriveClient();

  // ── Find or create: DEPT sub-folder ──────────────────────────────────────
  const deptFolderId = await _findOrCreateFolder(drive, department, DRIVE_BASE_FOLDER);

  // ── Find or create: YYYY-MM sub-folder ───────────────────────────────────
  const monthFolderId = await _findOrCreateFolder(drive, yearMonth, deptFolderId);

  // ── Upload PDF ────────────────────────────────────────────────────────────
  const stream = new Readable();
  stream.push(pdfBuffer);
  stream.push(null);

  const { data: file } = await drive.files.create({
    requestBody: {
      name:    fileName,
      parents: [monthFolderId],
      mimeType: 'application/pdf',
    },
    media: {
      mimeType: 'application/pdf',
      body:     stream,
    },
    fields: 'id, webViewLink, webContentLink',
  });

  // Make file readable by anyone with the link (same as your other Drive files)
  await drive.permissions.create({
    fileId:      file.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return { driveFileId: file.id, webViewLink: file.webViewLink };
}

/** Finds a folder by name inside parentId, or creates it. Returns folder ID. */
async function _findOrCreateFolder(drive, name, parentId) {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const { data } = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });

  if (data.files.length) return data.files[0].id;

  const { data: folder } = await drive.files.create({
    requestBody: { name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return folder.id;
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════════════
function _buildRef(department, date, version) {
  const dept = department.replace(/\s/g, '').substring(0, 4).toUpperCase();
  const d    = date.replace(/-/g, '');
  return version > 1 ? `SA-${dept}-${d}-v${version}` : `SA-${dept}-${d}`;
}

async function _nextVersion(parentId) {
  // Find the highest version in this correction chain
  const { data } = await supabase
    .from('site_assignments')
    .select('version')
    .or(`id.eq.${parentId},parent_id.eq.${parentId}`)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 1) + 1;
}

function _isLateCorrection(parentId, assignmentDate) {
  if (!parentId) return false;
  const today = new Date().toISOString().split('T')[0];
  return assignmentDate !== today;   // corrections for past dates require DH approval
}

function _byName(a, b) {
  return (a.employee_name_en || '').localeCompare(b.employee_name_en || '');
}

function _tally(lines) {
  return {
    assigned: lines.filter(l => l.status === 'ASSIGNED').length,
    idle:     lines.filter(l => l.status === 'IDLE').length,
    leave:    lines.filter(l => l.status === 'LEAVE').length,
    absent:   lines.filter(l => l.status === 'ABSENT').length,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════════════════════════
module.exports = { generateSiteAssignment, correctSiteAssignment };

// ════════════════════════════════════════════════════════════════════════════
//  CLI TEST  —  node site_assignment_generator.js
// ════════════════════════════════════════════════════════════════════════════
if (require.main === module) {
  require('dotenv').config();

  // ── Example: generate a fresh assignment ──────────────────────────────
  generateSiteAssignment({
    department:       'CISU',
    assignmentDate:   new Date().toISOString().split('T')[0],
    periodType:       'Daily',
    coordinatorId:    'replace-with-real-uuid',
    coordinatorName:  'Ahmed Al-Rashidi',
    generalProjectNo: 'P-CISU-2026',
    assignments: [
      // Fill in real employee UUIDs from your Supabase employees table
      { employeeId: 'emp-uuid-001', projectNo: 'P-2026-017', siteNo: 'S-03', status: 'ASSIGNED', remarks: '' },
      { employeeId: 'emp-uuid-002', projectNo: '',           siteNo: '',      status: 'IDLE',     remarks: 'Awaiting deployment' },
      { employeeId: 'emp-uuid-003', projectNo: '',           siteNo: '',      status: 'LEAVE',    remarks: 'Annual leave approved' },
      { employeeId: 'emp-uuid-004', projectNo: 'P-2026-019', siteNo: 'S-07', status: 'ASSIGNED', remarks: '' },
    ],
  })
  .then(r => console.log('Result:', JSON.stringify(r, null, 2)))
  .catch(e => console.error('Error:', e.message));

  // ── Example: submit a correction ──────────────────────────────────────
  // correctSiteAssignment({
  //   departmentOrRef: 'CISU',
  //   assignmentDate:  '2026-09-02',
  //   coordinatorId:   'replace-with-real-uuid',
  //   correctionReason: 'Ahmed was mistakenly marked IDLE — he was assigned to P-2026-017',
  //   assignments: [
  //     { employeeId: 'emp-uuid-001', projectNo: 'P-2026-017', siteNo: 'S-03', status: 'ASSIGNED', remarks: 'Correction' },
  //     // ... all other employees, full list
  //   ],
  // }).then(console.log).catch(console.error);
}
