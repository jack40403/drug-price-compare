Dim fso, scriptFolder, batPath
Set fso = CreateObject("Scripting.FileSystemObject")
scriptFolder = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptFolder & "\run_chrome.bat"
CreateObject("WScript.Shell").Run """" & batPath & """", 0, False
