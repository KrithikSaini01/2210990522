; ============================================================
;  OBSIDYN Secure Execution Environment – Inno Setup Script
;  Requires Inno Setup 6.x  (https://jrsoftware.org/isinfo.php)
;  Build:  iscc obsidyn_setup.iss
; ============================================================

#define MyAppName      "OBSIDYN"
#define MyAppVersion   "2.0.0"
#define MyAppPublisher "OBSIDYN Systems"
#define MyAppURL       "https://obsidyn.local"
#define MyAppExeName   "OBSIDYN.exe"
#define MyAppDir       "dist-app\OBSIDYN-win32-x64"

[Setup]
AppId={{D1A2B3C4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=releases
OutputBaseFilename=OBSIDYN_Setup_v{#MyAppVersion}
WizardStyle=modern
WizardResizable=yes
Compression=lzma2/ultra64
SolidCompression=yes
ShowLanguageDialog=no
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}

; Modern look — requires a WizardImageFile (optional, comment out if missing)
; WizardImageFile=installer_assets\wizard_banner.bmp
; WizardSmallImageFile=installer_assets\wizard_icon.bmp

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; ---- Application files ----
Source: "{#MyAppDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; ---- Default config (never overwrite existing user config) ----
; These are copied fresh on first install; user edits survive upgrades.
Source: "config\app_config.json";     DestDir: "{userappdata}\OBSIDYN\config"; Flags: onlyifdoesntexist
Source: "config\security_policy.json"; DestDir: "{userappdata}\OBSIDYN\config"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\{#MyAppName}";                   Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}";             Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Register the app so it can be found in Add/Remove Programs
Root: HKCU; Subkey: "Software\OBSIDYN"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\OBSIDYN"; ValueType: string; ValueName: "Version";     ValueData: "{#MyAppVersion}"

[Run]
; Offer to launch OBSIDYN after install finishes
Filename: "{app}\{#MyAppExeName}"; \
  Description: "{cm:LaunchProgram,{#MyAppName}}"; \
  Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up user data only if user agrees (do NOT auto-delete — respect privacy)
; To also wipe user data, uncomment the next line:
; Type: filesandordirs; Name: "{userappdata}\OBSIDYN"

[Code]
{ ----------------------------------------------------------------
  Custom wizard pages: welcome banner + progress feedback
  ---------------------------------------------------------------- }

procedure InitializeWizard();
begin
  WizardForm.Caption := 'OBSIDYN Setup';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
end;
