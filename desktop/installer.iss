[Setup]
AppId={{C4D852E7-9CF0-4726-9257-8F3DD50BE427}
AppName=Actelyo RAG Desktop
AppVersion=1.0.1
AppPublisher=Actelyo
DefaultDirName={localappdata}\Programs\Actelyo RAG Desktop
DefaultGroupName=Actelyo RAG Desktop
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist
OutputBaseFilename=Actelyo-RAG-Desktop-Setup-1.0.1-x64
Compression=lzma2/fast
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=4
WizardStyle=modern
UninstallDisplayIcon={app}\Actelyo RAG.exe
CloseApplications=yes
[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
[Files]
Source: "dist\Actelyo RAG Desktop\*"; DestDir: "{app}"; Excludes: "Uninstall*,unins*,*.map,*.d.ts,*\test\*,*\tests\*,*\__tests__\*"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\Actelyo RAG Desktop"; Filename: "{app}\Actelyo RAG.exe"
Name: "{autodesktop}\Actelyo RAG Desktop"; Filename: "{app}\Actelyo RAG.exe"
[Run]
Filename: "{app}\Actelyo RAG.exe"; Description: "Ouvrir Actelyo RAG"; Flags: nowait postinstall skipifsilent
