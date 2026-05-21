Dim fso, scriptFolder, batPath
Set fso = CreateObject("Scripting.FileSystemObject")
scriptFolder = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptFolder & "\open_in_chrome_browser.bat"
CreateObject("WScript.Shell").Run """" & batPath & """", 0, False
