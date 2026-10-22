Attribute VB_Name = "modExpensesExample"
' ================================================================
'  SAMPLE — How to use modSupabase in a real UserForm
'  This shows a complete example for an Expenses UserForm
'
'  This is a MODULE example (the button click code lives in
'  your UserForm — copy the Sub bodies into your form's code)
' ================================================================
Option Explicit

' ── EXAMPLE 1: Fetch employee by ID ──────────────────────────
' Call this when user types an Employee ID and presses Tab/Enter
Sub FetchEmployee(empId As String)
    If Not SB_IsLoggedIn() Then Exit Sub

    Dim json As String
    json = SB_GET("employees", "?emp_id=eq." & empId & "&select=id,full_name_en,designation,department_id")

    If Len(json) = 0 Or json = "[]" Then
        MsgBox "Employee ID not found: " & empId, vbExclamation, "ACCSYS"
        Exit Sub
    End If

    ' Extract fields from the first result
    ' (The response is an array — we take the first item)
    Dim name        As String
    Dim designation As String

    name        = ExtractStr(json, "full_name_en")
    designation = ExtractStr(json, "designation")

    ' Populate your UserForm controls
    ' txtEmpName.Text = name
    ' txtDesignation.Text = designation

    MsgBox "Found: " & name & " — " & designation   ' Remove this in production
End Sub

' ── EXAMPLE 2: Submit a daily expense to Supabase ────────────
' Call this from your Submit button on the Expense UserForm
Sub SubmitDailyExpense( _
    empId       As String, _
    entityId    As String, _
    expDate     As String, _
    category    As String, _
    amount      As Double, _
    description As String)

    If Not SB_IsLoggedIn() Then
        MsgBox "Please log in first.", vbExclamation, "ACCSYS"
        Exit Sub
    End If

    ' Build JSON body — JSONEscape handles special characters safely
    Dim body As String
    body = "{" & _
        """employee_id"":""" & JSONEscape(empId) & """," & _
        """entity_id"":""" & JSONEscape(entityId) & """," & _
        """expense_date"":""" & expDate & """," & _
        """category"":""" & JSONEscape(category) & """," & _
        """amount"":" & amount & "," & _
        """description"":""" & JSONEscape(description) & """" & _
        "}"

    Dim success As Boolean
    success = SB_POST("daily_expenses", body)

    If success Then
        MsgBox "Expense submitted successfully!", vbInformation, "ACCSYS"
        ' Clear the form fields here
    End If
End Sub

' ── EXAMPLE 3: Load all pending claims into a sheet ──────────
' Call this from a "Refresh" button on a reporting sheet
Sub LoadPendingClaims(targetSheet As Worksheet)
    If Not SB_IsLoggedIn() Then Exit Sub

    ' Fetch submitted expense claims
    Dim json As String
    json = SB_GET("expense_claims", _
        "?status=eq.submitted&select=id,claim_number,employee_id,claim_month,total_amount,status&order=created_at.desc&limit=200")

    If Len(json) = 0 Or json = "[]" Then
        MsgBox "No pending claims found.", vbInformation, "ACCSYS"
        Exit Sub
    End If

    ' Parse into table — specify the columns you want
    Dim data As Variant
    data = ParseJSONTable(json, "id,claim_number,employee_id,claim_month,total_amount,status")

    ' Clear old data and write new
    targetSheet.Cells.Clear
    DumpTableToSheet data, targetSheet, 1, 1

    ' Format amount column (column 5)
    Dim lastRow As Long
    lastRow = UBound(data, 1) + 1
    targetSheet.Range(targetSheet.Cells(2, 5), targetSheet.Cells(lastRow, 5)) _
        .NumberFormat = "#,##0.00"

    MsgBox "Loaded " & UBound(data, 1) & " claims.", vbInformation, "ACCSYS"
End Sub

' ── EXAMPLE 4: Approve a claim ───────────────────────────────
' Call from an Approve button, passing the claim ID
Sub ApproveClaim(claimId As String)
    If Not SB_IsLoggedIn() Then Exit Sub

    Dim body As String
    body = "{""status"":""approved"",""approved_at"":""" & Format(Now, "yyyy-mm-ddThh:mm:ss") & """}"

    Dim success As Boolean
    success = SB_PATCH("expense_claims", "?id=eq." & claimId, body)

    If success Then
        MsgBox "Claim " & claimId & " approved.", vbInformation, "ACCSYS"
    End If
End Sub

' ── EXAMPLE 5: Fetch dropdown list (employees for a ComboBox) ─
' Call during UserForm_Initialize to populate a ComboBox
Sub FillEmployeeDropdown(cbo As Object, entityId As String)
    If Not SB_IsLoggedIn() Then Exit Sub

    Dim json As String
    Dim query As String

    query = "?select=id,full_name_en,emp_id"
    If Len(entityId) > 0 Then
        query = query & "&entity_id=eq." & entityId
    End If
    query = query & "&order=full_name_en.asc"

    json = SB_GET("employees", query)

    If Len(json) = 0 Or json = "[]" Then Exit Sub

    Dim data As Variant
    data = ParseJSONTable(json, "id,full_name_en,emp_id")

    cbo.Clear
    Dim i As Long
    For i = 1 To UBound(data, 1)
        cbo.AddItem data(i, 1) & " — " & data(i, 2)   ' Name — EmpID
        ' Store the ID in ItemData for use on submit
        ' cbo.ItemData(cbo.ListCount - 1) = data(i, 0)
    Next i
End Sub

' ================================================================
'  END OF SAMPLE MODULE
' ================================================================
