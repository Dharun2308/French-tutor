"""Install the official free French download locally. Audio stays outside Git."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = 'https://downloads.languagetransfer.org/french/french.zip'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive', type=pathlib.Path, help='An already downloaded official french.zip')
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='language-transfer-') as temporary:
    archive = args.archive
    if archive is None:
        archive = pathlib.Path(temporary) / 'french.zip'
        urllib.request.urlretrieve(SOURCE, archive)
    with zipfile.ZipFile(archive) as package:
        tracks = {}
        for entry in package.infolist():
            match = re.fullmatch(r'Language Transfer - Introduction to French - Lesson (\d{2})\.mp3', entry.filename)
            if not match:
                continue
            number = int(match[1])
            if number in tracks:
                raise ValueError('Duplicate lesson in archive')
            tracks[number] = entry
        if set(tracks) != set(range(1, 41)):
            raise ValueError('Expected exactly lessons 01 through 40 in the official archive')
        output = ROOT / 'audio' / 'language-transfer-french'
        output.mkdir(parents=True, exist_ok=True)
        manifest = []
        for number, entry in sorted(tracks.items()):
            target = output / f'{number:02}.mp3'
            partial = target.with_suffix('.part')
            with package.open(entry) as source, partial.open('wb') as destination:
                shutil.copyfileobj(source, destination)
            duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(partial)], text=True).strip())
            if not 0 < duration < 7200:
                raise ValueError(f'Invalid lesson duration: {number}')
            partial.replace(target)
            manifest.append({'number': number, 'duration': round(duration, 3), 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        manifest_path = ROOT / 'src' / 'lib' / 'language-transfer-lessons.json'
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        print(f'Installed {len(manifest)} lessons, {sum(t["duration"] for t in manifest)/3600:.2f} hours, {sum(t["bytes"] for t in manifest)/1024/1024:.1f} MiB.')
