// Puts the Utang Tracker icon and name on the Windows .exe without needing Wine.
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  const nt = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(nt);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const v = context.packager.appInfo.version.split('.').map(Number);
    vi.setFileVersion(v[0], v[1], v[2], 0); vi.setProductVersion(v[0], v[1], v[2], 0);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: 'Utang Tracker', ProductName: 'Utang Tracker', CompanyName: 'Max Azores',
      OriginalFilename: 'Utang Tracker.exe', InternalName: 'Utang Tracker', LegalCopyright: '© 2026 Max Azores'
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(nt);
  fs.writeFileSync(exe, Buffer.from(nt.generate()));
  console.log('  • icon and version info set on', path.basename(exe));
};
