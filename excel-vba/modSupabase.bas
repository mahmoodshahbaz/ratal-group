Attribute VB_Name = "modSupabase"
' ================================================================
'  modSupabase.bas
'  ACCSYS — Supabase Authentication & API Module for Excel VBA
'
'  HOW TO IMPORT:
'  1. Open Excel → Press Alt+F11 (VBA Editor)
'  2. File → Import File → select this file
'  3. Update SUPABASE_URL and SUPABASE_ANON below
'  4. Done — all workbook UserForms can now call these functions
' ================================================================
Option Explicit

' ── CONFIGURATION ─────────────────────────────────────────────
' Replace these two values with your Supabase project details
' Found in: Supabase Dashboard → Settings → API

Private Const SUPABASE_URL  As String = "https://YOUR_PROJECT_REF.supabase.co"
Private Const SUPABASE_ANON As String = "YOUR_ANON_KEY_HERE"

' ── SESSION (memory only — never written to file or cells) ────
Private g_AccessToken   As String
Private g_RefreshToken  As String
Private g_UserEmail     As String
Private g_UserRole      As String
Private g_TokenExpiry   As Date

' ================================================================
'  AUTHENTICATION
' ================================================================

' Call this from your Login button
Public Function SB_Login(email As String, password As String) As Boolean
    Dim http    As Object
    Dim body    As String
    Dim resp    As String

    Set http = CreateObject("MSXML2.XMLHTTP")
    body = "{""email"":""" & email & """,""password"":""" & password & """}"

    On Error GoTo LoginFailed
    http.Open "POST", SUPABASE_URL & "/auth/v1/token?grant_type=password", False
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "apikey", SUPABASE_ANON
    http.send body

    If http.Status = 200 Then
        resp = http.responseText
        g_AccessToken  = ExtractStr(resp, "access_token")
        g_RefreshToken = ExtractStr(resp, "refresh_token")
        g_UserEmail    = email
        g_TokenExpiry  = Now + (1 / 24)   ' token valid for 1 hour
        ' Try to read role from user_metadata
        g_UserRole = ExtractStr(resp, "role")
        SB_Login = True
    Else
        SB_Login = False
    End If
    Exit Function
LoginFailed:
    SB_Login = False
End Function

' Refresh the session token (call silently before long sessions)
Public Function SB_RefreshSession() As Boolean
    If Len(g_RefreshToken) = 0 Then
        SB_RefreshSession = False
        Exit Function
    End If

    Dim http As Object
    Dim body As String
    Dim resp As String

    Set http = CreateObject("MSXML2.XMLHTTP")
    body = "{""refresh_token"":""" & g_RefreshToken & """}"

    On Error GoTo RefreshFailed
    http.Open "POST", SUPABASE_URL & "/auth/v1/token?grant_type=refresh_token", False
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "apikey", SUPABASE_ANON
    http.send body

    If http.Status = 200 Then
        resp = http.responseText
        g_AccessToken  = ExtractStr(resp, "access_token")
        g_RefreshToken = ExtractStr(resp, "refresh_token")
        g_TokenExpiry  = Now + (1 / 24)
        SB_RefreshSession = True
    Else
        SB_RefreshSession = False
    End If
    Exit Function
RefreshFailed:
    SB_RefreshSession = False
End Function

' Clear session — call on workbook close or logout button
Public Sub SB_Logout()
    g_AccessToken  = ""
    g_RefreshToken = ""
    g_UserEmail    = ""
    g_UserRole     = ""
    g_TokenExpiry  = 0
End Sub

' Check if current session is still valid
Public Function SB_IsLoggedIn() As Boolean
    SB_IsLoggedIn = (Len(g_AccessToken) > 0 And Now < g_TokenExpiry)
End Function

' Auto-refresh if expiring within 5 minutes
Public Function SB_EnsureSession() As Boolean
    If Not SB_IsLoggedIn() Then
        If Len(g_RefreshToken) > 0 Then
            SB_EnsureSession = SB_RefreshSession()
        Else
            SB_EnsureSession = False
        End If
    Else
        SB_EnsureSession = True
    End If
End Function

' Get current logged-in user info
Public Function SB_GetEmail() As String
    SB_GetEmail = g_UserEmail
End Function

Public Function SB_GetRole() As String
    SB_GetRole = g_UserRole
End Function

' ================================================================
'  API — DATA OPERATIONS
' ================================================================

' ── GET — Fetch rows from a table ────────────────────────────
' Returns raw JSON string
' query examples:
'   "?select=*"                          → all rows
'   "?employee_id=eq.EMP-001&select=*"   → filter by employee
'   "?select=*&order=created_at.desc"    → sorted
'   "?select=*&limit=50"                 → limit rows

Public Function SB_GET(tableName As String, Optional query As String = "?select=*") As String
    If Not SB_EnsureSession() Then
        MsgBox "Session expired. Please log in again.", vbExclamation, "ACCSYS"
        SB_GET = ""
        ShowLogin
        Exit Function
    End If

    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")

    On Error GoTo GetFailed
    http.Open "GET", SUPABASE_URL & "/rest/v1/" & tableName & query, False
    http.setRequestHeader "apikey",        SUPABASE_ANON
    http.setRequestHeader "Authorization", "Bearer " & g_AccessToken
    http.setRequestHeader "Content-Type",  "application/json"
    http.send

    If http.Status = 200 Then
        SB_GET = http.responseText
    Else
        SB_GET = ""
        MsgBox "Error " & http.Status & " fetching " & tableName & ":" & vbCr & _
               http.responseText, vbCritical, "ACCSYS"
    End If
    Exit Function
GetFailed:
    SB_GET = ""
    MsgBox "Connection error. Check your internet connection.", vbCritical, "ACCSYS"
End Function

' ── POST — Insert a new record ───────────────────────────────
' Returns True if successful
' jsonBody example: "{""name"":""Ahmed"",""amount"":500}"

Public Function SB_POST(tableName As String, jsonBody As String) As Boolean
    If Not SB_EnsureSession() Then
        MsgBox "Session expired. Please log in again.", vbExclamation, "ACCSYS"
        SB_POST = False
        ShowLogin
        Exit Function
    End If

    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")

    On Error GoTo PostFailed
    http.Open "POST", SUPABASE_URL & "/rest/v1/" & tableName, False
    http.setRequestHeader "apikey",        SUPABASE_ANON
    http.setRequestHeader "Authorization", "Bearer " & g_AccessToken
    http.setRequestHeader "Content-Type",  "application/json"
    http.setRequestHeader "Prefer",        "return=representation"
    http.send jsonBody

    If http.Status = 201 Then
        SB_POST = True
    Else
        SB_POST = False
        MsgBox "Error saving record to " & tableName & ":" & vbCr & _
               http.responseText, vbCritical, "ACCSYS"
    End If
    Exit Function
PostFailed:
    SB_POST = False
    MsgBox "Connection error.", vbCritical, "ACCSYS"
End Function

' ── PATCH — Update existing record(s) ───────────────────────
' filterQuery example: "?id=eq.123"
' jsonBody example:    "{""status"":""approved""}"

Public Function SB_PATCH(tableName As String, filterQuery As String, jsonBody As String) As Boolean
    If Not SB_EnsureSession() Then
        MsgBox "Session expired. Please log in again.", vbExclamation, "ACCSYS"
        SB_PATCH = False
        ShowLogin
        Exit Function
    End If

    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")

    On Error GoTo PatchFailed
    http.Open "PATCH", SUPABASE_URL & "/rest/v1/" & tableName & filterQuery, False
    http.setRequestHeader "apikey",        SUPABASE_ANON
    http.setRequestHeader "Authorization", "Bearer " & g_AccessToken
    http.setRequestHeader "Content-Type",  "application/json"
    http.setRequestHeader "Prefer",        "return=representation"
    http.send jsonBody

    SB_PATCH = (http.Status = 200)
    If Not SB_PATCH Then
        MsgBox "Error updating " & tableName & ":" & vbCr & _
               http.responseText, vbCritical, "ACCSYS"
    End If
    Exit Function
PatchFailed:
    SB_PATCH = False
    MsgBox "Connection error.", vbCritical, "ACCSYS"
End Function

' ── DELETE — Delete record(s) ────────────────────────────────
' filterQuery example: "?id=eq.123"

Public Function SB_DELETE(tableName As String, filterQuery As String) As Boolean
    If Not SB_EnsureSession() Then
        MsgBox "Session expired. Please log in again.", vbExclamation, "ACCSYS"
        SB_DELETE = False
        ShowLogin
        Exit Function
    End If

    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")

    On Error GoTo DeleteFailed
    http.Open "DELETE", SUPABASE_URL & "/rest/v1/" & tableName & filterQuery, False
    http.setRequestHeader "apikey",        SUPABASE_ANON
    http.setRequestHeader "Authorization", "Bearer " & g_AccessToken
    http.setRequestHeader "Content-Type",  "application/json"
    http.send

    SB_DELETE = (http.Status = 200 Or http.Status = 204)
    Exit Function
DeleteFailed:
    SB_DELETE = False
End Function

' ── RPC — Call a Supabase database function ──────────────────
' funcName: the PostgreSQL function name
' jsonArgs: "{""param1"":""value1""}"

Public Function SB_RPC(funcName As String, jsonArgs As String) As String
    If Not SB_EnsureSession() Then
        SB_RPC = ""
        Exit Function
    End If

    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")

    On Error GoTo RPCFailed
    http.Open "POST", SUPABASE_URL & "/rest/v1/rpc/" & funcName, False
    http.setRequestHeader "apikey",        SUPABASE_ANON
    http.setRequestHeader "Authorization", "Bearer " & g_AccessToken
    http.setRequestHeader "Content-Type",  "application/json"
    http.send jsonArgs

    If http.Status = 200 Then
        SB_RPC = http.responseText
    Else
        SB_RPC = ""
    End If
    Exit Function
RPCFailed:
    SB_RPC = ""
End Function

' ================================================================
'  JSON HELPERS
' ================================================================

' Extract a simple string or number value from a JSON string
' Works for flat responses (not nested objects)
Public Function ExtractStr(json As String, key As String) As String
    Dim pos     As Long
    Dim start   As Long
    Dim ch      As String

    pos = InStr(json, """" & key & """")
    If pos = 0 Then
        ExtractStr = ""
        Exit Function
    End If

    pos = InStr(pos, json, ":") + 1
    Do While Mid(json, pos, 1) = " "
        pos = pos + 1
    Loop

    ch = Mid(json, pos, 1)

    If ch = """" Then
        pos = pos + 1
        start = pos
        Do
            ch = Mid(json, pos, 1)
            If ch = "\" Then
                pos = pos + 2
            ElseIf ch = """" Then
                Exit Do
            Else
                pos = pos + 1
            End If
        Loop
        ExtractStr = Mid(json, start, pos - start)
    Else
        start = pos
        Do While pos <= Len(json)
            ch = Mid(json, pos, 1)
            If ch = "," Or ch = "}" Or ch = "]" Then Exit Do
            pos = pos + 1
        Loop
        ExtractStr = Trim(Mid(json, start, pos - start))
    End If
End Function

' Parse a JSON array of objects into a 2D array
' Returns array(row, col) — row 0 is headers
' keys: comma-separated field names e.g. "id,employee_id,amount,status"
Public Function ParseJSONTable(json As String, keys As String) As Variant
    Dim keyArr()    As String
    Dim rows()      As String
    Dim result()    As String
    Dim i           As Long
    Dim j           As Long
    Dim rowStart    As Long
    Dim rowEnd      As Long
    Dim rowCount    As Long
    Dim obj         As String

    keyArr = Split(keys, ",")

    ' Count rows by counting "{"  occurrences in array
    Dim tempPos As Long
    tempPos = 1
    rowCount = 0
    Do
        tempPos = InStr(tempPos, json, "{")
        If tempPos = 0 Then Exit Do
        rowCount = rowCount + 1
        tempPos = tempPos + 1
    Loop

    If rowCount = 0 Then
        ParseJSONTable = Array()
        Exit Function
    End If

    ReDim result(0 To rowCount, 0 To UBound(keyArr))

    ' Header row
    For j = 0 To UBound(keyArr)
        result(0, j) = Trim(keyArr(j))
    Next j

    ' Data rows
    Dim curPos As Long
    curPos = 1
    i = 1

    Do
        rowStart = InStr(curPos, json, "{")
        If rowStart = 0 Then Exit Do

        ' Find matching closing brace
        Dim depth As Long
        depth = 1
        rowEnd = rowStart + 1
        Do While rowEnd <= Len(json) And depth > 0
            Dim c As String
            c = Mid(json, rowEnd, 1)
            If c = "{" Then depth = depth + 1
            If c = "}" Then depth = depth - 1
            rowEnd = rowEnd + 1
        Loop

        obj = Mid(json, rowStart, rowEnd - rowStart)

        For j = 0 To UBound(keyArr)
            result(i, j) = ExtractStr(obj, Trim(keyArr(j)))
        Next j

        i = i + 1
        curPos = rowEnd
    Loop

    ParseJSONTable = result
End Function

' Safely escape a string for inclusion in a JSON body
Public Function JSONEscape(s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, vbCr, "\r")
    s = Replace(s, vbLf, "\n")
    s = Replace(s, vbTab, "\t")
    JSONEscape = s
End Function

' ================================================================
'  UI HELPERS
' ================================================================

' Show login form — call from Workbook_Open
Public Sub ShowLogin()
    frmLogin.Show vbModal
End Sub

' Write a parsed table into a worksheet starting at a cell
Public Sub DumpTableToSheet(data As Variant, ws As Worksheet, startRow As Long, startCol As Long)
    If Not IsArray(data) Then Exit Sub
    Dim r As Long, c As Long
    For r = 0 To UBound(data, 1)
        For c = 0 To UBound(data, 2)
            ws.Cells(startRow + r, startCol + c).Value = data(r, c)
        Next c
    Next r
    ' Bold the header row
    ws.Rows(startRow).Font.Bold = True
End Sub

' ================================================================
'  END OF MODULE
' ================================================================
