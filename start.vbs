Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "C:\employee-sync-master\start.bat" & Chr(34), 0
Set WshShell = Nothing