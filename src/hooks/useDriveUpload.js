/**
 * useDriveUpload.js
 * ACCSYS — React hook for uploading photos/files to Google Drive
 * via the drive-upload Supabase Edge Function.
 *
 * Usage in any form:
 *
 *   const { upload, uploading, error } = useDriveUpload()
 *
 *   // When user picks a file:
 *   const result = await upload(file, 'expenses')
 *   if (result) {
 *     console.log(result.viewUrl)    // hyperlink for Excel / admin view
 *     console.log(result.directUrl)  // direct image URL for Excel IMAGE()
 *     console.log(result.fileId)     // Drive file ID
 *   }
 *
 * Folder options: 'expenses' | 'sites' | 'fleet' | 'vouchers' | 'invoices'
 */

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Config ────────────────────────────────────────────────────
const FUNCTION_NAME = 'drive-upload'

// Maximum file size: 10 MB
const MAX_SIZE_BYTES = 10 * 1024 * 1024

// Allowed MIME types
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // .docx
  'application/pdf',
]

// ── Hook ──────────────────────────────────────────────────────
export function useDriveUpload() {
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState(null)

  /**
   * upload(file, folder, customName?)
   *
   * @param {File}   file       — the File object from <input type="file">
   * @param {string} folder     — Drive subfolder: expenses | sites | fleet | vouchers | invoices
   * @param {string} [prefix]   — optional filename prefix (e.g. employee ID)
   * @returns {Promise<{fileId, viewUrl, directUrl}|null>}
   */
  const upload = useCallback(async (file, folder, prefix = '') => {
    setError(null)

    // ── Validate ──────────────────────────────────────────────
    if (!file) {
      setError('No file selected.')
      return null
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('File type not supported. Please use JPG, PNG, or PDF.')
      return null
    }

    if (file.size > MAX_SIZE_BYTES) {
      setError('File too large. Maximum size is 10 MB.')
      return null
    }

    setUploading(true)

    try {
      // ── Convert file to base64 ────────────────────────────
      const base64 = await fileToBase64(file)

      // ── Build a structured filename ───────────────────────
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const ext       = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const safeName  = prefix
        ? `${prefix}_${timestamp}.${ext}`
        : `${timestamp}.${ext}`

      // ── Call the edge function ────────────────────────────
      const { data, error: fnError } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          file:     base64,
          fileName: safeName,
          mimeType: file.type,
          folder,
        },
      })

      if (fnError) throw new Error(fnError.message)
      if (!data?.success) throw new Error(data?.error || 'Upload failed')

      return {
        fileId:    data.fileId,
        viewUrl:   data.viewUrl,    // use as hyperlink in Excel / admin
        directUrl: data.directUrl,  // use in Excel IMAGE() function
      }

    } catch (err) {
      console.error('[useDriveUpload]', err)
      setError(err.message || 'Upload failed. Please try again.')
      return null

    } finally {
      setUploading(false)
    }
  }, [])

  return { upload, uploading, error }
}

// ── Helper: File → base64 string ─────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => {
      // reader.result is "data:image/jpeg;base64,/9j/4AAQ..."
      // We only want the part after the comma
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result.split(',')[1])
      } else {
        reject(new Error('Failed to read file'))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ── Standalone helper for components that don't need the hook ─
// Call this directly if you just need a one-off upload
export async function uploadToDrive(file, folder, prefix = '') {
  const base64    = await fileToBase64(file)
  const ext       = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  // If prefix already contains a date (YYYY-MM-DD), just add time; otherwise add full timestamp
  const hasDate   = /\d{4}-\d{2}-\d{2}/.test(prefix)
  const timePart  = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19)
  const fullStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeName  = prefix
    ? `${prefix}_${hasDate ? timePart : fullStamp}.${ext}`
    : `${fullStamp}.${ext}`

  const { data, error } = await supabase.functions.invoke('drive-upload', {
    body: { file: base64, fileName: safeName, mimeType: file.type, folder },
  })

  if (error || !data?.success) {
    throw new Error(error?.message || data?.error || 'Upload failed')
  }

  return { fileId: data.fileId, viewUrl: data.viewUrl, directUrl: data.directUrl }
}
