; Voconly NSIS Installer Hooks
; Customizes installation to use Voconly\Application directory structure

!macro NSIS_HOOK_PREINSTALL
  ; 写入调试日志到文件
  FileOpen $0 "$TEMP\voconly-install.log" a
  FileSeek $0 0 END
  FileWrite $0 "===== PREINSTALL DEBUG =====$\r$\n"
  FileWrite $0 "CMDLINE=$CMDLINE$\r$\n"
  FileWrite $0 "PassiveMode=$PassiveMode$\r$\n"
  FileWrite $0 "UpdateMode=$UpdateMode$\r$\n"
  FileWrite $0 "NoShortcutMode=$NoShortcutMode$\r$\n"
  FileWrite $0 "WixMode=$WixMode$\r$\n"
  FileWrite $0 "INSTDIR=$INSTDIR$\r$\n"
  FileWrite $0 "============================$\r$\n"
  FileClose $0

  DetailPrint "CMDLINE=$CMDLINE"
  DetailPrint "PassiveMode=$PassiveMode"
  DetailPrint "UpdateMode=$UpdateMode"

  ; Create User Data directory structure before installation
  CreateDirectory "$LOCALAPPDATA\Voconly\User Data"
  DetailPrint "Created User Data directory"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 写入安装完成日志
  FileOpen $0 "$TEMP\voconly-install.log" a
  FileSeek $0 0 END
  FileWrite $0 "===== POSTINSTALL =====$\r$\n"
  FileWrite $0 "Installation completed$\r$\n"
  FileWrite $0 "Application files: $INSTDIR$\r$\n"
  FileClose $0

  DetailPrint "Voconly installed successfully"
  DetailPrint "Application files: $INSTDIR"
  DetailPrint "User data will be stored in: $LOCALAPPDATA\Voconly\User Data"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 写入卸载调试日志到文件
  FileOpen $0 "$TEMP\voconly-uninstall.log" a
  FileSeek $0 0 END
  FileWrite $0 "===== PREUNINSTALL DEBUG =====$\r$\n"
  FileWrite $0 "CMDLINE=$CMDLINE$\r$\n"
  FileWrite $0 "PassiveMode=$PassiveMode$\r$\n"
  FileWrite $0 "UpdateMode=$UpdateMode$\r$\n"
  FileWrite $0 "=============================$\r$\n"
  FileClose $0

  DetailPrint "PREUNINSTALL: UpdateMode=$UpdateMode, PassiveMode=$PassiveMode"

  ; 使用 IntCmp 进行可靠的整数比较
  IntCmp $UpdateMode 1 uninstall_continue uninstall_continue 0
  IntCmp $PassiveMode 1 uninstall_continue uninstall_continue 0

  ; 正常卸载时询问用户关于数据保留
  MessageBox MB_YESNO \
    "卸载 Voconly$\r$\n$\r$\n\
    ━━━━━━━━━━━━━━━━━━━━━━━━$\r$\n$\r$\n\
    是否保留您的个人数据？$\r$\n$\r$\n\
    ✓ 语音模型文件$\r$\n\
    ✓ 场景配置与快捷键$\r$\n\
    ✓ 录音历史记录$\r$\n$\r$\n\
    ━━━━━━━━━━━━━━━━━━━━━━━━$\r$\n$\r$\n\
    【是】保留数据，仅卸载程序$\r$\n\
    【否】完全删除所有数据$\r$\n" \
    IDYES keep_data IDNO delete_all

  delete_all:
    RMDir /r "$LOCALAPPDATA\Voconly\User Data"
    DetailPrint "Deleted all user data"
    Goto uninstall_continue

  keep_data:
    DetailPrint "Preserving user data at: $LOCALAPPDATA\Voconly\User Data"

  uninstall_continue:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; 写入卸载完成日志
  FileOpen $0 "$TEMP\voconly-uninstall.log" a
  FileSeek $0 0 END
  FileWrite $0 "===== POSTUNINSTALL =====$\r$\n"
  FileClose $0

  ; Clean up empty parent directory if user data was also deleted
  IfFileExists "$LOCALAPPDATA\Voconly\User Data\*.*" done 0
  RMDir "$LOCALAPPDATA\Voconly"
  done:
!macroend