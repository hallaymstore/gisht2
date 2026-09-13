const { spawn } = require('child_process');
function pickFolder(title='Papka tanlang') {
  if(process.platform!=='win32') throw new Error('Papka tanlash oynasi hozircha Windows uchun');
  return new Promise((resolve,reject)=>{const escaped=String(title).replace(/'/g,"''");const script=`$s=New-Object -ComObject Shell.Application; $f=$s.BrowseForFolder(0,'${escaped}',0,0); if($f){[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output $f.Self.Path}`;const child=spawn('powershell.exe',['-NoProfile','-STA','-Command',script],{windowsHide:true});let out='';let err='';child.stdout.on('data',d=>out+=d.toString());child.stderr.on('data',d=>err+=d.toString());child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(new Error(err.trim()||`PowerShell ${code}`));resolve(out.trim());});});
}
module.exports={pickFolder};
