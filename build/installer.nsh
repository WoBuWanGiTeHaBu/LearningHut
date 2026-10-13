; Study Helper —— NSIS 自定义脚本
;
; 卸载时提醒一句：数据就放在安装目录下的 data\，卸载会连着安装目录一起删。
; （electron-builder 的顺序是：customUnInstall → RMDir /r $INSTDIR，
;   本宏执行时 $INSTDIR\data 还在，所以这里能给出准确的路径提示。）

!macro customUnInstall
  IfFileExists "$INSTDIR\data\learning-hut.db" 0 done
    MessageBox MB_OK|MB_ICONINFORMATION "你的学习数据在：$\r$\n$INSTDIR\data$\r$\n$\r$\n卸载会把安装目录一起删掉。如果还想留着这些数据，请先把上面这个文件夹复制到别的地方。" /SD IDOK
  done:
!macroend

!macro customInstall
  ; 安装完成不额外啰嗦：老数据若还在 $INSTDIR\data 会被新版本直接沿用。
!macroend
