Attribute VB_Name = "ThisWorkbook"
' ================================================================
'  ThisWorkbook — Workbook Events
'
'  Paste this code into the ThisWorkbook module (not a regular module)
'  In VBA Editor: double-click "ThisWorkbook" in the Project panel
' ================================================================
Option Explicit

' Auto-login when workbook opens
Private Sub Workbook_Open()
    Application.ScreenUpdating = False

    ' Show the login form immediately
    ShowLogin

    ' If user cancelled without logging in, workbook was already closed
    ' If they logged in, continue — show the main sheet
    If SB_IsLoggedIn() Then
        ' Optional: show a welcome sheet or activate main sheet
        ' Sheets("Dashboard").Activate
        Application.ScreenUpdating = True
    End If
End Sub

' Clear session when workbook closes
Private Sub Workbook_BeforeClose(Cancel As Boolean)
    SB_Logout
End Sub

' ================================================================
'  END OF THISWORKBOOK CODE
' ================================================================
