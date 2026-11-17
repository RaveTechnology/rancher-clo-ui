"""Build immutable Rancher UI assets, a release archive and a Helm catalogue."""
import argparse,gzip,hashlib,io,json,os,pathlib,re,shutil,subprocess,tarfile,tempfile

def prepare_ui(source,site,version):
 source=pathlib.Path(source);site=pathlib.Path(site)
 if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?',version):raise ValueError('invalid version')
 files={}
 for path in sorted(source.rglob('*')):
  if path.is_symlink():raise ValueError('symlinks are not release assets')
  if path.is_file() and path.name!='report.html' and not path.name.endswith('.map'):
   files['plugin/'+path.relative_to(source).as_posix()]=path.read_bytes()
 if 'plugin/clo-ui-'+version+'.umd.min.js' not in files:raise ValueError('main bundle missing')
 metadata=json.loads(files.get('plugin/package.json',b'{}'))
 if metadata.get('name')!='clo-ui' or metadata.get('version')!=version:raise ValueError('bundle version mismatch')
 files['files.txt']=(''.join(name+'\n' for name in sorted(files))).encode()
 target=site/'clo-ui'/version
 if (site/'clo-ui').is_symlink() or target.is_symlink():raise ValueError('unsafe publication directory')
 if target.exists():
  paths=list(target.rglob('*'))
  if any(p.is_symlink() for p in paths):raise ValueError('unsafe existing assets')
  previous={p.relative_to(target).as_posix():p.read_bytes() for p in paths if p.is_file()}
  if previous!=files:raise ValueError('published version differs; increment the version')
  return target
 target.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='.prepare-',dir=target.parent) as temporary:
  staging=pathlib.Path(temporary)/'version';staging.mkdir()
  for name,body in files.items():
   path=staging/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body)
  os.rename(staging,target)
 return target

def archive_directory(source,destination):
 with pathlib.Path(destination).open('wb') as out,gzip.GzipFile(filename='',mode='wb',fileobj=out,mtime=0) as zipped,tarfile.open(fileobj=zipped,mode='w',format=tarfile.PAX_FORMAT) as tar:
  for path in sorted(pathlib.Path(source).rglob('*')):
   if not path.is_file():continue
   data=path.read_bytes();info=tarfile.TarInfo(path.relative_to(source).as_posix());info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))

def main():
 import yaml
 parser=argparse.ArgumentParser();parser.add_argument('--version',required=True);parser.add_argument('--site',default='_site');parser.add_argument('--repository',default='RaveTechnology/rancher-clo-ui');args=parser.parse_args()
 version=args.version.removeprefix('v');root=pathlib.Path(__file__).resolve().parents[1];os.chdir(root)
 package=json.loads((root/'pkg/clo-ui/package.json').read_text());chart=yaml.safe_load((root/'deploy/chart/Chart.yaml').read_text())
 if package['version']!=version or chart['version']!=version or chart['appVersion']!=version:raise ValueError('tag, package and chart versions must match')
 owner,repo=args.repository.split('/');base='https://'+owner.lower()+'.github.io/'+repo
 site=pathlib.Path(args.site);target=prepare_ui(root/('dist-pkg/clo-ui-'+version),site,version)
 dist=root/'dist';dist.mkdir(exist_ok=True);archive_directory(target,dist/('clo-ui-'+version+'.tar.gz'))
 checks=''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(target).as_posix()+'\n' for p in sorted(target.rglob('*')) if p.is_file())
 (dist/('clo-ui-'+version+'.files.sha256')).write_text(checks)
 (site/'manifests').mkdir(exist_ok=True);(site/'manifests'/('clo-ui-'+version+'.sha256')).write_text(checks)
 with tempfile.TemporaryDirectory(prefix='clo-ui-chart-') as temporary:
  chartdir=pathlib.Path(temporary)/'clo-ui';shutil.copytree(root/'deploy/chart',chartdir)
  values=yaml.safe_load((chartdir/'values.yaml').read_text());values['endpoint']=base+'/clo-ui/'+version;(chartdir/'values.yaml').write_text(yaml.safe_dump(values,sort_keys=False))
  subprocess.run(['helm','package',str(chartdir),'--destination',str(dist)],check=True)
 charts=site/'charts';charts.mkdir(exist_ok=True);name='clo-ui-'+version+'.tgz';destination=charts/name
 if destination.exists() and destination.read_bytes()!=(dist/name).read_bytes():raise ValueError('published chart differs; increment version')
 shutil.copyfile(dist/name,destination)
 subprocess.run(['helm','repo','index',str(charts),'--url',base+'/charts'],check=True)
 (site/'.nojekyll').write_text('');(site/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>CLO Rancher UI</title><a href="charts/index.yaml">Helm repository</a>')
 (dist/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in sorted(dist.iterdir()) if p.is_file() and p.name!='SHA256SUMS'))
 print(json.dumps({'version':version,'endpoint':base+'/clo-ui/'+version,'chartRepository':base+'/charts'}))

if __name__=='__main__':main()
