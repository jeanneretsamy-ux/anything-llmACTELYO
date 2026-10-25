const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const REQUIRED_DISK_GIB = 50;
const REQUIRED_RAM_GIB = 8;
const WINDOWS_GUIDE = 'https://docs.openr.ag/install-windows/';
const DOCKER_DOWNLOAD = 'https://docs.docker.com/desktop/setup/install/windows-install/';

async function command(file, args, timeout = 15000) {
  try {
    const result = await execFileAsync(file, args, { timeout, windowsHide: true, encoding: 'utf8' });
    return { ok: true, output: result.stdout.trim() };
  } catch {
    return { ok: false, output: '' };
  }
}

function freeGiB(directory) {
  const stats = fs.statfsSync(directory, { bigint: true });
  return Number(stats.bavail * stats.bsize) / 1024 ** 3;
}

async function diagnose(directory) {
  const diskGiB = freeGiB(directory);
  const ramGiB = os.totalmem() / 1024 ** 3;
  const wsl = await command('wsl.exe', ['--version'], 10000);
  const ubuntu = wsl.ok ? await command('wsl.exe', ['-d', 'Ubuntu', '--', 'uname', '-r']) : { ok: false, output: '' };
  const wsl2 = ubuntu.ok && /microsoft.*wsl2/i.test(ubuntu.output);
  const docker = wsl2
    ? await command('wsl.exe', ['-d', 'Ubuntu', '--', 'docker', 'version', '--format', '{{.Server.Version}}'], 20000)
    : { ok: false, output: '' };
  const compose = docker.ok
    ? await command('wsl.exe', ['-d', 'Ubuntu', '--', 'docker', 'compose', 'version'], 12000)
    : { ok: false, output: '' };
  return { diskGiB, ramGiB, wslInstalled: wsl.ok, wsl2, dockerReady: docker.ok,
    dockerVersion: docker.output, composeReady: compose.ok,
    ready: diskGiB >= REQUIRED_DISK_GIB && ramGiB >= REQUIRED_RAM_GIB && wsl2 && docker.ok && compose.ok };
}

function formatDiagnosis(result) {
  const mark = (ready) => ready ? 'OK' : 'À préparer';
  return [
    `Espace libre sur le disque du profil Actelyo : ${result.diskGiB.toFixed(1)} Go (${REQUIRED_DISK_GIB} Go recommandés pour OpenRAG) — ${mark(result.diskGiB >= REQUIRED_DISK_GIB)}`,
    `Mémoire du poste : ${result.ramGiB.toFixed(1)} Go (${REQUIRED_RAM_GIB} Go recommandés) — ${mark(result.ramGiB >= REQUIRED_RAM_GIB)}`,
    `WSL 2 avec Ubuntu : ${mark(result.wsl2)}`,
    `Docker dans Ubuntu : ${mark(result.dockerReady)}${result.dockerVersion ? `, moteur ${result.dockerVersion}` : ''}`,
    `Docker Compose : ${mark(result.composeReady)}`,
    ...(result.wsl2 && !result.dockerReady
      ? ['Dans Docker Desktop, activez Ubuntu sous Settings → Resources → WSL Integration, puis Apply & restart.']
      : []),
    '',
    result.ready
      ? 'Prérequis apparents réunis. Vérifiez aussi le disque où Docker stocke ses images. OpenRAG reste une installation distincte ; aucun conteneur n’est démarré.'
      : 'Actelyo RAG et son moteur habituel restent utilisables sans OpenRAG. Aucun téléchargement ni conteneur n’est lancé par ce diagnostic.',
  ].join('\n');
}

async function launchWslInstaller() {
  // The user explicitly chooses this action in the desktop dialog. UAC and the
  // Ubuntu account setup remain visible and under the user's control.
  const script = '$ErrorActionPreference="Stop"; Start-Process -FilePath wsl.exe -ArgumentList "--install -d Ubuntu" -Verb RunAs';
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script],
    { timeout: 120000, windowsHide: true });
}

module.exports = { diagnose, formatDiagnosis, launchWslInstaller, WINDOWS_GUIDE, DOCKER_DOWNLOAD,
  REQUIRED_DISK_GIB, REQUIRED_RAM_GIB };
