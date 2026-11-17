"""Resume a release without replacing published assets, then allow Pages deploy."""
import argparse,hashlib,json,pathlib,re,subprocess,time,urllib.error,urllib.request

def remote_hash(url):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'rave-technology-release'}),timeout=30) as response:
    digest=hashlib.sha256()
    while chunk:=response.read(1024*1024):digest.update(chunk)
   return digest.hexdigest()
  except (OSError,urllib.error.URLError):
   if attempt==2:raise
   time.sleep(attempt+1)

def missing_assets(assets,files,digest_reader=remote_hash):
 existing={asset['name']:asset for asset in assets}
 if len(existing)!=len(assets):raise ValueError('duplicate release assets')
 missing=[]
 for file in files:
  file=pathlib.Path(file);asset=existing.get(file.name)
  if asset is None:missing.append(file);continue
  if digest_reader(asset['browser_download_url'])!=hashlib.sha256(file.read_bytes()).hexdigest():raise ValueError('published asset differs: '+file.name)
 return missing

def api(path,optional=False):
 process=subprocess.run(['gh','api',path],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if process.returncode:
  if optional and b'(HTTP 404)' in process.stderr:return None
  raise RuntimeError('GitHub API request failed: '+path)
 return json.loads(process.stdout)

def select_release(tag,published,listed):
 if published is not None:
  if published.get('tag_name')!=tag:raise ValueError('release tag mismatch')
  return published
 matches=[release for release in listed if release.get('tag_name')==tag]
 if len(matches)>1:raise ValueError('multiple drafts for the requested release tag')
 return matches[0] if matches else None

def find_release(repository,tag):
 published=api('repos/'+repository+'/releases/tags/'+tag,optional=True)
 if published is not None:return select_release(tag,published,[])
 # The by-tag endpoint can omit drafts, including a draft just created by us.
 process=subprocess.run(['gh','api','--paginate','--slurp','repos/'+repository+'/releases?per_page=100'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
 listed=[release for page in json.loads(process.stdout) for release in page]
 return select_release(tag,None,listed)


def await_release(repository,tag):
 # Read-after-write metadata can lag behind the successful draft creation.
 # Retry only reads; never repeat the create request here.
 for delay in (0,1,2,4):
  if delay:time.sleep(delay)
  release=find_release(repository,tag)
  if release is not None:return release
 return None

def main():
 parser=argparse.ArgumentParser();parser.add_argument('tag');parser.add_argument('--repository',required=True);parser.add_argument('--notes-file',required=True);parser.add_argument('files',nargs='+');args=parser.parse_args()
 if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?',args.tag):raise ValueError('invalid release tag')
 head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
 if api('repos/'+args.repository+'/commits/'+args.tag)['sha']!=head:raise ValueError('remote tag does not match this checkout')
 release=find_release(args.repository,args.tag)
 if release is None:
  # Draft creation is a single write. If its response is lost, reconcile before upload.
  result=subprocess.run(['gh','release','create',args.tag,'--repo',args.repository,'--verify-tag','--draft','--title',args.tag,'--notes-file',args.notes_file])
  release=await_release(args.repository,args.tag)
  if release is None:raise RuntimeError('release creation could not be reconciled')
 if release['tag_name']!=args.tag:raise ValueError('release tag mismatch')
 def assets():
  process=subprocess.run(['gh','api','--paginate','--slurp','repos/'+args.repository+'/releases/'+str(release['id'])+'/assets?per_page=100'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
  rows=[asset for page in json.loads(process.stdout) for asset in page]
  if release['draft']:
   for row in rows:row['browser_download_url']=row['url']
  return rows
 def authenticated_hash(url):
  body=subprocess.check_output(['gh','api','-H','Accept: application/octet-stream',url]);return hashlib.sha256(body).hexdigest()
 digest_reader=authenticated_hash if release['draft'] else remote_hash
 files=[pathlib.Path(file) for file in args.files]
 for file in missing_assets(assets(),files,digest_reader):subprocess.run(['gh','release','upload',args.tag,'--repo',args.repository,str(file)],check=True)
 if missing_assets(assets(),files,digest_reader):raise RuntimeError('release assets incomplete')
 if release['draft']:subprocess.run(['gh','release','edit',args.tag,'--repo',args.repository,'--draft=false','--latest'],check=True)
 print('Release verified without replacing published assets: '+args.tag)

if __name__=='__main__':main()
