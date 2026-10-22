Attribute VB_Name = "frmLogin"
' ================================================================
'  frmLogin — Login UserForm Code
'
'  HOW TO CREATE THE FORM:
'  1. In VBA Editor: Insert → UserForm
'  2. Name it: frmLogin (in Properties panel, change Name)
'  3. Add these controls (drag from Toolbox):
'
'     Control      Name          Properties
'     ─────────────────────────────────────────────────────
'     Label        lblTitle      Caption = "ACCSYS Login"
'                                Font: Bold, 16pt
'     Label        lblEmail      Caption = "Email Address"
'     TextBox      txtEmail
'     Label        lblPass       Caption = "Password"
'     TextBox      txtPassword   PasswordChar = *
'     CommandButton cmdLogin     Caption = "Login"
'     CommandButton cmdCancel    Caption = "Cancel"
'     Label        lblError      Caption = ""
'                                ForeColor = Red
'                                Visible = False
'
'  4. Paste the code below into the form's code window
'  5. Done — the form is ready
' ================================================================
Option Explicit

' Prevent closing without logging in
Private Sub UserForm_QueryClose(Cancel As Integer, CloseMode As Integer)
    If CloseMode = 0 Then   ' user clicked X
        If Not SB_IsLoggedIn() Then
            Cancel = True
            MsgBox "You must log in to use this workbook.", vbExclamation, "ACCSYS"
        End If
    End If
End Sub

Private Sub UserForm_Initialize()
    Me.Caption = "ACCSYS — Secure Login"
    txtEmail.SetFocus
End Sub

' Login button
Private Sub cmdLogin_Click()
    lblError.Visible = False

    ' Basic validation
    If Trim(txtEmail.Text) = "" Then
        ShowError "Please enter your email address."
        txtEmail.SetFocus
        Exit Sub
    End If

    If Trim(txtPassword.Text) = "" Then
        ShowError "Please enter your password."
        txtPassword.SetFocus
        Exit Sub
    End If

    ' Show loading state
    cmdLogin.Enabled = False
    cmdLogin.Caption = "Logging in..."
    Me.Repaint

    ' Attempt login
    Dim success As Boolean
    success = SB_Login(Trim(txtEmail.Text), txtPassword.Text)

    If success Then
        ' Clear sensitive data from form
        txtPassword.Text = ""

        ' Show welcome message briefly
        MsgBox "Welcome, " & SB_GetEmail() & "!" & vbCr & _
               "You are now connected to ACCSYS.", vbInformation, "ACCSYS"

        Unload Me   ' Close the login form
    Else
        ' Reset button
        cmdLogin.Enabled = True
        cmdLogin.Caption = "Login"
        ShowError "Incorrect email or password. Please try again."
        txtPassword.Text = ""
        txtPassword.SetFocus
    End If
End Sub

' Cancel button — closes workbook if not logged in
Private Sub cmdCancel_Click()
    If Not SB_IsLoggedIn() Then
        If MsgBox("You must log in to use this workbook." & vbCr & _
                  "Close the workbook?", vbYesNo + vbQuestion, "ACCSYS") = vbYes Then
            Unload Me
            ThisWorkbook.Close SaveChanges:=False
        End If
    Else
        Unload Me
    End If
End Sub

' Allow Enter key to trigger login
Private Sub txtPassword_KeyDown(KeyCode As Integer, Shift As Integer)
    If KeyCode = 13 Then cmdLogin_Click
End Sub

Private Sub txtEmail_KeyDown(KeyCode As Integer, Shift As Integer)
    If KeyCode = 13 Then
        txtPassword.SetFocus
    End If
End Sub

' Show error message on form
Private Sub ShowError(msg As String)
    lblError.Caption = msg
    lblError.Visible = True
End Sub

' ================================================================
'  END OF FORM CODE
' ================================================================
